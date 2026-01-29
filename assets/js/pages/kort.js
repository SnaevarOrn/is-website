// assets/js/pages/kort.js
// Kort — Map init (OpenStreetMap + MapLibre) + crosshair toggle + optional elevation

"use strict";

(() => {
  const elMap = document.getElementById("kort-map");
  const elState = document.getElementById("kortState");
  const elAlt = document.getElementById("kortAlt");
  const btnCopy = document.getElementById("btnCopyState");
  const btnCross = document.getElementById("btnCrosshair");
  if (!elMap) return;

  // Iceland bounds (lng,lat)
  window.KORT_ICELAND_BOUNDS = [
    [-24.546, 63.17],  // SW
    [-13.495, 66.60]   // NE
  ];

  const START_CENTER = [-21.9426, 64.1466];
  const START_ZOOM = 10.8;

  // Base raster OSM style
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

  // Satellite style defined elsewhere
  window.KORT_STYLE_SATELLITE = null;

  const map = new maplibregl.Map({
    container: elMap,
    style: window.KORT_STYLE_MAP,
    center: START_CENTER,
    zoom: START_ZOOM,
    bearing: 0,
    pitch: 0
  });

  window.kortMap = map;

  // Core controls
  map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");
  map.addControl(new maplibregl.FullscreenControl(), "top-right");
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 140, unit: "metric" }), "bottom-left");

  function fmt(n, d) {
    const p = Math.pow(10, d);
    return (Math.round(n * p) / p).toFixed(d);
  }

  let crosshairOn = false;
  let elevTimer = null;
  let lastElevKey = "";

  function setAltText(text) {
    if (!elAlt) return;
    elAlt.textContent = text;
  }

  async function fetchElevation(lat, lng) {
    // Optional endpoint. If you haven't created it yet, this will fail gracefully.
    const url = `/api/elevation?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`;
    try {
      const res = await fetch(url, { headers: { "accept": "application/json" }, cache: "no-store" });
      if (!res.ok) return null;
      const j = await res.json();
      if (!j || j.ok !== true) return null;
      if (typeof j.elevation_m !== "number") return null;
      return j.elevation_m;
    } catch {
      return null;
    }
  }

  function scheduleElevation() {
    if (!crosshairOn) return;
    if (!elAlt) return;

    if (elevTimer) clearTimeout(elevTimer);
    elevTimer = setTimeout(async () => {
      const c = map.getCenter();
      const lat = +fmt(c.lat, 5);
      const lng = +fmt(c.lng, 5);

      const key = lat + "," + lng;
      if (key === lastElevKey) return;
      lastElevKey = key;

      setAltText("hæð: —");
      const elev = await fetchElevation(lat, lng);
      if (elev === null) {
        // keep placeholder; we’ll plug in real service later
        return;
      }
      setAltText(`hæð: ${Math.round(elev)} m`);
    }, 220);
  }

  function updateState() {
    if (!elState) return;
    const c = map.getCenter();
    elState.textContent = `miðja: ${fmt(c.lat, 5)}, ${fmt(c.lng, 5)} · zoom: ${fmt(map.getZoom(), 2)}`;

    if (crosshairOn) scheduleElevation();
  }

  function setCrosshair(on) {
    crosshairOn = !!on;

    if (crosshairOn) elMap.classList.add("kort-crosshair-on");
    else elMap.classList.remove("kort-crosshair-on");

    if (btnCross) {
      btnCross.setAttribute("aria-pressed", crosshairOn ? "true" : "false");
      btnCross.textContent = crosshairOn ? "Crosshair ✓" : "Crosshair";
    }

    if (elAlt) {
      elAlt.hidden = !crosshairOn;
      if (crosshairOn) setAltText("hæð: —");
    }

    // refresh right away
    updateState();
  }

  map.on("load", () => {
    updateState();
    map.resize();
    setCrosshair(false); // default OFF
  });

  map.on("move", updateState);
  map.on("zoom", updateState);
  map.on("rotate", updateState);

  async function copyState() {
    const c = map.getCenter();
    const payload = JSON.stringify(
      { lat: +fmt(c.lat, 6), lng: +fmt(c.lng, 6), zoom: +fmt(map.getZoom(), 2) },
      null,
      0
    );

    try {
      await navigator.clipboard.writeText(payload);
      const old = btnCopy ? btnCopy.textContent : "";
      if (btnCopy) btnCopy.textContent = "Afritað ✓";
      setTimeout(() => { if (btnCopy) btnCopy.textContent = old; }, 900);
    } catch {}
  }

  if (btnCopy) btnCopy.addEventListener("click", copyState);

  if (btnCross) {
    btnCross.addEventListener("click", () => setCrosshair(!crosshairOn));
  }

  window.addEventListener("resize", () => map.resize());
})();
