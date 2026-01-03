// /functions/api/readingview.js
// Reading View scraper for ís.is (Cloudflare Pages Functions)
//
// Goals:
//  - Pull clean article text (avoid nav/menu/footer/share/subscription dumps)
//  - Work well for DV + RÚV (and others) with conservative heuristics
//  - Decode HTML entities like &#8211; and &#xFA; so text renders correctly
//
// Output:
// { ok, url, host, site, title, excerpt, wordCount, charCount, text, paragraphs[], debug? }

"use strict";

const ALLOWED_HOSTS = new Set([
  "www.ruv.is", "ruv.is",
  "www.mbl.is", "mbl.is",
  "www.visir.is", "visir.is",
  "www.dv.is", "dv.is",
  "www.vb.is", "vb.is",
  "stundin.is", "www.stundin.is",
  "heimildin.is", "www.heimildin.is",
  "grapevine.is", "www.grapevine.is",
  "433.is", "www.433.is",
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

function normSpace(s) {
  return String(s || "")
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Decode minimal set of HTML entities (numeric + common named)
// Handles: &#8211;  &#xFA;  &amp; &quot; &apos; &lt; &gt; &nbsp;
function decodeEntities(input) {
  let s = String(input || "");
  if (!s) return s;

  // Common named
  s = s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");

  // Numeric decimal
  s = s.replace(/&#(\d+);/g, (_, n) => {
    const code = Number(n);
    if (!Number.isFinite(code)) return _;
    try { return String.fromCodePoint(code); } catch { return _; }
  });

  // Numeric hex
  s = s.replace(/&#x([0-9a-f]+);/gi, (_, hx) => {
    const code = parseInt(hx, 16);
    if (!Number.isFinite(code)) return _;
    try { return String.fromCodePoint(code); } catch { return _; }
  });

  return s;
}

function isBadIdClass(idc) {
  const s = String(idc || "").toLowerCase();
  // IMPORTANT: keep this conservative (avoid nuking legit content containers)
  return (
    s.includes("cookie") ||
    s.includes("consent") ||
    s.includes("gdpr") ||
    s.includes("banner") ||
    s.includes("paywall") ||
    s.includes("subscribe") ||
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
    s.includes("share")
  );
}

// Stronger “menu dump” detector (fixes DV/RÚV spill)
function looksLikeMenuNoise(txt) {
  const t0 = decodeEntities(normSpace(txt)).toLowerCase();
  if (!t0) return true;

  // RÚV/DV typical UI crumbs
  const badPhrases = [
    "hoppa í aðalefni",
    "valmynd",
    "leit",
    "search for",
    "english",
    "pólski",
    "auðskilið",
    "ruv",
    "efstaleiti",
    "sími:",
    "hafa samband",
    "yfirlýsing um persónuvernd",
    "skrá inn",
    "styrkja",
    "forsíða",
    "um dv",
    "upplýsingar",
    "rekstur og stjórn",
    "starfsfólk",
    "lesa nánar",
    "ekki missa af",
    "helstu tíðindum",
    "í pósthólfið",
    "kynning",
    "fasteignir",
    "uppskriftir",
  ];
  let hits = 0;
  for (const p of badPhrases) if (t0.includes(p)) hits++;
  if (hits >= 2) return true;

  // Many very short tokens => menu-like
  const tokens = t0.split(/\s+/).filter(Boolean);
  if (tokens.length >= 16) {
    const short = tokens.filter(w => w.length <= 3).length;
    if (short / tokens.length > 0.55) return true;
  }

  // Lots of separators/arrow patterns typical in nav text
  const sepHits = (t0.match(/-->|\|\||»|›|·|•|\/|</g) || []).length;
  if (sepHits >= 3) return true;

  // Looks like a "list of sections/categories"
  const navWords = [
    "fréttir", "íþróttir", "menning", "viðskipti", "erlent", "innlent",
    "fókus", "pressan", "eyjan", "tónlist", "sjónvarp", "útvarp",
    "rannsóknir", "umræða", "fólk", "lífið", "veður", "bílar",
    "meira", "dagmál", "blaðamenn", "bókamerki"
  ];
  const navHits = navWords.reduce((acc, w) => acc + (t0.includes(w) ? 1 : 0), 0);
  if (navHits >= 5) return true;

  return false;
}

/* =========================
   Extractor
   ========================= */

class Extractor {
  constructor() {
    this.title = "";
    this.site = "";

    this._inBad = 0;
    this._inContent = 0; // only collect inside content zones
    this._buf = [];
    this._pushed = 0;
  }

  push(txt) {
    let s = decodeEntities(normSpace(txt));
    if (!s) return;

    // Kill obvious menu dumps early
    if (looksLikeMenuNoise(s)) return;

    // Reduce “single-line megadumps”
    // If it’s huge and has little punctuation, it’s usually nav
    if (s.length > 600 && (s.match(/[.!?…]/g) || []).length < 2) return;

    this._buf.push(s);
    this._pushed++;
  }

  getParagraphs() {
    // De-dupe adjacent duplicates + normalize
    const out = [];
    let prev = "";
    for (const p of this._buf) {
      const s = decodeEntities(normSpace(p));
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
   Host-tuned selectors
   ========================= */

function getSelectorsForHost(host) {
  const h = String(host || "").toLowerCase();

  // Default: fairly broad but safe-ish.
  let CONTENT_SELECTOR =
    "article, main, [role='main'], [itemprop='articleBody'], .entry-content, .post-content, .article-body, .article__body, .content__body, .story-body, .story__body, .news__content, .text";

  // RÚV tends to have lots of “main” furniture; bias towards article-y containers.
  if (h === "ruv.is" || h === "www.ruv.is") {
    CONTENT_SELECTOR =
      "article, [itemprop='articleBody'], .article, .article__body, .article__content, .story, .story__body, .news__content, main article";
  }

  // DV sometimes has large navigation blocks; keep default but still ok.
  if (h === "dv.is" || h === "www.dv.is") {
    CONTENT_SELECTOR =
      "article, [itemprop='articleBody'], .entry-content, .post-content, .article-body, .article__body, .content__body, main article";
  }

  // “bad zones” we never want
  const BAD_SELECTOR =
    "nav, header, footer, aside, form, button, script, style, noscript, svg, canvas";

  // Collect blocks as paragraphs
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

  if (!hostAllowed(target.hostname)) {
    return err("Host not allowed", 403, { host: target.hostname });
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
        // More browser-like UA helps with some sites
        "User-Agent":
          "Mozilla/5.0 (compatible; is.is readingview bot; +https://is.is) AppleWebKit/537.36 (KHTML, like Gecko)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "is,is-IS;q=0.9,en;q=0.7",
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
  const host = target.hostname.toLowerCase();
  const { CONTENT_SELECTOR, BAD_SELECTOR, BLOCK_SELECTOR } = getSelectorsForHost(host);

  const rewriter = new HTMLRewriter()
    // Site name
    .on("meta[property='og:site_name']", {
      element(el) {
        const c = el.getAttribute("content");
        if (c && !ex.site) ex.site = decodeEntities(normSpace(c));
      },
    })
    .on("meta[name='application-name']", {
      element(el) {
        const c = el.getAttribute("content");
        if (c && !ex.site) ex.site = decodeEntities(normSpace(c));
      },
    })
    // Best title: og:title if present
    .on("meta[property='og:title']", {
      element(el) {
        const c = el.getAttribute("content");
        if (c) ex.title = decodeEntities(normSpace(c));
      },
    })
    // fallback <title>
    .on("title", {
      text(t) {
        if (!ex.title) ex.title += t.text;
      },
      end() {
        ex.title = decodeEntities(normSpace(ex.title));
      },
    })
    // h1 is often best, but only outside bad subtree
    .on("h1", {
      element(el) {
        const idc = (el.getAttribute("id") || "") + " " + (el.getAttribute("class") || "");
        if (isBadIdClass(idc)) ex._inBad++;
      },
      text(t) {
        if (ex._inBad) return;
        const h1 = decodeEntities(normSpace(t.text));
        if (h1 && h1.length > 4 && h1.length < 220) ex.title = h1;
      },
      end() {
        if (ex._inBad) ex._inBad--;
      },
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

        const txt = decodeEntities(normSpace(t.text));
        if (!txt) return;

        // Keep some short real lines, but drop tiny crumbs
        if (txt.length < 22) return;

        ex.push(txt);
      },
    });

  await rewriter
    .transform(new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } }))
    .text();

  // Primary extraction result
  let paragraphs = ex.getParagraphs();
  let text = ex.getText();

  // Fallback ONLY if content zones failed (avoid bringing nav back)
  if (text.length < 220) {
    const stripped = decodeEntities(html)
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
      if (line.length < 80) continue;
      if (looksLikeMenuNoise(line)) continue;
      kept.push(line);
      if (kept.join("\n\n").length > 12000) break;
    }

    paragraphs = kept.slice(0, 80);
    text = normSpace(paragraphs.join("\n\n"));
  }

  // Final clean + stats
  text = clampText(text, 15000);
  const cleanTitle = clampText(decodeEntities(normSpace(ex.title)) || "Ónefnd frétt", 240);
  const site = clampText(decodeEntities(normSpace(ex.site)) || host, 120);

  const finalParagraphs = paragraphs
    .map(p => decodeEntities(normSpace(p)))
    .filter(Boolean)
    .filter(p => !looksLikeMenuNoise(p))
    .slice(0, 120);

  // Rebuild text from cleaned paragraphs (keeps entities fixed)
  text = clampText(normSpace(finalParagraphs.join("\n\n")), 15000);

  const excerpt = clampText(text.replace(/\n+/g, " ").trim(), 240);
  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;

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

  // If still basically nothing, return ok=false so UI can show your friendly message
  if (payload.charCount < 120) {
    return err("Extraction too small (blocked or unusual layout)", 502, {
      host,
      status,
      contentType,
      got: payload.charCount,
    });
  }

  return json(payload, 200, debug ? "no-store" : "public, max-age=300");
}