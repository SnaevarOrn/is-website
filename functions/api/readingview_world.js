// /functions/api/readingview_world.js
// Reading View scraper (WORLD) for ís.is (Cloudflare Pages Functions)
//
// Goals:
//  - Pull clean article text for major international sites
//  - Avoid nav/menu/footer/share/subscription dumps
//  - Decode HTML entities + strip soft hyphen (&shy; / \u00AD) + zero-width chars
//  - Be conservative with allowed hosts (explicit allowlist)
//
// Output:
// { ok, url, host, site, title, excerpt, wordCount, charCount, text, paragraphs[], debug? }

"use strict";

/* =========================
   Allowed hosts (WORLD)
   =========================
   Keep this small & explicit. Add as you onboard sources.
*/
const ALLOWED_HOSTS = new Set([
  "www.reuters.com", "reuters.com",
  "apnews.com", "www.apnews.com",
  "www.bbc.co.uk", "bbc.co.uk",
  "www.bbc.com", "bbc.com",
  "www.theguardian.com", "theguardian.com",
  "www.aljazeera.com", "aljazeera.com",
  "www.politico.com", "politico.com",
  "www.theverge.com", "theverge.com",
  "arstechnica.com", "www.arstechnica.com",
  "www.wired.com", "wired.com",
  "www.t3.com", "t3.com",
  "www.hackaday.com", "hackaday.com",
]);

function json(data, status = 200, cacheControl = "public, max-age=300") {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": cacheControl,
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}

export async function onRequestOptions() {
  return json({ ok: true }, 200, "no-store");
}

function err(message, status = 400, extra = undefined) {
  return json({ ok: false, error: message, ...(extra ? extra : {}) }, status, "no-store");
}

function isHttpUrl(s) {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function hostAllowed(host) {
  const h = String(host || "").toLowerCase().trim();
  return !!h && ALLOWED_HOSTS.has(h);
}

/* =========================
   Text helpers
   ========================= */

function clampText(s, maxChars) {
  const t = String(s || "");
  if (t.length <= maxChars) return t;
  return t.slice(0, maxChars).trimEnd() + "…";
}

// Soft hyphen + common zero-width chars
function stripSoftHyphens(s) {
  return String(s || "")
    .replace(/&shy;/gi, "")
    .replace(/\u00AD/g, "")
    .replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, "");
}

function normSpace(s) {
  return stripSoftHyphens(String(s || ""))
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// minimal HTML entity decoding (named + numeric)
function decodeEntities(input) {
  let s = stripSoftHyphens(String(input || ""));
  if (!s) return s;

  s = s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");

  s = s.replace(/&#(\d+);/g, (_, n) => {
    const code = Number(n);
    if (!Number.isFinite(code)) return _;
    try { return String.fromCodePoint(code); } catch { return _; }
  });

  s = s.replace(/&#x([0-9a-f]+);/gi, (_, hx) => {
    const code = parseInt(hx, 16);
    if (!Number.isFinite(code)) return _;
    try { return String.fromCodePoint(code); } catch { return _; }
  });

  return stripSoftHyphens(s);
}

function stripTags(s) {
  return stripSoftHyphens(decodeEntities(String(s || "")))
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n\n")
    .replace(/<\/li\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function isBadIdClass(idc) {
  const s = String(idc || "").toLowerCase();
  return (
    s.includes("cookie") ||
    s.includes("consent") ||
    s.includes("gdpr") ||
    s.includes("banner") ||
    s.includes("paywall") ||
    s.includes("subscribe") ||
    s.includes("subscription") ||
    s.includes("newsletter") ||
    s.includes("modal") ||
    s.includes("popup") ||
    s.includes("advert") ||
    s.includes("promo") ||
    s.includes("sponsor") ||
    s.includes("nav") ||
    s.includes("menu") ||
    s.includes("header") ||
    s.includes("footer") ||
    s.includes("sidebar") ||
    s.includes("related") ||
    s.includes("comment") ||
    s.includes("breadcrumbs") ||
    s.includes("search") ||
    s.includes("share") ||
    s.includes("login") ||
    s.includes("signin") ||
    s.includes("register")
  );
}

// WORLD menu/paywall noise detector
function looksLikeMenuNoise(txt) {
  const t0 = decodeEntities(normSpace(txt)).toLowerCase();
  if (!t0) return true;

  const badPhrases = [
    "skip to main content",
    "skip to content",
    "sign in",
    "log in",
    "subscribe",
    "subscription",
    "newsletter",
    "cookie",
    "consent",
    "privacy policy",
    "terms of service",
    "advertisement",
    "sponsored",
    "read more",
    "share this",
    "follow us",
    "most read",
    "related articles",
    "recommended",
  ];

  let hits = 0;
  for (const p of badPhrases) if (t0.includes(p)) hits++;
  if (hits >= 2) return true;

  // token-shape: nav dumps tend to be many short tokens
  const tokens = t0.split(/\s+/).filter(Boolean);
  if (tokens.length >= 18) {
    const short = tokens.filter(w => w.length <= 3).length;
    if (short / tokens.length > 0.58) return true;
  }

  // separators
  const sepHits = (t0.match(/-->|\|\||»|›|·|•|\/|</g) || []).length;
  if (sepHits >= 3) return true;

  return false;
}

// footer/legal/subscription noise (paragraph only)
function looksLikeFooterNoise(p) {
  const t = String(p || "").toLowerCase();
  const legalRe = /\b(copyright|all rights reserved|terms|privacy|cookies)\b/;
  const subsRe = /\b(subscribe|subscription|sign up|newsletter)\b/;
  return legalRe.test(t) || (subsRe.test(t) && t.length < 240);
}

function splitToParagraphs(rawText) {
  const t = normSpace(stripTags(rawText));
  if (!t) return [];
  const parts = t.split(/\n\s*\n/).map(p => normSpace(p)).filter(Boolean);
  return parts.slice(0, 120);
}

/* =========================
   Extractor
   ========================= */

class Extractor {
  constructor() {
    this.title = "";
    this.site = "";
    this._inBad = 0;
    this._inContent = 0;
    this._buf = [];
    this._pushed = 0;
  }

  push(txt) {
    let s = stripSoftHyphens(decodeEntities(normSpace(txt)));
    if (!s) return;
    if (looksLikeMenuNoise(s)) return;

    // Kill "megadumps" (long line, little punctuation)
    if (s.length > 650 && (s.match(/[.!?…]/g) || []).length < 2) return;

    this._buf.push(s);
    this._pushed++;
  }

  getParagraphs() {
    const out = [];
    let prev = "";
    for (const p of this._buf) {
      const s = stripSoftHyphens(decodeEntities(normSpace(p)));
      if (!s) continue;
      if (s === prev) continue;
      out.push(s);
      prev = s;
    }
    return out;
  }

  getText() {
    return normSpace(this.getParagraphs().join("\n\n"));
  }
}

/* =========================
   Host selectors
   ========================= */

function getSelectorsForHost(host) {
  const h = String(host || "").toLowerCase();

  // Default broad-ish
  let CONTENT_SELECTOR =
    "article, main, [role='main'], [itemprop='articleBody'], " +
    ".article-body, .article__body, .article__content, .content__body, " +
    ".story-body, .story__body, .entry-content, .post-content, .text, .body";

  // Site-specific nudges (small, safe)
  if (h.includes("theguardian.com")) {
    CONTENT_SELECTOR = "article, main article, [itemprop='articleBody'], .article-body";
  }
  if (h.includes("bbc.")) {
    CONTENT_SELECTOR = "article, main article, [role='main'], .ssrcss-*, [data-component='text-block']";
  }
  if (h.includes("reuters.com")) {
    CONTENT_SELECTOR = "article, main article, [role='main'], .article-body, .text";
  }
  if (h.includes("apnews.com")) {
    CONTENT_SELECTOR = "article, main article, [role='main'], .Article, .content";
  }

  const BAD_SELECTOR =
    "nav, header, footer, aside, form, button, script, style, noscript, svg, canvas";

  const BLOCK_SELECTOR = "p, li, h2, h3, blockquote";

  return { CONTENT_SELECTOR, BAD_SELECTOR, BLOCK_SELECTOR };
}

/* =========================
   Main handler
   ========================= */

export async function onRequestGet({ request }) {
  const { searchParams } = new URL(request.url);
  const rawUrl = (searchParams.get("url") || "").trim();
  const debug = searchParams.get("debug") === "1";

  if (!rawUrl) return err("Missing ?url=");
  if (!isHttpUrl(rawUrl)) return err("Invalid URL");

  let target;
  try { target = new URL(rawUrl); }
  catch { return err("Invalid URL"); }

  const host = target.hostname.toLowerCase();
  if (!hostAllowed(host)) {
    return err("Host not allowed", 403, { host });
  }

  // Fetch with timeout
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort("timeout"), 9000);

  let html = "";
  let status = 0;
  let contentType = "";

  try {
    const res = await fetch(target.toString(), {
      signal: ac.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; is.is readingview bot; +https://is.is) AppleWebKit/537.36 (KHTML, like Gecko)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-GB,en;q=0.9,is;q=0.6",
      },
    });

    status = res.status;
    contentType = res.headers.get("content-type") || "";

    if (!res.ok) return err("Fetch failed", 502, { status, contentType });
    if (!contentType.toLowerCase().includes("text/html")) {
      return err("URL did not return HTML", 415, { status, contentType });
    }

    html = await res.text();
    if (html.length > 2_000_000) html = html.slice(0, 2_000_000);
  } catch (e) {
    return err("Fetch exception", 502, { details: String(e?.message || e) });
  } finally {
    clearTimeout(timer);
  }

  const ex = new Extractor();
  const { CONTENT_SELECTOR, BAD_SELECTOR, BLOCK_SELECTOR } = getSelectorsForHost(host);

  const rewriter = new HTMLRewriter()
    // Site name
    .on("meta[property='og:site_name']", {
      element(el) {
        const c = el.getAttribute("content");
        if (c && !ex.site) ex.site = stripSoftHyphens(decodeEntities(normSpace(c)));
      },
    })
    .on("meta[name='application-name']", {
      element(el) {
        const c = el.getAttribute("content");
        if (c && !ex.site) ex.site = stripSoftHyphens(decodeEntities(normSpace(c)));
      },
    })
    // Best title: og:title
    .on("meta[property='og:title']", {
      element(el) {
        const c = el.getAttribute("content");
        if (c) ex.title = stripSoftHyphens(decodeEntities(normSpace(c)));
      },
    })
    // fallback <title>
    .on("title", {
      text(t) { if (!ex.title) ex.title += t.text; },
      end() { ex.title = stripSoftHyphens(decodeEntities(normSpace(ex.title))); },
    })
    // h1 best-effort
    .on("h1", {
      element(el) {
        const idc = (el.getAttribute("id") || "") + " " + (el.getAttribute("class") || "");
        if (isBadIdClass(idc)) ex._inBad++;
      },
      text(t) {
        if (ex._inBad) return;
        const h1 = stripSoftHyphens(decodeEntities(normSpace(t.text)));
        if (h1 && h1.length > 4 && h1.length < 240) ex.title = h1;
      },
      end() { if (ex._inBad) ex._inBad--; },
    })
    // hard bad zones
    .on(BAD_SELECTOR, {
      element() { ex._inBad++; },
      end() { ex._inBad--; },
    })
    // bad containers by id/class keywords
    .on("[class], [id]", {
      element(el) {
        const idc = (el.getAttribute("id") || "") + " " + (el.getAttribute("class") || "");
        if (isBadIdClass(idc)) ex._inBad++;
      },
      end(el) {
        const idc = (el.getAttribute("id") || "") + " " + (el.getAttribute("class") || "");
        if (isBadIdClass(idc)) ex._inBad--;
      },
    })
    // content zone depth
    .on(CONTENT_SELECTOR, {
      element(el) {
        const idc = (el.getAttribute("id") || "") + " " + (el.getAttribute("class") || "");
        if (isBadIdClass(idc)) ex._inBad++;
        else ex._inContent++;
      },
      end(el) {
        const idc = (el.getAttribute("id") || "") + " " + (el.getAttribute("class") || "");
        if (isBadIdClass(idc)) ex._inBad--;
        else ex._inContent--;
      },
    })
    // collect blocks inside content zones only
    .on(BLOCK_SELECTOR, {
      text(t) {
        if (ex._inBad) return;
        if (ex._inContent <= 0) return;

        const txt = stripSoftHyphens(decodeEntities(normSpace(t.text)));
        if (!txt) return;
        if (txt.length < 22) return;

        ex.push(txt);
      },
    });

  await rewriter
    .transform(new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } }))
    .text();

  // Primary extraction
  let paragraphs = ex.getParagraphs();
  let text = ex.getText();

  // Generic fallback ONLY if still failed
  if (text.length < 220) {
    const stripped = stripSoftHyphens(decodeEntities(html))
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<\/(p|div|br|li|h\d|blockquote)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    const lines = stripped.split(/\n+/).map(s => normSpace(s)).filter(Boolean);

    const kept = [];
    for (const line of lines) {
      if (line.length < 95) continue;
      if (looksLikeMenuNoise(line)) continue;
      kept.push(line);
      if (kept.join("\n\n").length > 12000) break;
    }

    paragraphs = kept.slice(0, 120);
    text = normSpace(paragraphs.join("\n\n"));
  }

  // Final cleanup
  const cleanTitle = clampText(
    stripSoftHyphens(decodeEntities(normSpace(ex.title))) || "Untitled",
    240
  );

  const site = clampText(
    stripSoftHyphens(decodeEntities(normSpace(ex.site))) || host,
    120
  );

  let finalParagraphs = (paragraphs || [])
    .map(p => stripSoftHyphens(decodeEntities(normSpace(p))))
    .map(p => stripTags(p))
    .map(p => normSpace(p))
    .filter(Boolean)
    .filter(p => !looksLikeMenuNoise(p))
    .filter(p => !looksLikeFooterNoise(p))
    .slice(0, 120);

  const finalText = clampText(normSpace(finalParagraphs.join("\n\n")), 15000);
  const excerpt = clampText(finalText.replace(/\n+/g, " ").trim(), 240);
  const wordCount = finalText ? finalText.split(/\s+/).filter(Boolean).length : 0;

  text = finalText;

  // If still basically nothing, return ok=false so UI shows your friendly message
  if (text.length < 120) {
    return err("Extraction too small (blocked or JS-only layout)", 502, {
      host, status, contentType, got: text.length
    });
  }

  const payload = {
    ok: true,
    url: target.toString(),
    host,
    site,
    title: cleanTitle,
    excerpt,
    wordCount,
    charCount: text.length,
    text,
    paragraphs: finalParagraphs,
  };

  if (debug) {
    payload.debug = {
      fetch: { status, contentType, htmlLen: html.length, host },
      selectors: { CONTENT_SELECTOR, BAD_SELECTOR, BLOCK_SELECTOR },
      extract: { pushed: ex._pushed, paraCount: finalParagraphs.length, finalLen: text.length },
    };
  }

  return json(payload, 200, debug ? "no-store" : "public, max-age=300");
}
