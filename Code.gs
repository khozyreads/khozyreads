const SPREADSHEET_ID = '1xM1oKLS3s7tQc9lkk8ly348NB1MwSGLpuEpR15EMRew';
const DRIVE_ROOT_FOLDER_ID = '1eyGUcnwf99GVj27BQgpGaP6G58hw9FBO';
const TELEGRAM_BOT_TOKEN = '8614149523:AAEiOMW9MzfMkqtYrAt0trlTLGMqnBmqPZM';
const TELEGRAM_ADMIN_CHAT_ID = '8614149523';

const SHEETS = {
  users: ['id', 'username', 'passwordHash', 'role', 'createdAt'],
  books: ['id', 'title', 'synopsis', 'coverUrl', 'creator', 'price', 'currency', 'language', 'totalEpisodes', 'status', 'isBuyEnabled', 'buyDisabledRemark', 'availableFrom', 'availableUntil', 'telegramGroupUrl', 'telegramButtonText', 'createdAt', 'updatedAt'],
  episodes: ['id', 'bookId', 'episodeNumber', 'episodeTitle', 'episodeContent', 'sourceFileUrl', 'status', 'createdAt', 'updatedAt'],
  orders: ['id', 'userId', 'bookId', 'amount', 'currency', 'paymentMethod', 'status', 'proofUrl', 'createdAt', 'approvedAt', 'approvedBy', 'rejectedAt', 'rejectReason'],
  library: ['id', 'userId', 'bookId', 'accessStatus', 'createdAt'],
  settings: ['key', 'value', 'updatedAt'],
  logs: ['id', 'orderId', 'action', 'actionBy', 'actionSource', 'createdAt', 'remark']
};

function doGet(e) {
  return handle_(e);
}

function doPost(e) {
  return handle_(e);
}

function handle_(e) {
  try {
    setupSheets_();
    const payload = parsePayload_(e);
    const action = payload.action || e.parameter.action;
    if (!action) throw new Error('Missing action');

    const routes = {
      register,
      login,
      me,
      listBooks,
      getBook,
      getBookState,
      createOrGetPendingOrder,
      uploadPaymentProof,
      myLibrary,
      readBook,
      sellerStats,
      adminListBooks,
      saveBook,
      archiveBook,
      adminListEpisodes,
      saveEpisode,
      archiveEpisode,
      adminListOrders,
      approveOrder,
      rejectOrder,
      getSettings,
      saveSettings
    };

    if (!routes[action]) throw new Error(`Unknown action: ${action}`);
    return output_(routes[action](payload), e);
  } catch (err) {
    console.error(err);
    return output_({ ok: false, error: err.message || String(err) }, e);
  }
}

function parsePayload_(e) {
  if (e.parameter && e.parameter.payload) return JSON.parse(e.parameter.payload);
  if (e.postData && e.postData.contents) return JSON.parse(e.postData.contents);
  return Object.assign({}, e.parameter);
}

function output_(obj, e) {
  const callback = e && e.parameter && e.parameter.callback;
  if (callback) {
    return ContentService
      .createTextOutput(`${callback}(${JSON.stringify(obj)});`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function setupSheets() {
  setupSheets_();
}

function testRegister() {
  setupSheets_();
  const username = `test${Math.floor(Math.random() * 100000)}`;
  const result = register({ username, password: 'test12345' });
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function ss_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function sheet_(name) {
  return ss_().getSheetByName(name);
}

function setupSheets_() {
  const ss = ss_();
  Object.keys(SHEETS).forEach(name => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    const headers = SHEETS[name];
    const first = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    if (first.join('') === '') sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  });
  seedSettings_();
}

function seedSettings_() {
  const defaults = {
    website_name: 'KhozyReads',
    default_language: 'kh',
    working_hours_start: '09:00',
    working_hours_end: '19:00',
    default_currency: 'USD',
    payment_notice_en: 'Payment verification is handled manually during working hours only. Payments made outside working hours may experience delay. Please upload a clear payment receipt after completing your payment.',
    payment_notice_kh: 'ការផ្ទៀងផ្ទាត់ការទូទាត់ធ្វើដោយដៃតែក្នុងម៉ោងធ្វើការប៉ុណ្ណោះ។ ការទូទាត់ក្រៅម៉ោងធ្វើការអាចយឺត។ សូមបង្ហោះបង្កាន់ដៃច្បាស់បន្ទាប់ពីទូទាត់រួច។'
  };
  const existing = rows_('settings').reduce((acc, row) => (acc[row.key] = true, acc), {});
  Object.keys(defaults).forEach(key => {
    if (!existing[key]) append_('settings', { key, value: defaults[key], updatedAt: now_() });
  });
}

function rows_(name) {
  const sheet = sheet_(name);
  const values = sheet.getDataRange().getValues();
  const headers = values.shift();
  return values.filter(row => row.some(cell => cell !== '')).map(row => {
    const obj = {};
    headers.forEach((key, index) => obj[key] = row[index]);
    return obj;
  });
}

function append_(name, obj) {
  const headers = SHEETS[name];
  sheet_(name).appendRow(headers.map(key => obj[key] ?? ''));
  return obj;
}

function update_(name, idField, id, patch) {
  const sheet = sheet_(name);
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idIndex = headers.indexOf(idField);
  for (let r = 1; r < values.length; r++) {
    if (String(values[r][idIndex]) === String(id)) {
      Object.keys(patch).forEach(key => {
        const c = headers.indexOf(key);
        if (c >= 0) sheet.getRange(r + 1, c + 1).setValue(patch[key]);
      });
      return true;
    }
  }
  return false;
}

function id_() {
  return Utilities.getUuid();
}

function now_() {
  return new Date().toISOString();
}

function hash_(password) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password);
  return bytes.map(b => (b + 256).toString(16).slice(-2)).join('');
}

function requireUser_(token) {
  const user = rows_('users').find(row => row.id === token);
  if (!user) throw new Error('Please log in first.');
  return user;
}

function requireStaff_(token) {
  const user = requireUser_(token);
  if (!['seller', 'admin'].includes(user.role)) throw new Error('Seller/admin only.');
  return user;
}

function register(payload) {
  const username = String(payload.username || '').trim().toLowerCase();
  if (!/^[a-zA-Z]+[0-9]+$/.test(username)) throw new Error('Username must use letters followed by numbers, for example dara123.');
  if (rows_('users').some(row => row.username === username)) throw new Error('Username already exists.');
  const user = append_('users', {
    id: id_(),
    username,
    passwordHash: hash_(payload.password || ''),
    role: 'buyer',
    createdAt: now_()
  });
  return { ok: true, user: publicUser_(user), token: user.id };
}

function login(payload) {
  const username = String(payload.username || '').trim().toLowerCase();
  const user = rows_('users').find(row => row.username === username && row.passwordHash === hash_(payload.password || ''));
  if (!user) throw new Error('Invalid username or password.');
  return { ok: true, user: publicUser_(user), token: user.id };
}

function me(payload) {
  return { ok: true, user: publicUser_(requireUser_(payload.token)) };
}

function publicUser_(user) {
  return { id: user.id, username: user.username, role: user.role };
}

function settingsMap_() {
  return rows_('settings').reduce((acc, row) => (acc[row.key] = row.value, acc), {});
}

function listBooks() {
  return { ok: true, books: rows_('books').filter(book => book.status === 'active') };
}

function getBook(payload) {
  const book = rows_('books').find(row => row.id === payload.bookId);
  if (!book) throw new Error('Book not found.');
  return { ok: true, book };
}

function getBookState(payload) {
  const user = payload.token ? rows_('users').find(row => row.id === payload.token) : null;
  const book = rows_('books').find(row => row.id === payload.bookId);
  if (!book) throw new Error('Book not found.');
  const library = user ? rows_('library').find(row => row.userId === user.id && row.bookId === book.id && row.accessStatus === 'active') : null;
  const orders = user ? rows_('orders').filter(row => row.userId === user.id && row.bookId === book.id) : [];
  orders.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return { ok: true, book, hasAccess: Boolean(library), order: orders[0] || null };
}

function isPurchaseOpen_(book) {
  const now = new Date();
  return book.status === 'active' &&
    String(book.isBuyEnabled) !== 'false' &&
    (!book.availableFrom || now >= new Date(book.availableFrom)) &&
    (!book.availableUntil || now <= new Date(book.availableUntil));
}

function createOrGetPendingOrder(payload) {
  const user = requireUser_(payload.token);
  if (payload.orderId) {
    const existingOrder = rows_('orders').find(row => row.id === payload.orderId && row.userId === user.id);
    if (!existingOrder) throw new Error('Order not found.');
    const existingBook = rows_('books').find(row => row.id === existingOrder.bookId);
    return { ok: true, order: existingOrder, book: existingBook, settings: settingsMap_() };
  }

  const book = rows_('books').find(row => row.id === payload.bookId);
  if (!book) throw new Error('Book not found.');
  const existing = rows_('orders').find(row => row.userId === user.id && row.bookId === book.id && row.status === 'pending');
  if (existing) return { ok: true, order: existing, book, settings: settingsMap_() };
  if (!isPurchaseOpen_(book)) throw new Error(book.buyDisabledRemark || 'This book is not available for purchase.');
  const order = append_('orders', {
    id: id_(),
    userId: user.id,
    bookId: book.id,
    amount: book.price,
    currency: book.currency || 'USD',
    paymentMethod: 'ABA QR / KHQR',
    status: 'pending',
    proofUrl: '',
    createdAt: now_()
  });
  return { ok: true, order, book, settings: settingsMap_() };
}

function uploadPaymentProof(payload) {
  const user = requireUser_(payload.token);
  const order = rows_('orders').find(row => row.id === payload.orderId && row.userId === user.id);
  if (!order) throw new Error('Order not found.');
  const url = saveFile_(payload.file, `payment-proofs/${user.id}`);
  update_('orders', 'id', order.id, { proofUrl: url, status: 'pending' });
  notifyTelegram_(order.id);
  return { ok: true, proofUrl: url };
}

function myLibrary(payload) {
  const user = requireUser_(payload.token);
  const books = rows_('books');
  const orders = rows_('orders').filter(row => row.userId === user.id);
  return { ok: true, orders: orders.map(order => Object.assign({}, order, { book: books.find(book => book.id === order.bookId) })) };
}

function readBook(payload) {
  const user = requireUser_(payload.token);
  const hasAccess = rows_('library').some(row => row.userId === user.id && row.bookId === payload.bookId && row.accessStatus === 'active');
  if (!hasAccess) return { ok: true, hasAccess: false };
  const book = rows_('books').find(row => row.id === payload.bookId);
  const episodes = rows_('episodes').filter(row => row.bookId === payload.bookId && row.status === 'published').sort((a, b) => Number(a.episodeNumber) - Number(b.episodeNumber));
  return { ok: true, hasAccess: true, book, episodes };
}

function sellerStats(payload) {
  requireStaff_(payload.token);
  return { ok: true, books: rows_('books').length, orders: rows_('orders').length, pending: rows_('orders').filter(row => row.status === 'pending').length };
}

function adminListBooks(payload) {
  requireStaff_(payload.token);
  return { ok: true, books: rows_('books'), episodes: rows_('episodes') };
}

function saveBook(payload) {
  requireStaff_(payload.token);
  const book = payload.book || {};
  const id = book.id || id_();
  const row = {
    id,
    title: book.title,
    synopsis: book.synopsis,
    coverUrl: book.coverFile ? saveFile_(book.coverFile, 'book-covers') : book.coverUrl,
    creator: book.creator,
    price: book.price,
    currency: book.currency || 'USD',
    language: book.language || 'kh',
    totalEpisodes: book.totalEpisodes || 0,
    status: book.status || 'active',
    isBuyEnabled: book.isBuyEnabled !== false,
    buyDisabledRemark: book.buyDisabledRemark || '',
    availableFrom: book.availableFrom || '',
    availableUntil: book.availableUntil || '',
    telegramGroupUrl: book.telegramGroupUrl || '',
    telegramButtonText: book.telegramButtonText || '',
    createdAt: book.createdAt || now_(),
    updatedAt: now_()
  };
  if (book.id) update_('books', 'id', book.id, row);
  else append_('books', row);
  return { ok: true, book: row };
}

function archiveBook(payload) {
  requireStaff_(payload.token);
  update_('books', 'id', payload.bookId, { status: 'archived', updatedAt: now_() });
  return { ok: true };
}

function adminListEpisodes(payload) {
  requireStaff_(payload.token);
  return { ok: true, episodes: rows_('episodes') };
}

function saveEpisode(payload) {
  requireStaff_(payload.token);
  const ep = payload.episode || {};
  const id = ep.id || id_();
  const row = {
    id,
    bookId: ep.bookId,
    episodeNumber: Number(ep.episodeNumber),
    episodeTitle: ep.episodeTitle || '',
    episodeContent: ep.episodeContent || '',
    sourceFileUrl: ep.sourceFile ? saveFile_(ep.sourceFile, `story-files/${ep.bookId}`) : ep.sourceFileUrl || '',
    status: ep.status || 'published',
    createdAt: ep.createdAt || now_(),
    updatedAt: now_()
  };
  if (ep.id) update_('episodes', 'id', ep.id, row);
  else append_('episodes', row);
  refreshEpisodeCount_(ep.bookId);
  return { ok: true, episode: row };
}

function archiveEpisode(payload) {
  requireStaff_(payload.token);
  const ep = rows_('episodes').find(row => row.id === payload.episodeId);
  update_('episodes', 'id', payload.episodeId, { status: 'archived', updatedAt: now_() });
  if (ep) refreshEpisodeCount_(ep.bookId);
  return { ok: true };
}

function refreshEpisodeCount_(bookId) {
  const total = rows_('episodes').filter(row => row.bookId === bookId && row.status === 'published').length;
  update_('books', 'id', bookId, { totalEpisodes: total, updatedAt: now_() });
}

function adminListOrders(payload) {
  requireStaff_(payload.token);
  const users = rows_('users');
  const books = rows_('books');
  return { ok: true, orders: rows_('orders').map(order => Object.assign({}, order, {
    buyer: users.find(user => user.id === order.userId),
    book: books.find(book => book.id === order.bookId)
  })) };
}

function approveOrder(payload) {
  const staff = requireStaff_(payload.token);
  const order = rows_('orders').find(row => row.id === payload.orderId);
  if (!order) throw new Error('Order not found.');
  update_('orders', 'id', order.id, { status: 'approved', approvedAt: now_(), approvedBy: staff.id, rejectedAt: '', rejectReason: '' });
  upsertLibrary_(order.userId, order.bookId, 'active');
  append_('logs', { id: id_(), orderId: order.id, action: 'approved', actionBy: staff.username, actionSource: 'dashboard', createdAt: now_(), remark: '' });
  return { ok: true };
}

function rejectOrder(payload) {
  const staff = requireStaff_(payload.token);
  const order = rows_('orders').find(row => row.id === payload.orderId);
  if (!order) throw new Error('Order not found.');
  update_('orders', 'id', order.id, { status: 'rejected', rejectedAt: now_(), rejectReason: payload.reason || '' });
  upsertLibrary_(order.userId, order.bookId, 'locked');
  append_('logs', { id: id_(), orderId: order.id, action: 'rejected', actionBy: staff.username, actionSource: 'dashboard', createdAt: now_(), remark: payload.reason || '' });
  return { ok: true };
}

function upsertLibrary_(userId, bookId, accessStatus) {
  const existing = rows_('library').find(row => row.userId === userId && row.bookId === bookId);
  if (existing) update_('library', 'id', existing.id, { accessStatus });
  else append_('library', { id: id_(), userId, bookId, accessStatus, createdAt: now_() });
}

function getSettings() {
  return { ok: true, settings: settingsMap_() };
}

function saveSettings(payload) {
  requireStaff_(payload.token);
  const settings = payload.settings || {};
  Object.keys(settings).forEach(key => {
    const existing = rows_('settings').find(row => row.key === key);
    const value = settings[key]?.fileName ? saveFile_(settings[key], 'site') : settings[key];
    if (existing) update_('settings', 'key', key, { value, updatedAt: now_() });
    else append_('settings', { key, value, updatedAt: now_() });
  });
  return { ok: true, settings: settingsMap_() };
}

function saveFile_(file, folderName) {
  if (!file || !file.base64) return '';
  const extension = String(file.fileName || '').split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const safeName = `${Date.now()}-${Utilities.getUuid()}.${extension}`;
  const root = DriveApp.getFolderById(DRIVE_ROOT_FOLDER_ID);
  const folder = getOrCreateFolder_(root, folderName);
  const bytes = Utilities.base64Decode(file.base64);
  const blob = Utilities.newBlob(bytes, file.mimeType || MimeType.PLAIN_TEXT, safeName);
  const created = folder.createFile(blob);
  created.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return created.getUrl();
}

function getOrCreateFolder_(root, path) {
  return path.split('/').filter(Boolean).reduce((folder, part) => {
    const iterator = folder.getFoldersByName(part);
    return iterator.hasNext() ? iterator.next() : folder.createFolder(part);
  }, root);
}

function notifyTelegram_(orderId) {
  if (!TELEGRAM_BOT_TOKEN || TELEGRAM_BOT_TOKEN.includes('PASTE_')) return;
  const order = rows_('orders').find(row => row.id === orderId);
  if (!order) return;
  const user = rows_('users').find(row => row.id === order.userId);
  const book = rows_('books').find(row => row.id === order.bookId);
  const text = [
    'New Payment Request',
    `Order ID: ${order.id}`,
    `Buyer: ${user ? user.username : '-'}`,
    `Book: ${book ? book.title : '-'}`,
    `Amount: ${order.amount} ${order.currency}`,
    `Proof: ${order.proofUrl || '-'}`
  ].join('\n');
  UrlFetchApp.fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ chat_id: TELEGRAM_ADMIN_CHAT_ID, text })
  });
}
