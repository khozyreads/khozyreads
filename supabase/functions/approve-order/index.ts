import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("BOOKSTORE_SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("BOOKSTORE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Missing Edge Function secrets" }, 500);

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const actor = await requireStaff(req, supabase);
  if (!actor.ok) return json({ error: actor.error }, actor.status);

  const { order_id } = await req.json();
  const { data: order, error } = await supabase.from("orders").select("*").eq("id", order_id).single();
  if (error) return json({ error: error.message }, 400);

  const { error: updateError } = await supabase
    .from("orders")
    .update({ status: "approved", approved_at: new Date().toISOString(), approved_by: actor.profile.id, rejected_at: null, reject_reason: null })
    .eq("id", order_id);
  if (updateError) return json({ error: updateError.message }, 400);

  await supabase.from("user_library").upsert({
    user_id: order.user_id,
    book_id: order.book_id,
    access_status: "active",
  }, { onConflict: "user_id,book_id" });

  await supabase.from("payment_approval_logs").insert({
    order_id,
    action: "approved",
    action_by: actor.profile.username,
    action_source: "dashboard",
  });

  return json({ ok: true });
});

async function requireStaff(req: Request, supabase: any) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return { ok: false, status: 401, error: "Missing user token" };
  const { data: userData, error } = await supabase.auth.getUser(token);
  if (error || !userData.user) return { ok: false, status: 401, error: "Invalid user token" };
  const { data: profile } = await supabase
    .from("users_profile")
    .select("*")
    .eq("auth_user_id", userData.user.id)
    .single();
  if (!profile || !["seller", "admin"].includes(profile.role)) return { ok: false, status: 403, error: "Staff only" };
  return { ok: true, profile };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
