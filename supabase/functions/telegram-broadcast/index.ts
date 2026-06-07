// ============================================================
// Edge Function: telegram-broadcast
// ============================================================
// Admin-only manual broadcast to all Telegram-linked users.
// Iterates over telegram_id list, sends DM via KhozyReads_bot,
// records audit log + per-recipient failures.
//
// Input (POST JSON):
//   { message: string, parse_mode?: "Markdown"|"HTML"|null }
//
// Output: { ok: true, total: N, sent: N, failed: N, failures?: [...] }
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("BOOKSTORE_SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("BOOKSTORE_SERVICE_ROLE_KEY");
    const botToken = Deno.env.get("TELEGRAM_LOGIN_BOT_TOKEN") ?? Deno.env.get("TELEGRAM_BOT_TOKEN");
    if (!supabaseUrl || !serviceKey) return json({ error: "Supabase env missing" }, 500);
    if (!botToken) return json({ error: "TELEGRAM_LOGIN_BOT_TOKEN not set" }, 500);

    const supabase = createClient(supabaseUrl, serviceKey);

    // ---- Auth: caller must be staff ----
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return json({ error: "Missing user token" }, 401);
    const { data: userData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !userData.user) return json({ error: "Invalid user token" }, 401);
    const { data: profile } = await supabase
      .from("users_profile")
      .select("id, role, username")
      .eq("auth_user_id", userData.user.id)
      .single();
    if (!profile || !["seller", "admin"].includes(profile.role)) {
      return json({ error: "Staff only" }, 403);
    }

    // ---- Parse body ----
    const body = await req.json().catch(() => null);
    const message = (body?.message ?? "").toString().trim();
    const photoUrl = body?.photo_url ? String(body.photo_url).trim() : "";
    const parseMode = body?.parse_mode === "HTML" || body?.parse_mode === "Markdown"
      ? body.parse_mode
      : "Markdown";
    if (!message && !photoUrl) return json({ error: "Message or image required" }, 400);
    // sendPhoto caption limit is 1024; sendMessage limit is 4096
    const maxLen = photoUrl ? 1024 : 4000;
    if (message.length > maxLen) {
      return json({ error: `Message too long (max ${maxLen} chars when ${photoUrl ? "image attached" : "text-only"})` }, 400);
    }

    // ---- Get recipients ----
    const { data: recipients, error: rcpErr } = await supabase.rpc("list_telegram_recipients");
    if (rcpErr) return json({ error: "Failed to list recipients", details: rcpErr.message }, 500);
    const list = (recipients ?? []) as { telegram_id: number; username: string; full_name: string }[];
    if (list.length === 0) {
      return json({ ok: true, total: 0, sent: 0, failed: 0, message: "No Telegram-linked users" });
    }

    // ---- Send to each recipient with throttling (Telegram limit: ~30 msg/sec) ----
    let sent = 0;
    let failed = 0;
    const failures: Array<{ telegram_id: number; username: string; reason: string }> = [];

    // Pick Telegram method: sendPhoto when image present, else sendMessage
    const tgMethod = photoUrl ? "sendPhoto" : "sendMessage";
    const buildPayload = (chatId: number) => photoUrl
      ? { chat_id: chatId, photo: photoUrl, caption: message || undefined, parse_mode: message ? parseMode : undefined }
      : { chat_id: chatId, text: message, parse_mode: parseMode, disable_web_page_preview: false };

    for (let i = 0; i < list.length; i++) {
      const rcp = list[i];
      try {
        const res = await fetch(`https://api.telegram.org/bot${botToken}/${tgMethod}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildPayload(rcp.telegram_id)),
        });
        if (res.ok) {
          sent++;
        } else {
          failed++;
          const errText = await res.text();
          failures.push({ telegram_id: rcp.telegram_id, username: rcp.username, reason: errText.slice(0, 200) });
        }
      } catch (err) {
        failed++;
        failures.push({ telegram_id: rcp.telegram_id, username: rcp.username, reason: String(err).slice(0, 200) });
      }
      // Throttle: 50ms between sends → max 20 msg/sec (under Telegram's 30/sec limit)
      if (i < list.length - 1) await new Promise((r) => setTimeout(r, 50));
    }

    // ---- Audit log ----
    await supabase.from("telegram_broadcast_logs").insert({
      message,
      recipients_total: list.length,
      sent_count: sent,
      failed_count: failed,
      failed_reasons: failures.length > 0 ? failures : null,
      sent_by: profile.id,
    });

    return json({
      ok: true,
      total: list.length,
      sent,
      failed,
      failures: failures.slice(0, 20), // return first 20 failures only
    });
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
