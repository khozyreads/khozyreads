import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get("BOOKSTORE_SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("BOOKSTORE_SERVICE_ROLE_KEY");
  const telegramBotToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const telegramAdminChatId = Deno.env.get("TELEGRAM_ADMIN_CHAT_ID");

  if (!supabaseUrl || !serviceRoleKey || !telegramBotToken || !telegramAdminChatId) {
    return json({ error: "Missing Edge Function secrets" }, 500);
  }

  const update = await req.json();
  const callback = update.callback_query;
  if (!callback?.data) return json({ ok: true });

  const callbackChatId = String(callback.message?.chat?.id ?? callback.from?.id ?? "");
  if (callbackChatId !== String(telegramAdminChatId)) {
    await answerCallback(telegramBotToken, callback.id, "Unauthorized");
    return json({ error: "Unauthorized Telegram chat" }, 403);
  }

  const [action, orderId] = String(callback.data).split(":");
  if (!["approve", "reject"].includes(action) || !orderId) {
    await answerCallback(telegramBotToken, callback.id, "Invalid action");
    return json({ error: "Invalid callback data" }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const result = action === "approve"
    ? await approveOrder(supabase, orderId, "telegram", callback.from?.username || callback.from?.id || "telegram")
    : await rejectOrder(supabase, orderId, "telegram", callback.from?.username || callback.from?.id || "telegram", "Rejected from Telegram");

  if (result.error) {
    await answerCallback(telegramBotToken, callback.id, result.error);
    return json({ error: result.error }, 400);
  }

  const message = action === "approve" ? "Order approved successfully." : "Order rejected successfully.";
  await answerCallback(telegramBotToken, callback.id, message);
  await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: telegramAdminChatId, text: message }),
  });

  return json({ ok: true });
});

async function approveOrder(supabase: any, orderId: string, source: string, actor: string) {
  const { data: order, error } = await supabase.from("orders").select("*").eq("id", orderId).single();
  if (error) return { error: error.message };

  const { error: updateError } = await supabase
    .from("orders")
    .update({ status: "approved", approved_at: new Date().toISOString(), rejected_at: null, reject_reason: null })
    .eq("id", orderId);
  if (updateError) return { error: updateError.message };

  const { error: libraryError } = await supabase.from("user_library").upsert({
    user_id: order.user_id,
    book_id: order.book_id,
    access_status: "active",
  }, { onConflict: "user_id,book_id" });
  if (libraryError) return { error: libraryError.message };

  await supabase.from("payment_approval_logs").insert({
    order_id: orderId,
    action: "approved",
    action_by: String(actor),
    action_source: source,
  });
  return { ok: true };
}

async function rejectOrder(supabase: any, orderId: string, source: string, actor: string, reason: string) {
  const { data: order, error } = await supabase.from("orders").select("*").eq("id", orderId).single();
  if (error) return { error: error.message };

  const { error: updateError } = await supabase
    .from("orders")
    .update({ status: "rejected", rejected_at: new Date().toISOString(), reject_reason: reason })
    .eq("id", orderId);
  if (updateError) return { error: updateError.message };

  await supabase
    .from("user_library")
    .update({ access_status: "locked" })
    .eq("user_id", order.user_id)
    .eq("book_id", order.book_id);

  await supabase.from("payment_approval_logs").insert({
    order_id: orderId,
    action: "rejected",
    action_by: String(actor),
    action_source: source,
    remark: reason,
  });
  return { ok: true };
}

async function answerCallback(token: string, callbackQueryId: string, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
