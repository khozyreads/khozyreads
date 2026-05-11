import { api, fileToPayload, getParam, isPurchaseOpen, money } from "./api-client.js";
import { t } from "./i18n.js";
import { wireSharedUi, registerBuyer, signInUsername, requireAuth, getProfile } from "./auth.js";
import { enableReaderProtection } from "./content-protection.js";

window.KHOZYREADS_MODULE_READY = true;
wireSharedUi();

const page = document.body.dataset.page;

function setMessage(text, type = "") {
  const el = document.querySelector("[data-message]");
  if (el) {
    el.textContent = text;
    el.className = text ? `notice ${type}` : "";
  }
}

function cover(url) {
  return url || "assets/placeholder-cover.svg";
}

function getBookIdParam() {
  return getParam("id") || getParam("book_id") || getParam("book");
}

async function loadHome() {
  const list = document.querySelector("[data-books]");
  list.innerHTML = `<p>${t("loading")}</p>`;
  try {
    const { books } = await api("listBooks");
    if (!books.length) {
      list.innerHTML = `<p>${t("empty")}</p>`;
      return;
    }
    list.innerHTML = books.map((book) => {
      const telegramText = book.telegramButtonText || t("joinTelegram");
      return `
        <article class="card book-card">
          <img class="cover" src="${cover(book.coverUrl)}" alt="">
          <div class="card-body">
            <h3>${book.title}</h3>
            <p>${book.synopsis || ""}</p>
            <div class="meta">${t("creator")}: ${book.creator || "-"}</div>
            <div class="meta">${t("price")}: ${money(book.price, book.currency)}</div>
            <div class="meta">${t("totalEpisodes")}: ${book.totalEpisodes || 0}</div>
            <div class="actions">
              <a class="button" href="book.html?id=${book.id}">${t("read_book")}</a>
              ${book.telegramGroupUrl ? `<a class="button secondary" href="${book.telegramGroupUrl}" target="_blank" rel="noopener">${telegramText}</a>` : ""}
            </div>
          </div>
        </article>`;
    }).join("");
  } catch (error) {
    console.error("Book list load failed", error);
    list.innerHTML = `<p>${error.message || t("error")}</p>`;
  }
}

async function loadBook() {
  const bookId = getBookIdParam();
  const root = document.querySelector("[data-book-detail]");
  if (!bookId) {
    root.innerHTML = `<section class="panel"><p>${t("missing_book_id")}</p><a class="button" href="index.html">${t("books")}</a></section>`;
    return;
  }

  try {
    const profile = await getProfile();
    const { book, hasAccess, order } = await api("getBookState", { bookId });
    const open = isPurchaseOpen(book);
    const telegramText = book.telegramButtonText || t("joinTelegram");
    let primaryAction = "";
    let statusNotice = "";

    if (!profile) {
      primaryAction = `<a class="button" href="login.html">${t("login_to_buy")}</a>`;
    } else if (hasAccess) {
      primaryAction = `<a class="button" href="reader.html?id=${book.id}">${t("read_book")}</a>`;
    } else if (order?.status === "pending") {
      statusNotice = `<p class="notice">${t("pending_verification")}</p>`;
      primaryAction = `<a class="button secondary" href="payment.html?order_id=${order.id}&book_id=${book.id}">${t("pending_verification")}</a>`;
    } else {
      const label = order?.status === "rejected" ? t("upload_again") : t("buy_now");
      primaryAction = open
        ? `<a class="button" href="payment.html?book_id=${book.id}">${label}</a>`
        : `<button disabled>${t("unavailable")}</button>`;
    }

    root.innerHTML = `
      <div class="detail">
        <img class="cover card" src="${cover(book.coverUrl)}" alt="">
        <section class="panel">
          <h1>${book.title}</h1>
          <p>${book.synopsis || ""}</p>
          <p><strong>${t("creator")}:</strong> ${book.creator || "-"}</p>
          <p><strong>${t("price")}:</strong> ${money(book.price, book.currency)}</p>
          <p><strong>${t("totalEpisodes")}:</strong> ${book.totalEpisodes || 0}</p>
          ${statusNotice}
          ${!open ? `<p class="notice">${book.buyDisabledRemark || t("disabledRemark")}</p>` : ""}
          <div class="actions">
            ${primaryAction}
            ${book.telegramGroupUrl ? `<a class="button secondary" href="${book.telegramGroupUrl}" target="_blank" rel="noopener">${telegramText}</a>` : ""}
          </div>
        </section>
      </div>`;
  } catch (error) {
    console.error("Book detail load failed", error);
    root.innerHTML = `<section class="panel"><p>${error.message || t("book_not_found")}</p></section>`;
  }
}

async function loadPayment() {
  const profile = await requireAuth();
  if (!profile) return;

  const bookId = getParam("book_id");
  const orderId = getParam("order_id") || getParam("order");
  const info = document.querySelector("[data-payment-info]");
  try {
    const result = await api("createOrGetPendingOrder", { bookId, orderId });
    const { order, book, settings } = result;
    info.innerHTML = `
      <h1>${t("payment")}</h1>
      <p><strong>${book.title}</strong></p>
      <p><strong>${money(order.amount, order.currency)}</strong></p>
      ${settings.aba_qr_image_url ? `<img class="card" style="max-width:280px" src="${settings.aba_qr_image_url}" alt="ABA QR">` : ""}
      <p>${settings.aba_account_name || ""} ${settings.aba_account_number || ""}</p>
      <p class="notice">${settings[`payment_notice_${window.KR_I18N.getLang()}`] || t("paymentNotice")}</p>
      <span class="badge ${order.status}">${t("pending_verification")}</span>`;

    document.querySelector("[data-proof-form]").addEventListener("submit", async (event) => {
      event.preventDefault();
      setMessage(t("loading"));
      try {
        const file = await fileToPayload(event.target.proof.files[0]);
        if (!file) return setMessage(t("upload_payment_proof"));
        await api("uploadPaymentProof", { orderId: order.id, file });
        setMessage(t("pending_verification"));
      } catch (error) {
        console.error("Payment proof upload failed", error);
        setMessage(error.message || t("error"));
      }
    });
  } catch (error) {
    console.error("Payment load failed", error);
    setMessage(error.message || t("error"));
  }
}

async function loadLibrary() {
  const profile = await requireAuth();
  if (!profile) return;
  const root = document.querySelector("[data-library]");
  try {
    const { orders } = await api("myLibrary");
    if (!orders.length) return root.innerHTML = `<p>${t("empty")}</p>`;
    root.innerHTML = orders.map((order) => `
      <article class="card">
        <img class="cover" src="${cover(order.book?.coverUrl)}" alt="">
        <div class="card-body">
          <h3>${order.book?.title || ""}</h3>
          <p>${order.book?.creator || ""}</p>
          <span class="badge ${order.status}">${order.status === "pending" ? t("pending_verification") : order.status === "approved" ? t("approved") : t("rejected")}</span>
          <div class="actions">
            ${order.status === "approved" ? `<a class="button" href="reader.html?id=${order.bookId}">${t("read_book")}</a>` : ""}
            ${order.status === "pending" ? `<a class="button secondary" href="payment.html?order_id=${order.id}&book_id=${order.bookId}">${t("pending_verification")}</a>` : ""}
            ${order.status === "rejected" ? `<a class="button" href="payment.html?book_id=${order.bookId}">${t("upload_again")}</a>` : ""}
          </div>
        </div>
      </article>`).join("");
  } catch (error) {
    console.error("Library load failed", error);
    root.innerHTML = `<p>${error.message || t("error")}</p>`;
  }
}

async function loadReader() {
  const bookId = getBookIdParam();
  const root = document.querySelector("[data-reader]");
  if (!bookId) {
    root.innerHTML = `<div class="panel"><p>${t("missing_book_id")}</p><a class="button" href="index.html">${t("books")}</a></div>`;
    return;
  }
  const profile = await requireAuth();
  if (!profile) return;

  try {
    const { hasAccess, book, episodes } = await api("readBook", { bookId });
    if (!hasAccess) {
      root.innerHTML = `<div class="panel"><p>${t("purchase_required")}</p><a class="button" href="payment.html?book_id=${bookId}">${t("buy_now")}</a></div>`;
      return;
    }
    root.innerHTML = `
      <h1>${book.title}</h1>
      <label>${t("episodes")}
        <select data-episode-select>${episodes.map((ep, index) => `<option value="${index}">${ep.episodeNumber}. ${ep.episodeTitle || ""}</option>`).join("")}</select>
      </label>
      <article class="reader-content" data-reader-content><h2 data-episode-title></h2><p data-episode-body></p></article>`;
    const select = root.querySelector("[data-episode-select]");
    const render = () => {
      const episode = episodes[Number(select.value)];
      root.querySelector("[data-episode-title]").textContent = `${episode.episodeNumber}. ${episode.episodeTitle || ""}`;
      root.querySelector("[data-episode-body]").textContent = episode.episodeContent || "";
    };
    select.addEventListener("change", render);
    render();
    enableReaderProtection({ username: profile.username, userId: profile.id, orderId: bookId });
  } catch (error) {
    console.error("Reader load failed", error);
    root.innerHTML = `<div class="panel"><p>${error.message || t("error")}</p></div>`;
  }
}

function wireAuthForms() {
  const registerForm = document.querySelector("[data-register-form]");
  if (registerForm) registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage(t("loading"));
    try {
      await registerBuyer(event.target.username.value, event.target.password.value);
      window.location.href = "library.html";
    } catch (error) {
      console.error("Registration failed", error);
      setMessage(error.message || t("error"));
    }
  });

  const loginForm = document.querySelector("[data-login-form]");
  if (loginForm) loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await signInUsername(event.target.username.value, event.target.password.value);
      window.location.href = loginForm.dataset.staff ? "seller-dashboard.html" : "library.html";
    } catch (error) {
      console.error("Login failed", error);
      setMessage(error.message || t("error"));
    }
  });
}

wireAuthForms();
if (page === "login" && getParam("registered") === "1") setMessage(t("registered_success"));
if (page === "home") loadHome();
if (page === "book") loadBook();
if (page === "payment") loadPayment();
if (page === "library") loadLibrary();
if (page === "reader") loadReader();
