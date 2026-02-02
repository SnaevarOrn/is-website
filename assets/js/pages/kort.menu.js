// assets/js/pages/kort.menu.js
// Kort — Hamburger panel UI + accordion + mode/style switching + addon toggles + checkmarks
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

  // ✅ One API to rule them all (router created by addons.overpass.js)
  const getAddons = () => window.kortAddons;

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
    const map = { street: "Street", topo: "Topo", satellite: "Satellite", light: "Light", dark: "Dark" };
    hintStyle.textContent = map[id] || id;
  }

  function setBtnState(btn, on) {
    btn.classList.toggle("is-on", !!on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function isAddonOn(id) {
    const ka = getAddons();
    if (!ka || typeof ka.isOn !== "function") return false;
    try { return !!ka.isOn(id); } catch { return false; }
  }

  function toggleAddon(id) {
    const ka = getAddons();
    if (!ka || typeof ka.toggle !== "function") return false;
    try { return !!ka.toggle(id); } catch (e) { console.warn(e); return false; }
  }

  function syncAddonChecks() {
    const btns = panel.querySelectorAll("[data-addon]");
    for (let i = 0; i < btns.length; i++) {
      const b = btns[i];
      const id = b.getAttribute("data-addon");
      if (!id) continue;
      setBtnState(b, isAddonOn(id));
    }
  }

  function open() {
    panel.classList.add("is-open");
    panel.setAttribute("aria-hidden", "false");
    backdrop.hidden = false;
    for (let i = 0; i < details.length; i++) details[i].open = false;
    syncAddonChecks();
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

  if (btnClose) btnClose.addEventListener("click", close);
  backdrop.addEventListener("click", close);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

  for (let i = 0; i < details.length; i++) {
    const d = details[i];
    d.addEventListener("toggle", () => {
      if (!d.open) return;
      for (let j = 0; j < details.length; j++) if (details[j] !== d) details[j].open = false;
    });
  }

  async function applyStyle(id) {
    const ks = window.kortStyles;
    if (!ks || typeof ks.set !== "function") return false;
    try {
      const key = await ks.set(id);
      setHintStyle(key);

      // after style swap, layers vanish -> addons refresh + UI resync
      setTimeout(() => {
        try {
          const ka = getAddons();
          if (ka && typeof ka.refresh === "function") ka.refresh();
        } catch {}
        syncAddonChecks();
      }, 260);

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
    } catch (e) { console.warn(e); }
    return false;
  }

  panel.addEventListener("click", (e) => {
    const t = e.target;

    const styleBtn = t && t.closest ? t.closest("[data-style]") : null;
    if (styleBtn) {
      const id = styleBtn.getAttribute("data-style");
      close();
      applyStyle(id);
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
      if (!id) return;

      // ✅ keep panel open for multi-toggle, update checkmark instantly
      toggleAddon(id);
      setBtnState(addonBtn, isAddonOn(id));
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

  try {
    if (window.kortModes && typeof window.kortModes.getCurrent === "function") setHintMode(window.kortModes.getCurrent());
  } catch {}

  try {
    const ks = window.kortStyles;
    if (ks && typeof ks.getCurrent === "function") setHintStyle(ks.getCurrent());
  } catch {}

  window.kortMenu = { open, close, toggle };

  setTimeout(syncAddonChecks, 0);
  setTimeout(syncAddonChecks, 350);
})();
