// assets/js/pages/kort.addons.overpass.js
// Overpass addons (vector overlays) for kort
//
// Requires:
// - window.kortMap
// - /api/overpass (Cloudflare function)
//
// Exposes:
// - window.kortAddonsOverpass.toggle(id)
// - window.kortAddonsOverpass.set(id, on)
// - window.kortAddonsOverpass.isOn(id)
// - window.kortAddonsOverpass.refresh()
// - window.kortAddonsOverpass.list()
//
// Also ensures a shared router exists at:
// - window.kortAddons  (toggle/set/isOn/refresh/list across ALL addon backends)

"use strict";

(() => {
  const map = window.kortMap;
  if (!map) return;

  /* =========================================================
     CFG: what overlays exist + minZoom gates (UI side)
     NOTE: Your API has its OWN minZoom gates too.
     If UI minZoom < API minZoom => overlay appears "empty" below API gate.
     ========================================================= */
  const CFG = {
    air:     { label: "Flugvellir + þyrlupallar", minZoom: 5,  type: "mix" },
    harbors: { label: "Hafnir + smábátahafnir",   minZoom: 6,  type: "mix" },
    fuel:    { label: "Bensínstöðvar",            minZoom: 8,  type: "points" },

    // ⚠️ API has huts minZoom=9 in your overpass function.
    // Keep UI consistent unless you intentionally want "empty until 9".
    huts:    { label: "Skálar + skjól",           minZoom: 9,  type: "points" },

    lights:  { label: "Vitar",                    minZoom: 4,  type: "points" },

    // Peaks can be MANY -> clustering makes zoomed-out map usable.
    // Edit clusterMaxZoom / clusterRadius to tune behavior.
    peaks:   { label: "Fjallatindar",             minZoom: 8,  type: "points", cluster: true, clusterMaxZoom: 12, clusterRadius: 45 },

    // Lines are heavy -> keep minZoom higher.
    roads:   { label: "Vegagrind (OSM)",          minZoom: 12, type: "lines" },

    waterfalls: { label: "Fossar", minZoom: 5, type: "points" },
    caves:      { label: "Hellar", minZoom: 4, type: "points" },
    viewpoints: { label: "Útsýnispunktar", minZoom: 6, type: "points" },
    hotsprings: { label: "Heitar laugar / uppsprettur", minZoom: 4, type: "points" },
  };

  /* =========================================================
     STYLE: colors per overlay id
     - Edit freely.
     - fill = inside color for point circles / cluster bubbles
     - stroke = outline color for point circles / cluster bubbles
     - line = line color (for line overlays like roads)
     ========================================================= */
  const STYLE = {
    // Requested palette
    lights:     { fill: "#ff8c1a", stroke: "#111" },     // vitarnir: appelsínugult
    waterfalls: { fill: "#7fd6ff", stroke: "#111" },     // fossar: ljósblátt
    hotsprings: { fill: "#0b3d91", stroke: "#e8f1ff" },  // heitar laugar: dökkblátt (með ljósum hring)
    huts:       { fill: "#7CFF7A", stroke: "#111" },     // skálar/skjól: ljósgrænt

    // Extras (stilltu eins og þú vilt)
    caves:      { fill: "#a78bfa", stroke: "#111" },     // fjólublátt
    viewpoints: { fill: "#fbbf24", stroke: "#111" },     // gult/amber
    fuel:       { fill: "#ef4444", stroke: "#111" },     // rautt
    peaks:      { fill: "#e5e7eb", stroke: "#111" },     // ljósgrátt

    // Mix layers
    air:        { fill: "#22d3ee", stroke: "#111" },     // cyan
    harbors:    { fill: "#34d399", stroke: "#111" },     // grænt

    // Lines
    roads:      { line: "#94a3b8" }                      // mildur gráblár
  };

  function styleFor(id) {
    // Default fallback if id isn't in STYLE
    return STYLE[id] || { fill: "#60a5fa", stroke: "#111", line: "#94a3b8" };
  }

  const state = {};      // id -> boolean
  const inflight = {};   // id -> AbortController
  const lastKey = {};    // id -> cache key for bbox+zoom
  let moveHandlerAttached = false;
  let refreshTimer = null;

  function sid(id) { return "op-" + id; }
  function lidPoint(id) { return "op-" + id + "-pt"; }
  function lidLine(id)  { return "op-" + id + "-ln"; }

  // Cluster layers (only created if CFG[id].cluster === true)
  function lidCluster(id) { return "op-" + id + "-cl"; }
  function lidClusterCount(id) { return "op-" + id + "-clc"; }

  function isOn(id) { return !!state[id]; }
  function list() { return Object.keys(CFG); }

  function anyOn() {
    const keys = list();
    for (let i = 0; i < keys.length; i++) if (state[keys[i]]) return true;
    return false;
  }

  function ensureLayers(id) {
    const sourceId = sid(id);
    const cfg = CFG[id] || {};
    const st = styleFor(id);

    /* =========================================================
       Source: one GeoJSON source per overlay id
       - We optionally enable clustering if cfg.cluster is true.
       - Clustering ONLY affects Point features.
       ========================================================= */
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },

        // ✅ Clustering knobs (only used when cfg.cluster === true)
        cluster: !!cfg.cluster,
        clusterMaxZoom: cfg.clusterMaxZoom ?? 12,
        clusterRadius: cfg.clusterRadius ?? 45
      });
    }

    /* =========================================================
       Cluster layers (bubble + count)
       - Only created if cfg.cluster === true
       - Bubble uses same fill/stroke as the overlay style
       ========================================================= */
    if (cfg.cluster) {
      if (!map.getLayer(lidCluster(id))) {
        map.addLayer({
          id: lidCluster(id),
          type: "circle",
          source: sourceId,
          filter: ["has", "point_count"],
          paint: {
            "circle-radius": ["step", ["get", "point_count"], 16, 25, 22, 100, 28],
            "circle-color": st.fill,
            "circle-stroke-color": st.stroke,
            "circle-stroke-width": 1.2,
            "circle-opacity": 0.75
          }
        });
      }

      if (!map.getLayer(lidClusterCount(id))) {
        map.addLayer({
          id: lidClusterCount(id),
          type: "symbol",
          source: sourceId,
          filter: ["has", "point_count"],
          layout: {
            "text-field": "{point_count_abbreviated}",
            "text-size": 12
          },
          paint: { "text-color": "#111" }
        });
      }
    }

    /* =========================================================
       Points layer
       - If clustering is enabled, we must hide clustered points
         by excluding features that have point_count.
       ========================================================= */
    if (!map.getLayer(lidPoint(id))) {
      map.addLayer({
        id: lidPoint(id),
        type: "circle",
        source: sourceId,
        filter: cfg.cluster
          ? ["all", ["==", ["geometry-type"], "Point"], ["!", ["has", "point_count"]]]
          : ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            7, 3,
            12, 5,
            15, 7
          ],
          // ✅ Color per overlay id (edit STYLE above)
          "circle-color": st.fill,
          "circle-stroke-width": 1.2,
          "circle-stroke-color": st.stroke,
          "circle-opacity": 0.9,
          "circle-stroke-opacity": 0.95
        }
      });
    }

    /* =========================================================
       Lines layer (LineString only)
       - Uses st.line if provided, otherwise falls back.
       ========================================================= */
    if (!map.getLayer(lidLine(id))) {
      map.addLayer({
        id: lidLine(id),
        type: "line",
        source: sourceId,
        filter: ["==", ["geometry-type"], "LineString"],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": st.line || "#94a3b8",
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

    /* =========================================================
       One-time click handler:
       1) If user clicks a cluster bubble -> expand/zoom in
       2) Otherwise: show popup with name + "kind" field
       ========================================================= */
    if (!map.__opClickBound) {
      map.__opClickBound = true;

      map.on("click", (e) => {
        // 1) Cluster click => zoom in (no popup)
        const clLayers = [];
        const keys0 = Object.keys(CFG);
        for (let i = 0; i < keys0.length; i++) {
          const k = keys0[i];
          if (CFG[k] && CFG[k].cluster) clLayers.push(lidCluster(k));
        }
        if (clLayers.length) {
          const hits = map.queryRenderedFeatures(e.point, { layers: clLayers });
          if (hits && hits.length) {
            const f0 = hits[0];
            const srcId = f0.layer && f0.layer.source;
            const clusterId = f0.properties && f0.properties.cluster_id;
            const src0 = srcId && map.getSource(srcId);
            if (src0 && typeof src0.getClusterExpansionZoom === "function") {
              src0.getClusterExpansionZoom(clusterId, (err, zoom) => {
                if (err) return;
                map.easeTo({ center: f0.geometry.coordinates, zoom });
              });
              return;
            }
          }
        }

        // 2) Normal feature popup
        const layers = [];
        const keys = Object.keys(CFG);
        for (let i = 0; i < keys.length; i++) {
          layers.push(lidPoint(keys[i]), lidLine(keys[i]));
        }

        const features = map.queryRenderedFeatures(e.point, { layers });
        if (!features || !features.length) return;

        const f = features[0];
        const p = f.properties || {};
        const name = p.name || p.osm_id || "Staður";
        const kind =
          p.amenity || p.tourism || p.aeroway || p.highway || p.harbour ||
          p.man_made || p.natural || p.leisure || "";

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
    // Remove cluster layers first (if they exist), then normal layers, then source.
    const lc = lidCluster(id);
    const lcc = lidClusterCount(id);
    const lp = lidPoint(id);
    const ll = lidLine(id);

    try { if (map.getLayer(lc)) map.removeLayer(lc); } catch {}
    try { if (map.getLayer(lcc)) map.removeLayer(lcc); } catch {}
    try { if (map.getLayer(lp)) map.removeLayer(lp); } catch {}
    try { if (map.getLayer(ll)) map.removeLayer(ll); } catch {}

    const s = sid(id);
    try { if (map.getSource(s)) map.removeSource(s); } catch {}
  }

  function bboxKey(bounds, z) {
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
    if (lastKey[id] === key) return;
    lastKey[id] = key;

    // Abort previous
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
      // silent
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
      refreshSoon();
    } else {
      if (inflight[id]) {
        try { inflight[id].abort(); } catch {}
        inflight[id] = null;
      }
      lastKey[id] = "";
      try { removeLayers(id); } catch {}
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

  // ✅ Export Overpass backend under its own name
  window.kortAddonsOverpass = { toggle, set, isOn, refresh, list };

  /* =========================
     ✅ Shared router: window.kortAddons
     - merges live + overpass so menu can call ONE thing
     - avoids "overwriting" when multiple addon modules load
     ========================= */

  function ensureRouter() {
    if (window.kortAddons && window.kortAddons.__isRouter) return;

    window.kortAddons = {
      __isRouter: true,

      toggle: function (id) {
        const live = window.kortAddonsLive;
        const over = window.kortAddonsOverpass;

        if (live && typeof live.list === "function") {
          const keys = live.list();
          for (let i = 0; i < keys.length; i++) if (keys[i] === id) return live.toggle(id);
        }
        if (over && typeof over.list === "function") {
          const keys = over.list();
          for (let i = 0; i < keys.length; i++) if (keys[i] === id) return over.toggle(id);
        }
        return false;
      },

      set: function (id, on) {
        const live = window.kortAddonsLive;
        const over = window.kortAddonsOverpass;

        if (live && typeof live.list === "function") {
          const keys = live.list();
          for (let i = 0; i < keys.length; i++) if (keys[i] === id) return live.set(id, on);
        }
        if (over && typeof over.list === "function") {
          const keys = over.list();
          for (let i = 0; i < keys.length; i++) if (keys[i] === id) return over.set(id, on);
        }
        return false;
      },

      isOn: function (id) {
        const live = window.kortAddonsLive;
        const over = window.kortAddonsOverpass;

        if (live && typeof live.isOn === "function") {
          if (typeof live.list === "function") {
            const keys = live.list();
            for (let i = 0; i < keys.length; i++) if (keys[i] === id) return !!live.isOn(id);
          }
        }

        if (over && typeof over.isOn === "function") {
          if (typeof over.list === "function") {
            const keys = over.list();
            for (let i = 0; i < keys.length; i++) if (keys[i] === id) return !!over.isOn(id);
          }
        }

        return false;
      },

      refresh: function () {
        const live = window.kortAddonsLive;
        const over = window.kortAddonsOverpass;
        try { if (live && typeof live.refresh === "function") live.refresh(); } catch {}
        try { if (over && typeof over.refresh === "function") over.refresh(); } catch {}
      },

      list: function () {
        const out = [];
        const pushUnique = (arr) => {
          for (let i = 0; i < arr.length; i++) {
            const v = arr[i];
            let exists = false;
            for (let j = 0; j < out.length; j++) if (out[j] === v) { exists = true; break; }
            if (!exists) out.push(v);
          }
        };

        const live = window.kortAddonsLive;
        const over = window.kortAddonsOverpass;

        if (live && typeof live.list === "function") pushUnique(live.list());
        if (over && typeof over.list === "function") pushUnique(over.list());
        return out;
      }
    };
  }

  ensureRouter();
})();
