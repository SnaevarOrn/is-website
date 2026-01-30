// assets/js/pages/kort.routing.js
// Live routing: from (watchPosition) -> to (destination from search)
// Draws route line and updates occasionally.
// Adds: distance popup with X that clears route + stops watch.
// Build-safe: no optional chaining / no replaceAll.

"use strict";

(() => {
  const map = window.kortMap;
  if (!map) return;

  const ROUTE_SOURCE = "kort-route";
  const ROUTE_LAYER  = "kort-route-line";
  const FROM_MARKER_COLOR = "#ff3b3b";

  let to = null;                 // {lng,lat,label?}
  let from = null;               // {lng,lat,acc?}
  let watchId = null;
  let fromMarker = null;
  let toMarker = null;

  let lastRouteAt = 0;
  let lastRouteFrom = null;

  let distPopup = null;
  let lastDistanceM = null;

  const MIN_RECALC_MS = 5000;    // don't spam
  const MIN_MOVE_M = 40;         // recalc after moving this much

  function emptyFeature() {
    return { type: "FeatureCollection", features: [] };
  }

  function ensureRouteLayers() {
    if (!map.getSource(ROUTE_SOURCE)) {
      map.addSource(ROUTE_SOURCE, {
        type: "geojson",
        data: emptyFeature()
      });
    }

    if (!map.getLayer(ROUTE_LAYER)) {
      map.addLayer({
        id: ROUTE_LAYER,
        type: "line",
        source: ROUTE_SOURCE,
        layout: {
          "line-join": "round",
          "line-cap": "round"
        },
        paint: {
          "line-color": "#ff3b3b",
          "line-width": 5,
          "line-opacity": 0.85
        }
      });
    }
  }

  function setRouteGeojson(feature) {
    ensureRouteLayers();
    const src = map.getSource(ROUTE_SOURCE);
    if (src && src.setData) src.setData({ type: "FeatureCollection", features: [feature] });
  }

  function clearRouteLineOnly() {
    ensureRouteLayers();
    const src = map.getSource(ROUTE_SOURCE);
    if (src && src.setData) src.setData(emptyFeature());
  }

  function haversineM(a, b) {
    const R = 6371000;
    const toRad = (x) => x * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const s1 = Math.sin(dLat / 2);
    const s2 = Math.sin(dLng / 2);
    const q = s1 * s1 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * s2 * s2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(q)));
  }

  function formatKm(distanceM) {
    const km = distanceM / 1000;
    let dec = 1;
    if (km < 5) dec = 3;
    else if (km < 10) dec = 2;
    else dec = 1;
    return km.toFixed(dec);
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function closeDistPopup() {
    if (distPopup) {
      try { distPopup.remove(); } catch (e) {}
      distPopup = null;
    }
  }

  function openOrUpdateDistPopup(distanceM) {
    if (!to) return;

    lastDistanceM = distanceM;

    const kmStr = formatKm(distanceM);
    const title = "Leið";
    const sub = "Vegalengd: <b>" + esc(kmStr) + " km</b>";

    // Build popup HTML with an X in top-right
    const token = String(Date.now()) + String(Math.floor(Math.random() * 10000));
    const idX = "kortRouteClear_" + token;

    const html =
      `<div class="kort-popup kort-route-mini">` +
        `<div class="kort-route-mini-head">` +
          `<div class="kort-route-mini-title">${title}</div>` +
          `<button id="${idX}" class="kort-route-mini-x" type="button" aria-label="Loka">✕</button>` +
        `</div>` +
        `<div class="kort-popup-sub">${sub}</div>` +
      `</div>`;

    closeDistPopup();

    distPopup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      maxWidth: "280px"
    })
      .setLngLat([to.lng, to.lat])
      .setHTML(html)
      .addTo(map);

    setTimeout(() => {
      const btn = document.getElementById(idX);
      if (btn) {
        btn.addEventListener("click", () => {
          clearAll(true); // true => also stop watch
        });
      }
    }, 0);
  }

  function setFrom(pos) {
    from = {
      lng: pos.coords.longitude,
      lat: pos.coords.latitude,
      acc: pos.coords.accuracy
    };

    if (!fromMarker) {
      fromMarker = new maplibregl.Marker({ color: FROM_MARKER_COLOR })
        .setLngLat([from.lng, from.lat])
        .addTo(map);
    } else {
      fromMarker.setLngLat([from.lng, from.lat]);
    }

    maybeRoute(false);
  }

  function setDestination(lng, lat, label) {
    to = { lng: lng, lat: lat, label: label || "" };

    if (!toMarker) {
      toMarker = new maplibregl.Marker({ color: "#111" })
        .setLngLat([to.lng, to.lat])
        .addTo(map);
    } else {
      toMarker.setLngLat([to.lng, to.lat]);
    }

    // reset route throttles so we route immediately
    maybeRoute(true);
  }

  async function routeOnce() {
    if (!from || !to) return;

    const now = Date.now();
    if (now - lastRouteAt < MIN_RECALC_MS) return;

    if (lastRouteFrom) {
      const moved = haversineM(lastRouteFrom, from);
      if (moved < MIN_MOVE_M) return;
    }

    lastRouteAt = now;
    lastRouteFrom = { lng: from.lng, lat: from.lat };

    const url =
      "/api/route?profile=driving" +
      "&from=" + encodeURIComponent(from.lng + "," + from.lat) +
      "&to=" + encodeURIComponent(to.lng + "," + to.lat);

    try {
      const res = await fetch(url, { headers: { "accept": "application/json" }, cache: "no-store" });
      if (!res.ok) return;

      const j = await res.json();
      if (!j || j.ok !== true || !j.geometry) return;

      setRouteGeojson(j.geometry);

      // Distance popup (preferred: use distance_m)
      if (typeof j.distance_m === "number" && isFinite(j.distance_m)) {
        openOrUpdateDistPopup(j.distance_m);
      } else if (lastDistanceM !== null) {
        // keep old popup if we had one
      }
    } catch (e) {
      // silent fail
    }
  }

  function maybeRoute(force) {
    if (!from || !to) return;
    if (force) {
      lastRouteAt = 0;
      lastRouteFrom = null;
    }
    routeOnce();
  }

  function startWatch() {
    if (!("geolocation" in navigator)) return;

    if (watchId !== null) return;
    watchId = navigator.geolocation.watchPosition(
      setFrom,
      function () {},
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 8000 }
    );
  }

  function stopWatch() {
    if (watchId !== null && navigator.geolocation && navigator.geolocation.clearWatch) {
      navigator.geolocation.clearWatch(watchId);
    }
    watchId = null;
  }

  // keepFromMarker: leave "you are here" marker visible
  function clearAll(stop) {
    clearRouteLineOnly();
    closeDistPopup();
    lastDistanceM = null;

    if (toMarker) { try { toMarker.remove(); } catch (e) {} toMarker = null; }
    to = null;

    lastRouteAt = 0;
    lastRouteFrom = null;

    if (stop) stopWatch();
  }

  // Re-add line after style changes (switching basemap resets custom layers)
  map.on("styledata", () => {
    try { ensureRouteLayers(); } catch (e) {}
  });

  window.kortRouting = {
    startWatch: startWatch,
    stopWatch: stopWatch,
    setDestination: setDestination,
    clear: function () { clearAll(true); }
  };
})();
