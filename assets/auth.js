import { api, getSession as readSession, setSession } from "./api-client.js";
import { applyI18n } from "./i18n.js";

export async function getSession() {
  return readSession();
}

export async function getProfile() {
  return readSession()?.user || null;
}

export async function requireAuth() {
  const profile = await getProfile();
  if (!profile) window.location.href = "login.html";
  return profile;
}

export async function requireStaff() {
  const profile = await getProfile();
  if (!profile || !["seller", "admin"].includes(profile.role)) {
    window.location.href = "seller-login.html";
    return null;
  }
  return profile;
}

export async function registerBuyer(username, password) {
  const cleanUsername = username.trim().toLowerCase();
  if (!/^[a-zA-Z]+[0-9]+$/.test(cleanUsername)) {
    throw new Error("Username must use letters followed by numbers, for example dara123.");
  }
  const result = await api("register", { username: cleanUsername, password });
  setSession({ token: result.token, user: result.user });
  return { user: result.user, session: true, username: cleanUsername };
}

export async function signInUsername(username, password) {
  const result = await api("login", { username, password });
  setSession({ token: result.token, user: result.user });
  return result.user;
}

export async function signOut() {
  setSession(null);
  window.location.href = "index.html";
}

export function wireSharedUi() {
  applyI18n();
  syncAuthNav();
  document.querySelectorAll("[data-lang]").forEach((btn) => {
    btn.addEventListener("click", () => window.KR_I18N.setLang(btn.dataset.lang));
  });
  document.querySelectorAll("[data-logout]").forEach((btn) => {
    btn.addEventListener("click", signOut);
  });
}

export function syncAuthNav() {
  const loggedIn = Boolean(readSession()?.token);
  document.querySelectorAll("[data-auth-user]").forEach((el) => {
    el.classList.toggle("hidden", !loggedIn);
  });
  document.querySelectorAll("[data-auth-guest]").forEach((el) => {
    el.classList.toggle("hidden", loggedIn);
  });
}

window.KR_AUTH = { signOut, syncAuthNav };
