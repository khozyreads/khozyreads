// ============================================================
// Edge Function: notify-telegram (v2 - bulletproof)
// ============================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  console.log(`>>> ${req.method} ${req.url}`);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("BOOKSTORE_SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("BOOKSTORE_SERVICE_ROLE_KEY");
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
    const adminChatId = Deno.env.get("TELEGRAM_ADMIN_CHAT_ID") ?? "";

    console.log("Env check:", {
      hasUrl: !!url,
      hasServiceKey: !!serviceKey,
      hasBotToken: !!botToken,
      hasChatId: !!adminChatId,
      chatId: adminChatId,
    });

    if (!url || !serviceKey) {
      return json({ error: "SUPABASE_URL or SERVICE_ROLE_KEY not set" }, 500);
    }
    if (!botToken || !adminChatId) {
      return json({ error: "TELEGRAM_BOT_TOKEN or TELEGRAM_ADMIN_CHAT_ID not set in secrets" }, 500);
    }

    // Parse body
    const text = await req.text();
    console.log("Raw body:", text);
    let body: { order_id?: string } = {};
    try {
      body = JSON.parse(text || "{}");
    } catch (e) {
      console.error("JSON parse error:", e);
      return json({ error: "Invalid JSON body", raw: text }, 400);
    }
    const orderId = body?.order_id;
    if (!orderId) {
      return json({ error: "order_id required", received: body }, 400);
    }
    console.log("Order ID:", orderId);

    // Fetch order via REST (no JS client to avoid join issues)
    const orderRes = await fetch(
      `${url}/rest/v1/orders?id=eq.${orderId}&select=id,amount,currency,payment_method,proof_url,created_at,user_id,book_id`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
      }
    );
    if (!orderRes.ok) {
      const errText = await orderRes.text();
      console.error("Order fetch failed:", errText);
      return json({ error: "Order fetch failed", status: orderRes.status, details: errText }, 500);
    }
    const orders = await orderRes.json();
    if (!orders.length) {
      return json({ error: "Order not found", order_id: orderId }, 404);
    }
    const order = orders[0];
    console.log("Order:", order);

    // Fetch buyer username + book title (separate, to avoid join issues)
    let username = "-";
    let bookTitle = "-";
    try {
      const [userRes, bookRes] = await Promise.all([
        fetch(`${url}/rest/v1/users_profile?id=eq.${order.user_id}&select=username`, {
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
        }),
        fetch(`${url}/rest/v1/books?id=eq.${order.book_id}&select=title`, {
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
        }),
      ]);
      const userData = await userRes.json();
      const bookData = await bookRes.json();
      username = userData?.[0]?.username ?? "-";
      bookTitle = bookData?.[0]?.title ?? "-";
    } catch (e) {
      console.error("User/book fetch warning:", e);
    }

    // Compose Telegram message (plain text, no markdown to avoid escape issues)
    const msgText = [
      "🧾 New Payment Request",
      "",
      `Order ID: ${order.id}`,
      `Buyer: @${username}`,
      `Book: ${bookTitle}`,
      `Amount: ${order.amount} ${order.currency}`,
      `Payment: ${order.payment_method}`,
      `Submitted: ${order.created_at}`,
      "",
      "Verify in ABA, then approve in admin dashboard.",
    ].join("\n");

    // Send Telegram message
    const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: adminChatId,
        text: msgText,
        disable_web_page_preview: true,
      }),
    });
    const tgBody = await tgRes.json();
    console.log("Telegram response:", tgRes.status, tgBody);
    if (!tgRes.ok) {
      return json({ error: "Telegram API rejected", details: tgBody }, 502);
    }

    // Optional: send proof link as second message
    if (order.proof_url) {
      fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: adminChatId,
          text: `Payment proof:\n${order.proof_url}`,
          disable_web_page_preview: true,
        }),
      }).catch((e) => console.error("Proof send warning:", e));
    }

    return json({ ok: true, sent_to: adminChatId });
  } catch (err) {
    console.error("Unhandled error:", err);
    return json({ error: "Unhandled exception", details: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
