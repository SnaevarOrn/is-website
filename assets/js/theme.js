/* =========================================================
   ís.is — theme.js
   Global theme wiring (depends on prefs.js)
   - One shared theme across the whole site (prefs key: is.pref.theme)
   - Supports multiple toggles anywhere (same behavior everywhere)
   - Safe on pages without toggles
   ========================================================= */

(function () {
  "use strict";

  const STORAGE_KEY = "is.pref.theme";

  if (!window.prefs || typeof window.prefs.applyTheme !== "function") {
    console.warn("theme.js: prefs.js not loaded (prefs.applyTheme missing)");
    return;
  }

  function domTheme() {
    const t = document.documentElement.getAttribute("data-theme");
    return (t === "dark") ? "dark" : "light";
  }

  function storedTheme() {
    // prefs.get returns parsed JSON; defaults exist in prefs.js
    const t = window.prefs.get("theme", window.prefs.defaults?.theme || "light");
    return (t === "dark") ? "dark" : "light";
  }

  function setTheme(t) {
    window.prefs.applyTheme((t === "dark") ? "dark" : "light");
    syncToggles();
  }

  function getToggles() {
    // You can have many. Keep existing #themeToggle plus any [data-theme-toggle]
    const list = Array.from(document.querySelectorAll("#themeToggle, [data-theme-toggle]"));
    return Array.from(new Set(list));
  }

  function syncToggles() {
    const t = domTheme(); // reflect what is actually applied
    const isDark = (t === "dark");

    for (const el of getToggles()) {
      if (el instanceof HTMLInputElement && el.type === "checkbox") {
        // NOTE: your old code used checked = dark. Keep that behavior.
        el.checked = isDark;
      } else {
        el.setAttribute("aria-pressed", isDark ? "true" : "false");
      }
    }
  }

  function wireToggles() {
    for (const el of getToggles()) {
      if (el.dataset && el.dataset.themeWired === "1") continue;
      if (el.dataset) el.dataset.themeWired = "1";

      if (el instanceof HTMLInputElement && el.type === "checkbox") {
        el.addEventListener("change", () => {
          setTheme(el.checked ? "dark" : "light");
        });
      } else {
        el.addEventListener("click", () => {
          setTheme(domTheme() === "dark" ? "light" : "dark");
        });
      }
    }
  }

  function init() {
    // Ensure theme is applied from storage on every page load
    // (so same tab navigation always respects the chosen theme)
    window.prefs.applyThemeFromStorage();

    wireToggles();
    syncToggles();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  // Cross-tab sync
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY) return;
    // prefs.js storage listener already appliesTheme(val)
    // we just need to sync UI toggles on this page
    syncToggles();
  });

  // Safari BFCache + back/forward: resync
  window.addEventListener("pageshow", () => {
    // If page came back from cache, re-apply from storage and sync toggles
    window.prefs.applyThemeFromStorage();
    wireToggles();
    syncToggles();
  });

  // Optional API
  window.theme = window.theme || {};
  window.theme.sync = syncToggles;
  window.theme.set = setTheme;

})();
