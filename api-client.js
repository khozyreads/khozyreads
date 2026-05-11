export const APPS_SCRIPT_URL = window.KHOZYREADS_APPS_SCRIPT_URL || "https://script.google.com/macros/s/AKfycbwPzXg54ROBqk8BWcoIc2f38wfbVaOaOUI0GD1KnLftk34z4dYhGunZgKTVaQ27C2c6/exec";

const SESSION_KEY = "khozyreads.session";

export function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

export function money(amount, currency = "USD") {
  return `${Number(amount || 0).toFixed(2)} ${currency || "USD"}`;
}

export function isPurchaseOpen(book) {
  const now = new Date();
  const fromOk = !book.availableFrom || now >= new Date(book.availableFrom);
  const untilOk = !book.availableUntil || now <= new Date(book.availableUntil);
  return book.status === "active" && String(book.isBuyEnabled) !== "false" && fromOk && untilOk;
}

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

export function setSession(session) {
  if (!session) localStorage.removeItem(SESSION_KEY);
  else localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function currentToken() {
  return getSession()?.token || "";
}

export async function api(action, payload = {}) {
  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.includes("PASTE_")) {
    throw new Error("Please set your Google Apps Script Web App URL in assets/api-client.js.");
  }

  const body = { action, token: currentToken(), ...payload };
  const result = await requestJson(body);
  if (!result.ok) throw new Error(result.error || "Request failed.");
  return result;
}

async function requestJson(body) {
  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body)
    });
    return await response.json();
  } catch (postError) {
    console.error("Apps Script POST failed, retrying with GET fallback", postError);
    if (JSON.stringify(body).length > 1500) {
      throw new Error("Connection to Apps Script failed. File uploads need the website hosted online or inside Apps Script, not opened as a local file.");
    }
    try {
      const url = new URL(APPS_SCRIPT_URL);
      url.searchParams.set("payload", JSON.stringify(body));
      const response = await fetch(url.toString(), { method: "GET" });
      return await response.json();
    } catch (getError) {
      console.error("Apps Script GET failed, retrying with JSONP fallback", getError);
      return jsonpRequest(body);
    }
  }
}

function jsonpRequest(body) {
  return new Promise((resolve, reject) => {
    const callbackName = `khozyreadsCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const url = new URL(APPS_SCRIPT_URL);
    url.searchParams.set("payload", JSON.stringify(body));
    url.searchParams.set("callback", callbackName);

    const script = document.createElement("script");
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Apps Script request timed out. Check the Web App URL and deployment access."));
    }, 20000);

    function cleanup() {
      window.clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
    }

    window[callbackName] = (result) => {
      cleanup();
      resolve(result);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("Apps Script request failed. Make sure the Web App is deployed with access set to Anyone."));
    };

    script.src = url.toString();
    document.head.appendChild(script);
  });
}

export function fileToPayload(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.size) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = String(reader.result).split(",")[1] || "";
      resolve({ fileName: file.name, mimeType: file.type || "application/octet-stream", base64 });
    };
    reader.onerror = () => reject(reader.error || new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}
