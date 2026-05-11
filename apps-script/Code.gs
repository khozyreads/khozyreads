/**
 * KhozyReads — Google Apps Script Web App
 * Entry point + request router.
 *
 * Configuration is read from Script Properties so you don't commit secrets.
 * Required Script Properties:
 *   SPREADSHEET_ID         — your Google Sheet ID
 *   DRIVE_ROOT_FOLDER_ID   — root Drive folder for KhozyReads (optional, auto-created if missing)
 *   ADMIN_BOOTSTRAP_USER   — username that becomes admin on first registration (optional)
 *
 * Optional (Telegram):
 *   TELEGRAM_BOT_TOKEN
 *   TELEGRAM_ADMIN_CHAT_ID
 *
 * Run setupKhozyReads() once from the Apps Script editor after setting properties.
 */

// ---------- Web App entry points ----------

function doGet(e) {
  try {
    ensureReady_();
    const page = (e && e.parameter && e.parameter.page) || '';
    // Secure file streaming endpoints. Token is checked server-side.
    if (page === 'stream') return streamFile_(e.parameter);
    if (page === 'pdf') return streamPdf_(e.parameter);
    // JSON API via GET (used as fallback / JSONP)
    const action = e && e.parameter && e.parameter.action;
    if (action) return jsonRoute_(e);
    // Default: serve the SPA
    return renderApp_();
  } catch (err) {
    logError_('doGet', err);
    return HtmlService.createHtmlOutput(friendlyError_(err));
  }
}

function doPost(e) {
  try {
    ensureReady_();
    // Telegram webhook (optional)
    if (e && e.parameter && e.parameter.tg === '1') {
      return telegramWebhook_(e);
    }
    return jsonRoute_(e);
  } catch (err) {
    logError_('doPost', err);
    return jsonOut_({ ok: false, error: friendlyError_(err) });
  }
}

function renderApp_() {
  const tpl = HtmlService.createTemplateFromFile('Index');
  tpl.bootstrap = JSON.stringify({
    settings: publicSettings_(),
    appUrl: ScriptApp.getService().getUrl()
  });
  return tpl.evaluate()
    .setTitle('KhozyReads')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include_(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/**
 * Bridge for google.script.run — accepts the same shape as the JSON router.
 * Returns a plain object (Apps Script serialises it for the client).
 */
function runApi(body) {
  try {
    ensureReady_();
    const action = body && body.action;
    if (!action) return { ok: false, error: 'Missing action' };

    const routes = {
      bootstrap: bootstrap,
      listBooks: listBooks,
      getBook: getBook,
      getBookState: getBookState,
      streamBase64: streamBase64_,
      register: register,
      login: login,
      logout: logout,
      me: me,
      createOrder: createOrder,
      uploadPaymentProof: uploadPaymentProof,
      myLibrary: myLibrary,
      openReader: openReader,
      adminListBooks: adminListBooks,
      saveBook: saveBook,
      archiveBook: archiveBook,
      adminListOrders: adminListOrders,
      approveOrder: approveOrder,
      rejectOrder: rejectOrder,
      getSettings: getSettings,
      saveSettings: saveSettings,
      adminListUsers: adminListUsers,
      adminCreateUser: adminCreateUser,
      adminUpdateUser: adminUpdateUser,
      adminDeleteUser: adminDeleteUser,
      adminTestTelegram: adminTestTelegram,
      adminListLogs: adminListLogs
    };
    const handler = routes[action];
    if (!handler) return { ok: false, error: 'Unknown action: ' + action };

    const result = handler(body) || {};
    return Object.assign({ ok: true }, result);
  } catch (err) {
    logError_('runApi:' + (body && body.action), err);
    return { ok: false, error: friendlyError_(err) };
  }
}

// ---------- JSON Router ----------

function jsonRoute_(e) {
  const payload = parsePayload_(e);
  const action = payload.action || (e && e.parameter && e.parameter.action);
  if (!action) throw new Error('Missing action');

  const routes = {
    // public
    bootstrap: bootstrap,
    listBooks: listBooks,
    getBook: getBook,
    getBookState: getBookState,
    streamBase64: streamBase64_,
    // auth
    register: register,
    login: login,
    logout: logout,
    me: me,
    // buyer
    createOrder: createOrder,
    uploadPaymentProof: uploadPaymentProof,
    myLibrary: myLibrary,
    openReader: openReader,
    // admin
    adminListBooks: adminListBooks,
    saveBook: saveBook,
    archiveBook: archiveBook,
    adminListOrders: adminListOrders,
    approveOrder: approveOrder,
    rejectOrder: rejectOrder,
    getSettings: getSettings,
    saveSettings: saveSettings,
    adminListUsers: adminListUsers,
    adminCreateUser: adminCreateUser,
    adminUpdateUser: adminUpdateUser,
    adminDeleteUser: adminDeleteUser,
    adminTestTelegram: adminTestTelegram,
    adminListLogs: adminListLogs
  };

  const handler = routes[action];
  if (!handler) throw new Error('Unknown action: ' + action);

  try {
    const result = handler(payload) || { ok: true };
    return jsonOut_(Object.assign({ ok: true }, result), e);
  } catch (err) {
    logError_('action:' + action, err);
    return jsonOut_({ ok: false, error: friendlyError_(err) }, e);
  }
}

function parsePayload_(e) {
  if (!e) return {};
  if (e.postData && e.postData.contents) {
    try { return JSON.parse(e.postData.contents); } catch (_) { /* fallthrough */ }
  }
  if (e.parameter && e.parameter.payload) {
    try { return JSON.parse(e.parameter.payload); } catch (_) { /* fallthrough */ }
  }
  return Object.assign({}, e.parameter || {});
}

function jsonOut_(obj, e) {
  const callback = e && e.parameter && e.parameter.callback;
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + JSON.stringify(obj) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------- One-time setup helper ----------

function setupKhozyReads() {
  ensureReady_();
  const cfg = config_();
  Logger.log('Spreadsheet OK: ' + cfg.spreadsheetId);
  Logger.log('Drive root: ' + cfg.driveRootId);
  Logger.log('Web App URL (after deploy): ' + (ScriptApp.getService().getUrl() || '— deploy first —'));
  Logger.log('All sheets and folders are ready.');
}

// Cached per-execution flag: setup work is idempotent but reading
// the spreadsheet schema and Drive folders on every call is wasteful.
var _kr_ready = false;
function ensureReady_() {
  if (_kr_ready) return;
  setupSheets_();
  ensureDriveFolders_();
  _kr_ready = true;
}

function bootstrap(payload) {
  const settings = publicSettings_();
  let user = null;
  if (payload && payload.token) {
    try { user = publicUser_(requireUser_(payload.token)); } catch (_) { user = null; }
  }
  return { settings: settings, user: user };
}

function friendlyError_(err) {
  const msg = (err && err.message) ? err.message : String(err);
  // Hide stack/internal details
  return msg.length > 240 ? msg.substring(0, 240) : msg;
}
