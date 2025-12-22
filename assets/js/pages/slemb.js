/* ís.is — pages/slemb.js */
(() => {
  "use strict";

  // Optional: button-style theme toggle (same behavior everywhere)
  if (window.prefs) {
    const themeBtn = document.getElementById("themeBtn");
    if (themeBtn) {
      const sync = () => {
        const t = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
        themeBtn.setAttribute("aria-pressed", t === "dark" ? "true" : "false");
      };

      themeBtn.addEventListener("click", () => {
        prefs.toggleTheme();
        sync();
      });

      sync();
      window.addEventListener("storage", (e) => {
        if (e.key === "is.pref.theme") sync();
      });
    }
  } else {
    console.warn("slemb.js: prefs.js not loaded");
  }
})();
