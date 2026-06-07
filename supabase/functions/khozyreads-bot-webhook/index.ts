// ============================================================
// Edge Function: khozyreads-bot-webhook
// ============================================================
// Webhook endpoint for @KhozyReads_bot. Telegram calls this URL
// every time a user interacts with the bot.
//
// Features:
//   - /start, /help commands
//   - Forward user DMs to admin chat
//   - Admin reply via Telegram swipe-reply OR /reply USER_ID MESSAGE
//
// Setup:
//   - Set KHOZY_BOT_ADMIN_CHAT_ID secret (admin's Telegram numeric ID)
//   - Admin must /start the bot before forwarding works
//   - Verify JWT must be OFF
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
    const adminChatId = Deno.env.get("KHOZY_BOT_ADMIN_CHAT_ID") ?? Deno.env.get("TELEGRAM_ADMIN_CHAT_ID");
    if (!botToken) return json({ error: "TELEGRAM_LOGIN_BOT_TOKEN not set" }, 500);

    const update = await req.json().catch(() => null);
    if (!update) return json({ ok: true });

    const msg = update.message;
    if (!msg || !msg.from) return json({ ok: true });

    const userId = msg.from.id;
    const userName = msg.from.username || `${msg.from.first_name || ""} ${msg.from.last_name || ""}`.trim() || `tg_${userId}`;
    const text = (msg.text || "").trim();
    const isAdmin = adminChatId && String(userId) === String(adminChatId);

    // ===== ADMIN REPLY HANDLERS =====
    // Cara 1: Admin reply to forwarded message (Telegram swipe-reply)
    if (isAdmin && msg.reply_to_message?.text && text) {
      const idMatch = msg.reply_to_message.text.match(/ID:\s*(\d+)/);
      if (idMatch) {
        const targetUserId = idMatch[1];
        await sendMessage(botToken, targetUserId, [
          `💬 *សារពី KhozyReads*`,
          ``,
          text,
        ].join("\n"));
        await sendMessage(
          botToken,
          adminChatId,
          `✓ Reply sent to user <code>${targetUserId}</code>`,
          "HTML"
        );
        return json({ ok: true });
      }
    }

    // Cara 2: /reply USER_ID MESSAGE command
    if (isAdmin && text.startsWith("/reply ")) {
      const m = text.slice(7).trim().match(/^(\d+)\s+([\s\S]+)$/);
      if (m) {
        const targetUserId = m[1];
        const replyText = m[2];
        await sendMessage(botToken, targetUserId, [
          `💬 *សារពី KhozyReads*`,
          ``,
          replyText,
        ].join("\n"));
        await sendMessage(
          botToken,
          adminChatId,
          `✓ Reply sent to user <code>${targetUserId}</code>`,
          "HTML"
        );
      } else {
        await sendMessage(
          botToken,
          adminChatId,
          `❌ Usage: /reply USER_ID MESSAGE\nExample: /reply 123456789 Halo`
        );
      }
      return json({ ok: true });
    }

    // ===== USER COMMANDS =====
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
      const helpLines = [
        `📚 *KhozyReads — ជំនួយ*`,
        ``,
        `• ស្វែងរកសៀវភៅ៖ https://khozyreads.com`,
        `• ការគាំទ្រ៖ សរសេរសារនៅទីនេះ យើងនឹងឆ្លើយតបក្នុងពេលឆាប់ៗ`,
        ``,
        `Commands:`,
        `/start - ចាប់ផ្តើម`,
        `/help - មើលជំនួយ`,
      ];
      if (isAdmin) {
        helpLines.push(``, `Admin commands:`, `/reply USER_ID MESSAGE - Reply to a specific user`);
      }
      await sendMessage(botToken, userId, helpLines.join("\n"));
      return json({ ok: true });
    }

    // ===== FORWARD USER MESSAGE TO ADMIN =====
    // Don't forward admin's own non-command messages back to themselves
    if (!isAdmin && adminChatId && text) {
      const safeName = escapeHtml(userName);
      const safeText = escapeHtml(text.length > 3500 ? text.slice(0, 3500) + "…" : text);
      const forwardText = [
        `📩 <b>New message from KhozyReads bot</b>`,
        ``,
        `From: ${safeName} (ID: <code>${userId}</code>)`,
        ``,
        `Message:`,
        safeText,
        ``,
        `💬 <b>How to reply:</b> Swipe-reply to this message OR type <code>/reply ${userId} YOUR_TEXT</code>`,
      ].join("\n");
      await sendMessage(botToken, adminChatId, forwardText, "HTML");

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
    return json({ ok: false, error: String(err) });
  }
});

async function sendMessage(botToken, chatId, text, parseMode = "Markdown") {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: parseMode,
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

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
