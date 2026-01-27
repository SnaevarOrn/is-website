// /functions/api/whoami.js
"use strict";

function maskIp(ip) {
  if (!ip || typeof ip !== "string") return null;
  // crude masking for IPv4; for IPv6 just keep prefix
  if (ip.includes(".")) {
    const parts = ip.split(".");
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
    return ip;
  }
  if (ip.includes(":")) {
    const parts = ip.split(":").filter(Boolean);
    return parts.slice(0, 3).join(":") + "::/48";
  }
  return ip;
}

export async function onRequestGet({ request }) {
  const h = request.headers;

  // Cloudflare provides these when proxied through CF
  const ip = h.get("CF-Connecting-IP") || h.get("X-Forwarded-For") || null;

  const out = {
    ok: true,
    now: new Date().toISOString(),
    request: {
      ipMasked: maskIp(ip),
      // country/city are best-effort (may be null if not on CF edge)
      country: h.get("CF-IPCountry") || null,
      city: h.get("CF-IPCity") || null,
      region: h.get("CF-Region") || null,
      postalCode: h.get("CF-Postal-Code") || null,
      timezone: h.get("CF-Timezone") || null,
      latitude: h.get("CF-IPLatitude") || null,
      longitude: h.get("CF-IPLongitude") || null,

      asn: h.get("CF-ASN") || null,
      isp: h.get("CF-ISP") || null,

      userAgent: h.get("User-Agent") || null,
      acceptLanguage: h.get("Accept-Language") || null,
      referer: h.get("Referer") || null
    },
    notes: [
      "Staðsetning er áætluð út frá IP (ekki GPS).",
      "Engar cookies eru notaðar fyrir þessa síðu."
    ]
  };

  return new Response(JSON.stringify(out, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
