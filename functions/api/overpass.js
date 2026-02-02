// /functions/api/overpass.js
// Overpass proxy for ís.is (Cloudflare Pages Functions)
//
// GET /api/overpass?layer=air&bbox=minLng,minLat,maxLng,maxLat&z=12
//
// Security:
// - Whitelisted layers only (no arbitrary Overpass queries)
// - Rate limit per IP
// - Hard caps on zoom + bbox size (diagonal km), per layer
//
// Response:
// { ok: true, layer, bbox: [minLng,minLat,maxLng,maxLat], geojson: FeatureCollection, meta: {...} }

"use strict";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const USER_AGENT = "is.is-kort/1.0 (contact: rokogstormur@gmail.com)"; // breyttu ef þú vilt

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
const LAYERS = {
  // Airports + helipads
  air: { minZoom: 7, maxDiagKm: 900 },

  // Harbors / marinas / piers (coastal POIs)
  harbors: { minZoom: 8, maxDiagKm: 350 },

  // Fuel stations
  fuel: { minZoom: 10, maxDiagKm: 140 },

  // Mountain huts / cabins / shelters
  huts: { minZoom: 9, maxDiagKm: 220 },

  // Lighthouses
  lights: { minZoom: 5, maxDiagKm: 1220 },

  // Mountain peaks (nice “wow”, but can be many)
  peaks: { minZoom: 8, maxDiagKm: 260 },

  // Road classes (LINES) — expensive: keep tight
  roads: { minZoom: 12, maxDiagKm: 70 }
};

export async function onRequestGet({ request, context }) {
  const url = new URL(request.url);

  const layer = (url.searchParams.get("layer") || "").trim();
  const bboxStr = (url.searchParams.get("bbox") || "").trim();
  const z = Number(url.searchParams.get("z") || "0");

  if (!LAYERS[layer]) return json({ ok: false, error: "invalid_layer" }, 400);
  if (!bboxStr) return json({ ok: false, error: "missing_bbox" }, 400);
  if (!Number.isFinite(z)) return json({ ok: false, error: "invalid_zoom" }, 400);

  const bbox = parseBBox(bboxStr);
  if (!bbox) return json({ ok: false, error: "invalid_bbox" }, 400);

  const policy = LAYERS[layer];

  // Zoom gate
  if (z < policy.minZoom) {
    return json(
      { ok: false, error: "zoom_too_low", minZoom: policy.minZoom },
      400
    );
  }

  // BBox size gate
  const diagKm = bboxDiagonalKm(bbox);
  if (diagKm > policy.maxDiagKm) {
    return json(
      { ok: false, error: "bbox_too_large", maxDiagKm: policy.maxDiagKm, diagKm: round(diagKm, 1) },
      400
    );
  }

  // Rate limit (best-effort)
  const ip =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For") ||
    "unknown";

  if (!rateLimit(ip)) {
    return json({ ok: false, error: "rate_limited" }, 429, { "Retry-After": "2" });
  }

  // Normalize bbox for caching (round to 4 decimals ~ 11 m lat-ish; ok)
  const nb = bbox.map((n) => round(n, 4));
  const cacheKeyUrl =
    url.origin +
    "/api/overpass?layer=" + encodeURIComponent(layer) +
    "&bbox=" + encodeURIComponent(nb.join(",")) +
    "&z=" + encodeURIComponent(String(Math.floor(z)));

  const cacheKey = new Request(cacheKeyUrl, { method: "GET" });
  const cache = caches.default;

  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  // Build query (whitelist only)
  const query = buildQuery(layer, nb);

  // POST to Overpass
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
      cf: { cacheTtl: 900, cacheEverything: true } // hint, but we also cache ourselves
    });

    if (!res.ok) {
      return json({ ok: false, error: "upstream_http_" + res.status }, 502);
    }

    upstreamJson = await res.json();
  } catch {
    return json({ ok: false, error: "upstream_fetch_failed" }, 502);
  }

  // Convert OSM JSON -> GeoJSON (nodes => points, ways(with geometry) => lines/polygons, relations ignored)
  const geojson = osmToGeoJSON(upstreamJson);

  const body = {
    ok: true,
    layer,
    bbox: nb,
    geojson,
    meta: {
      zoom: Math.floor(z),
      diagKm: round(diagKm, 2),
      elements: Array.isArray(upstreamJson && upstreamJson.elements) ? upstreamJson.elements.length : 0
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
   Query builder
   ========================= */

function buildQuery(layer, b) {
  // Overpass bbox is (south,west,north,east): (minLat,minLng,maxLat,maxLng)
  const south = b[1], west = b[0], north = b[3], east = b[2];
  const bbox = `${south},${west},${north},${east}`;

  // Keep timeouts modest; we’re gating bbox+zoom anyway
  const head = `[out:json][timeout:25];`;
  const outGeom = `out geom;`;

  // Helpers
  const n = (f) => `node${f}(${bbox});`;
  const w = (f) => `way${f}(${bbox});`;

  // NOTE:
  // - We use out geom so "way" includes geometry[] points.
  // - We deliberately ignore relations for simplicity (and speed).

  if (layer === "air") {
    // aeroway=aerodrome (often ways) + helipad + airport terminals sometimes
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
    // Road skeleton: motorway/trunk/primary/secondary/tertiary in bbox
    // Uses highways as lines. Keep bbox tiny via policy.
    return (
      head +
      `(` +
        w(`["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"]`) +
      `);` +
      outGeom
    );
  }

  // Should never happen (whitelist)
  return head + `out;`;
}

/* =========================
   OSM JSON -> GeoJSON
   ========================= */

function osmToGeoJSON(payload) {
  const fc = { type: "FeatureCollection", features: [] };
  const els = payload && Array.isArray(payload.elements) ? payload.elements : [];
  for (let i = 0; i < els.length; i++) {
    const el = els[i];
    const f = elementToFeature(el);
    if (f) fc.features.push(f);
  }
  return fc;
}

function elementToFeature(el) {
  if (!el || !el.type) return null;

  // Node -> Point
  if (el.type === "node" && isFinite(el.lat) && isFinite(el.lon)) {
    return {
      type: "Feature",
      geometry: { type: "Point", coordinates: [el.lon, el.lat] },
      properties: propsFrom(el)
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

    // If it looks like an area AND closed -> Polygon
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
        properties: propsFrom(el)
      };
    }

    return {
      type: "Feature",
      geometry: { type: "LineString", coordinates: coords },
      properties: propsFrom(el)
    };
  }

  // Skip relations for now (they get heavy fast)
  return null;
}

function propsFrom(el) {
  const tags = el.tags || {};
  const name = tags.name || tags["name:is"] || tags["name:en"] || "";
  const p = {
    osm_type: el.type,
    osm_id: el.id,
    name
  };
  // copy a small subset of tags to keep payload light
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
