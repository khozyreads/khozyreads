// ============================================================
// Edge Function: telegram-auth
// ============================================================
// Verifies a Telegram Login Widget payload (HMAC-SHA256 of bot token),
// finds-or-creates a corresponding Supabase auth user, and returns
// a magic-link URL the frontend redirects to in order to complete sign-in.
//
// Input (POST JSON):
//   { id, first_name, last_name, username, photo_url, auth_date, hash }
//
// Output: { magic_link: "https://...", is_new: boolean }
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Cache bot info across invocations (warm function reuse)
let _cachedBotInfo: { id: number; username: string } | null = null;

async function fetchBotInfo(botToken: string){
  if (_cachedBotInfo) return _cachedBotInfo;
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    if (!res.ok) return null;
    const body = await res.json();
    if (body?.ok && body?.result?.id) {
      _cachedBotInfo = { id: body.result.id, username: body.result.username };
      return _cachedBotInfo;
    }
  } catch (err) { console.warn("fetchBotInfo failed:", err); }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("BOOKSTORE_SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("BOOKSTORE_SERVICE_ROLE_KEY");
    // Use TELEGRAM_LOGIN_BOT_TOKEN for KhozyReads_bot (login widget).
    // Falls back to TELEGRAM_BOT_TOKEN if only one bot is configured.
    const botToken = Deno.env.get("TELEGRAM_LOGIN_BOT_TOKEN") ?? Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
    if (!url || !serviceKey) return json({ error: "Supabase env missing" }, 500);
    if (!botToken) return json({ error: "TELEGRAM_LOGIN_BOT_TOKEN not set" }, 500);

    // GET ?info=bot — return public bot info (id + username) for frontend redirect auth
    if (req.method === "GET") {
      const u = new URL(req.url);
      if (u.searchParams.get("info") === "bot") {
        const info = await fetchBotInfo(botToken);
        if (!info) return json({ error: "Could not fetch bot info" }, 500);
        return json({ bot_id: info.id, bot_username: info.username });
      }
      return json({ error: "Use ?info=bot for GET" }, 400);
    }

    // Parse body
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return json({ error: "Invalid JSON body" }, 400);

    const { id, first_name, last_name, username, photo_url, auth_date, hash } = body as {
      id?: number | string;
      first_name?: string;
      last_name?: string;
      username?: string;
      photo_url?: string;
      auth_date?: number | string;
      hash?: string;
    };

    if (!id || !auth_date || !hash) {
      return json({ error: "Missing required fields (id, auth_date, hash)" }, 400);
    }

    // ---- Verify Telegram hash ----
    // Telegram docs: https://core.telegram.org/widgets/login#checking-authorization
    // data_check_string = concatenation of ALL received fields (except `hash`),
    //   sorted alphabetically, in format "key=value", joined by '\n'.
    // secret_key = SHA-256(bot_token)
    // expected_hash = HMAC-SHA-256(secret_key, data_check_string)
    const dataFields: Record<string, string> = {};
    for (const [k, v] of Object.entries(body)) {
      if (k === "hash") continue;
      if (v === undefined || v === null || v === "") continue;
      dataFields[k] = String(v);
    }
    const dataCheckString = Object.keys(dataFields)
      .sort()
      .map((k) => `${k}=${dataFields[k]}`)
      .join("\n");
    console.log("data_check_string:", dataCheckString);

    const enc = new TextEncoder();
    const secretKey = await crypto.subtle.digest("SHA-256", enc.encode(botToken));
    const hmacKey = await crypto.subtle.importKey(
      "raw",
      secretKey,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", hmacKey, enc.encode(dataCheckString));
    const expectedHash = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (expectedHash !== String(hash)) {
      console.error("Hash mismatch", { expectedHash, got: hash });
      return json({ error: "Invalid Telegram auth signature" }, 401);
    }

    // ---- Auth_date freshness check (reject older than 1 day) ----
    const authDateNum = typeof auth_date === "string" ? parseInt(auth_date, 10) : auth_date;
    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec - authDateNum > 86400) {
      return json({ error: "Telegram auth data too old, please try again" }, 401);
    }

    // ---- Find or create user ----
    const supabase = createClient(url, serviceKey);
    const tgId = typeof id === "string" ? parseInt(id, 10) : id;
    const placeholderEmail = `tg${tgId}@telegram.khozyreads.local`;
    const displayName = [first_name, last_name].filter(Boolean).join(" ").trim() || `tg_${tgId}`;

    // Username priority: 1) Telegram @username  2) first+last name (sanitized)  3) tg_{id}
    // Telegram Login Widget does NOT return phone number, so phone fallback isn't possible.
    let baseUsername = "";
    if (username) {
      baseUsername = String(username);
    } else if (first_name || last_name) {
      baseUsername = `${first_name}${last_name}`;
    }
    let desiredUsername = baseUsername.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 30);
    if (!desiredUsername) desiredUsername = `tg_${tgId}`;

    // Look up existing profile by telegram_id
    // ---- Find or create user ----
    // Lookup priority:
    //   1) By telegram_id in users_profile (existing TG user with full link)
    //   2) By placeholder email in auth.users (auth exists but profile missing telegram_id)
    //   3) Create new auth user
    let authUserId: string | undefined;
    let isNew = false;

    // (1) Try by telegram_id
    const { data: byTgId, error: tgLookupErr } = await supabase.rpc("find_profile_by_telegram_id", { p_tg_id: tgId });
    if (tgLookupErr) {
      console.error("find_profile_by_telegram_id failed:", tgLookupErr);
      return json({ error: "DB lookup failed (telegram_id)", details: tgLookupErr.message }, 500);
    }
    const existingByTg = (byTgId ?? [])[0] as { profile_id: string; auth_user_id: string; username: string } | undefined;
    if (existingByTg) {
      authUserId = existingByTg.auth_user_id;
    }

    // (2) Fallback: lookup by placeholder email — recovers from past failed profile updates
    if (!authUserId) {
      const { data: byEmail, error: emailLookupErr } = await supabase.rpc("find_auth_user_by_email", { p_email: placeholderEmail });
      if (emailLookupErr) {
        console.error("find_auth_user_by_email failed:", emailLookupErr);
        return json({ error: "DB lookup failed (email)", details: emailLookupErr.message }, 500);
      }
      if (byEmail) {
        authUserId = String(byEmail);
        // Repair: set telegram_id on profile so next time lookup (1) works
        const { error: repairErr } = await supabase
          .from("users_profile")
          .update({ telegram_id: tgId, telegram_username: username || null })
          .eq("auth_user_id", authUserId);
        if (repairErr) console.warn("profile repair failed:", repairErr);
      }
    }

    // (3) Create new auth user only if nothing found
    if (!authUserId) {
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email: placeholderEmail,
        email_confirm: true,
        user_metadata: {
          full_name: displayName,
          avatar_url: photo_url || null,
          telegram_id: tgId,
          telegram_username: username || null,
          provider: "telegram",
        },
      });
      if (createErr || !created?.user) {
        console.error("createUser failed:", createErr);
        return json({ error: "Could not create user", details: createErr?.message }, 500);
      }
      authUserId = created.user.id;
      isNew = true;

      // Set username + telegram fields on the auto-created profile
      const { error: upErr } = await supabase
        .from("users_profile")
        .update({
          telegram_id: tgId,
          telegram_username: username || null,
          username: desiredUsername,
        })
        .eq("auth_user_id", authUserId);
      if (upErr) {
        // Username conflict — append last 4 of telegram_id and retry
        const fallback = `${desiredUsername}_${String(tgId).slice(-4)}`.slice(0, 30);
        await supabase
          .from("users_profile")
          .update({
            telegram_id: tgId,
            telegram_username: username || null,
            username: fallback,
          })
          .eq("auth_user_id", authUserId);
      }
    }

    // ---- Generate magic link + return token_hash for direct verification ----
    // We return the token_hash so the frontend can call sb.auth.verifyOtp() directly,
    // avoiding a cross-origin redirect to supabase.co (which fails inside Messenger /
    // Instagram in-app browsers because they block external navigation).
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: placeholderEmail,
    });
    if (linkErr || !linkData?.properties) {
      console.error("generateLink failed:", linkErr);
      return json({ error: "Could not generate sign-in link", details: linkErr?.message }, 500);
    }

    return json({
      // Primary path: token_hash for in-app/cross-origin-safe verifyOtp
      email: placeholderEmail,
      token_hash: linkData.properties.hashed_token,
      // Fallback: magic_link if frontend prefers redirect (legacy clients)
      magic_link: linkData.properties.action_link,
      is_new: isNew,
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
