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

const VERSION = "2026-10-05-shopify-5-subs";
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
      .select("id, user_id, book_id, kind, plan_code, amount, currency, status, shopify_checkout_url, shopify_draft_order_id, books(id, title, creator, cover_url, shopify_product_id, shopify_variant_id, shopify_synced_price)")
      .eq("id", orderId).maybeSingle();
    if (!order) return json({ error: "Order not found" }, 404);
    if (order.user_id !== profile.id) return json({ error: "Not your order" }, 403);
    if (order.status !== "pending") return json({ error: "ORDER_NOT_PENDING", status: order.status }, 409);

    // Reuse an existing draft order checkout if we already created one
    if (order.shopify_checkout_url && order.shopify_draft_order_id) {
      return json({ checkout_url: order.shopify_checkout_url, draft_order_id: order.shopify_draft_order_id, reused: true });
    }

    const orderCurrency = String(order.currency || "USD").toUpperCase();
    const orderAmount = Number(order.amount);
    if (!(orderAmount > 0)) return json({ error: "Invalid amount" }, 400);
    const isSub = (order as any).kind === "subscription";
    let plan: any = null;
    if (isSub) {
      const { data: p } = await sb.from("subscription_plans").select("*").eq("code", (order as any).plan_code).maybeSingle();
      if (!p) return json({ error: "Plan not found" }, 404);
      plan = p;
    }
    const bookTitle = isSub
      ? `KhozyReads ${plan.name_en} Pass (${plan.duration_days} day${plan.duration_days > 1 ? "s" : ""})`
      : String((order as any).books?.title ?? "KhozyReads Book");

    // ---- Shopify Admin token (client credentials) ----
    const accessToken = await getAdminToken(shop, clientId, clientSecret);
    const gql = (query: string, variables: Record<string, unknown>) => shopifyGraphQL(shop, apiVersion, accessToken, query, variables);

    // ---- Charge in the STORE currency (Shopify + ABA require it). Convert if needed. ----
    // USD↔KHR rate from site_settings.usd_khr_rate (default 4100). KHR must be a whole number ≥ 100.
    const shopInfo = await gql(`{ shop { currencyCode } }`, {});
    const storeCurrency = String(shopInfo?.data?.shop?.currencyCode ?? "USD").toUpperCase();
    let rate = 4100;
    const { data: rateRow } = await sb.from("site_settings").select("setting_value").eq("setting_key", "usd_khr_rate").maybeSingle();
    if (rateRow?.setting_value && Number(rateRow.setting_value) > 0) rate = Number(rateRow.setting_value);

    let chargeAmount = orderAmount;
    if (orderCurrency !== storeCurrency) {
      if (orderCurrency === "USD" && storeCurrency === "KHR") chargeAmount = orderAmount * rate;
      else if (orderCurrency === "KHR" && storeCurrency === "USD") chargeAmount = orderAmount / rate;
      else return json({ error: "SHOPIFY_ERROR", message: `Store currency ${storeCurrency} not supported for ${orderCurrency} orders` }, 502);
    }
    if (storeCurrency === "KHR") {
      chargeAmount = Math.round(chargeAmount / 100) * 100;      // round to nearest 100 riel (clean for payers)
      if (chargeAmount < 100) chargeAmount = 100;
    } else {
      chargeAmount = Math.round(chargeAmount * 100) / 100;
    }
    const chargeStr = storeCurrency === "KHR" ? String(Math.round(chargeAmount)) : chargeAmount.toFixed(2);
    const priceNote = orderCurrency !== storeCurrency ? ` — ${orderAmount} ${orderCurrency} ≈ ${chargeStr} ${storeCurrency}` : "";

    // ---- Make sure the orders/paid webhook exists (idempotent, once per warm instance) ----
    if (!_webhookChecked) {
      try { await ensureWebhook(gql, `${url}/functions/v1/shopify-webhook`); _webhookChecked = true; }
      catch (e) { console.warn("ensureWebhook failed (non-blocking):", e); }
    }

    // ---- Ensure a Shopify product exists (book: cover + title; plan: pass product) ----
    let variantId: string | null = null;
    try {
      if (isSub) variantId = await ensurePlanProduct(sb, gql, plan, chargeStr, storeCurrency, siteLogoUrl());
      else variantId = await ensureBookProduct(sb, gql, (order as any).books || {}, chargeStr, storeCurrency);
    } catch (e) {
      console.warn("ensure product failed; falling back to custom line item:", e);
    }

    // ---- Create draft order ----
    const m = `mutation DraftCreate($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder { id name invoiceUrl }
        userErrors { field message }
      }
    }`;
    const lineItem = variantId
      ? { variantId, quantity: 1 }
      : { title: bookTitle, quantity: 1, originalUnitPrice: chargeStr, requiresShipping: false, taxable: false };
    const input: Record<string, unknown> = {
      lineItems: [lineItem],
      note: `KhozyReads order ${order.id} · @${profile.username}${priceNote}`,
      tags: ["khozyreads", "digital"],
      customAttributes: [
        { key: "khozy_order_id", value: order.id },
        { key: "khozy_user", value: profile.username ?? "" },
        { key: "khozy_book_id", value: order.book_id ?? "" },
        { key: "khozy_kind", value: isSub ? "subscription" : "book" },
        { key: "khozy_plan", value: isSub ? String(plan.code) : "" },
        { key: "khozy_amount", value: `${orderAmount} ${orderCurrency}` },
      ],
    };
    if (profile.email && /@/.test(profile.email) && !/khozyreads\.local$/.test(profile.email)) input.email = profile.email;

    // Prefill billing address so the buyer only has to press "Pay" (digital goods — address is not used).
    const fullName = String(profile.display_name || profile.username || "KhozyReads Reader").trim();
    const [firstName, ...rest] = fullName.split(/\s+/);
    const billing = {
      firstName: firstName || "KhozyReads",
      lastName: rest.join(" ") || "Reader",
      address1: "Digital purchase - KhozyReads.com",
      city: "Phnom Penh",
      countryCode: "KH",
      zip: "12000",
    };
    input.billingAddress = billing;
    input.useCustomerDefaultAddress = false;

    let res = await gql(m, { input });
    let errs = res?.data?.draftOrderCreate?.userErrors ?? [];
    // If Shopify rejects the prefilled address for any reason, retry without it (buyer fills it in)
    if (errs.length && /address|province|zip|country/i.test(JSON.stringify(errs))) {
      console.warn("billing prefill rejected, retrying without:", JSON.stringify(errs));
      delete input.billingAddress; delete input.useCustomerDefaultAddress;
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
    // sanity: tags differ for passes
    void isSub;

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

// Create (once) a Shopify product for the book with its cover image, and keep the
// variant price in sync with the amount we charge. Returns the variant GID.
async function ensureBookProduct(sb: any, gql: (q: string, v: Record<string, unknown>) => Promise<any>, book: any, priceStr: string, currency: string): Promise<string | null> {
  if (!book?.id) return null;
  let productId: string | null = book.shopify_product_id || null;
  let variantId: string | null = book.shopify_variant_id || null;
  const syncedPrice = `${priceStr} ${currency}`;

  if (!productId || !variantId) {
    const createM = `mutation PC($input: ProductInput!, $media: [CreateMediaInput!]) {
      productCreate(input: $input, media: $media) {
        product { id variants(first: 1) { nodes { id } } }
        userErrors { field message }
      }
    }`;
    const input = {
      title: String(book.title || "KhozyReads Book"),
      vendor: String(book.creator || "KhozyReads"),
      productType: "Digital Book",
      status: "ACTIVE",
      tags: ["khozyreads", "digital"],
      descriptionHtml: `<p>Digital book from <a href="https://khozyreads.com">KhozyReads</a>. Delivered instantly to your KhozyReads library — no shipping.</p>`,
    };
    const media = book.cover_url ? [{ originalSource: book.cover_url, mediaContentType: "IMAGE", alt: String(book.title || "") }] : [];
    const r = await gql(createM, { input, media });
    const errs = r?.data?.productCreate?.userErrors ?? [];
    const p = r?.data?.productCreate?.product;
    if (errs.length || !p?.id) throw new Error("productCreate: " + JSON.stringify(errs));
    productId = p.id;
    variantId = p.variants?.nodes?.[0]?.id ?? null;
    if (!variantId) throw new Error("productCreate: no default variant");
    await sb.from("books").update({ shopify_product_id: productId, shopify_variant_id: variantId, shopify_synced_price: null }).eq("id", book.id);
  }

  // Sync price / digital flags when changed (or on first creation)
  if (book.shopify_synced_price !== syncedPrice) {
    const upd = `mutation PV($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        userErrors { field message }
      }
    }`;
    const r = await gql(upd, { productId, variants: [{ id: variantId, price: priceStr, taxable: false, inventoryItem: { tracked: false, requiresShipping: false } }] });
    const errs = r?.data?.productVariantsBulkUpdate?.userErrors ?? [];
    if (errs.length) throw new Error("productVariantsBulkUpdate: " + JSON.stringify(errs));
    await sb.from("books").update({ shopify_synced_price: syncedPrice }).eq("id", book.id);
  }
  return variantId;
}

function siteLogoUrl(): string {
  return (Deno.env.get("SITE_LOGO_URL") ?? "https://khozyreads.com/icon-512.png").trim();
}

// Create (once) a Shopify product for a subscription plan; keep price in sync.
async function ensurePlanProduct(sb: any, gql: (q: string, v: Record<string, unknown>) => Promise<any>, plan: any, priceStr: string, currency: string, logoUrl: string): Promise<string | null> {
  let productId: string | null = plan.shopify_product_id || null;
  let variantId: string | null = plan.shopify_variant_id || null;
  const syncedPrice = `${priceStr} ${currency}`;
  if (!productId || !variantId) {
    const createM = `mutation PC($input: ProductInput!, $media: [CreateMediaInput!]) {
      productCreate(input: $input, media: $media) { product { id variants(first: 1) { nodes { id } } } userErrors { field message } }
    }`;
    const title = `KhozyReads ${plan.name_en} Pass — read all books for ${plan.duration_days} day${plan.duration_days > 1 ? "s" : ""}`;
    const input = { title, vendor: "KhozyReads", productType: "Reading Pass", status: "ACTIVE", tags: ["khozyreads", "subscription", String(plan.code)],
      descriptionHtml: `<p>Unlimited reading of all paid books on <a href="https://khozyreads.com">KhozyReads</a> for ${plan.duration_days} day(s). Activated instantly after payment. No auto-renewal.</p>` };
    const media = logoUrl ? [{ originalSource: logoUrl, mediaContentType: "IMAGE", alt: title }] : [];
    const r = await gql(createM, { input, media });
    const errs = r?.data?.productCreate?.userErrors ?? [];
    const p = r?.data?.productCreate?.product;
    if (errs.length || !p?.id) throw new Error("productCreate(plan): " + JSON.stringify(errs));
    productId = p.id; variantId = p.variants?.nodes?.[0]?.id ?? null;
    if (!variantId) throw new Error("productCreate(plan): no default variant");
    await sb.from("subscription_plans").update({ shopify_product_id: productId, shopify_variant_id: variantId, shopify_synced_price: null }).eq("code", plan.code);
  }
  if (plan.shopify_synced_price !== syncedPrice) {
    const upd = `mutation PV($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) { userErrors { field message } }
    }`;
    const r = await gql(upd, { productId, variants: [{ id: variantId, price: priceStr, taxable: false, inventoryItem: { tracked: false, requiresShipping: false } }] });
    const errs = r?.data?.productVariantsBulkUpdate?.userErrors ?? [];
    if (errs.length) throw new Error("productVariantsBulkUpdate(plan): " + JSON.stringify(errs));
    await sb.from("subscription_plans").update({ shopify_synced_price: syncedPrice }).eq("code", plan.code);
  }
  return variantId;
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
