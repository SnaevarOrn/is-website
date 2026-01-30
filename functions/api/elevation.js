// functions/api/elevation.js
// Elevation lookup for ís.is (Cloudflare Pages Functions)
// GET /api/elevation?lat=64.14&lng=-21.94
// Response: { ok, lat, lng, elevation_m, source }
//
// Goals:
// - Stable edge cache key (rounded coords)
// - Cloudflare edge cache + upstream caching
// - Safe CORS for testing
// - Clear cache headers (s-maxage + stale-while-revalidate)
// - Robust payload parsing

export async function onRequest(context) {
  const request = context.request;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "GET") {
    return json({ ok: false, error: "method_not_allowed" }, 405, corsHeaders);
  }

  const url = new URL(request.url);

  const latStr = url.searchParams.get("lat") || url.searchParams.get("latitude");
  const lngStr =
    url.searchParams.get("lng") ||
    url.searchParams.get("lon") ||
    url.searchParams.get("longitude");

  const lat = Number(latStr);
  const lng = Number(lngStr);

  if (!isFinite(lat) || !isFinite(lng)) {
    return json({ ok: false, error: "missing_or_invalid_lat_lng" }, 400, corsHeaders);
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return json({ ok: false, error: "lat_lng_out_of_range" }, 400, corsHeaders);
  }

  // Round to reduce cache fragmentation
  const latN = round(lat, 5);
  const lngN = round(lng, 5);

  // Stable cache key (same origin, normalized query)
  const cacheKeyUrl =
    url.origin +
    "/api/elevation?lat=" + encodeURIComponent(String(latN)) +
    "&lng=" + encodeURIComponent(String(lngN));

  const cacheKey = new Request(cacheKeyUrl, { method: "GET" });

  const cache = caches.default;

  // Edge cache hit
  try {
    const cached = await cache.match(cacheKey);
    if (cached) return withCors(cached, corsHeaders);
  } catch (e) {
    // ignore cache errors
  }

  // Upstream (Open-Meteo elevation)
  const upstream =
    "https://api.open-meteo.com/v1/elevation" +
    "?latitude=" + encodeURIComponent(String(latN)) +
    "&longitude=" + encodeURIComponent(String(lngN));

  let payload;
  try {
    const res = await fetch(upstream, {
      headers: { accept: "application/json" },
      // Also cache upstream at the edge (belt + suspenders)
      cf: { cacheTtl: 86400, cacheEverything: true }
    });

    if (!res.ok) {
      return json({ ok: false, error: "upstream_http_" + res.status }, 502, corsHeaders);
    }
    payload = await res.json();
  } catch (e) {
    return json({ ok: false, error: "upstream_fetch_failed" }, 502, corsHeaders);
  }

  const elevation = extractElevation(payload);
  if (!isFinite(elevation)) {
    return json({ ok: false, error: "invalid_upstream_payload" }, 502, corsHeaders);
  }

  const body = {
    ok: true,
    lat: latN,
    lng: lngN,
    elevation_m: elevation,
    source: "open-meteo"
  };

  // Cache policy: 1 day + SWR 1 day
  const cacheControl = "public, max-age=86400, s-maxage=86400, stale-while-revalidate=86400";

  const response = json(body, 200, Object.assign({}, corsHeaders, {
    "Cache-Control": cacheControl
  }));

  // Save to edge cache (best effort)
  try {
    context.waitUntil(cache.put(cacheKey, response.clone()));
  } catch (e) {}

  return response;
}

function extractElevation(payload) {
  if (!payload) return NaN;

  // Typical: { elevation: [123.4] }
  if (payload.elevation && Array.isArray(payload.elevation) && payload.elevation.length) {
    return Number(payload.elevation[0]);
  }

  // Sometimes: { elevation: 123.4 }
  if (typeof payload.elevation === "number") {
    return payload.elevation;
  }

  return NaN;
}

function round(n, decimals) {
  const p = Math.pow(10, decimals);
  return Math.round(n * p) / p;
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status: status,
    headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, headers || {})
  });
}

function withCors(response, corsHeaders) {
  // Clone so we don't consume the cached body stream
  const r = response.clone();
  const h = new Headers(r.headers);
  for (const k in corsHeaders) h.set(k, corsHeaders[k]);
  return new Response(r.body, { status: r.status, headers: h });
}
