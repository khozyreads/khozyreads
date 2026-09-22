// ============================================================
// Edge Function: payway-purchase
// ============================================================
// Creates an ABA PayWay checkout request for a pending order.
// The HMAC-SHA512 hash is computed HERE (server-side) with the secret
// API key — the browser never sees credentials. The frontend receives
// the form fields and submits them to PayWay via the official popup plugin.
//
// POST { order_id }   (requires user JWT — buyer must own the order)
// → { action_url, fields: {...}, tran_id }
//
// Secrets (supabase secrets set ...):
//   PAYWAY_MERCHANT_ID   e.g. ec478783
//   PAYWAY_API_KEY       the 40-hex "Public Key" from ABA (used for HMAC)
//   PAYWAY_BASE_URL      https://checkout-sandbox.payway.com.kh  (prod: https://checkout.payway.com.kh)
//   SITE_URL             https://khozyreads.com
// Docs: hash = base64(HMAC_SHA512(req_time+merchant_id+tran_id+amount+items+shipping
//   +firstname+lastname+email+phone+type+payment_option+return_url+cancel_url
//   +continue_success_url+return_deeplink+currency+custom_fields+return_params
//   +payout+lifetime+additional_params+google_pay_token+skip_success_page, api_key))
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
    // trim(): stray whitespace/newline in a pasted secret silently breaks the HMAC ("Wrong Hash")
    const merchantId = (Deno.env.get("PAYWAY_MERCHANT_ID") ?? "").trim();
    const apiKey = (Deno.env.get("PAYWAY_API_KEY") ?? "").trim();
    const baseUrl = (Deno.env.get("PAYWAY_BASE_URL") ?? "https://checkout-sandbox.payway.com.kh").replace(/\/$/, "");
    const siteUrl = (Deno.env.get("SITE_URL") ?? "https://khozyreads.com").replace(/\/$/, "");
    if (!url || !serviceKey) return json({ error: "Server not configured" }, 500);
    if (!merchantId || !apiKey) return json({ error: "PAYWAY_NOT_CONFIGURED" }, 503);

    // ---- Auth: buyer JWT ----
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Auth required" }, 401);
    const sb = createClient(url, serviceKey);
    const { data: userData, error: userErr } = await sb.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Invalid token" }, 401);

    const { data: profile } = await sb
      .from("users_profile")
      .select("id, username, display_name")
      .eq("auth_user_id", userData.user.id)
      .maybeSingle();
    if (!profile) return json({ error: "Profile not found" }, 403);

    // ---- Input ----
    const body = await req.json().catch(() => null) as { order_id?: string } | null;
    const orderId = body?.order_id;
    if (!orderId || typeof orderId !== "string") return json({ error: "order_id required" }, 400);

    // ---- Load order (must be buyer's own, still pending) ----
    const { data: order, error: orderErr } = await sb
      .from("orders")
      .select("id, user_id, book_id, amount, currency, status, books(title)")
      .eq("id", orderId)
      .maybeSingle();
    if (orderErr || !order) return json({ error: "Order not found" }, 404);
    if (order.user_id !== profile.id) return json({ error: "Not your order" }, 403);
    if (order.status !== "pending") return json({ error: "ORDER_NOT_PENDING", status: order.status }, 409);

    // ---- Amount formatting (PayWay rules) ----
    const currency = String(order.currency || "USD").toUpperCase() === "KHR" ? "KHR" : "USD";
    const amountNum = Number(order.amount);
    if (!(amountNum > 0)) return json({ error: "Invalid amount" }, 400);
    let amountStr: string;
    if (currency === "KHR") {
      const rounded = Math.round(amountNum);
      if (rounded <= 100) return json({ error: "KHR amount must be greater than 100" }, 400);
      amountStr = String(rounded);                 // KHR: no decimals allowed
    } else {
      amountStr = amountNum.toFixed(2);            // USD: 2 decimals
    }

    // ---- Transaction id (≤20 chars, unique) ----
    const tranId = `KR${Date.now().toString(36).toUpperCase()}${randBase36(4)}`;

    // ---- Build request fields (empty string for unused hash fields) ----
    const bookTitle = String((order as any).books?.title ?? "KhozyReads Book");
    const reqTime = utcReqTime();
    const items = b64utf8(JSON.stringify([{ name: bookTitle.slice(0, 80), quantity: 1, price: Number(amountStr) }]));
    const returnUrl = b64utf8(`${url}/functions/v1/payway-verify`);
    const cancelUrl = `${siteUrl}/#/payment/${order.id}`;
    const continueSuccessUrl = `${siteUrl}/#/payway-return?tran_id=${tranId}`;
    const customFields = b64utf8(JSON.stringify({ order_id: order.id, user: profile.username }));
    const returnParams = order.id;
    const paymentOption = "abapay_khqr";
    const type = "purchase";
    const lifetime = "30";            // minutes
    const skipSuccessPage = "1";      // go straight to continue_success_url

    const f = {
      req_time: reqTime,
      merchant_id: merchantId,
      tran_id: tranId,
      amount: amountStr,
      items,
      shipping: "",
      firstname: "",
      lastname: "",
      email: "",
      phone: "",
      type,
      payment_option: paymentOption,
      return_url: returnUrl,
      cancel_url: cancelUrl,
      continue_success_url: continueSuccessUrl,
      return_deeplink: "",
      currency,
      custom_fields: customFields,
      return_params: returnParams,
      payout: "",
      lifetime,
      additional_params: "",
      google_pay_token: "",
      skip_success_page: skipSuccessPage,
    };

    // Exact documented order. view_type / payment_gate are NOT hashed.
    const b4hash =
      f.req_time + f.merchant_id + f.tran_id + f.amount + f.items + f.shipping +
      f.firstname + f.lastname + f.email + f.phone + f.type + f.payment_option +
      f.return_url + f.cancel_url + f.continue_success_url + f.return_deeplink +
      f.currency + f.custom_fields + f.return_params + f.payout + f.lifetime +
      f.additional_params + f.google_pay_token + f.skip_success_page;
    const hash = await hmacSha512B64(apiKey, b4hash);

    // ---- Record mapping tran_id → order (service role) ----
    const { error: insErr } = await sb.from("payway_transactions").insert({
      tran_id: tranId,
      order_id: order.id,
      amount: Number(amountStr),
      currency,
      status: "created",
    });
    if (insErr) {
      console.error("payway_transactions insert failed:", insErr);
      return json({ error: "Could not create transaction" }, 500);
    }
    await sb.from("orders").update({ payway_tran_id: tranId, payment_method: "ABA PayWay (KHQR)" }).eq("id", order.id);

    // Only send non-empty fields to PayWay (plus hash + view_type)
    const fields: Record<string, string> = { hash, view_type: "popup" };
    for (const [k, v] of Object.entries(f)) if (v !== "") fields[k] = v;

    return json({
      action_url: `${baseUrl}/api/payment-gateway/v1/payments/purchase`,
      fields,
      tran_id: tranId,
    });
  } catch (err) {
    console.error("payway-purchase error:", err);
    return json({ error: "Unhandled exception", details: String(err) }, 500);
  }
});

// ---- helpers ----
function utcReqTime(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}
function randBase36(n: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  let s = "";
  for (const b of bytes) s += chars[b % chars.length];
  return s;
}
function b64utf8(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
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
