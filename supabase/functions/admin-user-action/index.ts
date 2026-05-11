// ============================================================
// Edge Function: admin-user-action
// ============================================================
// Handles privileged user operations that require service_role:
//   - reset_password  → generate random password, return to admin
//   - disable_user    → ban auth.users (so they can't login)
//   - enable_user     → unban auth.users
//
// Caller must be authenticated as admin.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BAN_DURATION = "876000h"; // ~100 years

function randomPassword(len = 12): string {
  // Avoid ambiguous chars (0/O, 1/l/I)
  const chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const arr = new Uint32Array(len);
  crypto.getRandomValues(arr);
  let out = "";
  for (let i = 0; i < len; i++) out += chars[arr[i] % chars.length];
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("BOOKSTORE_SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("BOOKSTORE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Server not configured" }, 500);

  // Verify caller is admin
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Auth required" }, 401);

  const sb = createClient(url, serviceKey);
  const { data: userData, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: "Invalid token" }, 401);

  const { data: callerProfile } = await sb
    .from("users_profile")
    .select("id, username, role")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();

  if (!callerProfile || callerProfile.role !== "admin") {
    return json({ error: "Admin only" }, 403);
  }

  // Parse body
  let body: { action?: string; user_id?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid body" }, 400); }
  const action = body?.action;
  const targetProfileId = body?.user_id;
  if (!action || !targetProfileId) return json({ error: "action and user_id required" }, 400);

  // Resolve target user
  const { data: target } = await sb
    .from("users_profile")
    .select("auth_user_id, username, role")
    .eq("id", targetProfileId)
    .maybeSingle();
  if (!target) return json({ error: "Target user not found" }, 404);

  // Prevent admin from disabling themselves or other admins
  if ((action === "disable_user" || action === "reset_password") && target.role === "admin" && target.auth_user_id !== userData.user.id) {
    // Admin can reset their own password and disable themselves intentionally,
    // but block disabling other admins
    if (action === "disable_user") {
      return json({ error: "Cannot disable another admin" }, 403);
    }
  }

  // ------- Reset password -------
  if (action === "reset_password") {
    const newPassword = randomPassword(12);
    const { error } = await sb.auth.admin.updateUserById(target.auth_user_id, { password: newPassword });
    if (error) return json({ error: error.message }, 500);

    await sb.from("activity_logs").insert({
      action: "user.password_reset",
      actor_user_id: callerProfile.id,
      actor_username: callerProfile.username,
      target_type: "user",
      target_id: targetProfileId,
      details: { target_username: target.username },
    });

    return json({ ok: true, username: target.username, password: newPassword });
  }

  // ------- Disable user -------
  if (action === "disable_user") {
    const { error: banErr } = await sb.auth.admin.updateUserById(target.auth_user_id, { ban_duration: BAN_DURATION });
    if (banErr) return json({ error: banErr.message }, 500);
    await sb.from("users_profile").update({ status: "disabled" }).eq("id", targetProfileId);
    await sb.from("activity_logs").insert({
      action: "user.disable",
      actor_user_id: callerProfile.id,
      actor_username: callerProfile.username,
      target_type: "user",
      target_id: targetProfileId,
      details: { target_username: target.username },
    });
    return json({ ok: true, status: "disabled" });
  }

  // ------- Enable user -------
  if (action === "enable_user") {
    const { error: banErr } = await sb.auth.admin.updateUserById(target.auth_user_id, { ban_duration: "none" });
    if (banErr) return json({ error: banErr.message }, 500);
    await sb.from("users_profile").update({ status: "active" }).eq("id", targetProfileId);
    await sb.from("activity_logs").insert({
      action: "user.enable",
      actor_user_id: callerProfile.id,
      actor_username: callerProfile.username,
      target_type: "user",
      target_id: targetProfileId,
      details: { target_username: target.username },
    });
    return json({ ok: true, status: "active" });
  }

  return json({ error: "Unknown action: " + action }, 400);
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
