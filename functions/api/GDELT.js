// /functions/api/GDELT.js
// GDELT DOC 2.0 proxy for ís.is (Cloudflare Pages Functions)
//
// GET /api/GDELT?q=...&recent=24h&max=50&sort=DateDesc&format=json
// Optional:
//   - mode: ArtList | timelinevolinfo | timelineavgtone | ...
//   - start: YYYYMMDDHHMMSS (STARTDATETIME)
//   - end:   YYYYMMDDHHMMSS (ENDDATETIME)
//   - domain: example.com (domain filter)
//   - sourceCountry: IS (SOURCECOUNTRY)
//   - language: en (sourcelang)
//   - format: json | jsonp | html | rss ...
//
// Hardening:
// - Never throw -> always return JSON {ok:false,...}
// - Handles GDELT 429 (1 request / ~5 seconds) gracefully with retryAfterMs
// - Edge cache with stale-while-revalidate to reduce rate limiting
// - Timeout on upstream fetch
// - CORS + OPTIONS

"use strict";

const GDELT_DOC_ENDPOINT = "https://api.gdeltproject.org/api/v2/doc/doc";

const MAX_RECORDS_CAP = 250;
const QUERY_LEN_CAP = 300;

const DEFAULT_MODE = "ArtList";
const DEFAULT_SORT = "DateDesc";
const DEFAULT_FORMAT = "json";

// Caching: keep short-ish but helpful
const CACHE_MAX_AGE = 300;               // 5 min fresh
const CACHE_STALE_REVALIDATE = 900;      // 15 min stale-while-revalidate

// Upstream constraints / hardening
const UPSTREAM_TIMEOUT_MS = 9000;        // keep under Pages limits
const GDELT_MIN_INTERVAL_MS = 5200;      // per-edge throttle to avoid 429
const GDELT_DEFAULT_RETRY_MS = 5500;

// Best-effort per-edge throttle (not global, but helps)
const LAST_UPSTREAM_AT = new Map(); // key -> timestamp

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

function cacheKeyFromUpstream(urlStr) {
  // Normalizes to reduce cache fragmentation
  // (GDELT params are order-sensitive only in text form, not meaning)
  // We'll just use the final upstream.toString() which already orders by insertion,
  // but this helper exists if you want stronger normalization later.
  return urlStr;
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

  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  try {
    const url = new URL(request.url);

    const q = cleanStr(url.searchParams.get("q") || url.searchParams.get("query"));
    if (!q) {
      return jsonResponse(
        {
          ok: false,
          error: "Missing parameter: q",
          example: "/api/GDELT?q=iceland%20AND%20volcano&recent=24h&max=50",
        },
        200,
        { "cache-control": "no-store" }
      );
    }
    if (q.length > QUERY_LEN_CAP) {
      return jsonResponse(
        { ok: false, error: `q too long (>${QUERY_LEN_CAP})` },
        200,
        { "cache-control": "no-store" }
      );
    }

    const mode = cleanStr(url.searchParams.get("mode")) || DEFAULT_MODE;
    const format = cleanStr(url.searchParams.get("format")) || DEFAULT_FORMAT;
    const sort = cleanStr(url.searchParams.get("sort")) || DEFAULT_SORT;

    const recent = cleanStr(url.searchParams.get("recent")); // e.g. 12h, 7d, 30d
    const start = cleanStr(url.searchParams.get("start"));
    const end = cleanStr(url.searchParams.get("end"));

    const domain = cleanStr(url.searchParams.get("domain"));
    const sourceCountry = cleanStr(url.searchParams.get("sourceCountry"));
    const language = cleanStr(url.searchParams.get("language"));

    const max = clampInt(
      url.searchParams.get("max") || url.searchParams.get("maxrecords") || "50",
      1,
      MAX_RECORDS_CAP
    );

    // Build upstream URL
    const upstream = new URL(GDELT_DOC_ENDPOINT);
    upstream.searchParams.set("query", q);
    upstream.searchParams.set("mode", mode);
    upstream.searchParams.set("format", format);
    upstream.searchParams.set("maxrecords", String(max));
    upstream.searchParams.set("sort", sort);

    if (start || end) {
      if (!isYmdhms(start) || !isYmdhms(end)) {
        return jsonResponse(
          {
            ok: false,
            error: "start/end must be YYYYMMDDHHMMSS (14 digits)",
            example: "/api/GDELT?q=ukraine&start=20260201000000&end=20260203000000",
          },
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
    const upstreamKey = cacheKeyFromUpstream(upstreamUrl);

    // Edge cache
    const cache = caches?.default;

    // IMPORTANT: cache-control on our response determines client caching too,
    // but edge cache (caches.default) is separate.
    const cacheKey = new Request(upstreamKey, {
      method: "GET",
      headers: { accept: "application/json" },
    });

    if (cache) {
      const cached = await cache.match(cacheKey);
      if (cached) {
        const headers = new Headers(cached.headers);
        // keep CORS
        headers.set("access-control-allow-origin", "*");
        headers.set("access-control-allow-methods", "GET, OPTIONS");
        headers.set("access-control-allow-headers", "content-type");
        return new Response(cached.body, { status: cached.status, headers });
      }
    }

    // Best-effort throttle to reduce 429:
    // Per-edge only, but still helps a lot for your own traffic.
    const tNow = Date.now();
    const last = LAST_UPSTREAM_AT.get(upstreamKey) || 0;
    const delta = tNow - last;
    if (delta < GDELT_MIN_INTERVAL_MS) {
      await sleep(GDELT_MIN_INTERVAL_MS - delta);
    }
    LAST_UPSTREAM_AT.set(upstreamKey, Date.now());

    // Upstream fetch with timeout
    const t0 = Date.now();
    let res;
    try {
      res = await fetchWithTimeout(
        upstreamUrl,
        {
          headers: {
            "user-agent": "is.is-gdelt/1.0",
            accept: "application/json,text/plain,*/*",
          },
        },
        UPSTREAM_TIMEOUT_MS
      );
    } catch (e) {
      return jsonResponse(
        {
          ok: false,
          error: "Upstream fetch failed",
          message: String(e?.message || e),
          upstream: upstreamUrl,
          meta: { upstreamMs: Date.now() - t0 },
          hint: "GDELT may be slow or unreachable. Try shorter recent window or fewer max.",
        },
        200,
        { "cache-control": "no-store" }
      );
    }

    const upstreamMs = Date.now() - t0;
    const text = await res.text();

    // Handle GDELT throttling (429) gracefully
    if (res.status === 429) {
      const out429 = {
        ok: false,
        error: "Upstream rate limited",
        status: 429,
        upstream: upstreamUrl,
        retryAfterMs: GDELT_DEFAULT_RETRY_MS,
        sample: text.slice(0, 300),
        meta: { upstreamMs },
        hint:
          "GDELT limit: ~1 request / 5 seconds. Add cooldown in UI or rely on cache.",
      };

      // Cache 429 briefly to prevent stampede (short!)
      const response429 = jsonResponse(out429, 200, {
        "cache-control": "public, max-age=5",
      });

      if (cache) {
        const put = () => cache.put(cacheKey, response429.clone());
        if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(put());
        else await put();
      }

      return response429;
    }

    // Parse JSON safely; if upstream returned text/HTML, return structured error
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (e) {
      const outParse = {
        ok: false,
        error: "Upstream parse error",
        status: res.status,
        contentType: res.headers.get("content-type"),
        upstream: upstreamUrl,
        sample: text.slice(0, 300),
        meta: { upstreamMs },
      };

      // Cache parse errors briefly (avoid hammering)
      const resp = jsonResponse(outParse, 200, {
        "cache-control": "public, max-age=15",
      });

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
      meta: {
        q,
        mode,
        format,
        sort,
        max,
        recent: recent || null,
        start: start || null,
        end: end || null,
        domain: domain || null,
        sourceCountry: sourceCountry || null,
        language: language || null,
        upstream: upstreamUrl,
        upstreamMs,
      },
      data: payload,
    };

    // Always return 200 to avoid Cloudflare "host error" pages;
    // encode success/failure in out.ok/out.status.
    const response = jsonResponse(out, 200, {
      "cache-control": `public, max-age=${CACHE_MAX_AGE}, stale-while-revalidate=${CACHE_STALE_REVALIDATE}`,
    });

    if (cache) {
      const put = () => cache.put(cacheKey, response.clone());
      if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(put());
      else await put();
    }

    return response;
  } catch (err) {
    return jsonResponse(
      { ok: false, error: "Server error", message: String(err?.message || err) },
      200,
      { "cache-control": "no-store" }
    );
  }
}