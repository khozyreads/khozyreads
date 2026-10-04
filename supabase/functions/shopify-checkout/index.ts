// ============================================================
// Edge Function: shopify-checkout
// ============================================================
// Creates a Shopify Draft Order for a pending KhozyReads order and returns
// its invoice (checkout) URL. The buyer pays on Shopify's checkout where
// ABA PayWay (KHQR) is enabled. When Shopify marks the order paid, it posts
// an orders/paid webhook to `shopify-webhook`, which approves the order.
//
// POST { order_id }  (user JWT; buyer must own the order)
// → { checkout_url, draft_order_id }
// GET  → version info
//
// Secrets:
//   SHOPIFY_STORE_DOMAIN    hj2v7n-ua.myshopify.com
//   SHOPIFY_CLIENT_ID       Dev Dashboard → Credentials
//   SHOPIFY_CLIENT_SECRET   Dev Dashboard → Credentials (also used for webhook HMAC)
//   SHOPIFY_API_VERSION     optional, default 2026-07
// Auth: client-credentials grant → short-lived Admin API token (cached in memory).
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const VERSION = "2026-10-04-shopify-1";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

let _tokenCache: { token: string; exp: number } | null = null;
let _webhookChecked = false;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method === "GET") return json({ fn: "shopify-checkout", version: VERSION });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("BOOKSTORE_SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("BOOKSTORE_SERVICE_ROLE_KEY");
    const shop = (Deno.env.get("SHOPIFY_STORE_DOMAIN") ?? "").trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
    const clientId = (Deno.env.get("SHOPIFY_CLIENT_ID") ?? "").trim();
    const clientSecret = (Deno.env.get("SHOPIFY_CLIENT_SECRET") ?? "").trim();
    const apiVersion = (Deno.env.get("SHOPIFY_API_VERSION") ?? "2026-07").trim();
    if (!url || !serviceKey) return json({ error: "Server not configured" }, 500);
    if (!shop || !clientId || !clientSecret) return json({ error: "SHOPIFY_NOT_CONFIGURED" }, 503);

    // ---- Auth: buyer JWT ----
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Auth required" }, 401);
    const sb = createClient(url, serviceKey);
    const { data: userData, error: userErr } = await sb.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Invalid token" }, 401);
    const { data: profile } = await sb.from("users_profile").select("id, username, display_name, email").eq("auth_user_id", userData.user.id).maybeSingle();
    if (!profile) return json({ error: "Profile not found" }, 403);

    // ---- Input + order ----
    const body = await req.json().catch(() => null) as { order_id?: string } | null;
    const orderId = body?.order_id;
    if (!orderId) return json({ error: "order_id required" }, 400);
    const { data: order } = await sb.from("orders")
      .select("id, user_id, book_id, amount, currency, status, shopify_checkout_url, shopify_draft_order_id, books(title)")
      .eq("id", orderId).maybeSingle();
    if (!order) return json({ error: "Order not found" }, 404);
    if (order.user_id !== profile.id) return json({ error: "Not your order" }, 403);
    if (order.status !== "pending") return json({ error: "ORDER_NOT_PENDING", status: order.status }, 409);

    // Reuse an existing draft order checkout if we already created one
    if (order.shopify_checkout_url && order.shopify_draft_order_id) {
      return json({ checkout_url: order.shopify_checkout_url, draft_order_id: order.shopify_draft_order_id, reused: true });
    }

    const currency = String(order.currency || "USD").toUpperCase();
    const amount = Number(order.amount);
    if (!(amount > 0)) return json({ error: "Invalid amount" }, 400);
    const bookTitle = String((order as any).books?.title ?? "KhozyReads Book");

    // ---- Shopify Admin token (client credentials) ----
    const accessToken = await getAdminToken(shop, clientId, clientSecret);
    const gql = (query: string, variables: Record<string, unknown>) => shopifyGraphQL(shop, apiVersion, accessToken, query, variables);

    // ---- Make sure the orders/paid webhook exists (idempotent, once per warm instance) ----
    if (!_webhookChecked) {
      try { await ensureWebhook(gql, `${url}/functions/v1/shopify-webhook`); _webhookChecked = true; }
      catch (e) { console.warn("ensureWebhook failed (non-blocking):", e); }
    }

    // ---- Create draft order (custom line item, no product needed) ----
    const m = `mutation DraftCreate($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder { id name invoiceUrl }
        userErrors { field message }
      }
    }`;
    const input: Record<string, unknown> = {
      lineItems: [{ title: `${bookTitle} (digital book)`, quantity: 1, originalUnitPrice: amount.toFixed(2), requiresShipping: false, taxable: false }],
      note: `KhozyReads order ${order.id} · @${profile.username}`,
      tags: ["khozyreads", "digital"],
      customAttributes: [
        { key: "khozy_order_id", value: order.id },
        { key: "khozy_user", value: profile.username ?? "" },
        { key: "khozy_book_id", value: order.book_id },
      ],
      presentmentCurrencyCode: currency,
    };
    if (profile.email && /@/.test(profile.email) && !/khozyreads\.local$/.test(profile.email)) input.email = profile.email;

    let res = await gql(m, { input });
    let errs = res?.data?.draftOrderCreate?.userErrors ?? [];
    // If the store doesn't support that presentment currency, retry without it (store currency)
    if (errs.length && JSON.stringify(errs).toLowerCase().includes("currency")) {
      delete input.presentmentCurrencyCode;
      res = await gql(m, { input });
      errs = res?.data?.draftOrderCreate?.userErrors ?? [];
    }
    if (errs.length || !res?.data?.draftOrderCreate?.draftOrder?.invoiceUrl) {
      console.error("draftOrderCreate failed:", JSON.stringify(res));
      return json({ error: "SHOPIFY_ERROR", message: errs.map((e: any) => e.message).join("; ") || "Could not create checkout" }, 502);
    }
    const draft = res.data.draftOrderCreate.draftOrder;

    await sb.from("orders").update({
      shopify_draft_order_id: draft.id,
      shopify_checkout_url: draft.invoiceUrl,
      payment_method: "ABA PayWay via Shopify (KHQR)",
    }).eq("id", order.id);

    await sb.from("activity_logs").insert({
      action: "order.checkout_created", actor_user_id: profile.id, actor_username: profile.username,
      target_type: "order", target_id: order.id, details: { provider: "shopify", draft_order: draft.name },
    });

    return json({ checkout_url: draft.invoiceUrl, draft_order_id: draft.id, draft_name: draft.name });
  } catch (err) {
    console.error("shopify-checkout error:", err);
    return json({ error: "Unhandled exception", details: String(err) }, 500);
  }
});

// ---- helpers ----
async function getAdminToken(shop: string, clientId: string, clientSecret: string): Promise<string> {
  const now = Date.now();
  if (_tokenCache && _tokenCache.exp > now + 60_000) return _tokenCache.token;
  const r = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials" }),
  });
  const body = await r.json().catch(() => null) as any;
  if (!r.ok || !body?.access_token) {
    throw new Error(`Shopify token exchange failed (${r.status}): ${JSON.stringify(body)}`);
  }
  const ttl = Number(body.expires_in ?? 86400) * 1000;
  _tokenCache = { token: body.access_token, exp: now + ttl };
  return body.access_token;
}

async function shopifyGraphQL(shop: string, ver: string, token: string, query: string, variables: Record<string, unknown>) {
  const r = await fetch(`https://${shop}/admin/api/${ver}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
  });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`Shopify GraphQL HTTP ${r.status}: ${JSON.stringify(body)}`);
  if (body?.errors?.length) throw new Error(`Shopify GraphQL errors: ${JSON.stringify(body.errors)}`);
  return body;
}

async function ensureWebhook(gql: (q: string, v: Record<string, unknown>) => Promise<any>, callbackUrl: string) {
  const q = `{ webhookSubscriptions(first: 50, topics: [ORDERS_PAID]) { edges { node { id endpoint { __typename ... on WebhookHttpEndpoint { callbackUrl } } } } } }`;
  const existing = await gql(q, {});
  const edges = existing?.data?.webhookSubscriptions?.edges ?? [];
  if (edges.some((e: any) => e?.node?.endpoint?.callbackUrl === callbackUrl)) return;
  const m = `mutation Sub($topic: WebhookSubscriptionTopic!, $sub: WebhookSubscriptionInput!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: $sub) { userErrors { message } webhookSubscription { id } }
  }`;
  const r = await gql(m, { topic: "ORDERS_PAID", sub: { callbackUrl, format: "JSON" } });
  const errs = r?.data?.webhookSubscriptionCreate?.userErrors ?? [];
  if (errs.length) throw new Error("webhookSubscriptionCreate: " + JSON.stringify(errs));
  console.log("Registered ORDERS_PAID webhook →", callbackUrl);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
