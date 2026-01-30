// assets/js/pages/kort.crosshair.js
// Crosshair toggle + center coord readout + elevation (throttled + cached).
// Expects: window.kortMap exists.

"use strict";

(() => {
  const map = window.kortMap;
  if (!map) return;

  const mapEl = (typeof map.getContainer === "function") ? map.getContainer() : document.querySelector(".kort-map");

  let on = false;

  let timer = null;
  let aborter = null;
  const cache = new Map(); // key -> elevation_m

  function makeKey(lat, lng) {
    return lat.toFixed(5) + "," + lng.toFixed(5);
  }

  function setStatusLine(lat, lng, zoom, elevMeters) {
    const el = document.getElementById("kortState");
    if (!el) return;

    const z = (typeof zoom === "number") ? zoom.toFixed(2) : "—";
    const base = "miðja: " + lat.toFixed(5) + ", " + lng.toFixed(5) + " · zoom: " + z;

    if (!on) {
      el.textContent = base;
      return;
    }

    const h = (typeof elevMeters === "number") ? (Math.round(elevMeters) + " m") : "—";
    el.textContent = base + " · hæð: " + h;
  }

  async function fetchElev(lat, lng) {
    const k = makeKey(lat, lng);
    if (cache.has(k)) return cache.get(k);

    // Cancel previous in-flight request
    if (aborter) aborter.abort();
    aborter = new AbortController();

    const url = "/api/elevation?lat=" + encodeURIComponent(lat) + "&lng=" + encodeURIComponent(lng);
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: aborter.signal
    });

    if (!res.ok) throw new Error("elev_http_" + res.status);

    const j = await res.json();
    if (!j || j.ok !== true) throw new Error("elev_bad_payload");

    const v =
      (typeof j.elevation_m === "number") ? j.elevation_m :
      (typeof j.meters === "number") ? j.meters :
      (typeof j.elevation === "number") ? j.elevation :
      null;

    if (typeof v !== "number") throw new Error("elev_missing_value");

    cache.set(k, v);
    return v;
  }

  function cancelPending() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (aborter) {
      try { aborter.abort(); } catch {}
      aborter = null;
    }
  }

  function scheduleElev(lat, lng) {
    if (timer) clearTimeout(timer);

    timer = setTimeout(async () => {
      // If user toggled OFF while we waited, skip work
      if (!on) return;

      try {
        const elev = await fetchElev(lat, lng);
        setStatusLine(lat, lng, map.getZoom(), elev);
      } catch (e) {
        // Keep coords updated; show hæð: —
        setStatusLine(lat, lng, map.getZoom(), null);
      }
    }, 650);
  }

  function updateCoords() {
    const c = map.getCenter();
    const lat = c.lat;
    const lng = c.lng;

    setStatusLine(lat, lng, map.getZoom(), null);

    if (!on) return;
    scheduleElev(lat, lng);
  }

  function setOn(next) {
    on = !!next;

    if (!on) cancelPending();

    if (mapEl && mapEl.classList) {
      mapEl.classList.toggle("kort-crosshair-on", on);
    }

    updateCoords();
    return on;
  }

  function toggle() { return setOn(!on); }
  function get() { return on; }
  function refresh() { updateCoords(); }

  // Update coords while moving (no elevation spam)
  map.on("move", () => {
    if (!on) return;
    const c = map.getCenter();
    setStatusLine(c.lat, c.lng, map.getZoom(), null);
  });

  map.on("moveend", () => {
    updateCoords();
  });

  // init OFF
  setOn(false);

  window.kortCrosshair = { toggle, get, set: setOn, refresh };
})();