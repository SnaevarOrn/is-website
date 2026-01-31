// assets/js/pages/kort.addons.overpass.js
// Overpass addons (vector overlays) for kort
//
// Requires:
// - window.kortMap
// - /api/overpass (Cloudflare function)
// Exposes:
// - window.kortAddons.toggle(id)
// - window.kortAddons.set(id, on)
// - window.kortAddons.isOn(id)
// - window.kortAddons.refresh()
// - window.kortAddons.list()

"use strict";

(() => {
  const map = window.kortMap;
  if (!map) return;

  const CFG = {
    air:     { label: "Flugvellir + þyrlupallar", minZoom: 7,  type: "mix" },
    harbors: { label: "Hafnir + smábátahafnir",   minZoom: 9,  type: "mix" },
    fuel:    { label: "Bensínstöðvar",            minZoom: 11, type: "points" },
    huts:    { label: "Skálar + skjól",           minZoom: 10, type: "points" },
    lights:  { label: "Vitar",                    minZoom: 10, type: "points" },
    peaks:   { label: "Fjallatindar",             minZoom: 9,  type: "points" },
    roads:   { label: "Vegagrind (OSM)",          minZoom: 12, type: "lines" }
  };

  const state = {};
  const inflight = {};   // id -> AbortController
  const lastKey = {};    // id -> cache key for bbox+zoom
  let moveHandlerAttached = false;
  let refreshTimer = null;

  // Create stable source/layer ids
  function sid(id) { return "op-" + id; }
  function lidPoint(id) { return "op-" + id + "-pt"; }
  function lidLine(id)  { return "op-" + id + "-ln"; }

  function isOn(id) { return !!state[id]; }
  function list() { return Object.keys(CFG); }

  function anyOn() {
    const keys = list();
    for (let i = 0; i < keys.length; i++) if (state[keys[i]]) return true;
    return false;
  }

  function setStatus(text) {
    const el = document.getElementById("kortState");
    if (el) el.textContent = text;
  }

  function ensureLayers(id) {
    const sourceId = sid(id);
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] }
      });
    }

    // Points
    if (!map.getLayer(lidPoint(id))) {
      map.addLayer({
        id: lidPoint(id),
        type: "circle",
        source: sourceId,
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            7, 3,
            12, 5,
            15, 7
          ],
          "circle-stroke-width": 1.2,
          "circle-opacity": 0.85,
          "circle-stroke-opacity": 0.9
        }
      });
    }

    // Lines (roads, piers, etc.)
    if (!map.getLayer(lidLine(id))) {
      map.addLayer({
        id: lidLine(id),
        type: "line",
        source: sourceId,
        filter: ["==", ["geometry-type"], "LineString"],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-width": [
            "interpolate", ["linear"], ["zoom"],
            10, 1.2,
            13, 2.0,
            16, 3.0
          ],
          "line-opacity": 0.75
        }
      });
    }

    // Simple label popup on click (optional, safe)
    if (!map.__opClickBound) {
      map.__opClickBound = true;
      map.on("click", (e) => {
        const features = map.queryRenderedFeatures(e.point, {
          layers: Object.keys(CFG).reduce((acc, k) => {
            acc.push(lidPoint(k), lidLine(k));
            return acc;
          }, [])
        });
        if (!features || !features.length) return;

        const f = features[0];
        const p = f.properties || {};
        const name = p.name || p.osm_id || "Staður";
        const kind = p.amenity || p.tourism || p.aeroway || p.highway || p.harbour || p.man_made || p.natural || p.leisure || "";

        const html =
          `<div class="kort-popup">` +
            `<div class="kort-popup-title">${esc(name)}</div>` +
            (kind ? `<div class="kort-popup-sub">${esc(kind)}</div>` : ``) +
          `</div>`;

        new maplibregl.Popup({ closeButton: true, closeOnClick: true, maxWidth: "320px" })
          .setLngLat(e.lngLat)
          .setHTML(html)
          .addTo(map);
      });
    }
  }

  function clearData(id) {
    const src = map.getSource(sid(id));
    if (src && src.setData) src.setData({ type: "FeatureCollection", features: [] });
  }

  function removeLayers(id) {
    // Keep source, remove layers so queryRenderedFeatures list stays ok? — we remove both layers and source.
    const lp = lidPoint(id);
    const ll = lidLine(id);
    if (map.getLayer(lp)) map.removeLayer(lp);
    if (map.getLayer(ll)) map.removeLayer(ll);
    const s = sid(id);
    if (map.getSource(s)) map.removeSource(s);
  }

  function bboxKey(bounds, z) {
    // Reduce churn: round bounds to 3 decimals (~100m-200m), keep z int
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const minLng = round(sw.lng, 3);
    const minLat = round(sw.lat, 3);
    const maxLng = round(ne.lng, 3);
    const maxLat = round(ne.lat, 3);
    return `${minLng},${minLat},${maxLng},${maxLat}|${Math.floor(z)}`;
  }

  function getBBox(bounds) {
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    return [sw.lng, sw.lat, ne.lng, ne.lat];
  }

  async function fetchLayer(id) {
    const cfg = CFG[id];
    if (!cfg) return;

    const z = map.getZoom();
    if (z < cfg.minZoom) {
      clearData(id);
      return;
    }

    const bounds = map.getBounds();
    const key = bboxKey(bounds, z);
    if (lastKey[id] === key) return; // no change
    lastKey[id] = key;

    // Abort previous request
    if (inflight[id]) {
      try { inflight[id].abort(); } catch {}
      inflight[id] = null;
    }
    const ac = new AbortController();
    inflight[id] = ac;

    const bbox = getBBox(bounds).map((n) => round(n, 5));
    const url =
      "/api/overpass?layer=" + encodeURIComponent(id) +
      "&bbox=" + encodeURIComponent(bbox.join(",")) +
      "&z=" + encodeURIComponent(String(Math.floor(z)));

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { accept: "application/json" },
        cache: "no-store",
        signal: ac.signal
      });
      if (!res.ok) return;

      const j = await res.json();
      if (!j || j.ok !== true || !j.geojson) return;

      const src = map.getSource(sid(id));
      if (src && src.setData) src.setData(j.geojson);
    } catch {
      // silent fail
    } finally {
      if (inflight[id] === ac) inflight[id] = null;
    }
  }

  function refreshSoon() {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, 220);
  }

  async function refresh() {
    if (!anyOn()) return;

    const ids = list();
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (!state[id]) continue;
      await fetchLayer(id);
    }
  }

  function attachMoveHandler() {
    if (moveHandlerAttached) return;
    moveHandlerAttached = true;
    map.on("moveend", refreshSoon);

    // Base style swap nukes layers; re-add if toggled on
    map.on("styledata", () => {
      const ids = list();
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        if (!state[id]) continue;
        try { ensureLayers(id); } catch {}
      }
      refreshSoon();
    });
  }

  function detachMoveHandlerIfNone() {
    if (!moveHandlerAttached) return;
    if (anyOn()) return;
    try { map.off("moveend", refreshSoon); } catch {}
    moveHandlerAttached = false;
  }

  function set(id, on) {
    if (!CFG[id]) return false;

    const next = !!on;
    state[id] = next;

    if (next) {
      try { ensureLayers(id); } catch {}
      attachMoveHandler();
      setStatus("Kveikt: " + CFG[id].label);
      refreshSoon();
    } else {
      // stop inflight
      if (inflight[id]) {
        try { inflight[id].abort(); } catch {}
        inflight[id] = null;
      }
      lastKey[id] = "";
      try { removeLayers(id); } catch {}
      setStatus("Slökkt: " + CFG[id].label);
      detachMoveHandlerIfNone();
    }

    return true;
  }

  function toggle(id) {
    return set(id, !isOn(id));
  }

  function esc(s) {
    const str = String(s);
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function round(n, d) {
    const p = Math.pow(10, d);
    return Math.round(n * p) / p;
  }

  window.kortAddons = { toggle, set, isOn, refresh, list };
})();