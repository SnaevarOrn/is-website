// assets/js/pages/kort.measure.js
// Measure tool: place A and B points -> distance + elevation A/B
// Toggle on/off via window.kortMeasure.toggle()

"use strict";

(() => {
  const map = window.kortMap;
  if (!map) return;

  let enabled = false;
  let a = null; // {lng,lat,elev?}
  let b = null;

  let markerA = null;
  let markerB = null;
  let popup = null;
  let onClick = null;

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
      if (typeof j.elevation_m !== "number") return null;
      return j.elevation_m;
    } catch {
      return null;
    }
  }

  function clearUI() {
    if (markerA) { markerA.remove(); markerA = null; }
    if (markerB) { markerB.remove(); markerB = null; }
    if (popup) { popup.remove(); popup = null; }
    a = null; b = null;
  }

  function openPopup(midLng, midLat, html) {
    if (popup) popup.remove();
    popup = new maplibregl.Popup({ closeButton: true, closeOnClick: false, maxWidth: "360px" })
      .setLngLat([midLng, midLat])
      .setHTML(html)
      .addTo(map);
  }

  async function updatePopup() {
    if (!a || !b) return;

    const distM = haversineM(a, b);
    const distKm = distM / 1000;

    // Elevation (best effort)
    const elevA = await fetchElev(a.lat, a.lng);
    const elevB = await fetchElev(b.lat, b.lng);

    const ea = (elevA === null) ? "—" : String(Math.round(elevA)) + " m";
    const eb = (elevB === null) ? "—" : String(Math.round(elevB)) + " m";

    let diff = "—";
    if (elevA !== null && elevB !== null) {
      diff = String(Math.round(elevB - elevA)) + " m";
    }

    const html =
      `<div class="kort-popup">` +
        `<div class="kort-popup-title">Mæling A → B</div>` +
        `<div class="kort-popup-sub">Vegalengd: <b>${distKm.toFixed(2)} km</b> (${Math.round(distM)} m)</div>` +
        `<div class="kort-popup-meta">Hæð A: ${ea} · Hæð B: ${eb} · Δ: ${diff}</div>` +
        `<div class="kort-popup-coord">A: ${a.lat.toFixed(5)}, ${a.lng.toFixed(5)}<br>B: ${b.lat.toFixed(5)}, ${b.lng.toFixed(5)}</div>` +
      `</div>`;

    const midLng = (a.lng + b.lng) / 2;
    const midLat = (a.lat + b.lat) / 2;
    openPopup(midLng, midLat, html);
  }

  function setA(lng, lat) {
    a = { lng, lat };
    if (!markerA) {
      markerA = new maplibregl.Marker({ color: "#111" }).setLngLat([lng, lat]).addTo(map);
    } else {
      markerA.setLngLat([lng, lat]);
    }
  }

  function setB(lng, lat) {
    b = { lng, lat };
    if (!markerB) {
      markerB = new maplibregl.Marker({ color: "#ff3b3b" }).setLngLat([lng, lat]).addTo(map);
    } else {
      markerB.setLngLat([lng, lat]);
    }
  }

  function enable() {
    if (enabled) return true;
    enabled = true;

    clearUI();

    onClick = (e) => {
      const lng = e.lngLat.lng;
      const lat = e.lngLat.lat;

      if (!a) {
        setA(lng, lat);
        return;
      }

      if (!b) {
        setB(lng, lat);
        updatePopup();
        return;
      }

      // third click: reset and set new A
      clearUI();
      setA(lng, lat);
    };

    map.on("click", onClick);

    const el = document.getElementById("kortState");
    if (el) el.textContent = "Mæling: smelltu á A og B (þriðji smellur endurstillir).";

    return true;
  }

  function disable() {
    if (!enabled) return false;
    enabled = false;

    if (onClick) { map.off("click", onClick); onClick = null; }
    clearUI();

    const el = document.getElementById("kortState");
    if (el) el.textContent = "—";

    return false;
  }

  function toggle() {
    return enabled ? disable() : enable();
  }

  window.kortMeasure = { toggle, enable, disable, isOn: () => enabled };
})();
