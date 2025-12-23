// functions/api/icon.js
// Cloudflare Pages Function: /api/icon
// Usage:
//   /api/icon?u=https%3A%2F%2Fexample.com%2Fsome%2Farticle
//   /api/icon?host=example.com
//
// Caches favicons at the edge (caches.default) so you don't fetch them every time.

const ICON_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days
const HTML_TTL_SECONDS = 60 * 60 * 24 * 7;  // 7 days (icon discovery cache)

const MAX_ICON_BYTES = 1024 * 1024 * 2; // 2 MB safety limit

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  // 1) Determine target origin
  const target = getTargetOrigin(url);
  if (!target) {
    return json({ error: "Missing ?u= (url) or ?host= (domain)" }, 400);
  }

  const cache = caches.default;

  // 2) Build a stable cache key for the final icon response
  //    (Key should not depend on query order, etc.)
  const cacheKeyUrl = new URL("https://cache.local/icon");
  cacheKeyUrl.searchParams.set("origin", target.origin);

  const cacheKey = new Request(cacheKeyUrl.toString(), {
    method: "GET",
    headers: { "Accept": "image/*" },
  });

  // 3) Serve from edge cache if present
  let cached = await cache.match(cacheKey);
  if (cached) return withCors(cached);

  // 4) Discover icon URL (HTML parsing) — also cached
  const iconUrl = await discoverBestIconUrl(cache, target.origin);

  // 5) Fetch icon bytes (with redirects)
  const iconResp = await fetchIcon(iconUrl);

  // If icon fetch failed, return a small fallback SVG (cached too)
  const finalResp = iconResp.ok
    ? await makeIconResponse(iconResp)
    : fallbackIconResponse(target.hostname);

  // 6) Store in edge cache
  await cache.put(cacheKey, finalResp.clone());

  return withCors(finalResp);
}

/* ---------------- Helpers ---------------- */

function getTargetOrigin(reqUrl) {
  const u = reqUrl.searchParams.get("u");
  const host = reqUrl.searchParams.get("host");

  if (u) {
    try {
      const parsed = new URL(u);
      if (!/^https?:$/.test(parsed.protocol)) return null;
      // Normalize to origin only
      return new URL(parsed.origin);
    } catch {
      return null;
    }
  }

  if (host) {
    // Normalize host input
    const cleanHost = host.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
    if (!cleanHost) return null;
    return new URL(`https://${cleanHost}`);
  }

  return null;
}

async function discoverBestIconUrl(cache, origin) {
  // Cache the discovery result (icon URL string)
  const discoveryKey = new Request(`https://cache.local/icon-discovery?origin=${encodeURIComponent(origin)}`);
  const cached = await cache.match(discoveryKey);
  if (cached) {
    const txt = await cached.text();
    if (txt) return txt;
  }

  // Try: fetch homepage HTML and parse <link rel="...">
  let best = null;

  // Some sites redirect / to something else; follow it.
  const homeResp = await fetch(origin, {
    redirect: "follow",
    headers: {
      "Accept": "text/html,application/xhtml+xml",
      "User-Agent": "is.is-favicon-bot/1.0",
    },
  });

  if (homeResp.ok) {
    const html = await homeResp.text();
    best = pickIconFromHtml(html, origin);
  }

  // Fallbacks if parsing fails
  if (!best) {
    // Common locations
    best = new URL("/favicon.ico", origin).toString();
  }

  const store = new Response(best, {
    headers: cacheHeaders(HTML_TTL_SECONDS),
  });
  await cache.put(discoveryKey, store.clone());
  return best;
}

function pickIconFromHtml(html, origin) {
  // Very lightweight link tag scraping. Good enough for favicons.
  // We score candidates and pick the highest.
  const candidates = [];

  // Match <link ...> tags
  const linkTagRegex = /<link\b[^>]*>/gi;
  const tags = html.match(linkTagRegex) || [];

  for (const tag of tags) {
    const rel = getAttr(tag, "rel");
    if (!rel) continue;

    const relLower = rel.toLowerCase();
    const isIconRel =
      relLower.includes("icon") ||
      relLower.includes("apple-touch-icon") ||
      relLower.includes("mask-icon");

    if (!isIconRel) continue;

    const href = getAttr(tag, "href");
    if (!href) continue;

    const sizes = (getAttr(tag, "sizes") || "").toLowerCase(); // e.g. "32x32" or "any"
    const type = (getAttr(tag, "type") || "").toLowerCase();   // image/png, image/svg+xml

    const abs = toAbsoluteUrl(href, origin);
    if (!abs) continue;

    candidates.push({
      url: abs,
      rel: relLower,
      sizes,
      type,
      score: scoreIcon(relLower, sizes, type, abs),
    });
  }

  if (!candidates.length) return null;

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].url;
}

function scoreIcon(rel, sizes, type, url) {
  let s = 0;

  // Prefer PNG/SVG over ICO (often sharper)
  if (type.includes("image/png")) s += 40;
  if (type.includes("image/svg")) s += 35;

  // Prefer apple-touch icons (often 180x180)
  if (rel.includes("apple-touch-icon")) s += 30;

  // Prefer larger sizes (roughly)
  const m = sizes.match(/(\d+)\s*x\s*(\d+)/);
  if (m) {
    const w = parseInt(m[1], 10);
    const h = parseInt(m[2], 10);
    if (Number.isFinite(w) && Number.isFinite(h)) {
      s += Math.min(60, Math.round((w * h) / 1024)); // gentle boost
    }
  } else if (sizes.includes("any")) {
    s += 25;
  }

  // Path hints
  if (/favicon/i.test(url)) s += 10;
  if (/apple-touch-icon/i.test(url)) s += 10;

  return s;
}

function getAttr(tag, name) {
  // Handles single/double quotes + unquoted
  const re = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const m = tag.match(re);
  return (m && (m[1] || m[2] || m[3])) ? (m[1] || m[2] || m[3]).trim() : null;
}

function toAbsoluteUrl(href, origin) {
  try {
    // ignore data: icons (too big sometimes + no caching benefit)
    if (href.startsWith("data:")) return null;
    return new URL(href, origin).toString();
  } catch {
    return null;
  }
}

async function fetchIcon(iconUrl) {
  try {
    const resp = await fetch(iconUrl, {
      redirect: "follow",
      headers: {
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "User-Agent": "is.is-favicon-bot/1.0",
      },
    });
    return resp;
  } catch {
    return new Response(null, { status: 502 });
  }
}

async function makeIconResponse(iconResp) {
  // Enforce size cap (avoid caching huge blobs)
  const len = iconResp.headers.get("content-length");
  if (len && parseInt(len, 10) > MAX_ICON_BYTES) {
    return new Response(null, { status: 413 });
  }

  const buf = await iconResp.arrayBuffer();
  if (buf.byteLength > MAX_ICON_BYTES) {
    return new Response(null, { status: 413 });
  }

  // Best-effort content type
  const ct = iconResp.headers.get("content-type") || guessContentType(iconResp.url) || "image/x-icon";

  const headers = new Headers(cacheHeaders(ICON_TTL_SECONDS));
  headers.set("Content-Type", ct);
  headers.set("X-Icon-Source", safeHeaderValue(iconResp.url));

  return new Response(buf, { status: 200, headers });
}

function guessContentType(url) {
  const u = (url || "").toLowerCase();
  if (u.endsWith(".png")) return "image/png";
  if (u.endsWith(".svg")) return "image/svg+xml";
  if (u.endsWith(".webp")) return "image/webp";
  if (u.endsWith(".ico")) return "image/x-icon";
  return null;
}

function cacheHeaders(ttlSeconds) {
  // Cache at the edge for a long time; browser can cache too.
  // s-maxage is respected by CDN caches.
  return {
    "Cache-Control": `public, max-age=${ttlSeconds}, s-maxage=${ttlSeconds}, stale-while-revalidate=86400`,
  };
}

function withCors(resp) {
  const h = new Headers(resp.headers);
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  h.set("Access-Control-Allow-Headers", "*");
  return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: h });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...cacheHeaders(60),
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function safeHeaderValue(v) {
  // Prevent invalid header chars
  return String(v || "").replace(/[\r\n]+/g, " ").slice(0, 200);
}

function fallbackIconResponse(hostname) {
  const label = (hostname || "news").replace(/[^\w.-]+/g, "").slice(0, 24);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#9ad7ff"/>
      <stop offset="1" stop-color="#ffffff"/>
    </linearGradient>
  </defs>
  <rect x="4" y="4" width="56" height="56" rx="14" fill="url(#g)"/>
  <path d="M32 14l3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7z" fill="rgba(11,18,32,.75)"/>
  <text x="32" y="50" text-anchor="middle" font-family="system-ui,Segoe UI,Arial" font-size="12" fill="rgba(11,18,32,.75)">${label}</text>
</svg>`;

  return new Response(svg, {
    status: 200,
    headers: {
      ...cacheHeaders(ICON_TTL_SECONDS),
      "Content-Type": "image/svg+xml; charset=utf-8",
      "X-Icon-Source": "fallback",
    },
  });
}
