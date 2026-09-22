// ============================================================
// Edge Function: payway-verify
// ============================================================
// Verifies a PayWay transaction and auto-approves the order.
//
// Called two ways (both POST, JSON):
//   1) PayWay pushback (return_url webhook): { tran_id, apv, status, return_params }
//   2) Our frontend (after checkout / on return page):   { tran_id }
//
// SECURITY MODEL: we NEVER trust the caller. Whatever is posted, we ask
// PayWay's check-transaction API ourselves and only approve when PayWay
// says APPROVED. So this endpoint is safe to expose without a user JWT —
// the worst an attacker can do is trigger a verification of a real, paid
// transaction (harmless & idempotent).
//
// ⚠ Dashboard setting: "Verify JWT" must be OFF for this function, otherwise
//   the Supabase gateway rejects PayWay's webhook (no Authorization header).
//
// Secrets: PAYWAY_MERCHANT_ID, PAYWAY_API_KEY, PAYWAY_BASE_URL,
//          TELEGRAM_BOT_TOKEN (optional, buyer/admin notify), SITE_URL
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("BOOKSTORE_SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("BOOKSTORE_SERVICE_ROLE_KEY");
    const merchantId = (Deno.env.get("PAYWAY_MERCHANT_ID") ?? "").trim();
    const apiKey = (Deno.env.get("PAYWAY_API_KEY") ?? "").trim();
    const baseUrl = (Deno.env.get("PAYWAY_BASE_URL") ?? "https://checkout-sandbox.payway.com.kh").replace(/\/$/, "");
    if (!url || !serviceKey) return json({ error: "Server not configured" }, 500);
    if (!merchantId || !apiKey) return json({ error: "PAYWAY_NOT_CONFIGURED" }, 503);

    // PayWay may post JSON or form-encoded; handle both.
    let body: Record<string, unknown> = {};
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    } else {
      const txt = await req.text().catch(() => "");
      try { body = JSON.parse(txt); } catch { body = Object.fromEntries(new URLSearchParams(txt)); }
    }
    const tranId = String(body?.tran_id ?? "").trim();
    if (!tranId) return json({ error: "tran_id required" }, 400);

    const sb = createClient(url, serviceKey);

    // ---- Resolve tran_id → order ----
    const { data: tx } = await sb
      .from("payway_transactions")
      .select("tran_id, order_id, status")
      .eq("tran_id", tranId)
      .maybeSingle();
    if (!tx) return json({ error: "Unknown transaction" }, 404);

    const { data: order } = await sb
      .from("orders")
      .select("id, user_id, book_id, status, amount, currency, books(title)")
      .eq("id", tx.order_id)
      .maybeSingle();
    if (!order) return json({ error: "Order not found" }, 404);

    // Already approved earlier (idempotent fast path)
    if (order.status === "approved") {
      return json({ status: "approved", order_id: order.id, book_id: order.book_id, already: true });
    }

    // ---- Ask PayWay (source of truth) ----
    const reqTime = utcReqTime();
    const hash = await hmacSha512B64(apiKey, reqTime + merchantId + tranId);
    const pwRes = await fetch(`${baseUrl}/api/payment-gateway/v1/payments/check-transaction-2`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ req_time: reqTime, merchant_id: merchantId, tran_id: tranId, hash }),
    });
    const pw = await pwRes.json().catch(() => null) as any;
    const okCode = String(pw?.status?.code ?? "") === "00";
    if (!okCode) {
      console.warn("check-transaction failed:", pw);
      return json({ status: "unknown", order_id: order.id, payway: pw?.status ?? null }, 200);
    }

    const code = Number(pw?.data?.payment_status_code);
    const apv = String(pw?.data?.apv ?? "");
    const mapped =
      code === 0 ? "approved" :
      code === 2 ? "pending" :
      code === 3 ? "declined" :
      code === 4 ? "refunded" :
      code === 7 ? "cancelled" : "unknown";

    // Keep our mapping row in sync (non-approved states)
    if (mapped !== "approved") {
      const st = mapped === "pending" || mapped === "unknown" || mapped === "refunded" ? tx.status : mapped;
      await sb.from("payway_transactions").update({ status: st, verified_at: new Date().toISOString() }).eq("tran_id", tranId);
      return json({ status: mapped, order_id: order.id, book_id: order.book_id });
    }

    // ---- APPROVED → grant access (mirrors approve-order, but source = payway) ----
    const nowIso = new Date().toISOString();
    const { error: updErr } = await sb
      .from("orders")
      .update({
        status: "approved",
        approved_at: nowIso,
        approved_by: null,
        rejected_at: null,
        reject_reason: null,
        payment_method: "ABA PayWay (KHQR)",
        payway_tran_id: tranId,
        payway_apv: apv || null,
        paid_at: nowIso,
      })
      .eq("id", order.id)
      .eq("status", "pending");           // guard against races
    if (updErr) {
      console.error("order update failed:", updErr);
      return json({ error: "Could not approve order" }, 500);
    }

    await sb.from("user_library").upsert(
      { user_id: order.user_id, book_id: order.book_id, access_status: "active" },
      { onConflict: "user_id,book_id" },
    );
    await sb.from("payway_transactions")
      .update({ status: "approved", apv: apv || null, verified_at: nowIso })
      .eq("tran_id", tranId);
    await sb.from("payment_approval_logs").insert({
      order_id: order.id,
      action: "approved",
      action_by: "ABA PayWay",
      action_source: "payway",
      remark: apv ? `APV ${apv}` : null,
    });
    await sb.from("activity_logs").insert({
      action: "order.approved",
      actor_user_id: order.user_id,
      actor_username: "payway",
      target_type: "order",
      target_id: order.id,
      details: { source: "payway", tran_id: tranId, apv, amount: order.amount, currency: order.currency },
    });

    // ---- Best-effort Telegram notifications (never block approval) ----
    notifyTelegram(sb, order, tranId, apv).catch((e) => console.warn("telegram notify failed:", e));

    return json({ status: "approved", order_id: order.id, book_id: order.book_id });
  } catch (err) {
    console.error("payway-verify error:", err);
    return json({ error: "Unhandled exception", details: String(err) }, 500);
  }
});

// ---- Telegram (optional) ----
async function notifyTelegram(sb: any, order: any, tranId: string, apv: string) {
  const bookTitle = order?.books?.title ?? "Book";
  const amount = `${order.amount} ${order.currency}`;
  const loginBot = Deno.env.get("TELEGRAM_LOGIN_BOT_TOKEN") ?? Deno.env.get("TELEGRAM_BOT_TOKEN");
  const adminBot = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? loginBot;

  // Buyer (if they logged in with Telegram)
  if (loginBot) {
    const { data: buyer } = await sb.from("users_profile").select("telegram_id").eq("id", order.user_id).maybeSingle();
    if (buyer?.telegram_id) {
      await tgSend(loginBot, String(buyer.telegram_id),
        `✅ ការទូទាត់ជោគជ័យ / Payment successful\n\n📖 ${bookTitle}\n💵 ${amount}\n\nសៀវភៅរបស់អ្នកមាននៅក្នុង My Library ហើយ។\nYour book is now in My Library. Happy reading!`);
    }
  }
  // Admin
  if (adminBot) {
    const { data: s } = await sb.from("site_settings").select("value").eq("key", "telegram_admin_chat_id").maybeSingle();
    const chatId = s?.value;
    if (chatId) {
      await tgSend(adminBot, String(chatId),
        `💳 PayWay payment received (auto-approved)\n\nOrder: ${order.id.slice(0, 8)}\nBook: ${bookTitle}\nAmount: ${amount}\nTran: ${tranId}${apv ? `\nAPV: ${apv}` : ""}`);
    }
  }
}
async function tgSend(token: string, chatId: string, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

// ---- helpers ----
function utcReqTime(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}
async function hmacSha512B64(key: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(data));
  let bin = "";
  for (const b of new Uint8Array(sig)) bin += String.fromCharCode(b);
  return btoa(bin);
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
