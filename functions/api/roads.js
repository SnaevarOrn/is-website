// /functions/api/roads.js
// Roads proxy -> returns GeoJSON for MapLibre
// Plug in Vegagerðin ArcGIS FeatureServer layer URL (query -> GeoJSON).
//
// Example FEATURE_URL pattern (ArcGIS FeatureServer layer):
// https://vegasja.vegagerdin.is/arcgis/rest/services/<folder>/<service>/FeatureServer/<layerId>

"use strict";

const FEATURE_URL = "PUT_ARCGIS_FEATURESERVER_LAYER_URL_HERE"; // <-- set this
const CACHE_TTL_S = 60;

export async function onRequestGet({ request }) {
  const url = new URL(request.url);

  // Optional bbox from client for smaller payload
  // bbox=west,south,east,north (lng,lat)
  const bbox = (url.searchParams.get("bbox") || "").trim();

  // ArcGIS query -> GeoJSON
  const qp = new URLSearchParams({
    where: "1=1",
    outFields: "*",
    returnGeometry: "true",
    f: "geojson"
  });

  // If bbox provided, use geometry filter (envelope)
  if (bbox) {
    const parts = bbox.split(",").map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite)) {
      const [west, south, east, north] = parts;
      qp.set("geometryType", "esriGeometryEnvelope");
      qp.set("geometry", `${west},${south},${east},${north}`);
      qp.set("inSR", "4326");
      qp.set("spatialRel", "esriSpatialRelIntersects");
      qp.set("outSR", "4326");
    }
  }

  const fetchUrl = FEATURE_URL.replace(/\/+$/, "") + "/query?" + qp.toString();

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

  let geo;
  try {
    geo = await res.json();
  } catch {
    return json({ ok: false, error: "bad_json" }, 502);
  }

  // Pass-through GeoJSON (FeatureCollection)
  return json(
    { ok: true, source: "vegagerdin-arcgis", geojson: geo },
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