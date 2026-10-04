// ============================================================
// Edge Function: shopify-webhook
// ============================================================
// Receives Shopify webhooks (topic orders/paid). Verifies the HMAC signature
// with the app Client secret, finds the KhozyReads order from the
// `khozy_order_id` note attribute, and approves it (library access, logs,
// Telegram notify). Idempotent: already-approved orders are left untouched.
//
// Also supports POST { order_id } from the frontend with a user JWT to check
// status (returns { status }) — used for polling while the buyer pays.
//
// ⚠ Dashboard: "Verify JWT" must be OFF for this function (Shopify sends no
//   Supabase Authorization header). Security comes from the HMAC check.
//
// Secrets: SHOPIFY_CLIENT_SECRET (HMAC key), TELEGRAM_BOT_TOKEN (optional)
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const VERSION = "2026-10-04-shopify-1";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-shopify-hmac-sha256, x-shopify-topic, x-shopify-shop-domain",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method === "GET") return json({ fn: "shopify-webhook", version: VERSION });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("BOOKSTORE_SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("BOOKSTORE_SERVICE_ROLE_KEY");
  const clientSecret = (Deno.env.get("SHOPIFY_CLIENT_SECRET") ?? "").trim();
  if (!url || !serviceKey) return json({ error: "Server not configured" }, 500);
  const sb = createClient(url, serviceKey);

  const rawBody = await req.text();
  const hmacHeader = req.headers.get("x-shopify-hmac-sha256");

  // ───────────────────────────────────────────────────────────
  // Mode A: Shopify webhook (has HMAC header)
  // ───────────────────────────────────────────────────────────
  if (hmacHeader) {
    if (!clientSecret) return json({ error: "SHOPIFY_NOT_CONFIGURED" }, 503);
    const ok = await verifyHmac(clientSecret, rawBody, hmacHeader);
    if (!ok) { console.warn("Shopify webhook HMAC mismatch"); return json({ error: "Invalid signature" }, 401); }

    const topic = req.headers.get("x-shopify-topic") ?? "";
    let payload: any = null;
    try { payload = JSON.parse(rawBody); } catch { return json({ error: "Invalid JSON" }, 400); }

    const financial = String(payload?.financial_status ?? "").toLowerCase();
    const attrs: Array<{ name: string; value: string }> = payload?.note_attributes ?? [];
    const khozyOrderId = attrs.find((a) => a?.name === "khozy_order_id")?.value;
    const shopifyOrderId = String(payload?.id ?? "");
    const shopifyOrderName = String(payload?.name ?? "");

    console.log("webhook", { topic, financial, khozyOrderId, shopifyOrderName });
    if (!khozyOrderId) return json({ ok: true, ignored: "no khozy_order_id" });            // not ours
    if (!(topic === "orders/paid" || financial === "paid")) return json({ ok: true, ignored: `status ${financial}` });

    const result = await approveOrder(sb, khozyOrderId, { shopifyOrderId, shopifyOrderName, payload });
    return json({ ok: true, ...result });
  }

  // ───────────────────────────────────────────────────────────
  // Mode B: frontend status poll (user JWT) → { status }
  // ───────────────────────────────────────────────────────────
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Auth required" }, 401);
  const { data: userData, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: "Invalid token" }, 401);
  const { data: profile } = await sb.from("users_profile").select("id").eq("auth_user_id", userData.user.id).maybeSingle();
  if (!profile) return json({ error: "Profile not found" }, 403);

  let body: any = null;
  try { body = JSON.parse(rawBody); } catch { body = null; }
  const orderId = body?.order_id;
  if (!orderId) return json({ error: "order_id required" }, 400);
  const { data: order } = await sb.from("orders").select("id, user_id, book_id, status").eq("id", orderId).maybeSingle();
  if (!order) return json({ error: "Order not found" }, 404);
  if (order.user_id !== profile.id) return json({ error: "Not your order" }, 403);
  return json({ status: order.status, order_id: order.id, book_id: order.book_id });
});

// ---- approve (mirrors payway-verify) ----
async function approveOrder(sb: any, orderId: string, info: { shopifyOrderId: string; shopifyOrderName: string; payload: any }) {
  const { data: order } = await sb.from("orders")
    .select("id, user_id, book_id, status, amount, currency, books(title)")
    .eq("id", orderId).maybeSingle();
  if (!order) return { approved: false, reason: "order not found" };
  if (order.status === "approved") return { approved: true, already: true };

  const nowIso = new Date().toISOString();
  const { error: updErr } = await sb.from("orders").update({
    status: "approved", approved_at: nowIso, approved_by: null, rejected_at: null, reject_reason: null,
    paid_at: nowIso, payment_method: "ABA PayWay via Shopify (KHQR)",
    shopify_order_id: info.shopifyOrderId || null, shopify_order_name: info.shopifyOrderName || null,
  }).eq("id", order.id).eq("status", "pending");
  if (updErr) { console.error("order update failed:", updErr); return { approved: false, reason: updErr.message }; }

  await sb.from("user_library").upsert({ user_id: order.user_id, book_id: order.book_id, access_status: "active" }, { onConflict: "user_id,book_id" });
  await sb.from("payment_approval_logs").insert({
    order_id: order.id, action: "approved", action_by: "Shopify / ABA PayWay", action_source: "shopify",
    remark: info.shopifyOrderName ? `Shopify ${info.shopifyOrderName}` : null,
  });
  const gateway = info.payload?.payment_gateway_names?.join(", ") ?? "";
  await sb.from("activity_logs").insert({
    action: "order.approved", actor_user_id: order.user_id, actor_username: "shopify", target_type: "order", target_id: order.id,
    details: { source: "shopify", shopify_order: info.shopifyOrderName, shopify_order_id: info.shopifyOrderId, gateway, amount: order.amount, currency: order.currency },
  });

  notifyTelegram(sb, order, info.shopifyOrderName).catch((e) => console.warn("telegram notify failed:", e));
  return { approved: true };
}

async function notifyTelegram(sb: any, order: any, ref: string) {
  const bookTitle = order?.books?.title ?? "Book";
  const amount = `${order.amount} ${order.currency}`;
  const loginBot = Deno.env.get("TELEGRAM_LOGIN_BOT_TOKEN") ?? Deno.env.get("TELEGRAM_BOT_TOKEN");
  const adminBot = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? loginBot;
  if (loginBot) {
    const { data: buyer } = await sb.from("users_profile").select("telegram_id").eq("id", order.user_id).maybeSingle();
    if (buyer?.telegram_id) await tgSend(loginBot, String(buyer.telegram_id),
      `✅ ការទូទាត់ជោគជ័យ / Payment successful\n\n📖 ${bookTitle}\n💵 ${amount}\n\nសៀវភៅរបស់អ្នកមាននៅក្នុង My Library ហើយ។\nYour book is now in My Library. Happy reading!`);
  }
  if (adminBot) {
    const { data: s } = await sb.from("site_settings").select("setting_value").eq("setting_key", "telegram_admin_chat_id").maybeSingle();
    if (s?.setting_value) await tgSend(adminBot, String(s.setting_value),
      `💳 Payment received via Shopify/ABA (auto-approved)\n\nOrder: ${order.id.slice(0, 8)}\nBook: ${bookTitle}\nAmount: ${amount}${ref ? `\nShopify: ${ref}` : ""}`);
  }
}
async function tgSend(token: string, chatId: string, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text }) });
}

async function verifyHmac(secret: string, raw: string, header: string): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(raw));
  let bin = ""; for (const b of new Uint8Array(sig)) bin += String.fromCharCode(b);
  const computed = btoa(bin);
  if (computed.length !== header.length) return false;
  let diff = 0; for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ header.charCodeAt(i);
  return diff === 0;
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
