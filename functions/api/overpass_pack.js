// /functions/api/overpass_pack.js
// Overpass pack proxy for ís.is (Cloudflare Pages Functions)
//
// GET /api/overpass_pack?layers=lights,waterfalls,hotsprings&bbox=minLng,minLat,maxLng,maxLat&z=12
//
// Goals:
// - One request from frontend for MANY overlays (pack)
// - Keep same security posture as /api/overpass:
//   - Whitelisted layers only
//   - Zoom + bbox diagonal caps per layer
//   - Basic per-IP rate limit
//   - Edge caching
//
// Response:
// {
//   ok: true,
//   layersRequested: [...],
//   layersIncluded: [...],
//   layersSkipped: [{ layer, reason, minZoom }],
//   bbox: [minLng,minLat,maxLng,maxLat],
//   geojson: FeatureCollection,
//   meta: { zoom, diagKm, perLayer: { lights: {elements, features}... }, totalFeatures }
// }

"use strict";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const USER_AGENT = "is.is-kort/1.0 (contact: rokogstormur@gmail.com)";

// Best-effort per-IP cooldown (edge-scoped)
const LAST_REQUEST = new Map();
const MIN_INTERVAL_MS = 1200;

function rateLimit(key) {
  const now = Date.now();
  const last = LAST_REQUEST.get(key) || 0;
  if (now - last < MIN_INTERVAL_MS) return false;
  LAST_REQUEST.set(key, now);
  return true;
}

// Layer policy (zoom + max bbox diagonal in km)
// Keep this in sync with /api/overpass if you want identical behavior.
const LAYERS = {
  air:        { minZoom: 5,  maxDiagKm: 1200 },
  harbors:    { minZoom: 6,  maxDiagKm: 500 },
  fuel:       { minZoom: 8,  maxDiagKm: 250 },
  huts:       { minZoom: 9,  maxDiagKm: 250 },
  lights:     { minZoom: 5,  maxDiagKm: 1220 },
  peaks:      { minZoom: 8,  maxDiagKm: 260 },
  roads:      { minZoom: 12, maxDiagKm: 70 },  // expensive
  waterfalls: { minZoom: 5,  maxDiagKm: 360 },
  caves:      { minZoom: 4,  maxDiagKm: 1220 },
  viewpoints: { minZoom: 6,  maxDiagKm: 250 },
  hotsprings: { minZoom: 4,  maxDiagKm: 1220 },
};

// Safety: cap how many layers can be requested in one pack call
const MAX_LAYERS_PER_REQUEST = 8;

export async function onRequestGet({ request, context }) {
  const url = new URL(request.url);

  const layersStr = (url.searchParams.get("layers") || "").trim();
  const bboxStr = (url.searchParams.get("bbox") || "").trim();
  const z = Number(url.searchParams.get("z") || "0");

  if (!layersStr) return json({ ok: false, error: "missing_layers" }, 400);
  if (!bboxStr) return json({ ok: false, error: "missing_bbox" }, 400);
  if (!Number.isFinite(z)) return json({ ok: false, error: "invalid_zoom" }, 400);

  const bbox = parseBBox(bboxStr);
  if (!bbox) return json({ ok: false, error: "invalid_bbox" }, 400);

  // Parse + sanitize requested layers
  const requested = layersStr
    .split(",")
    .map((s) => String(s || "").trim())
    .filter(Boolean);

  if (!requested.length) return json({ ok: false, error: "invalid_layers" }, 400);
  if (requested.length > MAX_LAYERS_PER_REQUEST) {
    return json({ ok: false, error: "too_many_layers", max: MAX_LAYERS_PER_REQUEST }, 400);
  }

  // Whitelist only
  const invalid = [];
  const layers = [];
  for (let i = 0; i < requested.length; i++) {
    const id = requested[i];
    if (!LAYERS[id]) invalid.push(id);
    else layers.push(id);
  }
  if (invalid.length) return json({ ok: false, error: "invalid_layer", invalid }, 400);

  const zoom = Math.floor(z);

  // BBox diagonal gate per-request (same diag for all layers)
  const diagKm = bboxDiagonalKm(bbox);

  // Reject if bbox too large for ANY requested layer
  const tooBig = [];
  for (let i = 0; i < layers.length; i++) {
    const id = layers[i];
    const pol = LAYERS[id];
    if (diagKm > pol.maxDiagKm) {
      tooBig.push({ layer: id, maxDiagKm: pol.maxDiagKm });
    }
  }
  if (tooBig.length) {
    return json(
      {
        ok: false,
        error: "bbox_too_large",
        diagKm: round(diagKm, 1),
        offenders: tooBig
      },
      400
    );
  }

  // Rate limit (best-effort) once per pack
  const ip =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For") ||
    "unknown";

  if (!rateLimit(ip)) {
    return json({ ok: false, error: "rate_limited" }, 429, { "Retry-After": "2" });
  }

  // Normalize bbox for caching (round to 4 decimals ~ 11 m lat-ish)
  const nb = bbox.map((n) => round(n, 4));

  // Cache key: layers sorted for stable cache
  const sortedLayers = layers.slice().sort();
  const cacheKeyUrl =
    url.origin +
    "/api/overpass_pack?layers=" + encodeURIComponent(sortedLayers.join(",")) +
    "&bbox=" + encodeURIComponent(nb.join(",")) +
    "&z=" + encodeURIComponent(String(zoom));

  const cacheKey = new Request(cacheKeyUrl, { method: "GET" });
  const cache = caches.default;

  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  // Decide which layers to include vs skip based on zoom
  const layersSkipped = [];
  const layersIncluded = [];
  for (let i = 0; i < layers.length; i++) {
    const id = layers[i];
    const pol = LAYERS[id];
    if (zoom < pol.minZoom) {
      layersSkipped.push({ layer: id, reason: "zoom_too_low", minZoom: pol.minZoom });
    } else {
      layersIncluded.push(id);
    }
  }

  // Fetch included layers sequentially (gentler on Overpass)
  // If you want more speed: you can parallelize with a small concurrency pool.
  const merged = { type: "FeatureCollection", features: [] };
  const perLayer = {};

  for (let i = 0; i < layersIncluded.length; i++) {
    const layer = layersIncluded[i];

    const query = buildQuery(layer, nb);
    let upstreamJson;

    try {
      const res = await fetch(OVERPASS_URL, {
        method: "POST",
        headers: {
          "User-Agent": USER_AGENT,
          "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
          "Accept": "application/json"
        },
        body: "data=" + encodeURIComponent(query),
        // modest caching hint (we also edge-cache below)
        cf: { cacheTtl: 900, cacheEverything: true }
      });

      if (!res.ok) {
        perLayer[layer] = { ok: false, error: "upstream_http_" + res.status };
        continue;
      }

      upstreamJson = await res.json();
    } catch {
      perLayer[layer] = { ok: false, error: "upstream_fetch_failed" };
      continue;
    }

    const geo = osmToGeoJSON(upstreamJson, layer);
    const elements = Array.isArray(upstreamJson && upstreamJson.elements) ? upstreamJson.elements.length : 0;

    perLayer[layer] = {
      ok: true,
      elements,
      features: geo.features.length
    };

    // Merge
    for (let k = 0; k < geo.features.length; k++) {
      merged.features.push(geo.features[k]);
    }
  }

  const body = {
    ok: true,
    layersRequested: layers,
    layersIncluded,
    layersSkipped,
    bbox: nb,
    geojson: merged,
    meta: {
      zoom,
      diagKm: round(diagKm, 2),
      perLayer,
      totalFeatures: merged.features.length
    }
  };

  const response = json(body, 200, {
    "Cache-Control": "public, max-age=900",
    "X-Privacy": "no-cookies; no-storage"
  });

  // Edge cache (best-effort)
  try { context.waitUntil(cache.put(cacheKey, response.clone())); } catch {}

  return response;
}

/* =========================
   Query builder (same logic as /api/overpass)
   ========================= */

function buildQuery(layer, b) {
  // Overpass bbox is (south,west,north,east): (minLat,minLng,maxLat,maxLng)
  const south = b[1], west = b[0], north = b[3], east = b[2];
  const bbox = `${south},${west},${north},${east}`;

  const head = `[out:json][timeout:25];`;
  const outGeom = `out geom;`;
  const n = (f) => `node${f}(${bbox});`;
  const w = (f) => `way${f}(${bbox});`;

  if (layer === "air") {
    return (
      head +
      `(` +
        n(`["aeroway"="aerodrome"]`) +
        w(`["aeroway"="aerodrome"]`) +
        n(`["aeroway"="helipad"]`) +
        w(`["aeroway"="helipad"]`) +
        n(`["aeroway"="terminal"]`) +
      `);` +
      outGeom
    );
  }

  if (layer === "harbors") {
    return (
      head +
      `(` +
        n(`["harbour"]`) +
        w(`["harbour"]`) +
        n(`["leisure"="marina"]`) +
        w(`["leisure"="marina"]`) +
        n(`["man_made"="pier"]`) +
        w(`["man_made"="pier"]`) +
      `);` +
      outGeom
    );
  }

  if (layer === "fuel") {
    return (
      head +
      `(` +
        n(`["amenity"="fuel"]`) +
        w(`["amenity"="fuel"]`) +
      `);` +
      outGeom
    );
  }

  if (layer === "huts") {
    return (
      head +
      `(` +
        n(`["tourism"="alpine_hut"]`) +
        w(`["tourism"="alpine_hut"]`) +
        n(`["amenity"="shelter"]`) +
        w(`["amenity"="shelter"]`) +
        n(`["tourism"="wilderness_hut"]`) +
        w(`["tourism"="wilderness_hut"]`) +
        n(`["building"="cabin"]`) +
        w(`["building"="cabin"]`) +
      `);` +
      outGeom
    );
  }

  if (layer === "lights") {
    return (
      head +
      `(` +
        n(`["man_made"="lighthouse"]`) +
        w(`["man_made"="lighthouse"]`) +
      `);` +
      outGeom
    );
  }

  if (layer === "peaks") {
    return (
      head +
      `(` +
        n(`["natural"="peak"]`) +
      `);` +
      `out;`
    );
  }

  if (layer === "roads") {
    return (
      head +
      `(` +
        w(`["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"]`) +
      `);` +
      outGeom
    );
  }

  if (layer === "waterfalls") {
    return (
      head +
      `(` +
        n(`["waterway"="waterfall"]`) +
        n(`["natural"="waterfall"]`) +
        w(`["waterway"="waterfall"]`) +
        w(`["natural"="waterfall"]`) +
      `);` +
      outGeom
    );
  }

  if (layer === "caves") {
    return (
      head +
      `(` +
        n(`["natural"="cave_entrance"]`) +
        w(`["natural"="cave_entrance"]`) +
      `);` +
      outGeom
    );
  }

  if (layer === "viewpoints") {
    return (
      head +
      `(` +
        n(`["tourism"="viewpoint"]`) +
        w(`["tourism"="viewpoint"]`) +
      `);` +
      outGeom
    );
  }

  if (layer === "hotsprings") {
    return (
      head +
      `(` +
        n(`["natural"="hot_spring"]`) +
        w(`["natural"="hot_spring"]`) +
        n(`["leisure"="spa"]`) +
        w(`["leisure"="spa"]`) +
      `);` +
      outGeom
    );
  }

  return head + `out;`;
}

/* =========================
   OSM JSON -> GeoJSON (adds properties.layer)
   ========================= */

function osmToGeoJSON(payload, layer) {
  const fc = { type: "FeatureCollection", features: [] };
  const els = payload && Array.isArray(payload.elements) ? payload.elements : [];
  for (let i = 0; i < els.length; i++) {
    const el = els[i];
    const f = elementToFeature(el, layer);
    if (f) fc.features.push(f);
  }
  return fc;
}

function elementToFeature(el, layer) {
  if (!el || !el.type) return null;

  // Node -> Point
  if (el.type === "node" && isFinite(el.lat) && isFinite(el.lon)) {
    return {
      type: "Feature",
      geometry: { type: "Point", coordinates: [el.lon, el.lat] },
      properties: propsFrom(el, layer)
    };
  }

  // Way -> LineString / Polygon using el.geometry[]
  if (el.type === "way" && Array.isArray(el.geometry) && el.geometry.length >= 2) {
    const coords = [];
    for (let i = 0; i < el.geometry.length; i++) {
      const p = el.geometry[i];
      if (!p || !isFinite(p.lat) || !isFinite(p.lon)) continue;
      coords.push([p.lon, p.lat]);
    }
    if (coords.length < 2) return null;

    const isClosed =
      coords.length >= 4 &&
      coords[0][0] === coords[coords.length - 1][0] &&
      coords[0][1] === coords[coords.length - 1][1];

    const tags = el.tags || {};
    const areaish =
      tags.area === "yes" ||
      tags.building ||
      tags.landuse ||
      tags.natural === "water" ||
      tags.amenity === "parking" ||
      tags.harbour;

    if (isClosed && areaish) {
      return {
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [coords] },
        properties: propsFrom(el, layer)
      };
    }

    return {
      type: "Feature",
      geometry: { type: "LineString", coordinates: coords },
      properties: propsFrom(el, layer)
    };
  }

  return null;
}

function propsFrom(el, layer) {
  const tags = el.tags || {};
  const name = tags.name || tags["name:is"] || tags["name:en"] || "";
  const p = {
    layer,               // ✅ important: tells frontend which overlay it belongs to
    osm_type: el.type,
    osm_id: el.id,
    name
  };

  // Keep payload light: copy only a subset of tags
  const keep = ["amenity", "tourism", "aeroway", "highway", "harbour", "man_made", "natural", "leisure", "operator"];
  for (let i = 0; i < keep.length; i++) {
    const k = keep[i];
    if (tags[k]) p[k] = tags[k];
  }
  return p;
}

/* =========================
   Utils
   ========================= */

function parseBBox(s) {
  // minLng,minLat,maxLng,maxLat
  const parts = s.split(",").map((x) => Number(String(x).trim()));
  if (parts.length !== 4) return null;
  for (let i = 0; i < 4; i++) if (!isFinite(parts[i])) return null;

  const minLng = parts[0], minLat = parts[1], maxLng = parts[2], maxLat = parts[3];
  if (minLng < -180 || minLng > 180) return null;
  if (maxLng < -180 || maxLng > 180) return null;
  if (minLat < -90 || minLat > 90) return null;
  if (maxLat < -90 || maxLat > 90) return null;
  if (maxLng <= minLng || maxLat <= minLat) return null;
  return [minLng, minLat, maxLng, maxLat];
}

function bboxDiagonalKm(b) {
  // b = [minLng,minLat,maxLng,maxLat]
  return haversineKm(b[1], b[0], b[3], b[2]);
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function round(n, d) {
  const p = Math.pow(10, d);
  return Math.round(n * p) / p;
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers
    }
  });
}