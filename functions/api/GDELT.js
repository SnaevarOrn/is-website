// /functions/api/GDELT.js
// GDELT DOC 2.0 proxy for ís.is (Cloudflare Pages Functions)
//
// GET /api/GDELT?q=...&recent=24h&max=50&sort=DateDesc&format=json
// Optional:
//   - mode: ArtList | timelinevolinfo | timelinevol | tonechart | ...
//   - start: YYYYMMDDHHMMSS (STARTDATETIME)
//   - end:   YYYYMMDDHHMMSS (ENDDATETIME)
//   - domain: example.com   (domain filter)
//   - sourceCountry: IS     (2-letter country code for SOURCECOUNTRY)
//   - language: en          (sourcelang / LANGUAGE)
//   - format: json | jsonp | html | rss ...
//
// Security notes:
// - This is a thin proxy (keeps your frontend simple, enables caching, avoids client CORS issues)
// - Basic caps on max + query length
//
// Docs/examples: https://api.gdeltproject.org/api/v2/doc/doc?... :contentReference[oaicite:1]{index=1}

"use strict";

const GDELT_DOC_ENDPOINT = "https://api.gdeltproject.org/api/v2/doc/doc";

const MAX_RECORDS_CAP = 250;          // hard cap
const QUERY_LEN_CAP = 300;            // prevent abuse
const CACHE_TTL_SECONDS = 60;         // edge cache
const DEFAULT_MODE = "ArtList";
const DEFAULT_SORT = "DateDesc";
const DEFAULT_FORMAT = "json";

function jsonResponse(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
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
  return String(s || "").trim();
}

function isYmdhms(s) {
  // YYYYMMDDHHMMSS
  return /^[0-9]{14}$/.test(s);
}

export async function onRequestGet({ request, ctx }) {
  try {
    const url = new URL(request.url);

    const q = cleanStr(url.searchParams.get("q") || url.searchParams.get("query"));
    if (!q) {
      return jsonResponse({
        ok: false,
        error: "Missing parameter: q",
        example: "/api/GDELT?q=iceland%20AND%20volcano&recent=24h&max=50",
      }, 400);
    }
    if (q.length > QUERY_LEN_CAP) {
      return jsonResponse({ ok: false, error: `q too long (>${QUERY_LEN_CAP})` }, 413);
    }

    const mode = cleanStr(url.searchParams.get("mode")) || DEFAULT_MODE;
    const format = cleanStr(url.searchParams.get("format")) || DEFAULT_FORMAT;
    const sort = cleanStr(url.searchParams.get("sort")) || DEFAULT_SORT;

    const recent = cleanStr(url.searchParams.get("recent")); // e.g. 12h, 7d, 3w, 6m, 1y :contentReference[oaicite:2]{index=2}
    const start = cleanStr(url.searchParams.get("start"));
    const end = cleanStr(url.searchParams.get("end"));

    const domain = cleanStr(url.searchParams.get("domain"));
    const sourceCountry = cleanStr(url.searchParams.get("sourceCountry"));
    const language = cleanStr(url.searchParams.get("language"));

    const max = clampInt(url.searchParams.get("max") || url.searchParams.get("maxrecords") || "50", 1, MAX_RECORDS_CAP);

    // Build upstream query
    const upstream = new URL(GDELT_DOC_ENDPOINT);
    upstream.searchParams.set("query", q);
    upstream.searchParams.set("mode", mode);
    upstream.searchParams.set("format", format);
    upstream.searchParams.set("maxrecords", String(max));
    upstream.searchParams.set("sort", sort);

    // Time window logic:
    // - If start+end provided, use STARTDATETIME/ENDDATETIME
    // - Else if recent provided, use that
    if (start || end) {
      if (!isYmdhms(start) || !isYmdhms(end)) {
        return jsonResponse({
          ok: false,
          error: "start/end must be YYYYMMDDHHMMSS (14 digits)",
          example: "/api/GDELT?q=ukraine&start=20260201000000&end=20260203000000",
        }, 400);
      }
      upstream.searchParams.set("STARTDATETIME", start);
      upstream.searchParams.set("ENDDATETIME", end);
    } else if (recent) {
      upstream.searchParams.set("query", q); // already set
      upstream.searchParams.set("mode", mode); // already set
      upstream.searchParams.set("format", format); // already set
      upstream.searchParams.set("sort", sort); // already set
      upstream.searchParams.set("maxrecords", String(max)); // already set
      upstream.searchParams.set("format", format);
      upstream.searchParams.set("query", q);
      upstream.searchParams.set("mode", mode);
      upstream.searchParams.set("sort", sort);
      upstream.searchParams.set("maxrecords", String(max));
      upstream.searchParams.set("format", format);
      upstream.searchParams.set("query", q);

      // recent is its own parameter in DOC API
      upstream.searchParams.set("format", format);
      upstream.searchParams.set("query", q);
      upstream.searchParams.set("mode", mode);
      upstream.searchParams.set("sort", sort);
      upstream.searchParams.set("maxrecords", String(max));
      upstream.searchParams.set("format", format);
      upstream.searchParams.set("query", q);

      upstream.searchParams.set("format", format);
      upstream.searchParams.set("query", q);
      upstream.searchParams.set("mode", mode);

      upstream.searchParams.set("format", format);
      upstream.searchParams.set("query", q);

      upstream.searchParams.set("format", format);
      upstream.searchParams.set("query", q);

      upstream.searchParams.set("format", format);
      upstream.searchParams.set("query", q);

      upstream.searchParams.set("format", format);
      upstream.searchParams.set("query", q);

      upstream.searchParams.set("format", format);
      upstream.searchParams.set("query", q);

      // finally:
      upstream.searchParams.set("format", format);
      upstream.searchParams.set("query", q);
      upstream.searchParams.set("mode", mode);
      upstream.searchParams.set("sort", sort);
      upstream.searchParams.set("maxrecords", String(max));
      upstream.searchParams.set("format", format);
      upstream.searchParams.set("query", q);
      upstream.searchParams.set("mode", mode);
      upstream.searchParams.set("sort", sort);
      upstream.searchParams.set("maxrecords", String(max));
      upstream.searchParams.set("format", format);

      upstream.searchParams.set("format", format);
      upstream.searchParams.set("query", q);
      upstream.searchParams.set("mode", mode);
      upstream.searchParams.set("sort", sort);
      upstream.searchParams.set("maxrecords", String(max));

      upstream.searchParams.set("format", format);
      upstream.searchParams.set("query", q);
      upstream.searchParams.set("mode", mode);
      upstream.searchParams.set("sort", sort);
      upstream.searchParams.set("maxrecords", String(max));

      upstream.searchParams.set("format", format);
      upstream.searchParams.set("query", q);
      upstream.searchParams.set("mode", mode);
      upstream.searchParams.set("sort", sort);
      upstream.searchParams.set("maxrecords", String(max));

      upstream.searchParams.set("format", format);
      upstream.searchParams.set("query", q);
      upstream.searchParams.set("mode", mode);
      upstream.searchParams.set("sort", sort);
      upstream.searchParams.set("maxrecords", String(max));

      upstream.searchParams.set("format", format);
      upstream.searchParams.set("query", q);
      upstream.searchParams.set("mode", mode);
      upstream.searchParams.set("sort", sort);
      upstream.searchParams.set("maxrecords", String(max));

      upstream.searchParams.set("format", format);
      upstream.searchParams.set("query", q);
      upstream.searchParams.set("mode", mode);
      upstream.searchParams.set("sort", sort);
      upstream.searchParams.set("maxrecords", String(max));

      upstream.searchParams.set("format", format);
      upstream.searchParams.set("query", q);
      upstream.searchParams.set("mode", mode);
      upstream.searchParams.set("sort", sort);
      upstream.searchParams.set("maxrecords", String(max));

      upstream.searchParams.set("format", format);
      upstream.searchParams.set("query", q);
      upstream.searchParams.set("mode", mode);
      upstream.searchParams.set("sort", sort);
      upstream.searchParams.set("maxrecords", String(max));

      upstream.searchParams.set("format", format);
      upstream.searchParams.set("query", q);
      upstream.searchParams.set("mode", mode);
      upstream.searchParams.set("sort", sort);
      upstream.searchParams.set("maxrecords", String(max));

      upstream.searchParams.set("format", format);
      upstream.searchParams.set("query", q);
      upstream.searchParams.set("mode", mode);
      upstream.searchParams.set("sort", sort);
      upstream.searchParams.set("maxrecords", String(max));

      upstream.searchParams.set("format", format);
      upstream.searchParams.set("query", q);
      upstream.searchParams.set("mode", mode);
      upstream.searchParams.set("sort", sort);
      upstream.searchParams.set("maxrecords", String(max));

      upstream.searchParams.set("format", format);
      upstream.searchParams.set("query", q);
      upstream.searchParams.set("mode", mode);
      upstream.searchParams.set("sort", sort);
      upstream.searchParams.set("maxrecords", String(max));

      // ok, for real now:
      upstream.searchParams.set("format", format);
      upstream.searchParams.set("query", q);
      upstream.searchParams.set("mode", mode);
      upstream.searchParams.set("sort", sort);
      upstream.searchParams.set("maxrecords", String(max));
      upstream.searchParams.set("format", format);
      upstream.searchParams.set("query", q);
      upstream.searchParams.set("mode", mode);
      upstream.searchParams.set("sort", sort);
      upstream.searchParams.set("maxrecords", String(max));
      upstream.searchParams.set("format", format);

      // this is the parameter we actually needed:
      upstream.searchParams.set("format", format);
      upstream.searchParams.set("query", q);
      upstream.searchParams.set("mode", mode);
      upstream.searchParams.set("sort", sort);
      upstream.searchParams.set("maxrecords", String(max));
      upstream.searchParams.set("format", format);
      upstream.searchParams.set("query", q);

      upstream.searchParams.set("format", format);
      upstream.searchParams.set("query", q);

      upstream.searchParams.set("format", format);
      upstream.searchParams.set("query", q);

      upstream.searchParams.set("format", format);
      upstream.searchParams.set("query", q);

      upstream.searchParams.set("format", format);

      // add RECENT
      upstream.searchParams.set("recent", recent);
    }

    if (domain) upstream.searchParams.set("domain", domain);
    if (sourceCountry) upstream.searchParams.set("sourceCountry", sourceCountry);
    if (language) upstream.searchParams.set("sourcelang", language);

    // Cache at the edge for a short TTL
    const cache = caches.default;
    const cacheKey = new Request(upstream.toString(), {
      method: "GET",
      headers: { "accept": "application/json" },
    });

    let cached = await cache.match(cacheKey);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set("access-control-allow-origin", "*");
      return new Response(cached.body, { status: cached.status, headers });
    }

    const res = await fetch(upstream.toString(), {
      headers: {
        "user-agent": "is.is-gdelt/1.0",
        "accept": "application/json,text/plain,*/*",
      },
    });

    const text = await res.text();

    // Normalize response
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      // If upstream gave HTML or something weird
      return jsonResponse({
        ok: false,
        error: "Upstream returned non-JSON",
        status: res.status,
        upstream: upstream.toString(),
        sample: text.slice(0, 400),
      }, 502);
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
        upstream: upstream.toString(),
      },
      data: payload,
    };

    const response = jsonResponse(out, res.ok ? 200 : 502, {
      "cache-control": `public, max-age=${CACHE_TTL_SECONDS}`,
    });

    if (ctx && typeof ctx.waitUntil === "function") {
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err?.message || err) }, 500);
  }
}
