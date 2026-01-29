// assets/js/pages/kort.styles.js
// Kort — Map styles manager (Street / Satellite / Topo / No-labels ready)

"use strict";

(() => {
  const map = window.kortMap;
  if (!map) return;

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
        layers: [
          { id: "sat", type: "raster", source: "esri" }
        ]
      }
    }

    // topo: { ... }
    // nolabels: { ... }
  };

  let currentKey = "street";
  let isApplying = false;

  async function apply(key) {
    if (!STYLES[key] || isApplying) return;
    if (key === currentKey) return;

    isApplying = true;
    currentKey = key;

    map.setStyle(STYLES[key].style);
    await new Promise((r) => map.once("load", r));

    // Re-apply modes (wrecks, quiz, etc.)
    try {
      const id = window.kortModes?.getCurrent?.() || "default";
      window.kortModes?.setMode?.(id);
    } catch (e) { console.warn(e); }

    // Optional refresh hooks
    try { window.kortRoute?.refresh?.(); } catch {}
    try { window.kortMeasure?.refresh?.(); } catch {}
    try { window.kortCrosshair?.refresh?.(); } catch {}

    isApplying = false;
  }

  function toggle(key) {
    apply(currentKey === key ? "street" : key);
  }

  function getCurrent() {
    return currentKey;
  }

  window.kortStyles = {
    set: apply,
    toggle,
    getCurrent,
    list: () => Object.keys(STYLES)
  };
})();
