// assets/js/pages/kort.addons.js
// Add-ons: flights + roads (toggle + refresh + persists + survives style changes)
//
// Requirements:
// - window.kortMap exists
// - Optional: kort.styles.js calls window.kortAddons.refresh() after style swap (but we also self-heal)

"use strict";

(() => {
  const map = window.kortMap;
  if (!map) return;

  const STORAGE_KEY = "kort_addons_on_v1";

  // Tweakable knobs
  const CFG = {
    // Refresh happens on moveend/idle (not during drag)
    refreshOnMoveEnd: true,
    // If bbox changes less than this, skip refresh (degrees)
    minBboxDelta: 0.01,
    // Prevent spam if styledata fires a lot
    styleRebuildDebounceMs: 250
  };

  // Addons config
  const ADDONS = {
    flights: {
      label: "Flugvélar",
      sourceId: "addon-flights",
      layerId: "addon-flights-layer",
      minZoom: 6.5,
      intervalMs: 8000,
      url: () => "/api/flights?bbox=" + encodeURIComponent(currentBboxStr()),
      source: () => ({ type: "geojson", data: emptyFC() }),
      layer: () => ({
        id: "addon-flights-layer",
        type: "circle",
        source: "addon-flights",
        paint: {
          "circle-radius": 4,
          "circle-opacity": 0.85,
          "circle-color": "#111",
          "circle-stroke-width": 1,
          "circle-stroke-color": "#fff"
        }
      })
    },

    roads: {
      label: "Færð á vegum",
      sourceId: "addon-roads",
      layerId: "addon-roads-layer",
      minZoom: 7.0,
      intervalMs: 30000,
      url: () => "/api/roads?bbox=" + encodeURIComponent(currentBboxStr()),
      source: () => ({ type: "geojson", data: emptyFC() }),
      layer: () => ({
        id: "addon-roads-layer",
        type: "line",
        source: "addon-roads",
        paint: {
          "line-width": 3,
          "line-opacity": 0.85,
          "line-color": "#ff3b3b",
          "line-dasharray": [1.5, 1.5]
        }
      }),
      // Try to keep roads above base tiles but below popups/labels if any
      beforeLayerCandidates: [
        "maplibre-gl-draw-line",
        "place-label",
        "poi-label"
      ]
    },
    weather: {
      label: "Veður",
      minZoom: 0,
      intervalMs: 600000, // 10 min, not used yet
      // dummy, no map layer yet
      url: () => "",
      sourceId: "addon-weather",
      layerId: "addon-weather-layer",
      source: () => ({ type: "geojson", data: emptyFC() }),
      layer: () => ({
        id: "addon-weather-layer",
        type: "circle",
        source: "addon-weather",
        paint: { "circle-radius": 0 }
  })
}

  };

  const state = {
    on: { flights: false, roads: false },
    timers: { flights: null, roads: null },
    inflight: { flights: null, roads: null },      // AbortController
    last: { flights: null, roads: null },          // {bbox:[w,s,e,n], zoom}
    styleHealTimer: null
  };

  function emptyFC() {
    return { type: "FeatureCollection", features: [] };
  }

  function safeKey(k) {
    return ADDONS[k] ? k : null;
  }

  function currentBboxArr() {
    const b = map.getBounds();
    // west,south,east,north
    return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
  }

  function currentBboxStr() {
    return currentBboxArr().join(",");
  }

  function bboxDelta(a, b) {
    if (!a || !b) return Infinity;
    let d = 0;
    for (let i = 0; i < 4; i++) d = Math.max(d, Math.abs(a[i] - b[i]));
    return d;
  }

  function loadOn() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) return [];
      // filter to known keys
      return arr.filter((k) => !!ADDONS[k]);
    } catch {
      return [];
    }
  }

  function saveOn() {
    try {
      const arr = Object.keys(state.on).filter((k) => state.on[k]);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
    } catch {}
  }

  async function fetchGeo(url, controller) {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: controller.signal
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const j = await res.json();
    if (!j || j.ok !== true || !j.geojson) throw new Error("bad payload");
    return j.geojson;
  }

  function findBeforeLayerId(cfg) {
    const list = cfg.beforeLayerCandidates;
    if (!list || !list.length) return null;
    const layers = map.getStyle && map.getStyle() ? map.getStyle().layers : null;
    if (!layers) return null;

    // If candidate exists in current style, we insert before it.
    for (let i = 0; i < list.length; i++) {
      const id = list[i];
      for (let j = 0; j < layers.length; j++) {
        if (layers[j].id === id) return id;
      }
    }
    return null;
  }

  function ensureSourceAndLayer(key) {
    const cfg = ADDONS[key];
    if (!cfg) return;

    // Source
    if (!map.getSource(cfg.sourceId)) {
      try {
        map.addSource(cfg.sourceId, cfg.source());
      } catch {}
    }

    // Layer
    if (!map.getLayer(cfg.layerId)) {
      const layer = cfg.layer();
      let beforeId = null;

      if (cfg.beforeLayerCandidates) {
        beforeId = findBeforeLayerId(cfg);
      }

      try {
        if (beforeId) map.addLayer(layer, beforeId);
        else map.addLayer(layer);
      } catch {}
    }
  }

  function removeSourceAndLayer(key) {
    const cfg = ADDONS[key];
    if (!cfg) return;

    try { if (map.getLayer(cfg.layerId)) map.removeLayer(cfg.layerId); } catch {}
    try { if (map.getSource(cfg.sourceId)) map.removeSource(cfg.sourceId); } catch {}
  }

  function shouldRefresh(key) {
    const cfg = ADDONS[key];
    if (!cfg) return false;

    const z = map.getZoom();
    if (typeof cfg.minZoom === "number" && z < cfg.minZoom) return false;

    const bbox = currentBboxArr();
    const last = state.last[key];

    if (!last) return true;

    // If zoom changed a lot, refresh
    if (Math.abs((last.zoom || 0) - z) >= 0.75) return true;

    // If bbox changed enough, refresh
    const d = bboxDelta(last.bbox, bbox);
    if (d >= CFG.minBboxDelta) return true;

    return false;
  }

  function updateLast(key) {
    state.last[key] = { bbox: currentBboxArr(), zoom: map.getZoom() };
  }

  async function refresh(key, reason) {
    const cfg = ADDONS[key];
    if (!cfg) return;
    if (!state.on[key]) return;

    // Gate by bbox/zoom change
    if (!shouldRefresh(key)) return;

    ensureSourceAndLayer(key);

    // Abort previous request for this addon
    if (state.inflight[key]) {
      try { state.inflight[key].abort(); } catch {}
    }
    const controller = new AbortController();
    state.inflight[key] = controller;

    try {
      const geo = await fetchGeo(cfg.url(), controller);

      // Might have been turned off while awaiting
      if (!state.on[key]) return;

      const src = map.getSource(cfg.sourceId);
      if (src && typeof src.setData === "function") {
        src.setData(geo);
      }

      updateLast(key);
    } catch (e) {
      // Silent-ish: abort is expected during pan/zoom/toggles
      // console.warn("addon refresh failed", key, reason, e);
    } finally {
      if (state.inflight[key] === controller) state.inflight[key] = null;
    }
  }

  function start(key) {
    const cfg = ADDONS[key];
    if (!cfg) return;

    stop(key); // clears old timers/layers safely
    state.on[key] = true;
    saveOn();

    // immediate refresh (gated)
    refresh(key, "start");

    // interval refresh (still gated)
    state.timers[key] = setInterval(() => refresh(key, "interval"), cfg.intervalMs);
  }

  function stop(key) {
    const cfg = ADDONS[key];
    if (!cfg) return;

    state.on[key] = false;
    saveOn();

    if (state.timers[key]) {
      clearInterval(state.timers[key]);
      state.timers[key] = null;
    }

    if (state.inflight[key]) {
      try { state.inflight[key].abort(); } catch {}
      state.inflight[key] = null;
    }

    state.last[key] = null;

    removeSourceAndLayer(key);
  }

  // Public: toggle(key, forceState?)
  function toggle(key, forceState) {
    key = safeKey(key);
    if (!key) return false;

    const want = (typeof forceState === "boolean") ? forceState : !state.on[key];
    if (want) start(key);
    else stop(key);

    return !!state.on[key];
  }

  function isOn(key) {
    key = safeKey(key);
    return key ? !!state.on[key] : false;
  }

  // Called after style swaps: rebuild all ON addons (sources/layers vanish on setStyle)
  function refreshAllAfterStyle() {
    for (const key of Object.keys(ADDONS)) {
      if (!state.on[key]) continue;

      // Rebuild layers/sources for new style, then refresh
      ensureSourceAndLayer(key);

      // Force a refresh after style swap by clearing last snapshot
      state.last[key] = null;

      refresh(key, "style");
    }
  }

  // Debounced heal (styledata can fire many times)
  function scheduleStyleHeal() {
    if (state.styleHealTimer) clearTimeout(state.styleHealTimer);
    state.styleHealTimer = setTimeout(() => {
      state.styleHealTimer = null;
      refreshAllAfterStyle();
    }, CFG.styleRebuildDebounceMs);
  }

  // Refresh on moveend/idle (better UX + fewer requests)
  if (CFG.refreshOnMoveEnd) {
    map.on("moveend", () => {
      for (const key of Object.keys(ADDONS)) {
        if (state.on[key]) refresh(key, "moveend");
      }
    });

    // idle fires when rendering is done; good moment to fetch if style loaded
    map.on("idle", () => {
      for (const key of Object.keys(ADDONS)) {
        if (state.on[key]) refresh(key, "idle");
      }
    });
  }

  // Heal after any style swaps / style reloads
  map.on("styledata", scheduleStyleHeal);

  // Init from storage
  (function initFromStorage() {
    const onList = loadOn();
    for (let i = 0; i < onList.length; i++) {
      const k = onList[i];
      if (ADDONS[k]) {
        // Start without forcing immediate API spam; refresh() is gated anyway
        start(k);
      }
    }
  })();

    // ✅ Export LIVE backend (do NOT overwrite window.kortAddons router)
  window.kortAddonsLive = {
    toggle,
    set: (id, on) => toggle(id, on),
    isOn,
    refresh: refreshAllAfterStyle,
    list: () => Object.keys(ADDONS)
  };
})();
