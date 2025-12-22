/* =========================================================
   ís.is — theme.js
   Global theme controller.
   - One shared theme across all pages.
   - Supports multiple toggles (same behavior everywhere).
   - Depends on prefs.js (prefs.applyTheme) and its storage key.
   ========================================================= */

(function () {
  "use strict";

  const STORAGE_KEY = "is.pref.theme"; // keep your existing key

  // prefs.js is the source of truth for how theme is applied (and stored)
  if (!window.prefs || typeof window.prefs.applyTheme !== "function") {
    console.warn("theme.js: prefs.js not loaded (prefs.applyTheme missing)");
    return;
  }

  function getThemeFromDOM() {
    const t = document.documentElement.getAttribute("data-theme");
    return (t === "light") ? "light" : "dark";
  }

  function setTheme(theme) {
    const t = (theme === "light") ? "light" : "dark";
    // prefs.applyTheme should set data-theme + persist to STORAGE_KEY
    window.prefs.applyTheme(t);
    syncToggles();
  }

  function getAllToggles() {
    // Support:
    // 1) existing id="themeToggle"
    // 2) any extra toggles: data-theme-toggle
    const els = Array.from(document.querySelectorAll("#themeToggle, [data-theme-toggle]"));
    // Deduplicate (if element matches both selectors somehow)
    return Array.from(new Set(els));
  }

  function syncToggles() {
    const t = getThemeFromDOM();
    const isLight = (t === "light");

    for (const el of getAllToggles()) {
      // checkbox toggle
      if (el instanceof HTMLInputElement && el.type === "checkbox") {
        el.checked = isLight;
      } else {
        // button / anything else: keep it accessible if you want
        el.setAttribute("aria-pressed", isLight ? "true" : "false");
      }
    }
  }

  function wireToggles() {
    for (const el of getAllToggles()) {
      // Avoid double-wiring
      if (el.dataset && el.dataset.themeWired === "1") continue;
      if (el.dataset) el.dataset.themeWired = "1";

      if (el instanceof HTMLInputElement && el.type === "checkbox") {
        el.addEventListener("change", () => {
          setTheme(el.checked ? "light" : "dark");
        });
      } else {
        el.addEventListener("click", () => {
          setTheme(getThemeFromDOM() === "light" ? "dark" : "light");
        });
      }
    }
  }

  function init() {
    wireToggles();
    syncToggles();
  }

  // DOM ready (theme.js loads with defer, but safe)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  // Sync across tabs/pages via your existing storage key
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY) return;
    // prefs.js should already update storage; we just sync UI state
    syncToggles();
  });

  // Safari Back/Forward cache: resync when page is restored
  window.addEventListener("pageshow", () => {
    wireToggles();
    syncToggles();
  });

  // Optional: allow other scripts to force sync/set
  window.theme = window.theme || {};
  window.theme.sync = syncToggles;
  window.theme.set = setTheme;

})();
