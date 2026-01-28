// assets/js/pages/kort.js
// Kort — Map init (OpenStreetMap + MapLibre)

"use strict";

(() => {
  const elMap = document.getElementById("kort-map");
  const elState = document.getElementById("kortState");
  const btnCopy = document.getElementById("btnCopyState");
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

  // Satellite style defined in controls.js (demo provider)
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

  function fmt(n, d = 5) {
    return (Math.round(n * 10 ** d) / 10 ** d).toFixed(d);
  }

  function updateState() {
    if (!elState) return;
    const c = map.getCenter();
    elState.textContent = `miðja: ${fmt(c.lat)}, ${fmt(c.lng)} · zoom: ${fmt(map.getZoom(), 2)}`;
  }

  map.on("load", () => {
    updateState();
    map.resize();
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
      const old = btnCopy.textContent;
      btnCopy.textContent = "Afritað ✓";
      setTimeout(() => (btnCopy.textContent = old), 900);
    } catch {}
  }

  btnCopy?.addEventListener("click", copyState);

  window.addEventListener("resize", () => map.resize?.());
})();
