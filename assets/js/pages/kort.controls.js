// assets/js/pages/kort.controls.js
// Custom MapLibre controls (native look): Menu · Home · Satellite · Location
// + Style registry (street/light/dark/topo/satellite)

"use strict";

(() => {
  const map = window.kortMap;
  if (!map) return;

  /* =========================
     Styles (raster) — easy to try
     ========================= */

  // Street (OSM) from kort.js
  const STYLE_STREET = window.KORT_STYLE_MAP;

  // CARTO basemaps (labels included) — good “views”
  const styleCarto = (id, attribution) => ({
    version: 8,
    sources: {
      carto: {
        type: "raster",
        tiles: [
          `https://a.basemaps.cartocdn.com/${id}/{z}/{x}/{y}.png`,
          `https://b.basemaps.cartocdn.com/${id}/{z}/{x}/{y}.png`,
          `https://c.basemaps.cartocdn.com/${id}/{z}/{x}/{y}.png`,
          `https://d.basemaps.cartocdn.com/${id}/{z}/{x}/{y}.png`
        ],
        tileSize: 256,
        attribution
      }
    },
    layers: [{ id: "carto", type: "raster", source: "carto" }]
  });

  const STYLE_LIGHT = styleCarto("light_all", "© OpenStreetMap contributors © CARTO");
  const STYLE_DARK  = styleCarto("dark_all",  "© OpenStreetMap contributors © CARTO");

  // Topo (OpenTopoMap)
  const STYLE_TOPO = {
    version: 8,
    sources: {
      topo: {
        type: "raster",
        tiles: ["https://a.tile.opentopomap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors · SRTM | OpenTopoMap"
      }
    },
    layers: [{ id: "topo", type: "raster", source: "topo" }]
  };

  // Satellite (demo provider)
  const STYLE_SATELLITE = {
    version: 8,
    sources: {
      satellite: {
        type: "raster",
        tiles: [
          "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        ],
        tileSize: 256,
        attribution: "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics"
      }
    },
    layers: [{ id: "satellite", type: "raster", source: "satellite" }]
  };

  const STYLE_REGISTRY = new Map([
    ["street", STYLE_STREET],
    ["light", STYLE_LIGHT],
    ["dark", STYLE_DARK],
    ["topo", STYLE_TOPO],
    ["satellite", STYLE_SATELLITE]
  ]);

  let currentStyleId = "street";
  let lastNonSatelliteId = "street";

  function setStyleById(id) {
    const style = STYLE_REGISTRY.get(id);
    if (!style) return;

    const center = map.getCenter();
    const zoom = map.getZoom();
    const bearing = map.getBearing();
    const pitch = map.getPitch();

    currentStyleId = id;
    if (id !== "satellite") lastNonSatelliteId = id;

    map.setStyle(style);
    map.once("styledata", () => {
      map.jumpTo({ center, zoom, bearing, pitch });
    });

    // Let modes re-apply their layers on style changes
    window.kortModes?.setMode?.(window.kortModes?.getCurrent?.() || "default");
  }

  // Expose for menu
  window.kortSetStyle = setStyleById;
  window.kortGetStyle = () => currentStyleId;

  /* =========================
     Helpers: native control group
     ========================= */
  function makeGroupControl(buttons) {
    return {
      onAdd(_map) {
        this._map = _map;
        const container = document.createElement("div");
        container.className = "maplibregl-ctrl maplibregl-ctrl-group";
        buttons.forEach((btn) => container.appendChild(btn));
        this._container = container;
        return container;
      },
      onRemove() {
        this._container?.remove();
        this._map = null;
      }
    };
  }

  function makeButton(label, title, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("aria-label", title);
    btn.setAttribute("title", title);
    btn.innerHTML = label;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      onClick?.(btn);
    });
    return btn;
  }

  /* =========================
     Menu
     ========================= */
  const btnMenu = makeButton("☰", "Valmynd", () => window.kortMenu?.toggle?.());
  map.addControl(makeGroupControl([btnMenu]), "top-left");

  /* =========================
     Home / Satellite / Location
     ========================= */

  
const btnSearch = makeButton("🔍", "Leita", () => {
  if (window.kortSearchOverlay && typeof window.kortSearchOverlay.open === "function") {
    window.kortSearchOverlay.open();
  }
});
  
  const btnHome = makeButton("🇮🇸", "Sýna allt Ísland", () => {
    const bounds = window.KORT_ICELAND_BOUNDS;
    if (!bounds) return;
    map.fitBounds(bounds, { padding: 40, duration: 900, essential: true });
  });

  const btnSat = makeButton("🛰️", "Satellite", (btn) => {
    const next = (currentStyleId === "satellite") ? lastNonSatelliteId : "satellite";
    setStyleById(next);
    btn.classList.toggle("kort-ctrl-active", currentStyleId === "satellite");
  });

  const btnLoc = makeButton("📍", "Nota staðsetningu", (btn) => {
    if (!("geolocation" in navigator)) {
      alert("Vafrinn styður ekki staðsetningu.");
      return;
    }
    const btnCross = makeButton("⌖", "Crosshair", (btn) => {
  if (window.kortCrosshair && typeof window.kortCrosshair.toggle === "function") {
    window.kortCrosshair.toggle();
    btn.classList.toggle("kort-ctrl-active", window.kortCrosshair.get && window.kortCrosshair.get());
  }
});
    const btnMeasure = makeButton("📏", "Mæla", (btn) => {
  if (window.kortMeasure && typeof window.kortMeasure.toggle === "function") {
    const on = window.kortMeasure.toggle();
    btn.classList.toggle("kort-ctrl-active", !!on);
  }
});

    btn.disabled = true;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        map.flyTo({
          center: [lng, lat],
          zoom: Math.max(map.getZoom(), 12),
          speed: 1.2,
          curve: 1.3,
          essential: true
        });

        if (!window.__kortLocationMarker) {
          window.__kortLocationMarker = new maplibregl.Marker({ color: "#ff3b3b" })
            .setLngLat([lng, lat])
            .addTo(map);
        } else {
          window.__kortLocationMarker.setLngLat([lng, lat]);
        }

        btn.disabled = false;
      },
      (err) => {
        const msg =
          err.code === 1 ? "Aðgangi hafnað." :
          err.code === 2 ? "Staðsetning óaðgengileg." :
          err.code === 3 ? "Tími rann út." :
          "Villa kom upp.";

        alert(`Staðsetning: ${msg}`);
        btn.disabled = false;
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  });

 map.addControl(makeGroupControl([btnSearch, btnCross, btnMeasure, btnHome, btnSat, btnLoc]), "top-left");
})();
