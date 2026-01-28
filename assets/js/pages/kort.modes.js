// assets/js/pages/kort.modes.js
// Kort — Mode system (extensible) + REAL "wrecks" mode
// Build-safe: no optional chaining, no replaceAll

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
    if (current && current.id === id) return;

    // teardown current
    if (current && typeof current.teardown === "function") {
      try { await current.teardown({ map }); } catch (e) { console.warn(e); }
    }

    const next = modes.get(id) || modes.get("default");
    current = Object.assign({ id }, next || {});

    if (current && typeof current.setup === "function") {
      try { await current.setup({ map }); } catch (e) { console.warn(e); }
    }

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
      if (!res.ok) throw new Error("skipsflok.json HTTP " + res.status);
      return res.json();
    }

    function ensureLayers(data) {
      // Source
      if (!map.getSource(SOURCE_ID)) {
        map.addSource(SOURCE_ID, { type: "geojson", data: data });
      } else {
        const src = map.getSource(SOURCE_ID);
        if (src && typeof src.setData === "function") src.setData(data);
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

      // Labels (readable)
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
            "text-color": "#111",
            "text-halo-color": "rgba(255,255,255,.9)",
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

    function esc(s) {
      const str = String(s);
      return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    function getCoords(feature) {
      if (!feature || !feature.geometry || !feature.geometry.coordinates) return null;
      const c = feature.geometry.coordinates;
      if (!Array.isArray(c) || c.length < 2) return null;
      const lng = Number(c[0]);
      const lat = Number(c[1]);
      if (!isFinite(lng) || !isFinite(lat)) return null;
      return { lng, lat };
    }

    function openPopup(feature) {
      const p = (feature && feature.properties) ? feature.properties : {};
      const c = getCoords(feature);
      if (!c) return;

      const title = esc(p.name || "Skipsflak");
      const summary = p.summary ? `<div class="kort-popup-sub">${esc(p.summary)}</div>` : "";

      const metaBits = [];
      if (p.year) metaBits.push("Ár: " + esc(String(p.year)));
      if (p.type) metaBits.push("Tegund: " + esc(String(p.type)));
      if (p.source) metaBits.push("Heimild: " + esc(String(p.source)));

      const meta = metaBits.length
        ? `<div class="kort-popup-meta">${metaBits.join(" · ")}</div>`
        : "";

      const img = p.image
        ? `<img class="kort-popup-img" src="${esc(p.image)}" alt="">`
        : "";

      const sources = (p.sources && Array.isArray(p.sources) && p.sources.length)
        ? `<div class="kort-popup-sources">${
            p.sources.map((s) => {
              const url = s && s.url ? s.url : "";
              const label = s && s.label ? s.label : "Heimild";
              if (!url) return "";
              return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
            }).join("")
          }</div>`
        : "";

      const html =
        `<div class="kort-popup">` +
          `<div class="kort-popup-title">${title}</div>` +
          summary +
          img +
          meta +
          sources +
          `<div class="kort-popup-coord">${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}</div>` +
        `</div>`;

      if (popup) popup.remove();
      popup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, maxWidth: "360px" })
        .setLngLat([c.lng, c.lat])
        .setHTML(html)
        .addTo(map);
    }

    return {
      async setup() {
        const data = await loadGeoJSON();

        if (!map.isStyleLoaded()) {
          await new Promise((r) => map.once("load", r));
        }

        ensureLayers(data);

        // Re-add after style change (satellite toggle resets layers)
        onStyleData = () => {
          try { ensureLayers(data); } catch (e) {}
        };
        map.on("styledata", onStyleData);

        // Cursor + click
        onMoveCursor = () => setPointerCursor();
        onLeaveCursor = () => resetCursor();

        onClick = (e) => {
          const f = e && e.features && e.features[0];
          if (!f) return;
          openPopup(f);
        };

        map.on("mouseenter", LAYER_ID, onMoveCursor);
        map.on("mouseleave", LAYER_ID, onLeaveCursor);
        map.on("click", LAYER_ID, onClick);

        if (window.KORT_ICELAND_BOUNDS) {
          map.fitBounds(window.KORT_ICELAND_BOUNDS, { padding: 50, duration: 900, essential: true });
        }

        const elState = document.getElementById("kortState");
        if (elState) elState.textContent = "Skipsflök: smelltu á punkt til að sjá upplýsingar.";
      },

      async teardown() {
        if (popup) { popup.remove(); popup = null; }

        if (onStyleData) { map.off("styledata", onStyleData); onStyleData = null; }

        if (onMoveCursor) { map.off("mouseenter", LAYER_ID, onMoveCursor); onMoveCursor = null; }
        if (onLeaveCursor) { map.off("mouseleave", LAYER_ID, onLeaveCursor); onLeaveCursor = null; }
        if (onClick) { map.off("click", LAYER_ID, onClick); onClick = null; }

        // Remove layers + source if present
        if (map.getLayer(LAYER_LABEL_ID)) map.removeLayer(LAYER_LABEL_ID);
        if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);

        resetCursor();
      }
    };
  })());

  window.kortModes = {
    register,
    setMode,
    getCurrent: () => (current && current.id) ? current.id : "default"
  };

  setMode("default");
})();
