// assets/js/pages/kort.menu.js
// Kort — Hamburger panel UI + accordion + mode/style switching
// Build-safe: no optional chaining

"use strict";

(() => {
  const panel = document.getElementById("kortPanel");
  const backdrop = document.getElementById("kortPanelBackdrop");
  const btnClose = document.getElementById("kortPanelClose");

  if (!panel || !backdrop) return;

  const details = Array.prototype.slice.call(panel.querySelectorAll("[data-acc]"));
  const hintMode = document.getElementById("kortHintMode");
  const hintStyle = document.getElementById("kortHintStyle");

  function setHintMode(id) {
    if (!hintMode) return;
    const map = {
      default: "Venjulegt",
      quiz_towns: "Bæir",
      quiz_glaciers: "Jöklar",
      wrecks: "Skipsflök"
    };
    hintMode.textContent = map[id] || id;
  }

  function setHintStyle(id) {
    if (!hintStyle) return;
    const map = {
      street: "Street",
      light: "Light",
      dark: "Dark",
      topo: "Topo",
      satellite: "Satellite"
    };
    hintStyle.textContent = map[id] || id;
  }

  function open() {
    panel.classList.add("is-open");
    panel.setAttribute("aria-hidden", "false");
    backdrop.hidden = false;

    // close all accordions by default for less noise
    details.forEach((d) => { d.open = false; });
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
  if (btnClose) btnClose.addEventListener("click", close);
  backdrop.addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  // One accordion open at a time
  details.forEach((d) => {
    d.addEventListener("toggle", () => {
      if (!d.open) return;
      details.forEach((other) => {
        if (other !== d) other.open = false;
      });
    });
  });

  // Mode / style buttons
  panel.addEventListener("click", (e) => {
    const styleBtn = e.target.closest("[data-style]");
    if (styleBtn) {
      const id = styleBtn.getAttribute("data-style");
      if (window.kortSetStyle) window.kortSetStyle(id);
      setHintStyle(id);
      close();
      return;
    }

    const modeBtn = e.target.closest("[data-mode]");
    if (modeBtn) {
      const id = modeBtn.getAttribute("data-mode");
      if (window.kortModes && window.kortModes.setMode) window.kortModes.setMode(id);
      setHintMode(id);
      close();
      return;
    }

    if (e.target && e.target.id === "kortGoHome") {
      const map = window.kortMap;
      const b = window.KORT_ICELAND_BOUNDS;
      if (map && b) map.fitBounds(b, { padding: 50, duration: 900, essential: true });
      close();
      return;
    }

    if (e.target && e.target.id === "kortUseLocation") {
      // trigger same behavior as control button if you want:
      alert("Notaðu 📍 takkann á kortinu (eða við tengjum þetta við sama handler næst).");
      close();
      return;
    }
  });

  // Initialize hints from current state (best effort)
  try {
    if (window.kortModes && window.kortModes.getCurrent) setHintMode(window.kortModes.getCurrent());
  } catch {}
  try {
    if (window.kortGetStyle) setHintStyle(window.kortGetStyle());
  } catch {}

  // Expose for the ☰ control
  window.kortMenu = { open, close, toggle };
})();
