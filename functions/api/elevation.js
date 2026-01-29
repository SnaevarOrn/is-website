// functions/api/elevation.js
// Elevation lookup for ís.is (Cloudflare Pages Functions)
//
// GET /api/elevation?lat=64.14&lng=-21.94
// Response: { ok, lat, lng, elevation_m, source }
//
// Uses Open-Meteo Elevation API + Cloudflare edge cache.
// No cookies. No user tracking.

export async function onRequestGet(context) {
  const { request } = context;

  // CORS is optional when same-origin; keep permissive for local testing.
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  const url = new URL(request.url);

  // Accept both styles: lat/lng OR latitude/longitude
  const latStr = url.searchParams.get("lat") ?? url.searchParams.get("latitude");
  const lngStr = url.searchParams.get("lng") ?? url.searchParams.get("lon") ?? url.searchParams.get("longitude");

  const lat = Number(latStr);
  const lng = Number(lngStr);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return json(
      { ok: false, error: "missing_or_invalid_lat_lng" },
      400,
      corsHeaders
    );
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return json(
      { ok: false, error: "lat_lng_out_of_range" },
      400,
      corsHeaders
    );
  }

  // Normalize cache key (avoid infinite variants)
  const latN = round(lat, 5);
  const lngN = round(lng, 5);

  const cacheKey = new Request(
    `${url.origin}/api/elevation?lat=${encodeURIComponent(latN)}&lng=${encodeURIComponent(lngN)}`,
    { method: "GET" }
  );

  // Try edge cache first
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return withCors(cached, corsHeaders);

  // Upstream: Open-Meteo Elevation API
  const upstream = new URL("https://api.open-meteo.com/v1/elevation");
  upstream.searchParams.set("latitude", String(latN));
  upstream.searchParams.set("longitude", String(lngN));

  let data;
  try {
    const res = await fetch(upstream.toString(), {
      headers: { "accept": "application/json" },
      cf: {
        // Edge caching hints (still also writing to caches.default below)
        cacheTtl: 86400,
        cacheEverything: true,
      },
    });

    if (!res.ok) {
      return json(
        { ok: false, error: "upstream_http_" + res.status },
        502,
        corsHeaders
      );
    }

    data = await res.json();
  } catch (e) {
    return json(
      { ok: false, error: "upstream_fetch_failed" },
      502,
      corsHeaders
    );
  }

  // Open-Meteo returns: { elevation: [..], latitude: [..], longitude: [..] } for multi,
  // and for single it may still be arrays. We handle both.
  const elevation = extractElevation(data);

  if (!Number.isFinite(elevation)) {
    return json(
      { ok: false, error: "invalid_upstream_payload" },
      502,
      corsHeaders
    );
  }

  const body = {
    ok: true,
    lat: latN,
    lng: lngN,
    elevation_m: elevation,
    source: "open-meteo",
  };

  // Cache response at the edge (1 day)
  const response = json(body, 200, {
    ...corsHeaders,
    "Cache-Control": "public, max-age=86400",
  });

  // Write to cache (best effort)
  context.waitUntil(cache.put(cacheKey, response.clone()));

  return response;
}

function extractElevation(payload) {
  if (!payload) return NaN;

  // Common: { elevation: [123.4] }
  if (Array.isArray(payload.elevation) && payload.elevation.length) {
    return Number(payload.elevation[0]);
  }

  // Sometimes single: { elevation: 123.4 }
  if (typeof payload.elevation === "number") {
    return payload.elevation;
  }

  return NaN;
}

function round(n, decimals) {
  const p = Math.pow(10, decimals);
  return Math.round(n * p) / p;
}

function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

function withCors(response, corsHeaders) {
  // Add/override CORS headers on cached responses
  const h = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders)) h.set(k, v);
  return new Response(response.body, { status: response.status, headers: h });
}
