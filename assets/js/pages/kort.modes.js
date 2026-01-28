// assets/js/pages/kort.modes.js
// Kort — Mode system (extensible) + REAL "wrecks" mode

"use strict";

(() => {
  const map = window.kortMap;
  if (!map) return;

  const modes = new Map();
  let current = null;

  function register(id, mode) {
    modes.set(id, mode);
  }

  async function setMode(id) {
    if (current?.id === id) return;

    // teardown current
    if (current?.teardown) {
      try { await current.teardown({ map }); } catch (e) { console.warn(e); }
    }

    const next = modes.get(id) || modes.get("default");
    current = { id, ...next };

    if (current?.setup) {
      try { await current.setup({ map }); } catch (e) { console.warn(e); }
    }

    // UI hint
    const elState = document.getElementById("kortState");
    if (elState) elState.textContent = `Hamur: ${id}`;
  }

  /* =========================
     Default mode
     ========================= */
  register("default", {
    setup() {},
    teardown() {}
  });

  /* =========================
     Placeholders (later)
     ========================= */
  register("quiz_towns", {
    setup() { alert("Leikjahamur (bæir) — kemur næst. 🙂"); },
    teardown() {}
  });

  register("quiz_glaciers", {
    setup() { alert("Leikjahamur (jöklar) — kemur næst. ❄️"); },
    teardown() {}
  });

  /* =========================
     WRECKS (real)
     ========================= */

  register("wrecks", (() => {
    const SOURCE_ID = "wrecks";
    const LAYER_ID = "wrecks-points";
    const LAYER_LABEL_ID = "wrecks-labels";

    let onMoveCursor = null;
    let onLeaveCursor = null;
    let onClick = null;
    let onStyleData = null;
    let popup = null;

    async function loadGeoJSON() {
      const res = await fetch("/assets/data/skipsflok.json", {
        headers: { "accept": "application/json" },
        cache: "no-store"
      });
      if (!res.ok) throw new Error(`skipsflok.json HTTP ${res.status}`);
      return res.json();
    }

    function ensureLayers(data) {
      // Source
      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, {
          type: "geojson",
          data
        });
      } else {
        map.getSource(SOURCE_ID).setData(data);
      }

      // Points layer
      if (!map.getLayer(LAYER_ID)) {
        map.addLayer({
          id: LAYER_ID,
          type: "circle",
          source: SOURCE_ID,
          paint: {
            "circle-radius": 7,
            "circle-stroke-width": 2,
            "circle-opacity": 0.92
          }
        });
      }

      // Labels (optional, clean)
      if (!map.getLayer(LAYER_LABEL_ID)) {
        map.addLayer({
          id: LAYER_LABEL_ID,
          type: "symbol",
          source: SOURCE_ID,
          layout: {
            "text-field": ["get", "name"],
            "text-size": 12,
            "text-offset": [0, 1.2],
            "text-anchor": "top",
            "text-optional": true
          },
          paint: {
            "text-halo-width": 2
          }
        });
      }
    }

    function setPointerCursor() {
      map.getCanvas().style.cursor = "pointer";
    }
    function resetCursor() {
      map.getCanvas().style.cursor = "";
    }

    function openPopup(feature) {
      const p = feature.properties || {};
      const coords = feature.geometry?.coordinates || [];
      const lng = coords[0];
      const lat = coords[1];

      const title = esc(p.name || "Skipsflak");
      const summary = p.summary ? `<div class="kort-popup-sub">${esc(p.summary)}</div>` : "";
      const metaBits = [];

      if (p.year) metaBits.push(`Ár: ${esc(String(p.year))}`);
      if (p.type) metaBits.push(`Tegund: ${esc(String(p.type))}`);
      if (p.source) metaBits.push(`Heimild: ${esc(String(p.source))}`);

      const meta = metaBits.length
        ? `<div class="kort-popup-meta">${metaBits.map(esc).join(" · ")}</div>`
        : "";

      const html = `
        <div class="kort-popup">
          <div class="kort-popup-title">${title}</div>
          ${summary}
          ${meta}
          <div class="kort-popup-coord">${lat.toFixed(5)}, ${lng.toFixed(5)}</div>
        </div>
      `;

      if (popup) popup.remove();
      popup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, maxWidth: "340px" })
        .setLngLat([lng, lat])
        .setHTML(html)
        .addTo(map);
    }

    function esc(s) {
      return String(s)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }

    return {
      async setup() {
        const data = await loadGeoJSON();

        // Ensure on current style
        if (!map.isStyleLoaded()) {
          await new Promise((r) => map.once("load", r));
        }
        ensureLayers(data);

        // Re-add after style change (satellite toggle resets layers)
        onStyleData = () => {
          try {
            ensureLayers(data);
          } catch {}
        };
        map.on("styledata", onStyleData);

        // Cursor + click
        onMoveCursor = () => setPointerCursor();
        onLeaveCursor = () => resetCursor();

        onClick = (e) => {
          const f = e.features && e.features[0];
          if (!f) return;
          openPopup(f);
        };

        map.on("mouseenter", LAYER_ID, onMoveCursor);
        map.on("mouseleave", LAYER_ID, onLeaveCursor);
        map.on("click", LAYER_ID, onClick);

        // Fit to Iceland + gentle hint
        map.fitBounds(window.KORT_ICELAND_BOUNDS, { padding: 50, duration: 900, essential: true });

        const elState = document.getElementById("kortState");
        if (elState) elState.textContent = "Skipsflök: smelltu á punkt til að sjá upplýsingar.";
      },

      async teardown() {
        if (popup) {
          popup.remove();
          popup = null;
        }

        if (onStyleData) {
          map.off("styledata", onStyleData);
          onStyleData = null;
        }

        if (onMoveCursor) {
          map.off("mouseenter", LAYER_ID, onMoveCursor);
          onMoveCursor = null;
        }
        if (onLeaveCursor) {
          map.off("mouseleave", LAYER_ID, onLeaveCursor);
          onLeaveCursor = null;
        }
        if (onClick) {
          map.off("click", LAYER_ID, onClick);
          onClick = null;
        }

        // Remove layers + source if present
        if (map.getLayer(LAYER_LABEL_ID)) map.removeLayer(LAYER_LABEL_ID);
        if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);

        resetCursor();
      }
    };
  })());

  window.kortModes = { register, setMode, getCurrent: () => current?.id || "default" };

  // Start in default
  setMode("default");
})();
