// ============================================================
// Edge Function: notify-order-buyer
// ============================================================
// Called by admin dashboard AFTER admin_approve_order / admin_reject_order
// RPC succeeds. Looks up the buyer's telegram_id and sends a Khmer DM
// via @KhozyReads_bot. Silent skip if buyer has no telegram_id.
//
// Input (POST JSON):
//   { order_id: uuid, result: "approved"|"rejected", reason?: string }
//
// Output: { ok: true, notified: boolean, reason?: string }
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
    const { data: callerProfile } = await supabase
      .from("users_profile")
      .select("role")
      .eq("auth_user_id", userData.user.id)
      .single();
    if (!callerProfile || !["seller", "admin"].includes(callerProfile.role)) {
      return json({ error: "Staff only" }, 403);
    }

    // ---- Parse input ----
    const body = await req.json().catch(() => null);
    const orderId = body?.order_id;
    const result = body?.result;
    const reason = body?.reason ?? "";
    if (!orderId || !result || !["approved", "rejected"].includes(result)) {
      return json({ error: "order_id and result (approved|rejected) required" }, 400);
    }

    // ---- Look up order + buyer telegram_id + book title ----
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("user_id, book_id")
      .eq("id", orderId)
      .single();
    if (orderErr || !order) return json({ error: "Order not found" }, 404);

    const { data: profile } = await supabase
      .from("users_profile")
      .select("telegram_id")
      .eq("id", order.user_id)
      .single();
    if (!profile?.telegram_id) {
      return json({ ok: true, notified: false, reason: "Buyer has no telegram_id" });
    }

    const { data: book } = await supabase
      .from("books")
      .select("title")
      .eq("id", order.book_id)
      .single();
    const bookTitle = book?.title ?? "សៀវភៅរបស់អ្នក";

    // ---- Build Khmer message ----
    let text: string;
    if (result === "approved") {
      const readUrl = `https://khozyreads.com/#/read/${order.book_id}`;
      text = [
        `🎉 *ការទូទាត់ត្រូវបានអនុម័ត!*`,
        ``,
        `សៀវភៅ "${bookTitle}" រួចរាល់ក្នុងបណ្ណាល័យរបស់អ្នកហើយ។`,
        `ចាប់ផ្តើមអាននៅ៖ ${readUrl}`,
        ``,
        `សូមអរគុណចំពោះការគាំទ្រពី KhozyReads 📚`,
      ].join("\n");
    } else {
      const reasonText = (reason && String(reason).trim()) ? String(reason).trim() : "មិនបានបញ្ជាក់";
      const retryUrl = `https://khozyreads.com/#/book/${order.book_id}`;
      text = [
        `❌ *ការទូទាត់ត្រូវបានបដិសេធ*`,
        ``,
        `សៀវភៅ៖ "${bookTitle}"`,
        `មូលហេតុ៖ ${reasonText}`,
        ``,
        `សូមព្យាយាមម្តងទៀតនៅ៖ ${retryUrl}`,
        `ប្រសិនបើមានសំណួរ សូមទាក់ទងគាំទ្ររបស់យើង។`,
      ].join("\n");
    }

    // ---- Send to Telegram ----
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: profile.telegram_id,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: result === "rejected",
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn("Telegram send failed:", res.status, errText);
      return json({ ok: true, notified: false, reason: `Telegram API ${res.status}: ${errText.slice(0, 200)}` });
    }

    return json({ ok: true, notified: true });
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
