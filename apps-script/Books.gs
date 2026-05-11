/**
 * Books.gs — public store listing + buyer book detail.
 */

function listBooks(payload) {
  const all = rows_('Books').filter(function (b) { return b.status === 'active'; });
  // Sort newest first
  all.sort(function (a, b) {
    return String(b.created_at || '').localeCompare(String(a.created_at || ''));
  });
  const settings = settingsMap_();
  return { books: all.map(function (b) { return publicBook_(b, settings); }) };
}

function getBook(payload) {
  const book = findOne_('Books', function (b) { return b.book_id === (payload && payload.book_id); });
  if (!book) throw new Error('Book not found.');
  if (book.status !== 'active') throw new Error('Book not found.');
  return { book: publicBook_(book) };
}

function getBookState(payload) {
  const book = findOne_('Books', function (b) { return b.book_id === (payload && payload.book_id); });
  if (!book) throw new Error('Book not found.');
  if (book.status !== 'active') throw new Error('Book not found.');

  let user = null;
  try {
    if (payload && payload.token) user = requireUser_(payload.token);
  } catch (_) { user = null; }

  let access = false;
  let lastOrder = null;
  if (user) {
    const lib = findOne_('Library', function (l) {
      return l.user_id === user.user_id && l.book_id === book.book_id && l.access_status === 'active';
    });
    access = Boolean(lib);
    const myOrders = findAll_('Orders', function (o) {
      return o.user_id === user.user_id && o.book_id === book.book_id;
    });
    myOrders.sort(function (a, b) {
      return String(b.created_at).localeCompare(String(a.created_at));
    });
    lastOrder = myOrders[0] ? sanitiseOrderForBuyer_(myOrders[0]) : null;
  }

  return {
    book: publicBook_(book),
    isLoggedIn: Boolean(user),
    hasAccess: access,
    lastOrder: lastOrder
  };
}

/**
 * Strip internal fields and rewrite file IDs into safe stream URLs.
 */
function publicBook_(book, settings) {
  const out = {
    book_id: book.book_id,
    title: book.title,
    synopsis: book.synopsis,
    creator: book.creator,
    price: book.price,
    currency: book.currency || (settings && settings.default_currency) || 'USD',
    buy_enabled: String(book.buy_enabled) !== 'false',
    disabled_remark: book.disabled_remark || '',
    status: book.status,
    cover_url: book.cover_file_id ? streamUrl_('image', book.cover_file_id) : ''
  };
  return out;
}

function sanitiseOrderForBuyer_(o) {
  return {
    order_id: o.order_id,
    book_id: o.book_id,
    book_title: o.book_title,
    amount: o.amount,
    currency: o.currency,
    status: o.status,
    created_at: o.created_at,
    approved_at: o.approved_at || '',
    rejected_at: o.rejected_at || '',
    reject_reason: o.reject_reason || '',
    payment_proof_url: o.payment_proof_file_id ? '__pending__' : ''
  };
}

// ---------- Admin book CRUD ----------

function adminListBooks(payload) {
  requireAdmin_(payload && payload.token);
  const list = rows_('Books');
  list.sort(function (a, b) {
    return String(b.created_at || '').localeCompare(String(a.created_at || ''));
  });
  return { books: list };
}

function saveBook(payload) {
  requireAdmin_(payload && payload.token);
  const incoming = (payload && payload.book) || {};
  const isNew = !incoming.book_id;
  const bookId = incoming.book_id || id_();
  const existing = isNew ? null : findOne_('Books', function (b) { return b.book_id === bookId; });
  if (!isNew && !existing) throw new Error('Book not found.');

  const title = String(incoming.title || '').trim();
  if (!title) throw new Error('Title is required.');
  const price = Number(incoming.price);
  if (!isFinite(price) || price < 0) throw new Error('Price must be a positive number.');

  let coverFileId = (existing && existing.cover_file_id) || '';
  if (incoming.coverFile && incoming.coverFile.base64) {
    const up = uploadCover_(bookId, incoming.coverFile);
    coverFileId = up.fileId;
  }

  let pdfFileId = (existing && existing.pdf_file_id) || '';
  if (incoming.pdfFile && incoming.pdfFile.base64) {
    const up = uploadPdf_(bookId, incoming.pdfFile);
    pdfFileId = up.fileId;
  }

  if (isNew && !pdfFileId) {
    throw new Error('PDF is required when creating a book.');
  }

  const row = {
    book_id: bookId,
    title: title,
    synopsis: String(incoming.synopsis || ''),
    creator: String(incoming.creator || ''),
    price: price,
    currency: String(incoming.currency || settingsMap_().default_currency || 'USD'),
    cover_file_id: coverFileId,
    pdf_file_id: pdfFileId,
    pdf_view_url: pdfFileId ? '/* server stream only */' : '',
    buy_enabled: incoming.buy_enabled === false ? false : true,
    disabled_remark: String(incoming.disabled_remark || ''),
    status: incoming.status === 'archived' ? 'archived' : 'active',
    created_at: (existing && existing.created_at) || now_(),
    updated_at: now_()
  };

  if (isNew) {
    append_('Books', row);
    log_('book_created', payload.token ? requireUser_(payload.token).user_id : '', '', { book_id: bookId, title: title });
  } else {
    update_('Books', 'book_id', bookId, row);
    log_('book_updated', payload.token ? requireUser_(payload.token).user_id : '', '', { book_id: bookId });
  }
  if (incoming.pdfFile && incoming.pdfFile.base64) {
    log_('pdf_uploaded', requireUser_(payload.token).user_id, requireUser_(payload.token).username, { book_id: bookId });
  }
  return { book: row };
}

function archiveBook(payload) {
  const admin = requireAdmin_(payload && payload.token);
  const bookId = payload && payload.book_id;
  const ok = update_('Books', 'book_id', bookId, { status: 'archived', updated_at: now_() });
  if (!ok) throw new Error('Book not found.');
  log_('book_archived', admin.user_id, admin.username, { book_id: bookId });
  return { ok: true };
}
