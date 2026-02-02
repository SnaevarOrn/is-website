// assets/js/pages/kort.addon.flights.js
// Live-ish flight points via /api/flights (GeoJSON).
//
// Exposes (Live backend):
// - window.kortAddonsLive.toggle("flights")
// - window.kortAddonsLive.set("flights", true/false)
// - window.kortAddonsLive.isOn("flights")
// - window.kortAddonsLive.list()
// - window.kortAddonsLive.refresh()

"use strict";

(() => {
  const map = window.kortMap;
  if (!map) return;

  const ID = "flights";
  const SRC = "live-flights";
  const LYR = "live-flights-pts";

  const MIN_ZOOM = 7.5;
  const POLL_MS = 8000;

  let on = false;
  let timer = null;
  let aborter = null;

  function emptyFC() {
    return { type: "FeatureCollection", features: [] };
  }

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
          "circle-opacity": 0.9,
          "circle-color": "#111",
          "circle-stroke-width": 1.2,
          "circle-stroke-color": "#fff",
          "circle-stroke-opacity": 0.95
        }
      });
    }
  }

  function setData(fc) {
    const s = map.getSource(SRC);
    if (s && s.setData) s.setData(fc || emptyFC());
  }

  function clear() {
    try { setData(emptyFC()); } catch (e) {}
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

    const res = await fetch(url, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: aborter.signal
    });

    if (!res.ok) throw new Error("flights " + res.status);

    const j = await res.json();
    if (!j || j.ok !== true || !j.geojson) throw new Error("bad payload");

    setData(j.geojson);
  }

  function loop() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      try { await fetchFlights(); } catch (e) {}
      loop();
    }, POLL_MS);
  }

  function onClick(e) {
    try {
      const f = e.features && e.features[0];
      if (!f) return;

      const p = f.properties || {};
      const cs = (p.callsign || "").trim() || "(óþekkt)";
      const alt = (p.alt_m != null && isFinite(Number(p.alt_m))) ? (Math.round(Number(p.alt_m)) + " m") : "—";

      // ✅ API uses velocity_ms
      const velMs = (p.velocity_ms != null && isFinite(Number(p.velocity_ms))) ? Number(p.velocity_ms) : null;
      const spd = (velMs != null) ? (Math.round(velMs * 3.6) + " km/klst") : "—";

      const lon = Number(f.geometry && f.geometry.coordinates && f.geometry.coordinates[0]);
      const lat = Number(f.geometry && f.geometry.coordinates && f.geometry.coordinates[1]);

      const html =
        `<div class="kort-popup">` +
          `<div class="kort-popup-title">✈︎ ${esc(cs)}</div>` +
          `<div class="kort-popup-meta">Hæð: ${esc(alt)} · Hraði: ${esc(spd)}</div>` +
          (isFinite(lat) && isFinite(lon)
            ? `<div class="kort-popup-coord">${lat.toFixed(5)}, ${lon.toFixed(5)}</div>`
            : ``) +
        `</div>`;

      new maplibregl.Popup({ closeButton: true, closeOnClick: true, maxWidth: "320px" })
        .setLngLat([lon, lat])
        .setHTML(html)
        .addTo(map);
    } catch (e) {}
  }

  function enable() {
    if (on) return true;
    on = true;

    try { ensure(); } catch (e) {}

    // events (layer must exist)
    try {
      map.on("click", LYR, onClick);
      map.on("mouseenter", LYR, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", LYR, () => { map.getCanvas().style.cursor = ""; });
    } catch (e) {}

    loop();
    return true;
  }

  function disable() {
    if (!on) return false;
    on = false;

    if (timer) { clearTimeout(timer); timer = null; }
    if (aborter) { try { aborter.abort(); } catch (e) {} aborter = null; }

    try { map.off("click", LYR, onClick); } catch (e) {}
    clear();
    return true;
  }

  function toggle() {
    return on ? disable() : enable();
  }

  function refresh() {
    // manual refresh (useful after menu toggle / style swaps)
    if (!on) return;
    try { ensure(); } catch (e) {}
    try { fetchFlights(); } catch (e) {}
  }

  function set(id, val) {
    if (id !== ID) return false;
    return val ? enable() : disable();
  }

  function isOn(id) {
    if (id !== ID) return false;
    return !!on;
  }

  function list() {
    return [ID];
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
    try { ensure(); } catch (e) {}
  });

  // ✅ Export as LIVE backend (router will pick it up)
  window.kortAddonsLive = window.kortAddonsLive || {};
  window.kortAddonsLive.toggle = function (id) { return (id === ID) ? toggle() : false; };
  window.kortAddonsLive.set    = function (id, v)  { return set(id, v); };
  window.kortAddonsLive.isOn   = function (id) { return isOn(id); };
  window.kortAddonsLive.refresh= function () { refresh(); };
  window.kortAddonsLive.list   = function () { return list(); };
})();