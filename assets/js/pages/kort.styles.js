// assets/js/pages/kort.styles.js
// Kort — Map styles manager (Street / Satellite / Topo / No-labels ready)
//
// Robust:
// - returns a Promise from set/toggle so controls can await
// - uses "style.load" event (more reliable than "load" after setStyle)
// - persists current style in localStorage
// - safe re-apply hooks after style swap
// - IMPORTANT: "street" uses the *initial* map style (so we don't fall back to MapLibre demo world-map)

"use strict";

(() => {
  const map = window.kortMap;
  if (!map) return;

  const STORAGE_KEY = "kort_style_key";

  // Capture the initial style used when the map was created.
  // This is the safest way to "get back to OSM street" without hardcoding a demo URL.
  const INITIAL_STYLE = (() => {
    try {
      // Allow explicit override if you set it in kort.js before styles loads:
      // window.KORT_STREET_STYLE = "https://.../style.json" OR a full style object
      if (window.KORT_STREET_STYLE) {
        // If it's an object, clone it to avoid mutation surprises.
        if (typeof window.KORT_STREET_STYLE === "object") {
          return JSON.parse(JSON.stringify(window.KORT_STREET_STYLE));
        }
        return window.KORT_STREET_STYLE;
      }

      if (map.getStyle) {
        const s = map.getStyle();
        if (s && typeof s === "object") return JSON.parse(JSON.stringify(s));
      }
    } catch {}
    return null;
  })();

  const STYLES = {
    street: {
      name: "Street (OSM)",
      // Use the original style (your real street style) if available.
      // Only fallback to demo if we *cannot* determine the initial style.
      style: INITIAL_STYLE || "https://demotiles.maplibre.org/style.json"
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
    // nolabels: { ... } // oft gert sem overlay layer í mode, ekki sem base-style
  };

  let currentKey = "street";

  // Serialize setStyle calls so we never race / break controls.
  let chain = Promise.resolve();

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
      // If already loaded, resolve immediately.
      try {
        if (map.isStyleLoaded && map.isStyleLoaded()) return resolve();
      } catch {}

      let doneCalled = false;
      const done = () => {
        if (doneCalled) return;
        doneCalled = true;
        try { map.off("style.load", done); } catch {}
        try { map.off("load", done); } catch {}
        resolve();
      };

      // Preferred event after setStyle:
      try { map.once("style.load", done); } catch {}

      // Fallback (older / edge cases):
      try { map.once("load", done); } catch {}

      // Final safety net:
      setTimeout(done, 2500);
    });
  }

  async function afterApply() {
    // Re-apply current mode (adds back layers/sources that got nuked by setStyle)
    try {
      const id = window.kortModes?.getCurrent?.() || "default";
      await window.kortModes?.setMode?.(id);
    } catch (e) { console.warn(e); }

    // Optional refresh hooks (safe if undefined)
    try { window.kortRouting?.refresh?.(); } catch {}
    try { window.kortMeasure?.refresh?.(); } catch {}
    try { window.kortCrosshair?.refresh?.(); } catch {}
  }

  async function doSet(key) {
    key = safeKey(key);

    if (key === currentKey) return currentKey;

    currentKey = key;
    store(key);

    try {
      map.setStyle(STYLES[key].style);
      await waitStyleLoaded();
      await afterApply();
    } catch (e) {
      console.warn("kort.styles set failed:", e);
    }

    return currentKey;
  }

  function set(key) {
    // Returns a Promise that resolves to the final currentKey.
    chain = chain.then(() => doSet(key));
    return chain;
  }

  function toggle(key) {
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

  // Init from storage (queued, so it can't race other calls)
  set(getStored());

  window.kortStyles = { set, toggle, getCurrent, list };
})();
