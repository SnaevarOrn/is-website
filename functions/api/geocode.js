// /functions/api/geocode.js
// Geocoding proxy for ís.is — OpenStreetMap Nominatim
// Matches kort.search.js (supports multiple results + mobile form submit)
//
// Privacy-first: no cookies, no storage, no tracking.

"use strict";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "is.is-kort/1.2 (contact: admin@is.is)"; // settu contact sem þú vilt

// Best-effort per-IP cooldown (edge-scoped)
const LAST_REQUEST = new Map();
const MIN_INTERVAL_MS = 1200; // play nice with Nominatim

// Dedupe threshold (meters) for "same place shown twice" cases
const DEDUPE_EPS_M = 120;

function rateLimit(key) {
  const now = Date.now();
  const last = LAST_REQUEST.get(key) || 0;
  if (now - last < MIN_INTERVAL_MS) return false;
  LAST_REQUEST.set(key, now);
  return true;
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();

  // limit: frontend uses up to 5; allow 2–10
  let limit = Number(url.searchParams.get("limit") || 5);
  if (!Number.isFinite(limit)) limit = 5;
  limit = Math.max(2, Math.min(10, limit));

  if (!q || q.length < 2) {
    return json({ ok: false, error: "query too short" }, 400);
  }

  // Best-effort client key
  const ip =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For") ||
    "unknown";

  if (!rateLimit(ip)) {
    return json({ ok: false, error: "rate limited" }, 429, { "Retry-After": "2" });
  }

  // Bias towards Iceland; remove countrycodes to allow global-only
  const params = new URLSearchParams({
    q,
    format: "jsonv2",
    addressdetails: "1",
    limit: String(limit),
    countrycodes: "is",
    accept_language: "is",
    dedupe: "0" // we do our own dedupe (distance-based) for better control
  });

  const fetchUrl = `${NOMINATIM_URL}?${params.toString()}`;

  let res;
  try {
    res = await fetch(fetchUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "application/json"
      },
      cf: {
        cacheTtl: 86400,       // cache 24h at edge
        cacheEverything: true
      }
    });
  } catch {
    return json({ ok: false, error: "fetch failed" }, 502);
  }

  if (!res.ok) {
    return json({ ok: false, error: `upstream ${res.status}` }, 502);
  }

  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) {
    return json({ ok: true, results: [], meta: { raw: 0, deduped: 0 } }, 200);
  }

  // Normalize hits
  const hits = data
    .map((hit) => normalizeHit(hit))
    .filter(Boolean);

  if (!hits.length) {
    return json({ ok: true, results: [], meta: { raw: data.length, deduped: 0 } }, 200);
  }

  // Sort by "best" first so cluster representative is sensible
  hits.sort((a, b) => score(b) - score(a));

  // Distance-based dedupe clustering
  const clusters = [];
  for (const h of hits) {
    let bestIdx = -1;
    let bestD = Infinity;

    for (let i = 0; i < clusters.length; i++) {
      const c = clusters[i];
      const d = haversineMeters(h.lat, h.lng, c.lat, c.lng);
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0 && bestD <= DEDUPE_EPS_M) {
      const c = clusters[bestIdx];
      c.items.push(h);

      // Update centroid (simple mean)
      const n = c.items.length;
      c.lat = c.lat + (h.lat - c.lat) / n;
      c.lng = c.lng + (h.lng - c.lng) / n;

      // Keep the first item as representative because hits are pre-sorted by score
      // But if somehow later item is better, swap:
      if (score(h) > score(c.rep)) c.rep = h;
    } else {
      clusters.push({ lat: h.lat, lng: h.lng, rep: h, items: [h] });
    }
  }

  const results = clusters.map((c) => {
    const r = c.rep;
    return {
      lat: r.lat,
      lng: r.lng,
      label: r.label,

      // extra (safe to ignore on frontend)
      name: r.name,
      kind: r.kind,
      placeRank: r.placeRank,
      importance: r.importance,
      osm: r.osm,
      bounds: r.bounds,
      address: r.address,

      // how many merged into this result
      merged: c.items.length
    };
  });

  return json(
    {
      ok: true,
      results,
      meta: {
        raw: data.length,
        normalized: hits.length,
        deduped: results.length,
        eps_m: DEDUPE_EPS_M
      }
    },
    200,
    {
      "Cache-Control": "public, max-age=86400",
      "X-Privacy": "no-cookies; no-storage"
    }
  );
}

/* =========================
   Normalization + Labeling
   ========================= */

function normalizeHit(hit) {
  const lat = Number(hit.lat);
  const lng = Number(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const address = hit.address || {};
  const name =
    hit.name ||
    address.name ||
    address.island ||
    address.peak ||
    address.glacier ||
    address.hamlet ||
    address.locality ||
    address.village ||
    address.town ||
    address.city ||
    null;

  const kind = [hit.category, hit.type].filter(Boolean).join(":") || null;

  const placeRank = Number.isFinite(Number(hit.place_rank)) ? Number(hit.place_rank) : null;
  const importance = Number.isFinite(Number(hit.importance)) ? Number(hit.importance) : null;

  const osm = {
    type: hit.osm_type || null,
    id: Number.isFinite(Number(hit.osm_id)) ? Number(hit.osm_id) : null
  };

  const bounds = parseBounds(hit.boundingbox);

  const label = buildLabel({ hit, address, name });

  return {
    lat,
    lng,
    name,
    label,
    kind,
    placeRank,
    importance,
    osm,
    bounds,
    address
  };
}

function buildLabel({ hit, address, name }) {
  // Address-like result: road + house number first
  const isAddressy = !!(address.road && (address.house_number || address.house_name));

  const primary =
    isAddressy
      ? joinParts([address.road, address.house_number || address.house_name])
      : (name || firstDisplayChunk(hit.display_name) || "Staður");

  // Add context so Lundey variants become distinguishable
  // Prefer municipality/county-ish fields in Iceland (varies by data)
  const context =
    address.municipality ||
    address.city ||
    address.town ||
    address.village ||
    address.county ||
    address.state_district ||
    address.state ||
    address.region ||
    null;

  // postcode helps split same-name areas
  const postcode = address.postcode || null;

  // We generally don’t need “Ísland” repeated in every label;
  // keep it only if there is no other context.
  const wantCountry = !context;

  const parts = [primary];
  if (context) parts.push(context);
  if (postcode && !isAddressy) parts.push(postcode);
  if (wantCountry && address.country) parts.push(address.country);

  return parts.filter(Boolean).join(", ");
}

function firstDisplayChunk(displayName) {
  if (!displayName) return null;
  const s = String(displayName);
  const i = s.indexOf(",");
  return (i >= 0 ? s.slice(0, i) : s).trim() || null;
}

function joinParts(parts) {
  return parts.filter(Boolean).join(" ").trim();
}

/* =========================
   Scoring + Geo helpers
   ========================= */

function score(r) {
  // Importance usually 0..1 (higher is better)
  // place_rank: lower tends to be "more important" in Nominatim (broadly),
  // but not always. We'll use it as a weak tie-breaker.
  const imp = Number.isFinite(r.importance) ? r.importance : 0;
  const pr = Number.isFinite(r.placeRank) ? r.placeRank : 30;
  return imp * 100 - pr; // simple & stable
}

function parseBounds(bb) {
  // Nominatim boundingbox: [south, north, west, east] as strings
  if (!Array.isArray(bb) || bb.length !== 4) return null;
  const s = Number(bb[0]);
  const n = Number(bb[1]);
  const w = Number(bb[2]);
  const e = Number(bb[3]);
  if (![s, n, w, e].every(Number.isFinite)) return null;
  return { south: s, north: n, west: w, east: e };
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
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

/* =========================
   Response helper
   ========================= */

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers
    }
  });
}