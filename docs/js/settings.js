(() => {
  "use strict";

  console.log("Settings JS loaded");

  /* ===============================
     CONFIG
  ================================= */
  const API_BASE = "http://192.168.137.6:5000";
  const LOGOUT_URL = `${API_BASE}/logout`;
  const REQUEST_TIMEOUT_MS = 2500;

  /* ===============================
     DOM
  ================================= */
  const themeLightBtn = document.querySelector("#theme-light");
  const themeDarkBtn = document.querySelector("#theme-dark");
  const languageSelect = document.querySelector("#language-select");
  const logoutBtn = document.querySelector("#logout-btn");

  /* ===============================
     THEME UI
  ================================= */
  function setActiveThemeCard(theme) {
    const setCard = (btn, isActive) => {
      if (!btn) return;
      btn.setAttribute("aria-pressed", String(isActive));
      btn.classList.toggle("ring-2", isActive);
      btn.classList.toggle("ring-green-500", isActive);
      btn.classList.toggle("border-green-500", isActive);
    };

    setCard(themeLightBtn, theme === "light");
    setCard(themeDarkBtn, theme === "dark");
  }

  function setTheme(theme) {
    const t = theme === "dark" ? "dark" : "light";

    // Prefer using the global theme manager from main.js
    if (window.AgroVisionTheme && typeof window.AgroVisionTheme.setTheme === "function") {
      window.AgroVisionTheme.setTheme(t);
      setActiveThemeCard(t);
      return;
    }

    // Fallback
    try { localStorage.setItem("agrovision-theme", t); } catch (e) {}
    document.documentElement.classList.toggle("dark", t === "dark");
    document.documentElement.setAttribute("data-theme", t);
    document.documentElement.style.colorScheme = t;
    setActiveThemeCard(t);
  }

  function loadTheme() {
    if (window.AgroVisionTheme && typeof window.AgroVisionTheme.getTheme === "function") {
      const t = window.AgroVisionTheme.getTheme();
      setActiveThemeCard(t);
      return;
    }

    let theme = "light";
    try { theme = localStorage.getItem("agrovision-theme") || "light"; } catch (e) {}
    setTheme(theme);
  }

  /* ===============================
     LANGUAGE
  ================================= */
  function setLanguage(lang) {
    const locale = lang === "id" ? "id" : "en";

    // Prefer using i18n helper
    if (window.AgroVisionI18N && typeof window.AgroVisionI18N.setLocale === "function") {
      window.AgroVisionI18N.setLocale(locale, { reload: true });
      return;
    }

    // Fallback: persist and reload
    try { localStorage.setItem("agrovision-lang", locale); } catch (e) {}
    try { window.location.reload(); } catch (e) {}
  }

  function loadLanguage() {
    let lang = "en";

    if (window.AgroVisionI18N && typeof window.AgroVisionI18N.getLocale === "function") {
      lang = window.AgroVisionI18N.getLocale();
    } else {
      try { lang = localStorage.getItem("agrovision-lang") || "en"; } catch (e) {}
    }

    if (languageSelect) languageSelect.value = lang;
  }

  /* ===============================
     LOGOUT (backend-ready)
  ================================= */
  function clearLocalSession() {
    const keys = [
      "agrovision-token",
      "agrovision_access_token",
      "agrovision_refresh_token",
      "token",
      "access_token",
      "refresh_token",
      "authToken",
      "session",
    ];
    keys.forEach((k) => {
      try { localStorage.removeItem(k); } catch (e) {}
      try { sessionStorage.removeItem(k); } catch (e) {}
    });
  }

  async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal,
        cache: "no-store",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {}),
        },
      });
    } finally {
      clearTimeout(t);
    }
  }

  async function logout() {
    if (logoutBtn) {
      logoutBtn.disabled = true;
      logoutBtn.classList.add("opacity-80", "cursor-not-allowed");
    }

    try {
      // If you later have a global auth helper, prioritize it
      if (window.AgroVisionAuth && typeof window.AgroVisionAuth.signOut === "function") {
        await window.AgroVisionAuth.signOut();
      } else {
        // Try backend logout endpoint (safe if not available)
        try {
          await fetchWithTimeout(LOGOUT_URL, { method: "POST", body: JSON.stringify({}) });
        } catch (e) {
          // ignore network errors; still clear local session below
        }
      }

      clearLocalSession();

      // Redirect (if you have login.html, prefer that)
      const tryPaths = ["login.html", "index.html"];
      const target = tryPaths[0]; // default
      // Keep it simple: go to login.html if exists in your project, otherwise index will handle it
      window.location.href = target;
    } finally {
      if (logoutBtn) {
        logoutBtn.disabled = false;
        logoutBtn.classList.remove("opacity-80", "cursor-not-allowed");
      }
    }
  }

  /* ===============================
     EVENTS
  ================================= */
  if (themeLightBtn) themeLightBtn.addEventListener("click", () => setTheme("light"));
  if (themeDarkBtn) themeDarkBtn.addEventListener("click", () => setTheme("dark"));
  if (languageSelect) languageSelect.addEventListener("change", () => setLanguage(languageSelect.value));

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      const ok = window.confirm("Are you sure you want to log out?");
      if (!ok) return;
      logout();
    });
  }

  // Keep theme/language in sync if changed in another tab
  window.addEventListener("storage", (e) => {
    if (!e) return;
    if (e.key === "agrovision-theme") loadTheme();
    if (e.key === "agrovision-lang") loadLanguage();
  });

  // Keep in sync if theme is changed via header toggle
  window.addEventListener("agrovision:themechange", (e) => {
    try {
      const t = e && e.detail && e.detail.theme ? e.detail.theme : null;
      if (t) setActiveThemeCard(t);
    } catch (err) {}
  });

  /* ===============================
     INIT
  ================================= */
  loadTheme();
  loadLanguage();
})();
