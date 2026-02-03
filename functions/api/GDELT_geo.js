// /functions/api/GDELT_geo.js
// GDELT GEO 2.0 proxy for ís.is (Cloudflare Pages Functions)
//
// GET /api/GDELT_geo?q=...&recent=7d&max=250&format=geojson
// Optional:
//   - start/end: YYYYMMDDHHMMSS (STARTDATETIME/ENDDATETIME)
//   - domain, sourceCountry, language
//
// Hardening:
// - Always returns JSON (ok true/false)
// - Handles 429 with retryAfterMs
// - Edge cache + stale-while-revalidate
// - Upstream timeout + per-edge throttle

"use strict";

const GDELT_GEO_ENDPOINT = "https://api.gdeltproject.org/api/v2/geo/geo";

const MAX_RECORDS_CAP = 250;
const QUERY_LEN_CAP = 300;

const CACHE_MAX_AGE = 300;          // 5 min
const CACHE_STALE = 900;            // 15 min

const UPSTREAM_TIMEOUT_MS = 9000;
const GDELT_MIN_INTERVAL_MS = 5200;
const GDELT_DEFAULT_RETRY_MS = 5500;

const LAST_UPSTREAM_AT = new Map();

function corsHeaders(extra = {}) {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type",
    ...extra,
  };
}

function jsonResponse(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders(),
      ...extraHeaders,
    },
  });
}

function clampInt(n, min, max) {
  const x = Number.parseInt(n, 10);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, x));
}
function cleanStr(s) {
  return String(s ?? "").trim();
}
function isYmdhms(s) {
  return /^[0-9]{14}$/.test(s);
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function fetchWithTimeout(url, init, timeoutMs) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort("timeout"), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

export async function onRequest(context) {
  const { request, ctx } = context || {};
  const method = request?.method || "GET";

  if (method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });

  try {
    const url = new URL(request.url);

    const q = cleanStr(url.searchParams.get("q") || url.searchParams.get("query"));
    if (!q) {
      return jsonResponse({ ok: false, error: "Missing parameter: q" }, 200, { "cache-control": "no-store" });
    }
    if (q.length > QUERY_LEN_CAP) {
      return jsonResponse({ ok: false, error: `q too long (>${QUERY_LEN_CAP})` }, 200, { "cache-control": "no-store" });
    }

    const recent = cleanStr(url.searchParams.get("recent"));
    const start = cleanStr(url.searchParams.get("start"));
    const end = cleanStr(url.searchParams.get("end"));

    const domain = cleanStr(url.searchParams.get("domain"));
    const sourceCountry = cleanStr(url.searchParams.get("sourceCountry"));
    const language = cleanStr(url.searchParams.get("language"));

    const format = cleanStr(url.searchParams.get("format")) || "geojson";
    const max = clampInt(url.searchParams.get("max") || "250", 1, MAX_RECORDS_CAP);

    const upstream = new URL(GDELT_GEO_ENDPOINT);
    upstream.searchParams.set("query", q);
    upstream.searchParams.set("format", format);
    upstream.searchParams.set("maxrecords", String(max));

    if (start || end) {
      if (!isYmdhms(start) || !isYmdhms(end)) {
        return jsonResponse(
          { ok: false, error: "start/end must be YYYYMMDDHHMMSS (14 digits)" },
          200,
          { "cache-control": "no-store" }
        );
      }
      upstream.searchParams.set("STARTDATETIME", start);
      upstream.searchParams.set("ENDDATETIME", end);
    } else if (recent) {
      upstream.searchParams.set("recent", recent);
    }

    if (domain) upstream.searchParams.set("domain", domain);
    if (sourceCountry) upstream.searchParams.set("sourceCountry", sourceCountry);
    if (language) upstream.searchParams.set("sourcelang", language);

    const upstreamUrl = upstream.toString();

    const cache = caches?.default;
    const cacheKey = new Request(upstreamUrl, { method: "GET", headers: { accept: "application/json" } });

    if (cache) {
      const cached = await cache.match(cacheKey);
      if (cached) {
        const headers = new Headers(cached.headers);
        headers.set("access-control-allow-origin", "*");
        headers.set("access-control-allow-methods", "GET, OPTIONS");
        headers.set("access-control-allow-headers", "content-type");
        return new Response(cached.body, { status: cached.status, headers });
      }
    }

    // per-edge throttle
    const now = Date.now();
    const last = LAST_UPSTREAM_AT.get(upstreamUrl) || 0;
    const delta = now - last;
    if (delta < GDELT_MIN_INTERVAL_MS) await sleep(GDELT_MIN_INTERVAL_MS - delta);
    LAST_UPSTREAM_AT.set(upstreamUrl, Date.now());

    const t0 = Date.now();
    let res;
    try {
      res = await fetchWithTimeout(
        upstreamUrl,
        { headers: { "user-agent": "is.is-gdelt/1.0", accept: "application/json,text/plain,*/*" } },
        UPSTREAM_TIMEOUT_MS
      );
    } catch (e) {
      return jsonResponse(
        { ok: false, error: "Upstream fetch failed", message: String(e?.message || e), upstream: upstreamUrl, meta: { upstreamMs: Date.now() - t0 } },
        200,
        { "cache-control": "no-store" }
      );
    }

    const upstreamMs = Date.now() - t0;
    const text = await res.text();

    if (res.status === 429) {
      const out429 = {
        ok: false,
        error: "Upstream rate limited",
        status: 429,
        retryAfterMs: GDELT_DEFAULT_RETRY_MS,
        upstream: upstreamUrl,
        sample: text.slice(0, 300),
        meta: { upstreamMs },
      };
      const response429 = jsonResponse(out429, 200, { "cache-control": "public, max-age=5" });
      if (cache) {
        const put = () => cache.put(cacheKey, response429.clone());
        if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(put());
        else await put();
      }
      return response429;
    }

    let payload;
    try {
      payload = JSON.parse(text);
    } catch (e) {
      const outParse = {
        ok: false,
        error: "Upstream parse error",
        status: res.status,
        upstream: upstreamUrl,
        contentType: res.headers.get("content-type"),
        sample: text.slice(0, 300),
        meta: { upstreamMs },
      };
      const resp = jsonResponse(outParse, 200, { "cache-control": "public, max-age=15" });
      if (cache) {
        const put = () => cache.put(cacheKey, resp.clone());
        if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(put());
        else await put();
      }
      return resp;
    }

    const out = {
      ok: res.ok,
      status: res.status,
      meta: { q, recent: recent || null, start: start || null, end: end || null, max, format, upstream: upstreamUrl, upstreamMs },
      data: payload,
    };

    const response = jsonResponse(out, 200, {
      "cache-control": `public, max-age=${CACHE_MAX_AGE}, stale-while-revalidate=${CACHE_STALE}`,
    });

    if (cache) {
      const put = () => cache.put(cacheKey, response.clone());
      if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(put());
      else await put();
    }

    return response;
  } catch (err) {
    return jsonResponse({ ok: false, error: "Server error", message: String(err?.message || err) }, 200, { "cache-control": "no-store" });
  }
}