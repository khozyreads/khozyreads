import { t } from "./i18n.js";

export function enableReaderProtection({ username, userId, orderId }) {
  const reader = document.querySelector("[data-reader-content]");
  if (!reader) return;

  const notice = document.createElement("div");
  notice.className = "protection-notice";
  notice.textContent = t("protectedNotice");
  reader.before(notice);

  const watermark = document.createElement("div");
  watermark.className = "reader-watermark";
  reader.appendChild(watermark);

  const setWatermark = () => {
    const stamp = new Date().toLocaleString();
    watermark.textContent = `${username} | ${userId || orderId || ""} | ${stamp}`;
    watermark.style.backgroundPosition = `${Math.floor(Math.random() * 80)}px ${Math.floor(Math.random() * 80)}px`;
  };

  setWatermark();
  setInterval(setWatermark, 4000);

  reader.addEventListener("contextmenu", (event) => event.preventDefault());
  ["copy", "cut", "paste"].forEach((name) => {
    reader.addEventListener(name, (event) => event.preventDefault());
  });

  document.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    const blocked =
      event.key === "F12" ||
      (event.ctrlKey && ["c", "x", "s", "p", "u"].includes(key)) ||
      (event.ctrlKey && event.shiftKey && key === "i");
    if (blocked) {
      event.preventDefault();
      event.stopPropagation();
    }
  });

  const blurWhenHidden = () => reader.classList.toggle("reader-blurred", document.hidden || !document.hasFocus());
  document.addEventListener("visibilitychange", blurWhenHidden);
  window.addEventListener("blur", blurWhenHidden);
  window.addEventListener("focus", blurWhenHidden);
}
