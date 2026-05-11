/**
 * Admin.gs - settings, users, logs.
 */

const EDITABLE_SETTINGS = [
  'website_name',
  'aba_account_name',
  'aba_account_number',
  'working_hours_start',
  'working_hours_end',
  'payment_notice_kh',
  'payment_notice_en',
  'telegram_group_link',
  'telegram_button_text',
  'default_currency'
];

const ADMIN_USER_ROLES = ['buyer', 'seller', 'admin'];
const ADMIN_USER_STATUSES = ['active', 'disabled'];

function getSettings(payload) {
  // Admin gets every key; buyers/guests should use bootstrap() instead.
  requireAdmin_(payload && payload.token);
  return { settings: withPublicSettingUrls_(settingsMap_()) };
}

function saveSettings(payload) {
  const admin = requireAdmin_(payload && payload.token);
  const incoming = (payload && payload.settings) || {};
  const cleanSettings = {};

  // Optional QR upload - separate file param.
  if (payload && payload.aba_qr_file && payload.aba_qr_file.base64) {
    const up = uploadFile_(
      payload.aba_qr_file,
      'drive_folder_covers',
      'aba_qr_' + Date.now() + '.' + extFor_(payload.aba_qr_file.mimeType),
      ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    );
    try {
      DriveApp.getFileById(up.fileId)
        .setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (_) {}
    cleanSettings.aba_qr_file_id = up.fileId;
  }

  Object.keys(incoming).forEach(function (key) {
    if (EDITABLE_SETTINGS.indexOf(key) === -1) return;
    cleanSettings[key] = String(incoming[key] || '');
  });
  if (Object.keys(cleanSettings).length) setSettingsBulk_(cleanSettings);

  log_('settings_updated', admin.user_id, admin.username, { keys: Object.keys(cleanSettings) });
  return { settings: withPublicSettingUrls_(settingsMap_()) };
}

function withPublicSettingUrls_(settings) {
  const out = Object.assign({}, settings || {});
  if (out.aba_qr_file_id) out.aba_qr_url = streamUrl_('image', out.aba_qr_file_id);
  return out;
}

function adminListUsers(payload) {
  requireAdmin_(payload && payload.token);
  const list = rows_('Users').map(function (u) {
    return publicAdminUser_(u);
  });
  return { users: list };
}

function adminCreateUser(payload) {
  const admin = requireAdmin_(payload && payload.token);
  const data = (payload && payload.user) || {};
  const username = sanitizeUsername_(data.username);
  const password = String(data.password || '');
  const role = normalizeAdminUserRole_(data.role || 'buyer');
  const status = normalizeAdminUserStatus_(data.status || 'active');

  validatePassword_(password);
  if (findOne_('Users', function (u) { return String(u.username).toLowerCase() === username; })) {
    throw new Error('Username already exists.');
  }

  const salt = randomHex_(16);
  const user = append_('Users', {
    user_id: id_(),
    username: username,
    password_hash: hashPassword_(password, salt),
    password_salt: salt,
    role: role,
    status: status,
    created_at: now_(),
    last_login: ''
  });
  log_('admin_user_created', admin.user_id, admin.username, { username: username, role: role, status: status });
  return { user: publicAdminUser_(user) };
}

function adminUpdateUser(payload) {
  const admin = requireAdmin_(payload && payload.token);
  const data = (payload && payload.user) || {};
  const userId = String(data.user_id || '');
  if (!userId) throw new Error('User ID is required.');

  const user = findOne_('Users', function (u) { return String(u.user_id) === userId; });
  if (!user) throw new Error('User not found.');

  const patch = {};
  if (data.role !== undefined) patch.role = normalizeAdminUserRole_(data.role);
  if (data.status !== undefined) patch.status = normalizeAdminUserStatus_(data.status);
  if (!Object.keys(patch).length) throw new Error('No user changes provided.');
  if (userId === admin.user_id && patch.status && patch.status !== 'active') {
    throw new Error('You cannot disable your own admin account.');
  }
  if (userId === admin.user_id && patch.role && patch.role !== 'admin') {
    throw new Error('You cannot remove your own admin role.');
  }

  update_('Users', 'user_id', userId, patch);
  log_('admin_user_updated', admin.user_id, admin.username, Object.assign({ user_id: userId }, patch));
  return { user: publicAdminUser_(findOne_('Users', function (u) { return String(u.user_id) === userId; })) };
}

function adminDeleteUser(payload) {
  const admin = requireAdmin_(payload && payload.token);
  const userId = String(payload && payload.user_id || '');
  if (!userId) throw new Error('User ID is required.');
  if (userId === admin.user_id) throw new Error('You cannot delete your own admin account.');

  const user = findOne_('Users', function (u) { return String(u.user_id) === userId; });
  if (!user) throw new Error('User not found.');

  const hasOrders = !!findOne_('Orders', function (o) { return String(o.user_id) === userId; });
  const hasLibrary = !!findOne_('Library', function (l) { return String(l.user_id) === userId; });
  if (hasOrders || hasLibrary) {
    update_('Users', 'user_id', userId, { status: 'disabled' });
    log_('admin_user_disabled_instead_of_deleted', admin.user_id, admin.username, {
      user_id: userId,
      username: user.username
    });
    return { deleted: false, disabled: true };
  }

  deleteById_('Users', 'user_id', userId);
  log_('admin_user_deleted', admin.user_id, admin.username, { user_id: userId, username: user.username });
  return { deleted: true };
}

function adminTestTelegram(payload) {
  const admin = requireAdmin_(payload && payload.token);
  const cfg = config_();
  if (!cfg.telegramBotToken || !cfg.telegramAdminChatId) {
    throw new Error('Set TELEGRAM_BOT_TOKEN and TELEGRAM_ADMIN_CHAT_ID in Script Properties first.');
  }
  const response = UrlFetchApp.fetch('https://api.telegram.org/bot' + cfg.telegramBotToken + '/sendMessage', {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    payload: JSON.stringify({
      chat_id: cfg.telegramAdminChatId,
      text: 'KhozyReads Telegram test from ' + admin.username
    })
  });
  const code = response.getResponseCode();
  const body = response.getContentText();
  if (code < 200 || code >= 300) {
    log_('telegram_test_failed', admin.user_id, admin.username, { code: code, response: body });
    throw new Error('Telegram test failed: ' + code + '. Check Logs tab.');
  }
  log_('telegram_test_sent', admin.user_id, admin.username, {});
  return { sent: true };
}

function publicAdminUser_(u) {
  return {
    user_id: u.user_id,
    username: u.username,
    role: u.role,
    status: u.status,
    created_at: u.created_at,
    last_login: u.last_login
  };
}

function normalizeAdminUserRole_(role) {
  const value = String(role || '').toLowerCase();
  if (ADMIN_USER_ROLES.indexOf(value) === -1) throw new Error('Invalid role.');
  return value;
}

function normalizeAdminUserStatus_(status) {
  const value = String(status || '').toLowerCase();
  if (ADMIN_USER_STATUSES.indexOf(value) === -1) throw new Error('Invalid status.');
  return value;
}

function adminListLogs(payload) {
  requireAdmin_(payload && payload.token);
  const list = rows_('Logs');
  list.sort(function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)); });
  return { logs: list.slice(0, 500) };
}
