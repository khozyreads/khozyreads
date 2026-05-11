/**
 * Database.gs — Google Sheets schema, helpers, settings.
 *
 * Sheets and headers exactly match the project spec.
 * Missing sheets/headers are auto-created.
 */

const SHEETS_SCHEMA = {
  Settings: ['key', 'value', 'updated_at'],
  Users: [
    'user_id', 'username', 'password_hash', 'password_salt',
    'role', 'status', 'created_at', 'last_login'
  ],
  Books: [
    'book_id', 'title', 'synopsis', 'creator', 'price', 'currency',
    'cover_file_id', 'pdf_file_id', 'pdf_view_url',
    'buy_enabled', 'disabled_remark',
    'status', 'created_at', 'updated_at'
  ],
  Orders: [
    'order_id', 'user_id', 'username', 'book_id', 'book_title',
    'amount', 'currency', 'status',
    'payment_proof_file_id', 'payment_proof_url',
    'created_at', 'approved_at', 'approved_by',
    'rejected_at', 'reject_reason'
  ],
  Library: [
    'library_id', 'user_id', 'book_id', 'access_status', 'created_at'
  ],
  Logs: [
    'log_id', 'action', 'actor_user_id', 'actor_username',
    'details', 'created_at'
  ]
};

const DEFAULT_SETTINGS = {
  website_name: 'KhozyReads',
  default_language: 'kh',
  default_currency: 'USD',
  working_hours_start: '09:00',
  working_hours_end: '19:00',
  aba_qr_file_id: '',
  aba_account_name: '',
  aba_account_number: '',
  payment_notice_kh: 'ការផ្ទៀងផ្ទាត់ការទូទាត់ធ្វើដោយដៃតែក្នុងម៉ោងធ្វើការប៉ុណ្ណោះ។ ការទូទាត់ក្រៅម៉ោងធ្វើការអាចយឺត។ សូមបង្ហោះបង្កាន់ដៃច្បាស់បន្ទាប់ពីទូទាត់រួច។',
  payment_notice_en: 'Payment verification is handled manually during working hours only. Payments made outside working hours may experience delay. Please upload a clear payment receipt after completing your payment.',
  telegram_group_link: '',
  telegram_button_text: 'Join Telegram'
};

// ---------- Config ----------

function config_() {
  const props = PropertiesService.getScriptProperties();
  const spreadsheetId = props.getProperty('SPREADSHEET_ID');
  if (!spreadsheetId) {
    throw new Error('SPREADSHEET_ID is not set in Script Properties.');
  }
  return {
    spreadsheetId: spreadsheetId,
    driveRootId: props.getProperty('DRIVE_ROOT_FOLDER_ID') || '',
    adminBootstrapUser: (props.getProperty('ADMIN_BOOTSTRAP_USER') || '').trim().toLowerCase(),
    telegramBotToken: props.getProperty('TELEGRAM_BOT_TOKEN') || '',
    telegramAdminChatId: props.getProperty('TELEGRAM_ADMIN_CHAT_ID') || ''
  };
}

function ss_() {
  return SpreadsheetApp.openById(config_().spreadsheetId);
}

function sheet_(name) {
  const s = ss_().getSheetByName(name);
  if (!s) throw new Error('Sheet missing: ' + name);
  return s;
}

// ---------- Schema bootstrap ----------

function setupSheets_() {
  const ss = ss_();
  Object.keys(SHEETS_SCHEMA).forEach(function (name) {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    const headers = SHEETS_SCHEMA[name];
    const lastCol = sh.getLastColumn();
    const firstRow = lastCol > 0 ? sh.getRange(1, 1, 1, Math.max(lastCol, headers.length)).getValues()[0] : [];
    const isEmpty = firstRow.join('') === '';
    if (isEmpty) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
      sh.setFrozenRows(1);
    } else {
      // Append any new headers we've added since last setup
      const known = firstRow.map(String);
      headers.forEach(function (h, i) {
        if (known.indexOf(h) === -1) {
          sh.getRange(1, lastCol + 1 + i).setValue(h);
        }
      });
    }
  });
  seedSettings_();
}

function seedSettings_() {
  const existing = settingsMap_();
  const writes = [];
  Object.keys(DEFAULT_SETTINGS).forEach(function (key) {
    if (!(key in existing)) {
      writes.push({ key: key, value: DEFAULT_SETTINGS[key], updated_at: now_() });
    }
  });
  writes.forEach(function (row) { append_('Settings', row); });
}

// ---------- Generic CRUD helpers ----------

// In-memory cache (per-execution) + CacheService (cross-execution, 6h)
var _ROW_CACHE = {};
const ROW_CACHE_TTL = 21600;            // 6 hours
const ROW_CACHE_KEY = 'rows::';         // CacheService prefix

function rows_(name) {
  if (_ROW_CACHE[name]) return _ROW_CACHE[name];

  // Cross-execution cache (CacheService) — survives between requests
  const cache = CacheService.getScriptCache();
  const cached = cache.get(ROW_CACHE_KEY + name);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      _ROW_CACHE[name] = parsed;
      return parsed;
    } catch (_) { /* fall through and re-read */ }
  }

  const sh = sheet_(name);
  const range = sh.getDataRange();
  if (range.getNumRows() < 2) {
    _ROW_CACHE[name] = [];
    return [];
  }
  const values = range.getValues();
  const headers = values.shift();
  const rows = values
    .filter(function (row) { return row.some(function (cell) { return cell !== '' && cell !== null; }); })
    .map(function (row) {
      const obj = {};
      headers.forEach(function (key, i) { obj[key] = row[i]; });
      return obj;
    });

  _ROW_CACHE[name] = rows;
  // CacheService values must be < 100KB. If a sheet grows huge, skip writing
  // it to CacheService and just rely on per-execution cache.
  try {
    const json = JSON.stringify(rows);
    if (json.length < 95000) cache.put(ROW_CACHE_KEY + name, json, ROW_CACHE_TTL);
  } catch (_) {}
  return rows;
}

function invalidateCache_(name) {
  delete _ROW_CACHE[name];
  try { CacheService.getScriptCache().remove(ROW_CACHE_KEY + name); } catch (_) {}
}

function append_(name, obj) {
  const headers = SHEETS_SCHEMA[name];
  if (!headers) throw new Error('Unknown sheet: ' + name);
  const row = headers.map(function (key) {
    const v = obj[key];
    return (v === undefined || v === null) ? '' : v;
  });
  sheet_(name).appendRow(row);
  invalidateCache_(name);
  return obj;
}

function update_(name, idField, id, patch) {
  const sh = sheet_(name);
  const values = sh.getDataRange().getValues();
  const headers = values[0];
  const idIdx = headers.indexOf(idField);
  if (idIdx < 0) throw new Error('id field missing: ' + idField);
  for (let r = 1; r < values.length; r++) {
    if (String(values[r][idIdx]) === String(id)) {
      const nextRow = values[r].slice();
      Object.keys(patch).forEach(function (key) {
        const c = headers.indexOf(key);
        if (c >= 0) nextRow[c] = patch[key];
      });
      sh.getRange(r + 1, 1, 1, headers.length).setValues([nextRow]);
      invalidateCache_(name);
      return true;
    }
  }
  return false;
}

function deleteById_(name, idField, id) {
  const sh = sheet_(name);
  const values = sh.getDataRange().getValues();
  const headers = values[0];
  const idIdx = headers.indexOf(idField);
  if (idIdx < 0) throw new Error('id field missing: ' + idField);
  for (let r = 1; r < values.length; r++) {
    if (String(values[r][idIdx]) === String(id)) {
      sh.deleteRow(r + 1);
      invalidateCache_(name);
      return true;
    }
  }
  return false;
}

function findOne_(name, predicate) {
  const list = rows_(name);
  for (let i = 0; i < list.length; i++) if (predicate(list[i])) return list[i];
  return null;
}

function findAll_(name, predicate) {
  return rows_(name).filter(predicate);
}

// ---------- Settings ----------

function settingsMap_() {
  const out = {};
  rows_('Settings').forEach(function (row) {
    if (row.key) out[row.key] = row.value;
  });
  return out;
}

function publicSettings_() {
  const all = settingsMap_();
  // Only expose keys safe for the public UI
  const publicKeys = [
    'website_name', 'default_language', 'default_currency',
    'working_hours_start', 'working_hours_end',
    'aba_qr_file_id', 'aba_account_name', 'aba_account_number',
    'payment_notice_kh', 'payment_notice_en',
    'telegram_group_link', 'telegram_button_text'
  ];
  const out = {};
  publicKeys.forEach(function (k) { out[k] = all[k] || ''; });
  // Build streamable QR url instead of leaking the file id directly
  if (out.aba_qr_file_id) {
    out.aba_qr_url = streamUrl_('image', out.aba_qr_file_id);
  }
  return out;
}

function setSetting_(key, value) {
  const existing = findOne_('Settings', function (r) { return r.key === key; });
  if (existing) update_('Settings', 'key', key, { value: value, updated_at: now_() });
  else append_('Settings', { key: key, value: value, updated_at: now_() });
}

function setSettingsBulk_(settings) {
  const sh = sheet_('Settings');
  const range = sh.getDataRange();
  const values = range.getValues();
  const headers = values[0];
  const keyIdx = headers.indexOf('key');
  const valueIdx = headers.indexOf('value');
  const updatedIdx = headers.indexOf('updated_at');
  if (keyIdx < 0 || valueIdx < 0) throw new Error('Settings headers are missing.');

  const incoming = settings || {};
  const touched = {};
  const now = now_();
  for (let r = 1; r < values.length; r++) {
    const key = String(values[r][keyIdx] || '');
    if (Object.prototype.hasOwnProperty.call(incoming, key)) {
      values[r][valueIdx] = String(incoming[key] == null ? '' : incoming[key]);
      if (updatedIdx >= 0) values[r][updatedIdx] = now;
      touched[key] = true;
    }
  }

  if (values.length > 1) {
    sh.getRange(1, 1, values.length, headers.length).setValues(values);
  }

  const missingRows = [];
  Object.keys(incoming).forEach(function (key) {
    if (touched[key]) return;
    const row = headers.map(function (h) {
      if (h === 'key') return key;
      if (h === 'value') return String(incoming[key] == null ? '' : incoming[key]);
      if (h === 'updated_at') return now;
      return '';
    });
    missingRows.push(row);
  });
  if (missingRows.length) {
    sh.getRange(sh.getLastRow() + 1, 1, missingRows.length, headers.length).setValues(missingRows);
  }
  invalidateCache_('Settings');
}

// ---------- Utilities ----------

function id_() { return Utilities.getUuid(); }
function now_() { return new Date().toISOString(); }

function isWithinWorkingHours_() {
  const all = settingsMap_();
  const tz = Session.getScriptTimeZone() || 'Asia/Phnom_Penh';
  const nowStr = Utilities.formatDate(new Date(), tz, 'HH:mm');
  return nowStr >= (all.working_hours_start || '09:00')
      && nowStr <= (all.working_hours_end || '19:00');
}
