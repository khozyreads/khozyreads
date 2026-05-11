(function () {
  const SESSION_KEY = "khozyreads.session";

  function hasSession() {
    try {
      const session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      return Boolean(session && session.token);
    } catch {
      return false;
    }
  }

  function syncNav() {
    const loggedIn = hasSession();
    document.querySelectorAll("[data-auth-user]").forEach((el) => {
      el.classList.toggle("hidden", !loggedIn);
    });
    document.querySelectorAll("[data-auth-guest]").forEach((el) => {
      el.classList.toggle("hidden", loggedIn);
    });
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
    syncNav();
    window.location.href = "index.html";
  }

  function boot() {
    syncNav();
    document.querySelectorAll("[data-logout]").forEach((button) => {
      if (button.dataset.navLogoutReady) return;
      button.dataset.navLogoutReady = "true";
      button.addEventListener("click", logout);
    });
  }

  window.KHOZYREADS_SYNC_NAV = syncNav;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
