// assets/js/pages/kort.menu.js
// Kort — Hamburger panel UI + mode switching

"use strict";

(() => {
  const panel = document.getElementById("kortPanel");
  const backdrop = document.getElementById("kortPanelBackdrop");
  const btnClose = document.getElementById("kortPanelClose");

  if (!panel || !backdrop) return;

  function open() {
    panel.classList.add("is-open");
    panel.setAttribute("aria-hidden", "false");
    backdrop.hidden = false;
  }

  function close() {
    panel.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");
    backdrop.hidden = true;
  }

  function toggle() {
    if (panel.classList.contains("is-open")) close();
    else open();
  }

  // Close actions
  btnClose?.addEventListener("click", close);
  backdrop.addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  // Mode buttons
  panel.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-mode]");
    if (!btn) return;
    const id = btn.getAttribute("data-mode");
    window.kortModes?.setMode?.(id);
    close();
  });
panel.addEventListener("click", (e) => {
  const styleBtn = e.target.closest("[data-style]");
  if (styleBtn) {
    const id = styleBtn.getAttribute("data-style");
    window.kortSetStyle?.(id);
    close();
    return;
  }

  const modeBtn = e.target.closest("[data-mode]");
  if (modeBtn) {
    const id = modeBtn.getAttribute("data-mode");
    window.kortModes?.setMode?.(id);
    close();
    return;
  }
});

  // Expose for control button
  window.kortMenu = { open, close, toggle };
})();
