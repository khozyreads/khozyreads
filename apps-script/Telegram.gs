/**
 * Telegram.gs - optional notifications + optional inline approve/reject.
 *
 * Configure via Script Properties:
 *   TELEGRAM_BOT_TOKEN
 *   TELEGRAM_ADMIN_CHAT_ID
 *
 * Webhook URL:
 *   {WEB_APP_URL}?tg=1
 */

function notifyTelegram_(orderId) {
  const cfg = config_();
  if (!cfg.telegramBotToken || !cfg.telegramAdminChatId) {
    log_('telegram_not_configured', '', 'system', {
      has_bot_token: !!cfg.telegramBotToken,
      has_admin_chat_id: !!cfg.telegramAdminChatId
    });
    return { sent: false, reason: 'Telegram Bot Token or Admin Chat ID is missing.' };
  }

  const order = findOne_('Orders', function (o) { return o.order_id === orderId; });
  if (!order) return { sent: false, reason: 'Order not found.' };

  const dashboardUrl = ScriptApp.getService().getUrl() || '';
  const text = [
    'New Payment Request',
    '',
    'Order ID: ' + order.order_id,
    'Buyer: ' + order.username,
    'Book: ' + order.book_title,
    'Amount: ' + order.amount + ' ' + order.currency,
    'Submitted At: ' + order.created_at,
    '',
    'Open the admin dashboard to view the payment proof and approve:',
    dashboardUrl,
    '',
    'Please verify payment in ABA before approving.'
  ].join('\n');

  const inlineKeyboard = {
    inline_keyboard: [[
      { text: 'Approve', callback_data: 'approve:' + order.order_id },
      { text: 'Reject', callback_data: 'reject:' + order.order_id }
    ]]
  };

  try {
    const response = UrlFetchApp.fetch('https://api.telegram.org/bot' + cfg.telegramBotToken + '/sendMessage', {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      payload: JSON.stringify({
        chat_id: cfg.telegramAdminChatId,
        text: text,
        reply_markup: inlineKeyboard
      })
    });
    const code = response.getResponseCode();
    const body = response.getContentText();
    if (code < 200 || code >= 300) {
      log_('telegram_send_failed', '', 'system', { code: code, response: body, order_id: orderId });
      return { sent: false, reason: 'Telegram API error ' + code };
    }
    log_('telegram_sent', '', 'system', { order_id: orderId });
    return { sent: true };
  } catch (e) {
    logError_('telegram_send', e);
    return { sent: false, reason: e.message || String(e) };
  }
}

function telegramWebhook_(e) {
  const cfg = config_();
  if (!cfg.telegramBotToken || !cfg.telegramAdminChatId) {
    return ContentService.createTextOutput('disabled');
  }
  let body = {};
  try { body = JSON.parse(e.postData.contents); } catch (_) {}

  if (body.callback_query) {
    const cq = body.callback_query;
    const fromId = cq.from && cq.from.id ? String(cq.from.id) : '';
    const chatId = cq.message && cq.message.chat && cq.message.chat.id ? String(cq.message.chat.id) : '';
    if (chatId !== String(cfg.telegramAdminChatId) && fromId !== String(cfg.telegramAdminChatId)) {
      tgAnswerCallback_(cfg, cq.id, 'Not authorised.');
      return ContentService.createTextOutput('forbidden');
    }

    const data = String(cq.data || '');
    const sep = data.indexOf(':');
    const action = data.substring(0, sep);
    const orderId = data.substring(sep + 1);

    try {
      if (action === 'approve') {
        approveOrderInternal_(orderId, 'telegram');
        tgAnswerCallback_(cfg, cq.id, 'Approved');
      } else if (action === 'reject') {
        rejectOrderInternal_(orderId, 'rejected via Telegram', 'telegram');
        tgAnswerCallback_(cfg, cq.id, 'Rejected');
      } else {
        tgAnswerCallback_(cfg, cq.id, 'Unknown action');
      }
    } catch (err) {
      logError_('telegram_action', err);
      tgAnswerCallback_(cfg, cq.id, 'Error: ' + (err.message || err));
    }
  }

  return ContentService.createTextOutput('ok');
}

function tgAnswerCallback_(cfg, id, text) {
  try {
    UrlFetchApp.fetch('https://api.telegram.org/bot' + cfg.telegramBotToken + '/answerCallbackQuery', {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      payload: JSON.stringify({ callback_query_id: id, text: text || '' })
    });
  } catch (_) {}
}

function approveOrderInternal_(orderId, source) {
  const order = findOne_('Orders', function (o) { return o.order_id === orderId; });
  if (!order) throw new Error('Order not found.');
  if (order.status === 'approved') return;
  update_('Orders', 'order_id', orderId, {
    status: 'approved',
    approved_at: now_(),
    approved_by: 'telegram-admin',
    rejected_at: '',
    reject_reason: ''
  });
  upsertLibrary_(order.user_id, order.book_id, 'active');
  log_('order_approved', '', 'telegram-admin', { order_id: orderId, source: source });
}

function rejectOrderInternal_(orderId, reason, source) {
  const order = findOne_('Orders', function (o) { return o.order_id === orderId; });
  if (!order) throw new Error('Order not found.');
  update_('Orders', 'order_id', orderId, {
    status: 'rejected',
    rejected_at: now_(),
    reject_reason: reason || 'rejected'
  });
  upsertLibrary_(order.user_id, order.book_id, 'locked');
  log_('order_rejected', '', 'telegram-admin', { order_id: orderId, source: source, reason: reason });
}
