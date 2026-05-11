(function () {
  const SESSION_KEY = "khozyreads.session";
  const url = window.KHOZYREADS_APPS_SCRIPT_URL;

  function message(text) {
    const el = document.querySelector("[data-message]");
    if (el) {
      el.textContent = text;
      el.className = text ? "notice" : "";
    }
  }

  function jsonp(action, payload) {
    return new Promise((resolve, reject) => {
      if (!url || url.includes("PASTE_")) {
        reject(new Error("Apps Script URL is not set in assets/config.js."));
        return;
      }

      const callbackName = `khozyreadsFallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const requestUrl = new URL(url);
      requestUrl.searchParams.set("payload", JSON.stringify({ action, ...payload }));
      requestUrl.searchParams.set("callback", callbackName);

      const script = document.createElement("script");
      const timer = window.setTimeout(() => {
        cleanup();
        reject(new Error("Request timed out. Check Web App deployment access: Anyone."));
      }, 20000);

      function cleanup() {
        window.clearTimeout(timer);
        delete window[callbackName];
        script.remove();
      }

      window[callbackName] = (result) => {
        cleanup();
        if (!result.ok) reject(new Error(result.error || "Request failed."));
        else resolve(result);
      };

      script.onerror = () => {
        cleanup();
        reject(new Error("Apps Script request failed. Redeploy Web App as Anyone and use the /exec URL."));
      };

      script.src = requestUrl.toString();
      document.head.appendChild(script);
    });
  }

  function attachFallback() {
    if (window.KHOZYREADS_MODULE_READY) return;

    const registerForm = document.querySelector("[data-register-form]");
    if (registerForm) {
      registerForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        message("Registering...");
        try {
          const result = await jsonp("register", {
            username: registerForm.username.value,
            password: registerForm.password.value
          });
          localStorage.setItem(SESSION_KEY, JSON.stringify({ token: result.token, user: result.user }));
          if (window.KHOZYREADS_SYNC_NAV) window.KHOZYREADS_SYNC_NAV();
          if (window.KR_AUTH?.syncAuthNav) window.KR_AUTH.syncAuthNav();
          window.location.href = "library.html";
        } catch (error) {
          console.error("Fallback register failed", error);
          message(error.message);
        }
      });
    }

    const loginForm = document.querySelector("[data-login-form]");
    if (loginForm) {
      loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        message("Logging in...");
        try {
          const result = await jsonp("login", {
            username: loginForm.username.value,
            password: loginForm.password.value
          });
          localStorage.setItem(SESSION_KEY, JSON.stringify({ token: result.token, user: result.user }));
          if (window.KHOZYREADS_SYNC_NAV) window.KHOZYREADS_SYNC_NAV();
          if (window.KR_AUTH?.syncAuthNav) window.KR_AUTH.syncAuthNav();
          window.location.href = loginForm.dataset.staff ? "seller-dashboard.html" : "library.html";
        } catch (error) {
          console.error("Fallback login failed", error);
          message(error.message);
        }
      });
    }
  }

  window.setTimeout(attachFallback, 600);
})();
