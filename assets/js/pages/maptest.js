"use strict";

(() => {
  const $ = (sel) => document.querySelector(sel);

  const elState = $("#mapState");
  const btnCopy = $("#btnCopyState");
  const btnRey = $("#btnReykjavik");
  const btnVj = $("#btnVatnajokull");

  // Reykjavík (lng, lat)
  const REYKJAVIK = { center: [-21.9426, 64.1466], zoom: 11.5 };
  // Vatnajökull (approx center)
  const VATNAJOKULL = { center: [-16.8, 64.6], zoom: 8.2 };

  const map = new maplibregl.Map({
    container: "map",
    style: {
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
          attribution: '© OpenStreetMap contributors'
        }
      },
      layers: [
        { id: "osm-tiles", type: "raster", source: "osm" }
      ]
    },
    center: REYKJAVIK.center,
    zoom: REYKJAVIK.zoom,
    // For Iceland, keep north-up; you can allow rotate later if you want
    bearing: 0,
    pitch: 0
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: "metric" }), "bottom-left");

  // Optional marker at center
  const marker = new maplibregl.Marker({ draggable: false })
    .setLngLat(REYKJAVIK.center)
    .addTo(map);

  function fmt(n, d = 5) {
    return (Math.round(n * 10 ** d) / 10 ** d).toFixed(d);
  }

  function updateState() {
    const c = map.getCenter();
    const z = map.getZoom();
    const b = map.getBearing();
    elState.textContent = `miðja: ${fmt(c.lat, 5)}, ${fmt(c.lng, 5)} | zoom: ${fmt(z, 2)} | bearing: ${fmt(b, 1)}`;
  }

  function flyTo(place) {
    map.flyTo({
      center: place.center,
      zoom: place.zoom,
      speed: 1.2,
      curve: 1.2,
      essential: true
    });
    marker.setLngLat(place.center);
  }

  async function copyState() {
    const c = map.getCenter();
    const z = map.getZoom();
    const payload = JSON.stringify(
      { lat: +fmt(c.lat, 6), lng: +fmt(c.lng, 6), zoom: +fmt(z, 2) },
      null,
      0
    );
    try {
      await navigator.clipboard.writeText(payload);
      const old = btnCopy.textContent;
      btnCopy.textContent = "Afritað ✓";
      setTimeout(() => (btnCopy.textContent = old), 900);
    } catch {
      // ignore
    }
  }

  map.on("load", updateState);
  map.on("move", updateState);
  map.on("zoom", updateState);
  map.on("rotate", updateState);

  btnRey?.addEventListener("click", () => flyTo(REYKJAVIK));
  btnVj?.addEventListener("click", () => flyTo(VATNAJOKULL));
  btnCopy?.addEventListener("click", copyState);
})();
