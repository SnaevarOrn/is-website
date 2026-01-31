// assets/js/pages/kort.addon.flights.js
// Adds live-ish flight points via /api/flights (GeoJSON).
// Toggle via window.kortAddons.toggle("flights") or menu data-addon="flights"

"use strict";

(() => {
  const map = window.kortMap;
  if (!map) return;

  const ID = "flights";
  const SRC = "kort-flights";
  const LYR = "kort-flights-pts";

  const MIN_ZOOM = 7.5;
  const POLL_MS = 8000;

  let on = false;
  let timer = null;
  let aborter = null;

  function ensure() {
    if (!map.getSource(SRC)) {
      map.addSource(SRC, { type: "geojson", data: emptyFC() });
    }
    if (!map.getLayer(LYR)) {
      map.addLayer({
        id: LYR,
        type: "circle",
        source: SRC,
        paint: {
          "circle-radius": 4,
          "circle-opacity": 0.85,
          "circle-stroke-width": 1,
          "circle-stroke-opacity": 0.9
          // colors inherit from default style; if you want specific color, say so.
        }
      });
    }
  }

  function emptyFC() {
    return { type: "FeatureCollection", features: [] };
  }

  function setData(fc) {
    const s = map.getSource(SRC);
    if (s && s.setData) s.setData(fc || emptyFC());
  }

  function clear() {
    try { setData(emptyFC()); } catch {}
  }

  function bboxStr() {
    const b = map.getBounds();
    const sw = b.getSouthWest();
    const ne = b.getNorthEast();
    return [sw.lng, sw.lat, ne.lng, ne.lat].join(",");
  }

  async function fetchFlights() {
    if (!on) return;
    if (map.getZoom() < MIN_ZOOM) {
      clear();
      return;
    }

    if (aborter) aborter.abort();
    aborter = new AbortController();

    const url = "/api/flights?bbox=" + encodeURIComponent(bboxStr());
    const res = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store", signal: aborter.signal });
    if (!res.ok) throw new Error("flights " + res.status);
    const j = await res.json();
    if (!j || j.ok !== true || !j.geojson) throw new Error("bad payload");
    setData(j.geojson);
  }

  function loop() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      try { await fetchFlights(); } catch {}
      loop();
    }, POLL_MS);
  }

  function enable() {
    if (on) return true;
    on = true;

    try { ensure(); } catch {}

    // basic click popup
    map.on("click", LYR, onClick);
    map.on("mouseenter", LYR, () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", LYR, () => { map.getCanvas().style.cursor = ""; });

    loop();
    return true;
  }

  function disable() {
    if (!on) return false;
    on = false;

    if (timer) { clearTimeout(timer); timer = null; }
    if (aborter) { try { aborter.abort(); } catch {} aborter = null; }

    try { map.off("click", LYR, onClick); } catch {}
    clear();
    return false;
  }

  function toggle() {
    return on ? disable() : enable();
  }

  function onClick(e) {
    try {
      const f = e.features && e.features[0];
      if (!f) return;

      const p = f.properties || {};
      const cs = (p.callsign || "").trim() || "(óþekkt)";
      const alt = (p.alt_m != null) ? Math.round(Number(p.alt_m)) + " m" : "—";
      const spd = (p.speed_mps != null) ? Math.round(Number(p.speed_mps) * 3.6) + " km/klst" : "—";

      const html =
        `<div class="kort-popup">` +
          `<div class="kort-popup-title">✈︎ ${esc(cs)}</div>` +
          `<div class="kort-popup-meta">Hæð: ${esc(alt)} · Hraði: ${esc(spd)}</div>` +
          `<div class="kort-popup-coord">${Number(f.geometry.coordinates[1]).toFixed(5)}, ${Number(f.geometry.coordinates[0]).toFixed(5)}</div>` +
        `</div>`;

      new maplibregl.Popup({ closeButton: true, closeOnClick: true, maxWidth: "320px" })
        .setLngLat(f.geometry.coordinates)
        .setHTML(html)
        .addTo(map);
    } catch {}
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Re-add after style swaps
  map.on("styledata", () => {
    if (!on) return;
    try { ensure(); } catch {}
  });

  // Public addon registry
  window.kortAddons = window.kortAddons || {};
  window.kortAddons[ID] = { enable, disable, toggle, isOn: () => on, id: ID, minZoom: MIN_ZOOM };
})();