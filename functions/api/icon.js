export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const dRaw = (url.searchParams.get("d") || "").trim().toLowerCase();

  // Sanitize: allow only plain hostnames (prevents SSRF / weird fetches)
  const domain = sanitizeDomain(dRaw);
  if (!domain) {
    return new Response("Bad domain", { status: 400 });
  }

  // Cache key includes domain
  const cacheUrl = new URL(request.url);
  cacheUrl.searchParams.set("d", domain);
  const cacheKey = new Request(cacheUrl.toString(), request);

  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  // Try common icon locations (fast + works for most)
  const candidates = [
    `https://${domain}/favicon.ico`,
    `https://${domain}/favicon.png`,
    `https://${domain}/apple-touch-icon.png`,
    `https://${domain}/apple-touch-icon-precomposed.png`,
  ];

  let upstreamRes = null;

  for (const u of candidates) {
    try {
      const r = await fetch(u, {
        headers: {
          "User-Agent": "is.is icon fetcher",
          "Accept": "image/avif,image/webp,image/png,image/*;q=0.9,*/*;q=0.8",
        },
        // Cloudflare fetch caching hint (still we do our own caching too)
        cf: { cacheTtl: 86400, cacheEverything: true },
      });

      if (!r.ok) continue;

      const ct = (r.headers.get("content-type") || "").toLowerCase();
      if (!ct.startsWith("image/") && !ct.includes("icon")) continue;

      // Limit size so nobody serves you a 50MB "favicon"
      const ab = await r.arrayBuffer();
      if (ab.byteLength > 800_000) continue;

      upstreamRes = new Response(ab, {
        status: 200,
        headers: {
          "content-type": r.headers.get("content-type") || "image/x-icon",
          "cache-control": "public, max-age=604800, immutable",
        },
      });
      break;
    } catch {
      // keep trying next candidate
    }
  }

  const res = upstreamRes || fallbackSvg(domain);

  // Store in Cloudflare cache
  await cache.put(cacheKey, res.clone());
  return res;
}

function sanitizeDomain(input) {
  // Remove protocol/path if user pasted a URL
  const s = input
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .trim();

  // Basic safety: hostname-ish only
  if (!/^[a-z0-9.-]+$/.test(s)) return null;
  if (!s.includes(".")) return null;
  if (s.includes("..")) return null;
  if (s.length > 253) return null;

  return s;
}

function fallbackSvg(domain) {
  const letter = (domain[0] || "•").toUpperCase();
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
  <rect x="2" y="2" width="60" height="60" rx="14" fill="#2b6cff" opacity="0.12"/>
  <rect x="2" y="2" width="60" height="60" rx="14" fill="none" stroke="#2b6cff" opacity="0.30"/>
  <text x="32" y="40" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, Roboto"
        font-size="28" font-weight="700" fill="#2b6cff">${escapeXml(letter)}</text>
</svg>`;

  return new Response(svg, {
    status: 200,
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=604800, immutable",
    },
  });
}

function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, (c) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    '"': "&quot;",
  }[c]));
}