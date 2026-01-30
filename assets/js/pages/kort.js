// assets/js/pages/kort.js
// Kort — Map init + crosshair + HUD + elevation lookup
//
// Fullscreen:
// - Uses native Fullscreen API when available
// - Falls back to CSS fullscreen (works on iOS Safari)
// - Fullscreens the page (documentElement) so overlay/panel stay visible

"use strict";

(() => {
  const elMap = document.getElementById("kort-map");
  const elState = document.getElementById("kortState");
  const btnCopy = document.getElementById("btnCopyState");
  if (!elMap) return;

  // Iceland bounds
  window.KORT_ICELAND_BOUNDS = [
    [-24.546, 63.17],
    [-13.495, 66.60]
  ];

  const START_CENTER = [-21.9426, 64.1466];
  const START_ZOOM = 10.8;

  // Simple raster OSM base style (your "street" baseline)
  window.KORT_STYLE_MAP = {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: [
          "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
          "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
          "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png"
        ],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors"
      }
    },
    layers: [{ id: "osm", type: "raster", source: "osm" }]
  };

  // Let kort.styles.js know what "street" REALLY is for this page
  window.KORT_STREET_STYLE = window.KORT_STYLE_MAP;

  const map = new maplibregl.Map({
    container: elMap,
    style: window.KORT_STYLE_MAP,
    center: START_CENTER,
    zoom: START_ZOOM,
    bearing: 0,
    pitch: 0
  });

  window.kortMap = map;

  map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 140, unit: "metric" }), "bottom-left");

  /* =========================
     Fullscreen (native + CSS fallback)
     ========================= */

  const FS_CLASS = "kort-fs";
  const fsTarget = document.documentElement;

  const nativeFsEnabled =
    !!document.fullscreenEnabled &&
    !!fsTarget &&
    typeof fsTarget.requestFullscreen === "function" &&
    typeof document.exitFullscreen === "function";

  function cssFsOn() {
    document.documentElement.classList.add(FS_CLASS);
    // iOS needs a resize after layout changes
    setTimeout(() => { try { map.resize(); } catch {} }, 60);
  }

  function cssFsOff() {
    document.documentElement.classList.remove(FS_CLASS);
    setTimeout(() => { try { map.resize(); } catch {} }, 60);
  }

  function isCssFs() {
    return document.documentElement.classList.contains(FS_CLASS);
  }

  function isNativeFs() {
    return !!document.fullscreenElement;
  }

  async function enterNativeFs() {
    try {
      await fsTarget.requestFullscreen({ navigationUI: "hide" });
      setTimeout(() => { try { map.resize(); } catch {} }, 60);
      return true;
    } catch {
      return false;
    }
  }

  async function exitNativeFs() {
    try {
      await document.exitFullscreen();
      setTimeout(() => { try { map.resize(); } catch {} }, 60);
      return true;
    } catch {
      return false;
    }
  }

  async function toggleFullscreen() {
    // Prefer native if supported; else CSS fallback (iOS)
    if (nativeFsEnabled) {
      if (isNativeFs()) await exitNativeFs();
      else await enterNativeFs();
      return;
    }
    if (isCssFs()) cssFsOff();
    else cssFsOn();
  }

  // Expose for other modules if needed
  window.kortToggleFullscreen = toggleFullscreen;

  function HybridFullscreenControl() {}

  HybridFullscreenControl.prototype.onAdd = function () {
    const wrap = document.createElement("div");
    wrap.className = "maplibregl-ctrl maplibregl-ctrl-group";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "maplibregl-ctrl-icon maplibregl-ctrl-fullscreen";
    btn.setAttribute("aria-label", "Fullscreen");
    btn.title = "Fullscreen";

    const sync = () => {
      const on = nativeFsEnabled ? isNativeFs() : isCssFs();
      // MapLibre uses this class to show “shrink” icon state
      btn.classList.toggle("maplibregl-ctrl-shrink", !!on);
    };

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleFullscreen().then(sync);
    });

    // Keep button state correct
    document.addEventListener("fullscreenchange", sync);
    window.addEventListener("resize", sync);

    wrap.appendChild(btn);
    this._wrap = wrap;
    this._btn = btn;
    this._sync = sync;

    // Initial
    setTimeout(sync, 0);

    return wrap;
  };

  HybridFullscreenControl.prototype.onRemove = function () {
    if (this._wrap && this._wrap.parentNode) this._wrap.parentNode.removeChild(this._wrap);
    this._wrap = null;
    this._btn = null;
    this._sync = null;
  };

  map.addControl(new HybridFullscreenControl(), "top-right");

  /* =========================
     HUD + Crosshair elevation
     ========================= */

  const hud = document.createElement("div");
  hud.className = "kort-hud";
  hud.hidden = true;
  hud.textContent = "";
  elMap.appendChild(hud);

  function fmt(n, d) {
    const p = Math.pow(10, d);
    return (Math.round(n * p) / p).toFixed(d);
  }

  let crosshairOn = false;
  let elevTimer = null;
  let lastElevKey = "";
  let lastElevText = "hæð: —";

  async function fetchElevation(lat, lng) {
    const url = "/api/elevation?lat=" + encodeURIComponent(lat) + "&lng=" + encodeURIComponent(lng);
    try {
      const res = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
      if (!res.ok) return null;
      const j = await res.json();
      if (!j || j.ok !== true) return null;
      if (typeof j.elevation_m !== "number") return null;
      return j.elevation_m;
    } catch {
      return null;
    }
  }

  function updateHud() {
    if (!crosshairOn) {
      hud.hidden = true;
      return;
    }
    const c = map.getCenter();
    const lat = +fmt(c.lat, 5);
    const lng = +fmt(c.lng, 5);

    hud.hidden = false;
    hud.textContent = "miðja: " + fmt(lat, 5) + ", " + fmt(lng, 5) + "\n" + lastElevText;
  }

  function scheduleElevation() {
    if (!crosshairOn) return;

    if (elevTimer) clearTimeout(elevTimer);
    elevTimer = setTimeout(async () => {
      const c = map.getCenter();
      const lat = +fmt(c.lat, 5);
      const lng = +fmt(c.lng, 5);

      const key = lat + "," + lng;
      if (key === lastElevKey) return;
      lastElevKey = key;

      lastElevText = "hæð: —";
      updateHud();

      const elev = await fetchElevation(lat, lng);
      if (elev === null) return;

      lastElevText = "hæð: " + Math.round(elev) + " m";
      updateHud();
    }, 260);
  }

  function updateStateLine() {
    if (!elState) return;
    const c = map.getCenter();
    elState.textContent =
      "miðja: " + fmt(c.lat, 5) + ", " + fmt(c.lng, 5) + " · zoom: " + fmt(map.getZoom(), 2);
  }

  function setCrosshair(on) {
    crosshairOn = !!on;

    if (crosshairOn) elMap.classList.add("kort-crosshair-on");
    else elMap.classList.remove("kort-crosshair-on");

    lastElevText = "hæð: —";
    updateHud();

    if (crosshairOn) scheduleElevation();
  }

  function toggleCrosshair() {
    setCrosshair(!crosshairOn);
  }

  window.kortCrosshair = {
    get: function () { return crosshairOn; },
    set: setCrosshair,
    toggle: toggleCrosshair
  };

  window.kortGoHome = function () {
    const b = window.KORT_ICELAND_BOUNDS;
    if (b && b.length === 2) {
      map.fitBounds(b, { padding: 50, duration: 900, essential: true });
      return;
    }
    map.flyTo({ center: [-19.0, 64.9], zoom: 5.6, essential: true });
  };

  window.kortUseLocation = function () {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        const lng = pos.coords.longitude;
        const lat = pos.coords.latitude;
        map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 14), essential: true });
      },
      function () {},
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 2000 }
    );
  };

  map.on("load", () => {
    updateStateLine();
    map.resize();
    setCrosshair(false);
  });

  map.on("move", () => {
    updateStateLine();
    if (crosshairOn) updateHud();
  });

  map.on("moveend", () => {
    if (crosshairOn) scheduleElevation();
  });

  async function copyState() {
    const c = map.getCenter();
    const payload = JSON.stringify(
      { lat: +fmt(c.lat, 6), lng: +fmt(c.lng, 6), zoom: +fmt(map.getZoom(), 2) },
      null,
      0
    );

    try {
      await navigator.clipboard.writeText(payload);
      if (btnCopy) {
        const old = btnCopy.textContent;
        btnCopy.textContent = "Afritað ✓";
        setTimeout(() => { btnCopy.textContent = old; }, 900);
      }
    } catch {}
  }

  if (btnCopy) btnCopy.addEventListener("click", copyState);

  window.addEventListener("resize", () => {
    try { map.resize(); } catch {}
  });
})();
