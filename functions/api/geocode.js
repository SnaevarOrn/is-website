// /functions/api/geocode.js
// Geocoding proxy for ís.is — OpenStreetMap Nominatim
// Privacy-first: no cookies, no storage, no tracking.

"use strict";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "is.is-kort/1.0 (contact: admin@is.is)"; // breyttu ef þú vilt

// Simple in-memory cooldown per IP (best-effort; edge-scoped)
const LAST_REQUEST = new Map();
const MIN_INTERVAL_MS = 1200; // 1.2s — play nice with Nominatim

function rateLimit(key) {
  const now = Date.now();
  const last = LAST_REQUEST.get(key) || 0;
  if (now - last < MIN_INTERVAL_MS) return false;
  LAST_REQUEST.set(key, now);
  return true;
}

export async function onRequestGet({ request }) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();

  if (!q || q.length < 2) {
    return json(
      { ok: false, error: "query too short" },
      400
    );
  }

  // Best-effort client key (masked IP if available)
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

  // Bias results towards Iceland, but allow global
  const params = new URLSearchParams({
    q,
    format: "jsonv2",
    addressdetails: "1",
    limit: "1",
    countrycodes: "is",      // remove this line if you want global-only searches
    accept_language: "is",
    dedupe: "1"
  });

  const url = `${NOMINATIM_URL}?${params.toString()}`;

  let res;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "application/json"
      },
      cf: {
        cacheTtl: 86400,           // cache 24h at edge
        cacheEverything: true
      }
    });
  } catch (e) {
    return json(
      { ok: false, error: "fetch failed" },
      502
    );
  }

  if (!res.ok) {
    return json(
      { ok: false, error: `upstream ${res.status}` },
      502
    );
  }

  const data = await res.json();

  if (!Array.isArray(data) || data.length === 0) {
    return json(
      { ok: true, result: null },
      200
    );
  }

  const hit = data[0];

  const lat = Number(hit.lat);
  const lng = Number(hit.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return json(
      { ok: false, error: "invalid coordinates" },
      500
    );
  }

  // Build a friendly label
  const addr = hit.address || {};
  const labelParts = [
    addr.road,
    addr.house_number,
    addr.city || addr.town || addr.village,
    addr.postcode,
    addr.country
  ].filter(Boolean);

  const label = labelParts.join(", ") || hit.display_name;

  return json(
    {
      ok: true,
      result: {
        lat,
        lng,
        label
      }
    },
    200,
    {
      // Explicit privacy stance
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