// /assets/js/pages/kort.addon.weather.js
// Weather overlay via /api/weather (OpenWeatherMap tiles proxied).
//
// Toggle with:
//   window.kortAddons.toggle("weather")
// or menu button data-addon="weather"
//
// Exposes live backend at window.kortAddonsLive (if not already present).

"use strict";

(() => {
  const map = window.kortMap;
  if (!map) return;

  const ID = "weather";
  const SRC = "kort-weather-src";
  const LYR = "kort-weather-lyr";

  // Pick a default overlay layer:
  // clouds_new | precipitation_new | pressure_new | wind_new | temp_new
  let currentLayer = "precipitation_new";

  // Visual intensity
  const OPACITY = 0.60;

  let on = false;

  function tilesUrl(layer) {
    // MapLibre will substitute {z}/{x}/{y}
    return `/api/weather?layer=${encodeURIComponent(layer)}&z={z}&x={x}&y={y}`;
  }

  function ensure() {
    if (!map.getSource(SRC)) {
      map.addSource(SRC, {
        type: "raster",
        tiles: [tilesUrl(currentLayer)],
        tileSize: 256,
        minzoom: 0,
        maxzoom: 20
      });
    }

    if (!map.getLayer(LYR)) {
      // Put overlay near the top but below labels if you later add label layers.
      map.addLayer({
        id: LYR,
        type: "raster",
        source: SRC,
        paint: {
          "raster-opacity": OPACITY
        }
      });
    }
  }

  function teardown() {
    try { if (map.getLayer(LYR)) map.removeLayer(LYR); } catch {}
    try { if (map.getSource(SRC)) map.removeSource(SRC); } catch {}
  }

  function enable() {
    if (on) return true;
    on = true;
    try { ensure(); } catch {}
    return true;
  }

  function disable() {
    if (!on) return false;
    on = false;
    teardown();
    return false;
  }

  function toggle() {
    return on ? disable() : enable();
  }

  function isOn() { return !!on; }

  // Optional: allow switching overlay type later (menu sub-options etc.)
  function setLayer(next) {
    if (!next) return false;
    currentLayer = String(next);

    if (!on) return true;

    // Recreate source with new tile template
    teardown();
    ensure();
    return true;
  }

  function refresh() {
    if (!on) return;
    // style swap nukes layers/sources -> rebuild
    try {
      teardown();
      ensure();
    } catch {}
  }

  // Survive style swaps
  map.on("styledata", () => { if (on) refresh(); });

  /* =========================
     ✅ Live backend registry: window.kortAddonsLive
     ========================= */

  function ensureLiveBackend() {
    if (window.kortAddonsLive && window.kortAddonsLive.__isLiveBackend) return;

    // Minimal live backend router (for flights/roads/weather)
    const liveState = {};
    const liveHandlers = {};

    window.kortAddonsLive = {
      __isLiveBackend: true,

      register: function (id, api) {
        liveHandlers[id] = api;
        liveState[id] = !!(api && typeof api.isOn === "function" && api.isOn());
      },

      list: function () { return Object.keys(liveHandlers); },

      toggle: function (id) {
        const a = liveHandlers[id];
        if (!a || typeof a.toggle !== "function") return false;
        const r = a.toggle();
        liveState[id] = !!(a.isOn && a.isOn());
        return r;
      },

      set: function (id, on) {
        const a = liveHandlers[id];
        if (!a) return false;
        if (!!on) { if (a.enable) a.enable(); }
        else { if (a.disable) a.disable(); }
        liveState[id] = !!(a.isOn && a.isOn());
        return true;
      },

      isOn: function (id) {
        const a = liveHandlers[id];
        if (!a || typeof a.isOn !== "function") return false;
        return !!a.isOn();
      },

      refresh: function () {
        const keys = Object.keys(liveHandlers);
        for (let i = 0; i < keys.length; i++) {
          const a = liveHandlers[keys[i]];
          try { if (a && typeof a.refresh === "function") a.refresh(); } catch {}
        }
      }
    };
  }

  ensureLiveBackend();

  // Register this addon
  window.kortAddonsLive.register(ID, {
    id: ID,
    enable,
    disable,
    toggle,
    isOn,
    refresh,
    setLayer,
    getLayer: () => currentLayer
  });

  // If your shared router exists (from overpass module), it will pick this up automatically.
})();
