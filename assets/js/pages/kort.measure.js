// assets/js/pages/kort.measure.js
// Measure tool: place A and B points -> distance + elevation A/B + dotted line
// Live preview line while moving mouse after placing A.
// Toggle on/off via window.kortMeasure.toggle()

"use strict";

(() => {
  const map = window.kortMap;
  if (!map) return;

  const SRC_ID = "kort-measure";
  const LINE_ID = "kort-measure-line";

  let enabled = false;
  let a = null; // {lng,lat}
  let b = null; // {lng,lat}

  let markerA = null;
  let markerB = null;
  let popup = null;

  let onClick = null;
  let onMove = null;

  function haversineM(p1, p2) {
    const R = 6371000;
    const toRad = (x) => x * Math.PI / 180;
    const dLat = toRad(p2.lat - p1.lat);
    const dLng = toRad(p2.lng - p1.lng);
    const s1 = Math.sin(dLat / 2);
    const s2 = Math.sin(dLng / 2);
    const q = s1 * s1 + Math.cos(toRad(p1.lat)) * Math.cos(toRad(p2.lat)) * s2 * s2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(q)));
  }

  async function fetchElev(lat, lng) {
    const url = "/api/elevation?lat=" + encodeURIComponent(lat) + "&lng=" + encodeURIComponent(lng);
    try {
      const res = await fetch(url, { headers: { "accept": "application/json" }, cache: "no-store" });
      if (!res.ok) return null;
      const j = await res.json();
      if (!j || j.ok !== true) return null;

      // tolerate multiple response shapes
      const v =
        (typeof j.elevation_m === "number") ? j.elevation_m :
        (typeof j.meters === "number") ? j.meters :
        (typeof j.elevation === "number") ? j.elevation :
        null;

      return (typeof v === "number") ? v : null;
    } catch {
      return null;
    }
  }

  function ensureLineLayer() {
    if (!map.getSource(SRC_ID)) {
      map.addSource(SRC_ID, { type: "geojson", data: emptyFC() });
    }
    if (!map.getLayer(LINE_ID)) {
      map.addLayer({
        id: LINE_ID,
        type: "line",
        source: SRC_ID,
        paint: {
          "line-color": "#111",
          "line-width": 2.5,
          "line-opacity": 0.9,
          "line-dasharray": [2, 2]
        }
      });
    }
  }

  function setLine(coords) {
    const src = map.getSource(SRC_ID);
    if (!src) return;
    src.setData({
      type: "FeatureCollection",
      features: coords && coords.length >= 2 ? [{
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: coords }
      }] : []
    });
  }

  function clearUI() {
    if (markerA) { markerA.remove(); markerA = null; }
    if (markerB) { markerB.remove(); markerB = null; }
    if (popup) { popup.remove(); popup = null; }
    a = null; b = null;
    setLine(null);
  }

  function openPopup(midLng, midLat, html) {
    if (popup) popup.remove();
    popup = new maplibregl.Popup({ closeButton: true, closeOnClick: false, maxWidth: "360px" })
      .setLngLat([midLng, midLat])
      .setHTML(html)
      .addTo(map);
  }

  async function updatePopup(finalB) {
    if (!a || !finalB) return;

    const distM = haversineM(a, finalB);
    const distKm = distM / 1000;

    const elevA = await fetchElev(a.lat, a.lng);
    const elevB = await fetchElev(finalB.lat, finalB.lng);

    const ea = (elevA === null) ? "—" : String(Math.round(elevA)) + " m";
    const eb = (elevB === null) ? "—" : String(Math.round(elevB)) + " m";

    let diff = "—";
    if (elevA !== null && elevB !== null) diff = String(Math.round(elevB - elevA)) + " m";

    const html =
      `<div class="kort-popup">` +
        `<div class="kort-popup-title">Mæling A → B</div>` +
        `<div class="kort-popup-sub">Vegalengd: <b>${distKm.toFixed(2)} km</b> (${Math.round(distM)} m)</div>` +
        `<div class="kort-popup-meta">Hæð A: ${ea} · Hæð B: ${eb} · Δ: ${diff}</div>` +
        `<div class="kort-popup-coord">A: ${a.lat.toFixed(5)}, ${a.lng.toFixed(5)}<br>B: ${finalB.lat.toFixed(5)}, ${finalB.lng.toFixed(5)}</div>` +
      `</div>`;

    const midLng = (a.lng + finalB.lng) / 2;
    const midLat = (a.lat + finalB.lat) / 2;
    openPopup(midLng, midLat, html);
  }

  function setA(lng, lat) {
    a = { lng, lat };
    if (!markerA) markerA = new maplibregl.Marker({ color: "#111" }).setLngLat([lng, lat]).addTo(map);
    else markerA.setLngLat([lng, lat]);
  }

  function setB(lng, lat) {
    b = { lng, lat };
    if (!markerB) markerB = new maplibregl.Marker({ color: "#ff3b3b" }).setLngLat([lng, lat]).addTo(map);
    else markerB.setLngLat([lng, lat]);
  }

  function enable() {
    if (enabled) return true;
    enabled = true;

    clearUI();
    ensureLineLayer();

    onClick = (e) => {
      const lng = e.lngLat.lng;
      const lat = e.lngLat.lat;

      if (!a) {
        setA(lng, lat);
        setLine([[lng, lat], [lng, lat]]);
        return;
      }

      if (!b) {
        setB(lng, lat);
        setLine([[a.lng, a.lat], [lng, lat]]);
        updatePopup(b);
        return;
      }

      // third click: reset and set new A
      clearUI();
      setA(lng, lat);
      setLine([[lng, lat], [lng, lat]]);
    };

    onMove = (e) => {
      if (!enabled) return;
      if (!a) return;
      if (b) return; // once B is set, stop preview
      const lng = e.lngLat.lng;
      const lat = e.lngLat.lat;
      setLine([[a.lng, a.lat], [lng, lat]]);
      // (valfrjálst) live distance í status:
      try {
        const m = haversineM(a, { lng, lat });
        const km = (m / 1000).toFixed(2);
        const el = document.getElementById("kortState");
        if (el) el.textContent = `Mæling: ${km} km (smelltu til að setja B)`;
      } catch {}
    };

    map.on("click", onClick);
    map.on("mousemove", onMove);

    const el = document.getElementById("kortState");
    if (el) el.textContent = "Mæling: smelltu á A og B (þriðji smellur endurstillir).";

    return true;
  }

  function disable() {
    if (!enabled) return false;
    enabled = false;

    if (onClick) { map.off("click", onClick); onClick = null; }
    if (onMove) { map.off("mousemove", onMove); onMove = null; }

    clearUI();

    const el = document.getElementById("kortState");
    if (el) el.textContent = "—";

    return false;
  }

  function toggle() {
    return enabled ? disable() : enable();
  }

  function isOn() { return enabled; }

  function refresh() {
    // Called after style swap: re-add line layer if tool is enabled
    if (!enabled) return;
    try {
      ensureLineLayer();
      if (a && b) setLine([[a.lng, a.lat], [b.lng, b.lat]]);
      else if (a) setLine([[a.lng, a.lat], [a.lng, a.lat]]);
    } catch {}
  }

  function emptyFC() {
    return { type: "FeatureCollection", features: [] };
  }

  window.kortMeasure = { toggle, enable, disable, isOn, refresh };
})();
