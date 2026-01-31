// assets/js/pages/kort.addons.js
// Add-ons: flights + roads (toggle + refresh + survives style changes)

"use strict";

(() => {
  const map = window.kortMap;
  if (!map) return;

  const ADDONS = {
    flights: {
      sourceId: "addon-flights",
      layerId: "addon-flights-layer",
      url: () => "/api/flights?bbox=" + encodeURIComponent(currentBbox()),
      intervalMs: 8000,
      type: "circle",
      paint: {
        "circle-radius": 4,
        "circle-opacity": 0.85,
        "circle-color": "#111",
        "circle-stroke-width": 1,
        "circle-stroke-color": "#fff"
      }
    },

    roads: {
      sourceId: "addon-roads",
      layerId: "addon-roads-layer",
      url: () => "/api/roads?bbox=" + encodeURIComponent(currentBbox()),
      intervalMs: 30000,
      type: "line",
      paint: {
        "line-width": 3,
        "line-opacity": 0.85,
        "line-color": "#ff3b3b",
        "line-dasharray": [1.5, 1.5]
      }
    }
  };

  const state = {
    on: { flights: false, roads: false },
    timers: { flights: null, roads: null }
  };

  function currentBbox() {
    const b = map.getBounds();
    // west,south,east,north
    return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].join(",");
  }

  async function fetchGeo(url) {
    const res = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const j = await res.json();
    if (!j || j.ok !== true || !j.geojson) throw new Error("bad payload");
    return j.geojson;
  }

  function ensureSourceAndLayer(key) {
    const cfg = ADDONS[key];
    if (!cfg) return;

    if (!map.getSource(cfg.sourceId)) {
      map.addSource(cfg.sourceId, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    }

    if (!map.getLayer(cfg.layerId)) {
      map.addLayer({
        id: cfg.layerId,
        type: cfg.type,
        source: cfg.sourceId,
        paint: cfg.paint
      });
    }
  }

  function removeSourceAndLayer(key) {
    const cfg = ADDONS[key];
    if (!cfg) return;
    try { if (map.getLayer(cfg.layerId)) map.removeLayer(cfg.layerId); } catch {}
    try { if (map.getSource(cfg.sourceId)) map.removeSource(cfg.sourceId); } catch {}
  }

  async function refresh(key) {
    const cfg = ADDONS[key];
    if (!cfg) return;
    ensureSourceAndLayer(key);

    try {
      const geo = await fetchGeo(cfg.url());
      const src = map.getSource(cfg.sourceId);
      if (src && src.setData) src.setData(geo);
    } catch (e) {
      // silent fail (don’t spam UI)
    }
  }

  function start(key) {
    const cfg = ADDONS[key];
    if (!cfg) return;

    stop(key);
    state.on[key] = true;

    refresh(key);
    state.timers[key] = setInterval(() => refresh(key), cfg.intervalMs);
  }

  function stop(key) {
    state.on[key] = false;
    if (state.timers[key]) {
      clearInterval(state.timers[key]);
      state.timers[key] = null;
    }
    removeSourceAndLayer(key);
  }

  function toggle(key) {
    if (state.on[key]) stop(key);
    else start(key);
    return !!state.on[key];
  }

  // Survive style swaps (your kort.styles.js calls refresh hooks)
  function refreshAllAfterStyle() {
    for (const key of Object.keys(ADDONS)) {
      if (state.on[key]) {
        // after style swap, layers/sources are gone -> rebuild + refresh
        start(key);
      }
    }
  }

  window.kortAddons = {
    toggle,
    isOn: (k) => !!state.on[k],
    refresh: refreshAllAfterStyle
  };

  // If style changes without calling hooks, catch it anyway
  map.on("styledata", () => {
    // Debounced-ish: just try once shortly after
    setTimeout(refreshAllAfterStyle, 250);
  });
})();