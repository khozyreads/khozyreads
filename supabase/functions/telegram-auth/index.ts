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
    // data_check_string = sorted "key=value" lines from all fields except `hash`
    // secret_key = SHA-256(bot_token)
    // expected_hash = HMAC-SHA-256(secret_key, data_check_string)
    const dataFields: Record<string, string> = {};
    for (const k of ["auth_date", "first_name", "id", "last_name", "photo_url", "username"]) {
      const v = (body as Record<string, unknown>)[k];
      if (v !== undefined && v !== null && v !== "") {
        dataFields[k] = String(v);
      }
    }
    const dataCheckString = Object.keys(dataFields)
      .sort()
      .map((k) => `${k}=${dataFields[k]}`)
      .join("\n");

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
    const desiredUsername = (username ? String(username) : `tg_${tgId}`).toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 30) || `tg_${tgId}`;

    // Look up existing profile by telegram_id
    const { data: existingRows, error: lookupErr } = await supabase.rpc("find_profile_by_telegram_id", { p_tg_id: tgId });
    if (lookupErr) {
      console.error("find_profile_by_telegram_id failed:", lookupErr);
      return json({ error: "DB lookup failed", details: lookupErr.message }, 500);
    }
    const existing = (existingRows ?? [])[0] as { profile_id: string; auth_user_id: string; username: string } | undefined;

    let authUserId: string;
    let isNew = false;

    if (existing) {
      authUserId = existing.auth_user_id;
    } else {
      // Create new auth user
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

      // Update users_profile with telegram fields. The auto-created profile (from trigger)
      // will have a generated username — overwrite with telegram-derived one.
      const { error: upErr } = await supabase
        .from("users_profile")
        .update({
          telegram_id: tgId,
          telegram_username: username || null,
          username: desiredUsername,
        })
        .eq("auth_user_id", authUserId);
      if (upErr) {
        // Username conflict possible — append numeric suffix and retry
        const fallback = `${desiredUsername}_${String(tgId).slice(-4)}`;
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

    // ---- Generate magic link for sign-in ----
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: placeholderEmail,
    });
    if (linkErr || !linkData?.properties?.action_link) {
      console.error("generateLink failed:", linkErr);
      return json({ error: "Could not generate sign-in link", details: linkErr?.message }, 500);
    }

    return json({
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
