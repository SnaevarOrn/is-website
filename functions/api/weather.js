// /functions/api/weather.js
// OpenWeatherMap tiles proxy for ís.is (Cloudflare Pages Functions)
//
// GET /api/weather?layer=precipitation_new&z=7&x=32&y=20
//
// Returns: image/png
//
// Notes:
// - Whitelist layers only (no arbitrary URLs)
// - Caches at edge to be nice to OpenWeather
// - Keeps API key server-side

"use strict";

const OWM_TILE_HOST = "https://tile.openweathermap.org/map";
const CACHE_TTL_S = 300; // 5 min (enough for “live-ish”)

const LAYERS = {
  clouds_new: true,
  precipitation_new: true,
  pressure_new: true,
  wind_new: true,
  temp_new: true
};

export async function onRequestGet({ request, env, context }) {
  const url = new URL(request.url);

  const layer = (url.searchParams.get("layer") || "").trim();
  const z = Number(url.searchParams.get("z"));
  const x = Number(url.searchParams.get("x"));
  const y = Number(url.searchParams.get("y"));

  if (!LAYERS[layer]) return bad(400, "invalid_layer");
  if (!Number.isFinite(z) || !Number.isFinite(x) || !Number.isFinite(y)) return bad(400, "missing_or_invalid_xyz");
  if (z < 0 || z > 20) return bad(400, "z_out_of_range");
  if (x < 0 || y < 0) return bad(400, "xy_out_of_range");

  const key = env.OPENWEATHER_API_KEY || env.OWM_API_KEY || env.OPENWEATHER_KEY;
  if (!key) return bad(500, "missing_server_api_key");

  // Cache key must NOT include the secret
  const cacheKeyUrl =
    url.origin +
    "/api/weather?layer=" + encodeURIComponent(layer) +
    "&z=" + encodeURIComponent(String(z)) +
    "&x=" + encodeURIComponent(String(x)) +
    "&y=" + encodeURIComponent(String(y));

  const cacheKey = new Request(cacheKeyUrl, { method: "GET" });
  const cache = caches.default;

  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const upstream =
    `${OWM_TILE_HOST}/${encodeURIComponent(layer)}/${z}/${x}/${y}.png?appid=${encodeURIComponent(key)}`;

  let res;
  try {
    res = await fetch(upstream, {
      headers: { "accept": "image/png" },
      cf: { cacheTtl: CACHE_TTL_S, cacheEverything: true }
    });
  } catch {
    return bad(502, "upstream_fetch_failed");
  }

  if (!res.ok) return bad(502, "upstream_http_" + res.status);

  // Return image as-is + cache headers
  const out = new Response(res.body, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": `public, max-age=${CACHE_TTL_S}`,
      "X-Weather-Source": "openweathermap-tiles"
    }
  });

  try { context.waitUntil(cache.put(cacheKey, out.clone())); } catch {}
  return out;
}

function bad(status, error) {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}
