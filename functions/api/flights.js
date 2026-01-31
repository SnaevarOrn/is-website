// /functions/api/flights.js
// Flights proxy (OpenSky) -> GeoJSON points for MapLibre
// GET /api/flights?bbox=west,south,east,north
//
// NOTE: OpenSky has rate limits. Cache a few seconds to be nice.

"use strict";

const OPENSKY_URL = "https://opensky-network.org/api/states/all";
const CACHE_TTL_S = 10;

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const bbox = (url.searchParams.get("bbox") || "").trim();

  const qp = new URLSearchParams();
  if (bbox) {
    const parts = bbox.split(",").map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite)) {
      const [west, south, east, north] = parts;
      qp.set("lamin", String(south));
      qp.set("lomin", String(west));
      qp.set("lamax", String(north));
      qp.set("lomax", String(east));
    }
  }

  const fetchUrl = OPENSKY_URL + (qp.toString() ? "?" + qp.toString() : "");

  let res;
  try {
    res = await fetch(fetchUrl, {
      headers: { "accept": "application/json" },
      cf: { cacheTtl: CACHE_TTL_S, cacheEverything: true }
    });
  } catch {
    return json({ ok: false, error: "fetch_failed" }, 502);
  }

  if (!res.ok) return json({ ok: false, error: "upstream_" + res.status }, 502);

  let data;
  try {
    data = await res.json();
  } catch {
    return json({ ok: false, error: "bad_json" }, 502);
  }

  const states = Array.isArray(data && data.states) ? data.states : [];
  const features = [];

  // OpenSky "states" array layout (common):
  // [0] icao24, [1] callsign, [2] origin_country, [5] lon, [6] lat,
  // [7] baro_altitude, [8] on_ground, [9] velocity, [10] true_track, [13] geo_altitude
  for (const s of states) {
    const lon = Number(s && s[5]);
    const lat = Number(s && s[6]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;

    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties: {
        icao24: (s[0] || "").trim(),
        callsign: (s[1] || "").trim(),
        country: (s[2] || "").trim(),
        on_ground: !!s[8],
        velocity_ms: (typeof s[9] === "number") ? s[9] : null,
        heading_deg: (typeof s[10] === "number") ? s[10] : null,
        alt_m: (typeof s[13] === "number") ? s[13] : ((typeof s[7] === "number") ? s[7] : null)
      }
    });
  }

  return json(
    { ok: true, source: "opensky", geojson: { type: "FeatureCollection", features } },
    200,
    { "Cache-Control": `public, max-age=${CACHE_TTL_S}` }
  );
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