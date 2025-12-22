/* =========================================================
   ís.is — theme.js
   Theme toggle wiring for settings modal (depends on prefs.js)
   Safe on pages without #themeToggle.
   ========================================================= */

(function () {
  "use strict";

  if (!window.prefs) {
    console.warn("theme.js: prefs.js not loaded");
    return;
  }

  const toggle = document.getElementById("themeToggle");
  if (!toggle) return;

  function curTheme() {
    const t = document.documentElement.getAttribute("data-theme");
    return (t === "dark") ? "dark" : "light";
  }

  function syncToggle() {
    toggle.checked = (curTheme() === "dark");
  }

  // Initial sync (DOM is ready when this runs via defer, but safe anyway)
  document.addEventListener("DOMContentLoaded", syncToggle);

  // User changes toggle
  toggle.addEventListener("change", (e) => {
    const next = e.target.checked ? "dark" : "light";
    prefs.applyTheme(next);
    syncToggle();
  });

  // Sync across tabs/pages
  window.addEventListener("storage", (e) => {
    if (e.key === "is.pref.theme") syncToggle();
  });

  // Optional: allow other scripts to force sync
  window.theme = window.theme || {};
  window.theme.sync = syncToggle;

})();