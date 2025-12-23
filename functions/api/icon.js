export async function onRequestGet({ request, waitUntil }) {
  const url = new URL(request.url);
  const domain = (url.searchParams.get("domain") || "").trim().toLowerCase();

  if (!domain || domain.includes("/") || domain.includes("..")) {
    return new Response("Bad domain", { status: 400 });
  }

  // Google S2 favicon service (hratt + stöðugt)
  const upstream = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;

  const cache = caches.default;
  const cacheKey = new Request(upstream, { method: "GET" });

  let res = await cache.match(cacheKey);
  if (!res) {
    res = await fetch(upstream, {
      headers: { "User-Agent": "is.is icon proxy" }
    });

    // ef eitthvað klikkar, fail gracefully
    if (!res.ok) return new Response("", { status: 204 });

    // cache 7 daga
    const cached = new Response(res.body, res);
    cached.headers.set("cache-control", "public, max-age=604800, s-maxage=604800");
    cached.headers.set("content-type", res.headers.get("content-type") || "image/png");

    waitUntil(cache.put(cacheKey, cached.clone()));
    return cached;
  }

  return res;
}