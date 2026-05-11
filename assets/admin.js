import { api, fileToPayload, money } from "./api-client.js";
import { t } from "./i18n.js";
import { wireSharedUi, requireStaff } from "./auth.js";

wireSharedUi();
const page = document.body.dataset.page;

function msg(text) {
  const el = document.querySelector("[data-message]");
  if (el) {
    el.textContent = text;
    el.className = text ? "notice" : "";
  }
}

async function loadDashboard() {
  const stats = await api("sellerStats");
  document.querySelector("[data-stats]").innerHTML = `
    <article class="panel stat"><h2>${stats.books || 0}</h2><p>${t("manageBooks")}</p></article>
    <article class="panel stat"><h2>${stats.orders || 0}</h2><p>${t("manageOrders")}</p></article>
    <article class="panel stat"><h2>${stats.pending || 0}</h2><p>${t("pending_verification")}</p></article>`;
}

async function loadBooksAdmin() {
  const form = document.querySelector("[data-book-form]");
  const episodeForm = document.querySelector("[data-episode-form]");
  const table = document.querySelector("[data-book-table]");
  const episodeTable = document.querySelector("[data-episode-table]");
  const select = document.querySelector("[name='book_id']");
  let currentBooks = [];
  let currentEpisodes = [];

  async function refresh() {
    const { books, episodes } = await api("adminListBooks");
    currentBooks = books || [];
    currentEpisodes = episodes || [];
    table.innerHTML = currentBooks.map((book) => `
      <tr>
        <td>${book.title}</td><td>${book.creator || ""}</td><td>${money(book.price, book.currency)}</td>
        <td><span class="badge ${book.status}">${book.status}</span></td>
        <td>${String(book.isBuyEnabled) === "false" ? "Disabled" : "Enabled"}</td>
        <td><a class="button secondary" href="book.html?id=${book.id}">${t("view")}</a> <button data-edit-book="${book.id}">${t("edit")}</button> <button class="secondary" data-archive-book="${book.id}">Archive</button></td>
      </tr>`).join("");
    episodeTable.innerHTML = currentEpisodes.map((episode) => {
      const book = currentBooks.find((item) => item.id === episode.bookId);
      return `
        <tr>
          <td>${book?.title || ""}</td><td>${episode.episodeNumber}</td><td>${episode.episodeTitle || ""}</td>
          <td><span class="badge ${episode.status}">${episode.status}</span></td>
          <td><button data-edit-episode="${episode.id}">${t("edit")}</button> <button class="secondary" data-archive-episode="${episode.id}">Archive</button></td>
        </tr>`;
    }).join("");
    select.innerHTML = currentBooks.map((book) => `<option value="${book.id}">${book.title}</option>`).join("");
    table.querySelectorAll("[data-edit-book]").forEach((button) => button.addEventListener("click", () => fillBookForm(button.dataset.editBook)));
    table.querySelectorAll("[data-archive-book]").forEach((button) => button.addEventListener("click", async () => {
      await api("archiveBook", { bookId: button.dataset.archiveBook });
      await refresh();
    }));
    episodeTable.querySelectorAll("[data-edit-episode]").forEach((button) => button.addEventListener("click", () => fillEpisodeForm(button.dataset.editEpisode)));
    episodeTable.querySelectorAll("[data-archive-episode]").forEach((button) => button.addEventListener("click", async () => {
      await api("archiveEpisode", { episodeId: button.dataset.archiveEpisode });
      await refresh();
    }));
  }

  function fillBookForm(id) {
    const book = currentBooks.find((item) => item.id === id);
    if (!book) return;
    form.elements.id.value = book.id;
    form.elements.title.value = book.title || "";
    form.elements.synopsis.value = book.synopsis || "";
    form.elements.creator.value = book.creator || "";
    form.elements.price.value = book.price || "";
    form.elements.currency.value = book.currency || "USD";
    form.elements.language.value = book.language || "kh";
    form.elements.telegram_group_url.value = book.telegramGroupUrl || "";
    form.elements.telegram_button_text.value = book.telegramButtonText || "";
    form.elements.buy_disabled_remark.value = book.buyDisabledRemark || "";
    form.elements.is_buy_enabled.checked = String(book.isBuyEnabled) !== "false";
    form.elements.available_from.value = book.availableFrom ? String(book.availableFrom).slice(0, 16) : "";
    form.elements.available_until.value = book.availableUntil ? String(book.availableUntil).slice(0, 16) : "";
    form.elements.status.value = book.status || "active";
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function fillEpisodeForm(id) {
    const episode = currentEpisodes.find((item) => item.id === id);
    if (!episode) return;
    episodeForm.elements.id.value = episode.id;
    episodeForm.elements.book_id.value = episode.bookId;
    episodeForm.elements.episode_number.value = episode.episodeNumber || "";
    episodeForm.elements.episode_title.value = episode.episodeTitle || "";
    episodeForm.elements.episode_content.value = episode.episodeContent || "";
    episodeForm.elements.status.value = episode.status || "published";
    episodeForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    msg(t("loading"));
    try {
      const fd = new FormData(form);
      const coverFile = await fileToPayload(fd.get("cover"));
      const book = {
        id: fd.get("id"),
        title: fd.get("title"),
        synopsis: fd.get("synopsis"),
        creator: fd.get("creator"),
        price: fd.get("price"),
        currency: fd.get("currency"),
        language: fd.get("language"),
        telegramGroupUrl: fd.get("telegram_group_url"),
        telegramButtonText: fd.get("telegram_button_text"),
        buyDisabledRemark: fd.get("buy_disabled_remark"),
        isBuyEnabled: fd.get("is_buy_enabled") === "on",
        availableFrom: fd.get("available_from"),
        availableUntil: fd.get("available_until"),
        status: fd.get("status"),
        coverFile
      };
      await api("saveBook", { book });
      form.reset();
      await refresh();
      msg(t("book_saved"));
    } catch (error) {
      console.error("Book save failed", error);
      msg(error.message || t("error"));
    }
  });

  episodeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    msg(t("loading"));
    try {
      const fd = new FormData(episodeForm);
      const sourceFile = await fileToPayload(fd.get("source_file"));
      const episode = {
        id: fd.get("id"),
        bookId: fd.get("book_id"),
        episodeNumber: fd.get("episode_number"),
        episodeTitle: fd.get("episode_title"),
        episodeContent: fd.get("episode_content"),
        status: fd.get("status"),
        sourceFile
      };
      await api("saveEpisode", { episode });
      episodeForm.reset();
      await refresh();
      msg(t("episode_saved"));
    } catch (error) {
      console.error("Episode save failed", error);
      msg(error.message || t("error"));
    }
  });

  await refresh();
}

async function loadOrdersAdmin() {
  const table = document.querySelector("[data-orders-table]");
  const { orders } = await api("adminListOrders");
  table.innerHTML = (orders || []).map((order) => `
    <tr>
      <td>${order.id}</td>
      <td>${order.buyer?.username || ""}</td>
      <td>${order.book?.title || ""}</td>
      <td>${money(order.amount, order.currency)}</td>
      <td><span class="badge ${order.status}">${order.status}</span></td>
      <td>${order.proofUrl ? `<a href="${order.proofUrl}" target="_blank">Open</a>` : ""}</td>
      <td>
        <button data-approve="${order.id}" ${order.status === "approved" ? "disabled" : ""}>${t("approve")}</button>
        <button class="danger" data-reject="${order.id}" ${order.status === "rejected" ? "disabled" : ""}>${t("reject")}</button>
      </td>
    </tr>`).join("");

  table.querySelectorAll("[data-approve]").forEach((button) => {
    button.addEventListener("click", async () => {
      await api("approveOrder", { orderId: button.dataset.approve });
      await loadOrdersAdmin();
    });
  });
  table.querySelectorAll("[data-reject]").forEach((button) => {
    button.addEventListener("click", async () => {
      const reason = prompt("Reject reason") || "";
      await api("rejectOrder", { orderId: button.dataset.reject, reason });
      await loadOrdersAdmin();
    });
  });
}

async function loadSettingsAdmin() {
  const form = document.querySelector("[data-settings-form]");
  const { settings } = await api("getSettings");
  Object.entries(settings || {}).forEach(([key, value]) => {
    const field = form.elements[key];
    if (field) field.value = value || "";
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    msg(t("loading"));
    try {
      const fd = new FormData(form);
      const settingsPayload = Object.fromEntries(fd.entries());
      if (fd.get("website_logo_file")?.size) settingsPayload.website_logo_url = await fileToPayload(fd.get("website_logo_file"));
      if (fd.get("aba_qr_file")?.size) settingsPayload.aba_qr_image_url = await fileToPayload(fd.get("aba_qr_file"));
      delete settingsPayload.website_logo_file;
      delete settingsPayload.aba_qr_file;
      await api("saveSettings", { settings: settingsPayload });
      msg(t("save"));
    } catch (error) {
      console.error("Settings save failed", error);
      msg(error.message || t("error"));
    }
  });
}

const staff = await requireStaff();
if (staff && page === "seller-dashboard") loadDashboard();
if (staff && page === "admin-books") loadBooksAdmin();
if (staff && page === "admin-orders") loadOrdersAdmin();
if (staff && page === "admin-settings") loadSettingsAdmin();
