// assets/js/pages/kort.menu.js
// Kort — Hamburger panel UI + accordion + mode/style switching + addons
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

  // Optional: small hint area for addons (only if you add #kortHintAddons in HTML)
  const hintAddons = document.getElementById("kortHintAddons");

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
      topo: "Topo",
      satellite: "Satellite"
    };
    hintStyle.textContent = map[id] || id;
  }

  function setHintAddons(list) {
    if (!hintAddons) return;
    if (!list || !list.length) {
      hintAddons.textContent = "—";
      return;
    }
    hintAddons.textContent = list.join(", ");
  }

  function open() {
    panel.classList.add("is-open");
    panel.setAttribute("aria-hidden", "false");
    backdrop.hidden = false;

    // close all accordions by default for less noise
    for (let i = 0; i < details.length; i++) details[i].open = false;
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
  for (let i = 0; i < details.length; i++) {
    const d = details[i];
    d.addEventListener("toggle", () => {
      if (!d.open) return;
      for (let j = 0; j < details.length; j++) {
        const other = details[j];
        if (other !== d) other.open = false;
      }
    });
  }

  async function applyStyle(id) {
    const ks = window.kortStyles;
    if (!ks || typeof ks.set !== "function") return false;

    try {
      const key = await ks.set(id);
      setHintStyle(key);
      return true;
    } catch (e) {
      console.warn(e);
      return false;
    }
  }

  function applyMode(id) {
    try {
      if (window.kortModes && typeof window.kortModes.setMode === "function") {
        window.kortModes.setMode(id);
        setHintMode(id);
        return true;
      }
    } catch (e) {
      console.warn(e);
    }
    return false;
  }

  function applyAddon(id, btn) {
    try {
      if (window.kortAddons && typeof window.kortAddons.toggle === "function") {
        const on = window.kortAddons.toggle(id);

        // If your addon API returns boolean, we can reflect state on the button.
        if (btn && typeof on === "boolean") {
          btn.classList.toggle("is-on", on);
          btn.setAttribute("aria-pressed", on ? "true" : "false");
        }

        // Update hint if addon API supports listOn()
        try {
          if (window.kortAddons && typeof window.kortAddons.listOn === "function") {
            setHintAddons(window.kortAddons.listOn());
          }
        } catch {}

        return true;
      }
    } catch (e) {
      console.warn(e);
    }
    return false;
  }

  // Mode / style / addon buttons (event delegation)
  panel.addEventListener("click", (e) => {
    const t = e.target;

    const styleBtn = t && t.closest ? t.closest("[data-style]") : null;
    if (styleBtn) {
      const id = styleBtn.getAttribute("data-style");
      close();           // close immediately for snappy UX
      applyStyle(id);    // async best-effort
      return;
    }

    const modeBtn = t && t.closest ? t.closest("[data-mode]") : null;
    if (modeBtn) {
      const id = modeBtn.getAttribute("data-mode");
      applyMode(id);
      close();
      return;
    }

    const addonBtn = t && t.closest ? t.closest("[data-addon]") : null;
    if (addonBtn) {
      const id = addonBtn.getAttribute("data-addon");
      applyAddon(id, addonBtn);
      close();
      return;
    }

    if (t && t.id === "kortGoHome") {
      if (typeof window.kortGoHome === "function") window.kortGoHome();
      close();
      return;
    }

    if (t && t.id === "kortUseLocation") {
      if (typeof window.kortUseLocation === "function") window.kortUseLocation();
      close();
      return;
    }
  });

  // Initialize hints from current state (best effort)
  try {
    if (window.kortModes && typeof window.kortModes.getCurrent === "function") {
      setHintMode(window.kortModes.getCurrent());
    }
  } catch {}

  try {
    const ks = window.kortStyles;
    if (ks && typeof ks.getCurrent === "function") setHintStyle(ks.getCurrent());
  } catch {}

  // Init addons hint + button pressed states (best effort)
  try {
    if (window.kortAddons) {
      if (typeof window.kortAddons.listOn === "function") {
        setHintAddons(window.kortAddons.listOn());
      }
      if (typeof window.kortAddons.isOn === "function") {
        const btns = panel.querySelectorAll("[data-addon]");
        for (let i = 0; i < btns.length; i++) {
          const b = btns[i];
          const id = b.getAttribute("data-addon");
          const on = !!window.kortAddons.isOn(id);
          b.classList.toggle("is-on", on);
          b.setAttribute("aria-pressed", on ? "true" : "false");
        }
      }
    }
  } catch {}

  // Expose for the ☰ control
  window.kortMenu = { open, close, toggle };
})();