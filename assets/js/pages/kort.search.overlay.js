// assets/js/pages/kort.search.overlay.js
// Search overlay open/close (used by 🔍 control)

"use strict";

(() => {
  const ov = document.getElementById("kortSearchOverlay");
  const btnX = document.getElementById("kortSearchOvClose");
  const input = document.getElementById("kortSearchOv");

  if (!ov) return;

  function open() {
    ov.hidden = false;
    ov.setAttribute("aria-hidden", "false");
    setTimeout(() => { if (input) input.focus(); }, 0);
  }

  function close() {
    ov.hidden = true;
    ov.setAttribute("aria-hidden", "true");
  }

  ov.addEventListener("click", (e) => {
    // click outside card closes
    if (e.target === ov) close();
  });

  if (btnX) btnX.addEventListener("click", close);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !ov.hidden) close();
  });

  window.kortSearchOverlay = { open, close };
})();
