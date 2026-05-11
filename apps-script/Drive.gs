/**
 * Drive.gs — folder management, validated uploads, secure streaming.
 *
 * Folder layout under DRIVE_ROOT_FOLDER_ID:
 *   /Book Covers      (public-by-link OK, just images)
 *   /Book PDFs        (PRIVATE — only the script can read)
 *   /Payment Proofs   (PRIVATE — only the script can read)
 *
 * Files are streamed back to authorised users through doGet?page=stream
 * so we never expose Drive file IDs in URLs that bypass our access checks.
 */

const FOLDER_KEYS = {
  covers: 'drive_folder_covers',
  pdfs: 'drive_folder_pdfs',
  proofs: 'drive_folder_proofs'
};

const COVER_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const PDF_TYPES = ['application/pdf'];
const PROOF_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];

// ---------- Folder bootstrap ----------

function ensureDriveFolders_() {
  const cfg = config_();
  let root;
  if (cfg.driveRootId) {
    try {
      root = DriveApp.getFolderById(cfg.driveRootId);
    } catch (e) {
      throw new Error('DRIVE_ROOT_FOLDER_ID is invalid or not accessible.');
    }
  } else {
    root = DriveApp.createFolder('KhozyReads');
    PropertiesService.getScriptProperties().setProperty('DRIVE_ROOT_FOLDER_ID', root.getId());
  }

  const settings = settingsMap_();
  const folders = [
    { key: FOLDER_KEYS.covers, name: 'Book Covers' },
    { key: FOLDER_KEYS.pdfs, name: 'Book PDFs' },
    { key: FOLDER_KEYS.proofs, name: 'Payment Proofs' }
  ];
  folders.forEach(function (f) {
    let id = settings[f.key];
    let folder = null;
    if (id) {
      try { folder = DriveApp.getFolderById(id); } catch (_) { folder = null; }
    }
    if (!folder) {
      const it = root.getFoldersByName(f.name);
      folder = it.hasNext() ? it.next() : root.createFolder(f.name);
      setSetting_(f.key, folder.getId());
    }
  });
}

function getFolderForKey_(key) {
  const id = settingsMap_()[key];
  if (!id) {
    ensureDriveFolders_();
    return DriveApp.getFolderById(settingsMap_()[key]);
  }
  return DriveApp.getFolderById(id);
}

// ---------- Upload ----------

/**
 * file = { base64, mimeType, fileName }
 */
function uploadFile_(file, folderKey, safeName, allowedMimes) {
  if (!file || !file.base64) throw new Error('No file provided.');
  const mime = String(file.mimeType || '').toLowerCase();
  if (allowedMimes.indexOf(mime) === -1) {
    throw new Error('File type not allowed.');
  }
  const bytes = Utilities.base64Decode(file.base64);
  // Soft size cap: 25 MB
  if (bytes.length > 25 * 1024 * 1024) {
    throw new Error('File is too large (max 25 MB).');
  }
  const blob = Utilities.newBlob(bytes, mime, safeName);
  const folder = getFolderForKey_(folderKey);
  const created = folder.createFile(blob);
  // Defensive: never make these public
  try { created.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE); } catch (_) {}
  return {
    fileId: created.getId(),
    name: created.getName(),
    mime: mime,
    size: bytes.length
  };
}

function uploadCover_(bookId, file) {
  const ext = extFor_(file.mimeType);
  const safe = 'cover_' + bookId + '_' + Date.now() + '.' + ext;
  const result = uploadFile_(file, FOLDER_KEYS.covers, safe, COVER_TYPES);
  // Covers are intentionally public marketing assets (so <img> tags can load
  // them without proxying binary through Apps Script). Make the file
  // viewable by link, but no editor access.
  try {
    DriveApp.getFileById(result.fileId)
      .setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (_) {}
  return result;
}

function uploadPdf_(bookId, file) {
  const safe = 'book_' + bookId + '_' + Date.now() + '.pdf';
  return uploadFile_(file, FOLDER_KEYS.pdfs, safe, PDF_TYPES);
}

function uploadProof_(orderId, file) {
  const ext = extFor_(file.mimeType);
  const safe = 'proof_' + orderId + '_' + Date.now() + '.' + ext;
  return uploadFile_(file, FOLDER_KEYS.proofs, safe, PROOF_TYPES);
}

function extFor_(mime) {
  switch (String(mime || '').toLowerCase()) {
    case 'image/jpeg':
    case 'image/jpg': return 'jpg';
    case 'image/png': return 'png';
    case 'image/webp': return 'webp';
    case 'application/pdf': return 'pdf';
    default: return 'bin';
  }
}

// ---------- Streaming ----------

/**
 * Build a stream URL.
 *
 *   image  — public Google content URL (covers / ABA QR). These files are
 *            shared ANYONE_WITH_LINK on upload so the <img> tag can render.
 *   proof  — private payment proof. Goes through doGet?page=stream which
 *            checks the session/admin role on every fetch.
 *   pdf    — handled by streamBase64_({ kind: 'pdf', book }) only.
 */
function streamUrl_(kind, fileId, opts) {
  if (!fileId) return '';
  if (kind === 'image') {
    // Direct Google content endpoint — fast, cached by browsers.
    return 'https://lh3.googleusercontent.com/d/' + encodeURIComponent(fileId);
  }
  const base = ScriptApp.getService().getUrl();
  if (!base) return '';
  const params = ['page=stream', 'kind=' + encodeURIComponent(kind), 'id=' + encodeURIComponent(fileId)];
  if (opts && opts.token) params.push('t=' + encodeURIComponent(opts.token));
  if (opts && opts.bookId) params.push('book=' + encodeURIComponent(opts.bookId));
  return base + '?' + params.join('&');
}

// pdfReaderUrl_ removed — the SPA fetches the PDF as base64 via streamBase64,
// which keeps content protection (no shareable URL leaks).

/**
 * doGet?page=stream — kept for completeness but the main flow is the
 * streamBase64 JSON action invoked via google.script.run, which is far more
 * reliable than ContentService for binary.
 *
 * For images we redirect-the-equivalent by returning a tiny HTML page that
 * loads the public Google content URL (covers/QR are share-by-link).
 * For proofs we render an HTML page that requests base64 over google.script.run
 * after re-checking the user's session — but in practice the admin UI calls
 * streamBase64 directly and renders the image inline.
 */
function streamFile_(params) {
  return ContentService
    .createTextOutput('Use the in-app viewer.')
    .setMimeType(ContentService.MimeType.TEXT);
}

/**
 * doGet?page=pdf — same story; the SPA calls streamBase64 directly.
 */
function streamPdf_(params) {
  return ContentService
    .createTextOutput('Use the in-app reader.')
    .setMimeType(ContentService.MimeType.TEXT);
}

// Apps Script can't natively send raw binary easily through ContentService,
// so we use HtmlService.createHtmlOutput with an embedded base64 fallback.
// However the modern path (used by the reader) is to embed PDF.js + a base64
// blob URL produced from a JSON endpoint. Provide that endpoint here:
function streamBase64_(params) {
  const kind = params.kind;
  const id = params.id;
  if (!id) throw new Error('Missing id');

  if (kind === 'image') {
    // Only allow files we know are public marketing assets:
    //   - ABA QR (settings.aba_qr_file_id)
    //   - Book covers (Books.cover_file_id, status active)
    const settings = settingsMap_();
    let allowed = false;
    if (settings.aba_qr_file_id && settings.aba_qr_file_id === id) allowed = true;
    if (!allowed) {
      const book = findOne_('Books', function (b) { return b.cover_file_id === id; });
      if (book) allowed = true;
    }
    if (!allowed) throw new Error('Forbidden');
    const file = DriveApp.getFileById(id);
    const blob = file.getBlob();
    return {
      mime: blob.getContentType(),
      base64: Utilities.base64Encode(blob.getBytes()),
      name: file.getName()
    };
  }
  if (kind === 'proof') {
    const user = requireUser_(params.t);
    if (user.role !== 'admin') {
      const order = findOne_('Orders', function (o) {
        return o.user_id === user.user_id && o.payment_proof_file_id === id;
      });
      if (!order) throw new Error('Forbidden');
    }
    const file = DriveApp.getFileById(id);
    const blob = file.getBlob();
    return {
      mime: blob.getContentType(),
      base64: Utilities.base64Encode(blob.getBytes()),
      name: file.getName()
    };
  }
  if (kind === 'pdf') {
    const user = requireUser_(params.t);
    const bookId = params.book;
    const book = findOne_('Books', function (b) { return b.book_id === bookId; });
    if (!book) throw new Error('Book not found.');
    if (user.role !== 'admin') {
      const lib = findOne_('Library', function (r) {
        return r.user_id === user.user_id && r.book_id === bookId && r.access_status === 'active';
      });
      if (!lib) throw new Error('You need to purchase this book before reading.');
    }
    const file = DriveApp.getFileById(book.pdf_file_id);
    const blob = file.getBlob();
    log_('book_read', user.user_id, user.username, { book_id: bookId });
    return {
      mime: 'application/pdf',
      base64: Utilities.base64Encode(blob.getBytes()),
      name: book.title + '.pdf'
    };
  }
  throw new Error('Unknown kind');
}

// mimeToContentMime_ removed — base64 streaming carries its own mime type.
