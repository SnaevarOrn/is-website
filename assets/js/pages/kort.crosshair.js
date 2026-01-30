// assets/js/pages/kort.crosshair.js
// Crosshair toggle + center coord readout + elevation (throttled, cached).
// Expects:
// - map container has class .kort-map
// - state element id="kortState" exists (optional)

"use strict";

(() => {
  const map = window.kortMap;
  if (!map) return;

  const mapEl = document.getElementById("map") || document.querySelector(".kort-map");
  let on = false;

  let timer = null;
  let aborter = null;
  const cache = new Map();

  function key(lat, lng) {
    return lat.toFixed(5) + "," + lng.toFixed(5);
  }

  function setStatusLine(lat, lng, zoom, elevMeters) {
    const el = document.getElementById("kortState");
    if (!el) return;

    const z = (typeof zoom === "number") ? zoom.toFixed(2) : "—";
    const base = `miðja: ${lat.toFixed(5)}, ${lng.toFixed(5)} · zoom: ${z}`;

    if (!on) {
      el.textContent = base;
      return;
    }

    const h = (typeof elevMeters === "number") ? `${Math.round(elevMeters)} m` : "—";
    el.textContent = `${base} · hæð: ${h}`;
  }

  async function fetchElev(lat, lng) {
    const k = key(lat, lng);
    if (cache.has(k)) return cache.get(k);

    if (aborter) aborter.abort();
    aborter = new AbortController();

    const res = await fetch(`/api/elevation?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: aborter.signal
    });

    if (!res.ok) throw new Error("elev " + res.status);
    const j = await res.json();
    if (!j || j.ok !== true) throw new Error("elev bad");

    const v =
      (typeof j.elevation_m === "number") ? j.elevation_m :
      (typeof j.meters === "number") ? j.meters :
      (typeof j.elevation === "number") ? j.elevation :
      null;

    if (typeof v !== "number") throw new Error("elev missing");
    cache.set(k, v);
    return v;
  }

  function scheduleElev(lat, lng) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        const elev = await fetchElev(lat, lng);
        setStatusLine(lat, lng, map.getZoom(), elev);
      } catch (e) {
        // keep coords updated, don't overwrite with "-" aggressively
        setStatusLine(lat, lng, map.getZoom(), null);
      }
    }, 650);
  }

  function updateCoords() {
    const c = map.getCenter();
    const lat = c.lat;
    const lng = c.lng;
    const zoom = map.getZoom();

    if (!on) {
      setStatusLine(lat, lng, zoom, null);
      return;
    }

    // update immediately, then fetch elevation throttled
    setStatusLine(lat, lng, zoom, null);
    scheduleElev(lat, lng);
  }

  function setOn(next) {
    on = !!next;
    if (mapEl) mapEl.classList.toggle("kort-crosshair-on", on);
    updateCoords();
    return on;
  }

  function toggle() {
    return setOn(!on);
  }

  function get() { return on; }

  function refresh() {
    // after style changes, just refresh HUD
    updateCoords();
  }

  // Keep coords updated (and elevation only on moveend)
  map.on("move", () => {
    // update coords while moving, no elevation calls
    if (!on) return;
    const c = map.getCenter();
    setStatusLine(c.lat, c.lng, map.getZoom(), null);
  });

  map.on("moveend", () => {
    updateCoords();
  });

  // init (OFF)
  setOn(false);

  window.kortCrosshair = { toggle, get, set: setOn, refresh };
})();
