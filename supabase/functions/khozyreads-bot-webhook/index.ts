// ============================================================
// Edge Function: khozyreads-bot-webhook
// ============================================================
// Webhook endpoint for @KhozyReads_bot. Telegram calls this URL
// every time a user interacts with the bot (sends a message, taps
// a button, etc.). For MVP we handle:
//   1. /start - friendly welcome
//   2. /help  - usage instructions
//   3. Any other message → forward to admin chat for manual reply
//
// To activate: call Telegram setWebhook once with this function's URL:
//   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=<EDGE_FN_URL>"
//
// Verify JWT must be OFF (Telegram doesn't send JWT headers).
// ============================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const botToken = Deno.env.get("TELEGRAM_LOGIN_BOT_TOKEN") ?? Deno.env.get("TELEGRAM_BOT_TOKEN");
    const adminChatId = Deno.env.get("TELEGRAM_ADMIN_CHAT_ID");
    if (!botToken) return json({ error: "TELEGRAM_LOGIN_BOT_TOKEN not set" }, 500);
    if (!adminChatId) {
      console.warn("TELEGRAM_ADMIN_CHAT_ID not set — messages won't be forwarded");
    }

    const update = await req.json().catch(() => null);
    if (!update) return json({ ok: true });

    // We care about message updates (not callback queries or others)
    const msg = update.message;
    if (!msg || !msg.from) return json({ ok: true });

    const userId = msg.from.id;
    const userName = msg.from.username || `${msg.from.first_name || ""} ${msg.from.last_name || ""}`.trim() || `tg_${userId}`;
    const text = (msg.text || "").trim();

    // ---- Handle commands ----
    if (text.startsWith("/start")) {
      await sendMessage(botToken, userId, [
        `👋 *សួស្តី! សូមស្វាគមន៍មកកាន់ KhozyReads*`,
        ``,
        `យើងគឺជាហាងសៀវភៅឌីជីថលខ្មែរ។`,
        ``,
        `🌐 ទស្សនាគេហទំព័រ៖ https://khozyreads.com`,
        `❓ វាយ /help សម្រាប់ជំនួយ`,
      ].join("\n"));
      return json({ ok: true });
    }

    if (text.startsWith("/help")) {
      await sendMessage(botToken, userId, [
        `📚 *KhozyReads — ជំនួយ*`,
        ``,
        `• ស្វែងរកសៀវភៅ៖ https://khozyreads.com`,
        `• ចូលគណនី៖ ប្រើបុ៊ុង "Sign in with Telegram"`,
        `• ការគាំទ្រ៖ សរសេរសារនៅទីនេះ យើងនឹងឆ្លើយតបក្នុងពេលឆាប់ៗ`,
        ``,
        `Commands:`,
        `/start - ចាប់ផ្តើម`,
        `/help - មើលជំនួយ`,
      ].join("\n"));
      return json({ ok: true });
    }

    // ---- Forward user message to admin chat ----
    if (adminChatId && text) {
      const forwardText = [
        `📩 *New message from KhozyReads bot*`,
        ``,
        `From: ${userName} (ID: \`${userId}\`)`,
        ``,
        `Message:`,
        text.length > 3500 ? text.slice(0, 3500) + "…" : text,
        ``,
        `💬 *Reply tip:* Use Telegram's reply feature OR send a direct message to user ID \`${userId}\``,
      ].join("\n");
      await sendMessage(botToken, adminChatId, forwardText);

      // Send acknowledgement to user
      await sendMessage(botToken, userId, [
        `✓ យើងបានទទួលសារ​របស់​អ្នកហើយ។`,
        `ក្រុមការងាររបស់យើងនឹងឆ្លើយតបក្នុងពេលឆាប់ៗ។`,
        ``,
        `សូមអរគុណ! 🙏`,
      ].join("\n"));
    }

    return json({ ok: true });
  } catch (err) {
    console.error("Webhook error:", err);
    // Always return 200 to Telegram so it doesn't retry forever
    return json({ ok: false, error: String(err) });
  }
});

async function sendMessage(botToken: string, chatId: string | number, text: string) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      console.warn("sendMessage failed:", res.status, await res.text());
    }
  } catch (err) {
    console.warn("sendMessage error:", err);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
