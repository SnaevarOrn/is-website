// /functions/api/geocode.js
// Geocoding proxy for ís.is — OpenStreetMap Nominatim
// Matches kort.search.js (supports multiple results + mobile form submit)
//
// Privacy-first: no cookies, no storage, no tracking.

"use strict";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "is.is-kort/1.1 (contact: admin@is.is)"; // breyttu ef þú vilt

// Best-effort per-IP cooldown (edge-scoped)
const LAST_REQUEST = new Map();
const MIN_INTERVAL_MS = 1200; // play nice with Nominatim

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
    return json(
      { ok: false, error: "rate limited" },
      429,
      { "Retry-After": "2" }
    );
  }

  // Bias towards Iceland; remove countrycodes to allow global-only
  const params = new URLSearchParams({
    q,
    format: "jsonv2",
    addressdetails: "1",
    limit: String(limit),
    countrycodes: "is",
    accept_language: "is",
    dedupe: "1"
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
    return json({ ok: true, results: [] }, 200);
  }

  // Normalize results for frontend
  const results = data
    .map((hit) => {
      const lat = Number(hit.lat);
      const lng = Number(hit.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

      const addr = hit.address || {};
      const labelParts = [
        addr.road,
        addr.house_number,
        addr.city || addr.town || addr.village,
        addr.postcode,
        addr.country
      ].filter(Boolean);

      const label = labelParts.join(", ") || hit.display_name;

      return { lat, lng, label };
    })
    .filter(Boolean);

  return json(
    {
      ok: true,
      results
    },
    200,
    {
      "Cache-Control": "public, max-age=86400",
      "X-Privacy": "no-cookies; no-storage"
    }
  );
}

/* =========================
   Helpers
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
