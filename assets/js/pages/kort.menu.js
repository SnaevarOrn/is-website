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

  // ✅ Correct globals (separate namespaces)
  const getOverpass = () => window.kortAddonsOverpass;
  const getLive = () => window.kortAddonsLive;

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

  function open() {
    panel.classList.add("is-open");
    panel.setAttribute("aria-hidden", "false");
    backdrop.hidden = false;

    for (let i = 0; i < details.length; i++) details[i].open = false;

    // sync ✓ when opened
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

      // Style swap nukes layers -> give addons a moment then resync UI
      setTimeout(syncAddonChecks, 250);
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

  function setBtnState(btn, on) {
    btn.classList.toggle("is-on", !!on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function isOverpassOn(id) {
    const over = getOverpass();
    if (!over || typeof over.isOn !== "function") return false;
    try { return !!over.isOn(id); } catch { return false; }
  }

  function isLiveOn(id) {
    const live = getLive();
    if (!live || typeof live.isOn !== "function") return false;
    try { return !!live.isOn(id); } catch { return false; }
  }

  function syncAddonChecks() {
    // Overpass buttons
    const opBtns = panel.querySelectorAll("[data-addon]");
    for (let i = 0; i < opBtns.length; i++) {
      const b = opBtns[i];
      const id = b.getAttribute("data-addon");
      if (!id) continue;
      setBtnState(b, isOverpassOn(id));
    }

    // Live buttons (optional)
    const liveBtns = panel.querySelectorAll("[data-live]");
    for (let i = 0; i < liveBtns.length; i++) {
      const b = liveBtns[i];
      const id = b.getAttribute("data-live");
      if (!id) continue;
      setBtnState(b, isLiveOn(id));
    }
  }

  function toggleOverpass(id) {
    const over = getOverpass();
    if (!over || typeof over.toggle !== "function") return false;
    try { over.toggle(id); return true; } catch (e) { console.warn(e); return false; }
  }

  function toggleLive(id) {
    const live = getLive();
    if (!live || typeof live.toggle !== "function") return false;
    try { live.toggle(id); return true; } catch (e) { console.warn(e); return false; }
  }

  // Click delegation
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

    // Overpass addons
    const addonBtn = t && t.closest ? t.closest("[data-addon]") : null;
    if (addonBtn) {
      const id = addonBtn.getAttribute("data-addon");
      if (!id) return;

      const ok = toggleOverpass(id);
      if (ok) setBtnState(addonBtn, isOverpassOn(id));
      return;
    }

    // Live addons (optional)
    const liveBtn = t && t.closest ? t.closest("[data-live]") : null;
    if (liveBtn) {
      const id = liveBtn.getAttribute("data-live");
      if (!id) return;

      const ok = toggleLive(id);
      if (ok) setBtnState(liveBtn, isLiveOn(id));
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

  // Expose for ☰ control
  window.kortMenu = { open, close, toggle };

  // Best-effort initial sync
  setTimeout(syncAddonChecks, 0);
  setTimeout(syncAddonChecks, 350);
})();