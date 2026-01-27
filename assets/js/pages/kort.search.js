// assets/js/pages/kort.search.js
// Kort — Search (geocoding via /api/geocode)
// Depends on: kort.js (window.kortMap)

"use strict";

(() => {
  const map = window.kortMap;
  if (!map) return;

  const input = document.getElementById("kortSearch");
  if (!input) return;

  let searchMarker = null;

  function setStatus(text) {
    const el = document.getElementById("kortState");
    if (el) el.textContent = text;
  }

  function placeMarker(lng, lat) {
    if (!searchMarker) {
      searchMarker = new maplibregl.Marker({ color: "#3bb2d0" })
        .setLngLat([lng, lat])
        .addTo(map);
    } else {
      searchMarker.setLngLat([lng, lat]);
    }
  }

  async function geocode(query) {
    const url = `/api/geocode?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { "accept": "application/json" },
      cache: "no-store"
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    return res.json();
  }

  async function handleSearch() {
    const q = input.value.trim();
    if (!q) return;

    setStatus("Leita…");

    try {
      const data = await geocode(q);

      if (!data || !data.ok || !data.result) {
        setStatus("Engin niðurstaða fannst.");
        return;
      }

      const { lat, lng, label } = data.result;

      placeMarker(lng, lat);

      map.flyTo({
        center: [lng, lat],
        zoom: Math.max(map.getZoom(), 14),
        speed: 1.2,
        curve: 1.3,
        essential: true
      });

      setStatus(label || `Staðsetning: ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    } catch (err) {
      console.error("Search error:", err);
      setStatus("Villa við leit.");
    }
  }

  // Submit on Enter
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch();
    }
  });

})();