// assets/js/pages/kort.menu.js
// Kort — Hamburger panel UI + accordion + mode/style switching + addon toggles
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

  // ⬇️ Stilltu þetta ef overpass module exportar öðru nafni
  const getOverpass = () => window.kortOverpassAddons; // <-- BREYTTU EF ÞARF
  const getLive = () => window.kortAddons;

  const LIVE_KEYS = { flights: true, roads: true }; // live addons here

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
    const map = { street: "Street", topo: "Topo", satellite: "Satellite" };
    hintStyle.textContent = map[id] || id;
  }

  function open() {
    panel.classList.add("is-open");
    panel.setAttribute("aria-hidden", "false");
    backdrop.hidden = false;
    for (let i = 0; i < details.length; i++) details[i].open = false;
    // sync checkmarks þegar opnað er
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
      // styleswap: addons layers/sources detta út -> sync
      setTimeout(syncAddonChecks, 200);
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

  function isAddonOn(id) {
    const live = getLive();
    const over = getOverpass();

    if (LIVE_KEYS[id]) {
      return !!(live && typeof live.isOn === "function" && live.isOn(id));
    }
    // overpass
    return !!(over && typeof over.isOn === "function" && over.isOn(id));
  }

  function setAddonButtonState(btn, on) {
    // class fyrir CSS ✓ / highlight
    btn.classList.toggle("is-on", !!on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function syncAddonChecks() {
    const btns = panel.querySelectorAll("[data-addon]");
    for (let i = 0; i < btns.length; i++) {
      const b = btns[i];
      const id = b.getAttribute("data-addon");
      if (!id) continue;
      setAddonButtonState(b, isAddonOn(id));
    }
  }

  function toggleAddon(id) {
    const live = getLive();
    const over = getOverpass();

    try {
      if (LIVE_KEYS[id]) {
        if (!live || typeof live.toggle !== "function") return false;
        live.toggle(id);
        return true;
      }
      // overpass
      if (!over || typeof over.toggle !== "function") return false;
      over.toggle(id);
      return true;
    } catch (e) {
      console.warn(e);
      return false;
    }
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

      // ✅ ekki loka panel — leyfir multi-toggle + sjá checkmark
      const ok = toggleAddon(id);
      if (ok) setAddonButtonState(addonBtn, isAddonOn(id));
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

  // Initialize hints
  try {
    if (window.kortModes && typeof window.kortModes.getCurrent === "function") {
      setHintMode(window.kortModes.getCurrent());
    }
  } catch {}

  try {
    const ks = window.kortStyles;
    if (ks && typeof ks.getCurrent === "function") setHintStyle(ks.getCurrent());
  } catch {}

  // Expose
  window.kortMenu = { open, close, toggle };

  // Best-effort: keep checks updated if something changes outside menu
  setTimeout(syncAddonChecks, 0);
})();