// assets/js/pages/kort.search.overlay.js
// Search overlay open/close (used by 🔍 control) — robust version

"use strict";

(() => {
  const ov = document.getElementById("kortSearchOverlay");
  if (!ov) return;

  const btnX = document.getElementById("kortSearchOvClose");
  const input = document.getElementById("kortSearchOv");

  function open() {
    ov.hidden = false;
    ov.setAttribute("aria-hidden", "false");
    // focus after paint
    setTimeout(() => { try { input && input.focus(); } catch (e) {} }, 0);
  }

  function close(silent) {
    ov.hidden = true;
    ov.setAttribute("aria-hidden", "true");
    if (!silent) {
      // optional: clear query
      // if (input) input.value = "";
    }
  }

  // HARD guarantee: overlay must be closed on startup
  close(true);

  // Click outside card closes
  ov.addEventListener("click", (e) => {
    if (e.target === ov) close();
  });

  // Close button
  if (btnX) {
    btnX.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      close();
    });
  }

  // Escape closes
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !ov.hidden) close();
  });

  window.kortSearchOverlay = { open, close };
})();
