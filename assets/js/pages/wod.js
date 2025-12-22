/* ís.is — pages/wod.js
   Minimal: wire theme toggle if present, and optional nav buttons if you want later.
*/
(() => {
  "use strict";

  // Theme toggle uses prefs/theme.js convention (same id across pages)
  // theme.js already binds #themeToggle if present.
  // Here we support a button-style toggle too (#themeBtn) by calling prefs.toggleTheme()

  if (!window.prefs) {
    console.warn("wod.js: prefs.js not loaded");
    return;
  }

  const themeBtn = document.getElementById("themeBtn");
  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      prefs.toggleTheme();
      // keep aria in sync
      const cur = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
      themeBtn.setAttribute("aria-pressed", cur === "dark" ? "true" : "false");
    });

    // init aria-pressed
    const cur = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    themeBtn.setAttribute("aria-pressed", cur === "dark" ? "true" : "false");

    // sync across tabs/pages
    window.addEventListener("storage", (e) => {
      if (e.key === "is.pref.theme") {
        const t = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
        themeBtn.setAttribute("aria-pressed", t === "dark" ? "true" : "false");
      }
    });
  }
})();
