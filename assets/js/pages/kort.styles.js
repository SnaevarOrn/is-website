// assets/js/pages/kort.styles.js
// Kort — Map styles manager (Street / Satellite / Topo / No-labels ready)
//
// Robust:
// - returns a Promise from set/toggle so controls can await
// - uses "style.load" event (more reliable than "load" after setStyle)
// - persists current style in localStorage
// - safe re-apply hooks after style swap

"use strict";

(() => {
  const map = window.kortMap;
  if (!map) return;

  const STORAGE_KEY = "kort_style_key";

  const STYLES = {
    street: {
      name: "Street (OSM)",
      style: "https://demotiles.maplibre.org/style.json"
    },

    satellite: {
      name: "Satellite",
      style: {
        version: 8,
        name: "Satellite",
        sources: {
          esri: {
            type: "raster",
            tiles: [
              "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            ],
            tileSize: 256,
            attribution: "© Esri"
          }
        },
        layers: [{ id: "sat", type: "raster", source: "esri" }]
      }
    }

    // topo: { ... }
    // nolabels: { ... }  // (oft gert sem overlay layer í mode, ekki sem base-style)
  };

  let currentKey = "street";
  let isApplying = false;

  function safeKey(k) {
    return STYLES[k] ? k : "street";
  }

  function getStored() {
    try {
      const k = localStorage.getItem(STORAGE_KEY);
      return safeKey(k || "street");
    } catch {
      return "street";
    }
  }

  function store(k) {
    try { localStorage.setItem(STORAGE_KEY, k); } catch {}
  }

  function waitStyleLoaded() {
    return new Promise((resolve) => {
      // If already loaded, resolve soon
      if (map.isStyleLoaded && map.isStyleLoaded()) return resolve();

      // Prefer style.load after setStyle
      const done = () => {
        try { map.off("style.load", done); } catch {}
        try { map.off("load", done); } catch {}
        resolve();
      };

      map.once("style.load", done);

      // Fallback: some environments still emit "load"
      map.once("load", done);

      // Final safety net
      setTimeout(done, 2500);
    });
  }

  async function afterApply() {
    // Re-apply modes (wrecks, quiz, etc.)
    try {
      const id = window.kortModes?.getCurrent?.() || "default";
      await window.kortModes?.setMode?.(id);
    } catch (e) { console.warn(e); }

    // Optional refresh hooks
    try { window.kortRouting?.refresh?.(); } catch {}
    try { window.kortMeasure?.refresh?.(); } catch {}
    try { window.kortCrosshair?.refresh?.(); } catch {}
  }

  async function set(key) {
    key = safeKey(key);

    if (key === currentKey) return currentKey;
    if (isApplying) return currentKey;

    isApplying = true;
    currentKey = key;
    store(key);

    try {
      map.setStyle(STYLES[key].style);
      await waitStyleLoaded();
      await afterApply();
    } catch (e) {
      console.warn("kort.styles set failed:", e);
    } finally {
      isApplying = false;
    }

    return currentKey;
  }

  async function toggle(key) {
    const target = safeKey(key);
    const next = (currentKey === target) ? "street" : target;
    return set(next);
  }

  function getCurrent() {
    return currentKey;
  }

  function list() {
    return Object.keys(STYLES);
  }

  // Init from storage (non-blocking)
  (async () => {
    const stored = getStored();
    if (stored !== currentKey) {
      await set(stored);
    }
  })();

  window.kortStyles = { set, toggle, getCurrent, list };
})();
