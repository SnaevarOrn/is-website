// functions/api/route.js
// Routing proxy for ís.is (Cloudflare Pages Functions)
// GET /api/route?from=-21.94,64.14&to=-21.90,64.13&profile=driving
// Returns: { ok, profile, from:{lng,lat}, to:{lng,lat}, distance_m, duration_s, geometry }

export async function onRequest(context) {
  const req = context.request;

  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405, cors);

  const url = new URL(req.url);

  const fromStr = url.searchParams.get("from");
  const toStr = url.searchParams.get("to");
  const profileRaw = (url.searchParams.get("profile") || "driving").toLowerCase();

  const profile = (profileRaw === "foot" || profileRaw === "walking") ? "foot" :
                  (profileRaw === "bike" || profileRaw === "bicycle") ? "bike" :
                  "driving";

  const from = parseLngLat(fromStr);
  const to = parseLngLat(toStr);

  if (!from || !to) {
    return json({ ok: false, error: "missing_or_invalid_from_to" }, 400, cors);
  }

  // Normalize to reduce cache variants
  const fromN = { lng: round(from.lng, 5), lat: round(from.lat, 5) };
  const toN   = { lng: round(to.lng, 5),   lat: round(to.lat, 5) };

  const cacheKey = new Request(
    url.origin + "/api/route?profile=" + encodeURIComponent(profile) +
    "&from=" + encodeURIComponent(fromN.lng + "," + fromN.lat) +
    "&to=" + encodeURIComponent(toN.lng + "," + toN.lat),
    { method: "GET" }
  );

  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return withCors(cached, cors);

  // OSRM public server (good for demo; consider self-hosting if heavy usage)
  const osrmProfile = (profile === "foot") ? "foot" : (profile === "bike") ? "bike" : "driving";

  const upstream =
    "https://router.project-osrm.org/route/v1/" + osrmProfile + "/" +
    fromN.lng + "," + fromN.lat + ";" + toN.lng + "," + toN.lat +
    "?overview=full&geometries=geojson&steps=false&annotations=false";

  let payload;
  try {
    const res = await fetch(upstream, {
      headers: { "accept": "application/json" },
      cf: { cacheTtl: 30, cacheEverything: true } // short cache: route changes with from
    });

    if (!res.ok) {
      return json({ ok: false, error: "upstream_http_" + res.status }, 502, cors);
    }
    payload = await res.json();
  } catch (e) {
    return json({ ok: false, error: "upstream_fetch_failed" }, 502, cors);
  }

  const out = normalizeOsrm(payload, profile, fromN, toN);
  if (!out) return json({ ok: false, error: "invalid_upstream_payload" }, 502, cors);

  const response = json(out, 200, Object.assign({}, cors, {
    "Cache-Control": "public, max-age=30"
  }));

  try { context.waitUntil(cache.put(cacheKey, response.clone())); } catch (e) {}

  return response;
}

function normalizeOsrm(payload, profile, from, to) {
  if (!payload || payload.code !== "Ok") return null;
  if (!payload.routes || !payload.routes.length) return null;

  const r = payload.routes[0];
  if (!r.geometry || !r.geometry.coordinates) return null;

  return {
    ok: true,
    profile: profile,
    from: from,
    to: to,
    distance_m: typeof r.distance === "number" ? r.distance : null,
    duration_s: typeof r.duration === "number" ? r.duration : null,
    geometry: {
      type: "Feature",
      properties: {},
      geometry: r.geometry
    },
    source: "osrm"
  };
}

function parseLngLat(s) {
  if (!s) return null;
  const parts = String(s).split(",");
  if (parts.length !== 2) return null;
  const lng = Number(parts[0]);
  const lat = Number(parts[1]);
  if (!isFinite(lng) || !isFinite(lat)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lng: lng, lat: lat };
}

function round(n, d) {
  const p = Math.pow(10, d);
  return Math.round(n * p) / p;
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status: status,
    headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, headers || {})
  });
}

function withCors(response, corsHeaders) {
  const h = new Headers(response.headers);
  for (const k in corsHeaders) h.set(k, corsHeaders[k]);
  return new Response(response.body, { status: response.status, headers: h });
}
