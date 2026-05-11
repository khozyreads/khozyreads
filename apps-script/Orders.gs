/**
 * Orders.gs — buy flow, payment proof, library, admin approve/reject.
 */

function createOrder(payload) {
  const user = requireUser_(payload && payload.token);
  const bookId = payload && payload.book_id;
  const book = findOne_('Books', function (b) { return b.book_id === bookId; });
  if (!book) throw new Error('Book not found.');
  if (book.status !== 'active') throw new Error('Book not found.');
  if (String(book.buy_enabled) === 'false') {
    throw new Error(book.disabled_remark || 'This book is not available for purchase right now.');
  }

  // If buyer already has access, no order needed
  const hasAccess = findOne_('Library', function (l) {
    return l.user_id === user.user_id && l.book_id === bookId && l.access_status === 'active';
  });
  if (hasAccess) return { alreadyOwned: true };

  // Reuse existing pending order if there is one
  const existing = findOne_('Orders', function (o) {
    return o.user_id === user.user_id && o.book_id === bookId && o.status === 'pending';
  });
  if (existing) {
    return { order: sanitiseOrderForBuyer_(existing), settings: publicSettings_() };
  }

  const settings = settingsMap_();
  const order = {
    order_id: id_(),
    user_id: user.user_id,
    username: user.username,
    book_id: book.book_id,
    book_title: book.title,
    amount: Number(book.price) || 0,
    currency: book.currency || settings.default_currency || 'USD',
    status: 'pending',
    payment_proof_file_id: '',
    payment_proof_url: '',
    created_at: now_(),
    approved_at: '',
    approved_by: '',
    rejected_at: '',
    reject_reason: ''
  };
  append_('Orders', order);
  log_('order_created', user.user_id, user.username, {
    order_id: order.order_id, book_id: order.book_id
  });
  return { order: sanitiseOrderForBuyer_(order), settings: publicSettings_() };
}

function uploadPaymentProof(payload) {
  const user = requireUser_(payload && payload.token);
  const orderId = payload && payload.order_id;
  const order = findOne_('Orders', function (o) {
    return o.order_id === orderId && o.user_id === user.user_id;
  });
  if (!order) throw new Error('Order not found.');
  if (order.status === 'approved') throw new Error('Order is already approved.');

  if (!payload.file || !payload.file.base64) throw new Error('Please attach a payment proof.');
  const upload = uploadProof_(order.order_id, payload.file);

  update_('Orders', 'order_id', order.order_id, {
    payment_proof_file_id: upload.fileId,
    payment_proof_url: '/* server stream only */',
    status: 'pending',
    rejected_at: '',
    reject_reason: ''
  });
  log_('payment_proof_uploaded', user.user_id, user.username, {
    order_id: order.order_id, book_id: order.book_id
  });

  let telegram = { sent: false, reason: 'Not attempted.' };
  // Optional Telegram notification
  try {
    telegram = notifyTelegram_(order.order_id) || telegram;
  } catch (e) {
    logError_('telegram', e);
    telegram = { sent: false, reason: e.message || String(e) };
  }

  return { ok: true, telegram: telegram };
}

function myLibrary(payload) {
  const user = requireUser_(payload && payload.token);
  const orders = findAll_('Orders', function (o) { return o.user_id === user.user_id; });
  orders.sort(function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)); });
  const books = rows_('Books');
  const settings = settingsMap_();

  const enriched = orders.map(function (o) {
    const book = books.filter(function (b) { return b.book_id === o.book_id; })[0];
    return Object.assign(sanitiseOrderForBuyer_(o), {
      book: book ? publicBook_(book, settings) : null
    });
  });

  // Active library entries (so even legacy / manually granted books show)
  const lib = findAll_('Library', function (l) {
    return l.user_id === user.user_id && l.access_status === 'active';
  });
  const ownedBooks = lib.map(function (l) {
    const book = books.filter(function (b) { return b.book_id === l.book_id; })[0];
    return book ? publicBook_(book, settings) : null;
  }).filter(Boolean);

  return { orders: enriched, ownedBooks: ownedBooks };
}

function openReader(payload) {
  const user = requireUser_(payload && payload.token);
  const bookId = payload && payload.book_id;
  const book = findOne_('Books', function (b) { return b.book_id === bookId; });
  if (!book) throw new Error('Book not found.');

  const lib = findOne_('Library', function (l) {
    return l.user_id === user.user_id && l.book_id === bookId && l.access_status === 'active';
  });
  if (!lib && user.role !== 'admin') {
    return { hasAccess: false };
  }

  // The SPA fetches PDF bytes via streamBase64 (which re-checks access).
  return {
    hasAccess: true,
    book: { book_id: book.book_id, title: book.title, creator: book.creator },
    reader: {
      watermark: {
        username: user.username,
        user_id: user.user_id,
        book_id: book.book_id,
        ts: now_()
      }
    }
  };
}

// ---------- Admin order moderation ----------

function adminListOrders(payload) {
  requireAdmin_(payload && payload.token);
  const orders = rows_('Orders');
  orders.sort(function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)); });
  // Strip payment_proof_url — the SPA fetches the proof via streamBase64
  // when the admin clicks "View proof", so access is re-checked every time.
  return { orders: orders.map(function (o) {
    return Object.assign({}, o, { payment_proof_url: '' });
  }) };
}

function approveOrder(payload) {
  const admin = requireAdmin_(payload && payload.token);
  const orderId = payload && payload.order_id;
  const order = findOne_('Orders', function (o) { return o.order_id === orderId; });
  if (!order) throw new Error('Order not found.');
  if (order.status === 'approved') return { ok: true, alreadyApproved: true };

  update_('Orders', 'order_id', orderId, {
    status: 'approved',
    approved_at: now_(),
    approved_by: admin.username,
    rejected_at: '',
    reject_reason: ''
  });
  upsertLibrary_(order.user_id, order.book_id, 'active');
  log_('order_approved', admin.user_id, admin.username, {
    order_id: orderId, book_id: order.book_id, buyer: order.username
  });
  return { ok: true };
}

function rejectOrder(payload) {
  const admin = requireAdmin_(payload && payload.token);
  const orderId = payload && payload.order_id;
  const reason = String((payload && payload.reason) || '').trim();
  if (!reason) throw new Error('Please provide a reason for rejection.');
  const order = findOne_('Orders', function (o) { return o.order_id === orderId; });
  if (!order) throw new Error('Order not found.');

  update_('Orders', 'order_id', orderId, {
    status: 'rejected',
    rejected_at: now_(),
    reject_reason: reason
  });
  // Lock any library row tied to this order
  upsertLibrary_(order.user_id, order.book_id, 'locked');
  log_('order_rejected', admin.user_id, admin.username, {
    order_id: orderId, book_id: order.book_id, reason: reason
  });
  return { ok: true };
}

function upsertLibrary_(userId, bookId, status) {
  const existing = findOne_('Library', function (l) {
    return l.user_id === userId && l.book_id === bookId;
  });
  if (existing) {
    update_('Library', 'library_id', existing.library_id, { access_status: status });
  } else {
    append_('Library', {
      library_id: id_(),
      user_id: userId,
      book_id: bookId,
      access_status: status,
      created_at: now_()
    });
  }
}
