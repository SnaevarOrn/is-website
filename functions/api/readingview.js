// /functions/api/readingview.js
// Reading View scraper for ís.is (Cloudflare Pages Functions)
//
// Goals:
//  - Pull clean article text (avoid nav/menu/footer/share/subscription dumps)
//  - DV + RÚV: extra defensive heuristics
//  - Decode HTML entities like &#8211; and &#xFA;
//  - Filter out &shy; (soft hyphen) and common zero-width chars
//  - If RÚV article text is not in DOM blocks, extract from JSON-LD / __NEXT_DATA__
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

// Remove soft hyphen + common zero-width chars.
// Soft hyphen can arrive as entity (&shy;) or as decoded char (\u00AD).
function stripSoftHyphens(s) {
  return String(s || "")
    .replace(/&shy;/gi, "")      // entity form
    .replace(/\u00AD/g, "")      // decoded soft hyphen char
    .replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, ""); // zero-width junk
}

function normSpace(s) {
  return stripSoftHyphens(String(s || ""))
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Decode minimal set of HTML entities (numeric + common named)
function decodeEntities(input) {
  // IMPORTANT: kill &shy; BEFORE decoding numerics
  let s = stripSoftHyphens(String(input || ""));
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

  // IMPORTANT: kill decoded soft hyphens AFTER decoding
  s = stripSoftHyphens(s);

  return s;
}

// Strip tags if we end up with HTML-ish blobs (from JSON fields sometimes)
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

// Strong “menu dump” detector (DV/RÚV)
function looksLikeMenuNoise(txt) {
  const t0 = decodeEntities(normSpace(txt)).toLowerCase();
  if (!t0) return true;

  const badPhrases = [
    "hoppa í aðalefni",
    "valmynd",
    "leit",
    "search for",
    "english",
    "pólski",
    "auðskilið",
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
    "uppskriftir",
    "fasteignir",
    "athugasemdir",
  ];
  let hits = 0;
  for (const p of badPhrases) if (t0.includes(p)) hits++;
  if (hits >= 2) return true;

  const tokens = t0.split(/\s+/).filter(Boolean);
  if (tokens.length >= 16) {
    const short = tokens.filter(w => w.length <= 3).length;
    if (short / tokens.length > 0.55) return true;
  }

  const sepHits = (t0.match(/-->|\|\||»|›|·|•|\/|</g) || []).length;
  if (sepHits >= 3) return true;

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
// Comment-disclaimer "cut marker" — drop paragraph + everything after it
function truncateFromCommentDisclaimer(paragraphs) {
  const paras = Array.isArray(paragraphs) ? paragraphs.slice() : [];
  if (!paras.length) return paras;

  // Require "athugasemd" + (ábyrgð + rétt/áskilur) OR (ærumeið) OR (tilkynna/smelltu)
  const markerRe = /\bathugasemd(?:ir|um|a)?\b/i;
  const responsibilityRe = /\b(ábyrgð|á\s+ábyrgð)\b/i;
  const rightsRe = /\b(áskilur|áskilja|rétt(?:\s+til)?|fjarlægja|eyða)\b/i;
  const abuseRe = /\b(ærumeið|ósæmileg|óviðeigandi)\b/i;
  const reportRe = /\b(tilkynna|smelltu\s+hér)\b/i;

  const isCutMarker = (s) => {
    const t = String(s || "");
    if (!markerRe.test(t)) return false;

    const a = responsibilityRe.test(t);
    const r = rightsRe.test(t);
    const b = abuseRe.test(t);
    const p = reportRe.test(t);

    // Strong enough combos (keeps false positives low)
    return (a && r) || b || p;
  };

  for (let i = 0; i < paras.length; i++) {
    const p = paras[i];

    // If marker is the whole paragraph -> cut from here
    if (isCutMarker(p)) return paras.slice(0, i);

    // If marker starts mid-paragraph -> trim paragraph and cut rest
    // (useful when the disclaimer is appended at bottom)
    if (markerRe.test(p) && (abuseRe.test(p) || reportRe.test(p) || (responsibilityRe.test(p) && rightsRe.test(p)))) {
      // crude but effective: cut at first "Athugasemd..." occurrence
      const m = p.match(/\bathugasemd(?:ir|um|a)?\b/i);
      if (m && typeof m.index === "number" && m.index > 0) {
        const head = p.slice(0, m.index).trim();
        return head ? paras.slice(0, i).concat([head]) : paras.slice(0, i);
      }
      return paras.slice(0, i);
    }
  }

  return paras;
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

    // Kill "megadumps"
    if (s.length > 600 && (s.match(/[.!?…]/g) || []).length < 2) return;

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

  // Default broad-ish, still safe
  let CONTENT_SELECTOR =
    "article, main, [role='main'], [itemprop='articleBody'], .entry-content, .post-content, .article-body, .article__body, .content__body, .story-body, .story__body, .news__content, .text";

  // RÚV: avoid plain "main" (often contains nav furniture + sometimes JS-only body)
  if (h === "ruv.is" || h === "www.ruv.is") {
    CONTENT_SELECTOR =
      "article, [itemprop='articleBody'], .article, .article__body, .article__content, .story, .story__body, .news__content, main article";
  }

  // DV: bias toward article containers
  if (h === "dv.is" || h === "www.dv.is") {
    CONTENT_SELECTOR =
      "article, [itemprop='articleBody'], .entry-content, .post-content, .article-body, .article__body, .content__body, main article";
  }

  const BAD_SELECTOR =
    "nav, header, footer, aside, form, button, script, style, noscript, svg, canvas";

  const BLOCK_SELECTOR = "p, li, h2, h3, blockquote";

  return { CONTENT_SELECTOR, BAD_SELECTOR, BLOCK_SELECTOR };
}

/* =========================
   RÚV structured-data fallback
   ========================= */

function tryParseJsonSafe(s) {
  try { return JSON.parse(s); } catch { return null; }
}

function* iterateJsonNodes(root, maxNodes = 4000) {
  const stack = [root];
  let seen = 0;
  while (stack.length && seen < maxNodes) {
    const node = stack.pop();
    seen++;
    yield node;
    if (node && typeof node === "object") {
      if (Array.isArray(node)) {
        for (let i = node.length - 1; i >= 0; i--) stack.push(node[i]);
      } else {
        const keys = Object.keys(node);
        for (let i = keys.length - 1; i >= 0; i--) stack.push(node[keys[i]]);
      }
    }
  }
}

function pickBestLongText(strings) {
  const candidates = [];
  for (const s of strings) {
    const t = normSpace(stripTags(s));
    if (!t) continue;
    if (t.length < 220) continue;
    if (looksLikeMenuNoise(t)) continue;

    // Prefer Icelandic-looking text with punctuation
    const icelandic = (t.match(/[áðéíóúýþæö]/gi) || []).length;
    const punct = (t.match(/[.!?…]/g) || []).length;

    // Score: length + icelandic + punctuation
    const score = t.length + icelandic * 8 + punct * 20;
    candidates.push({ t, score });
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates.length ? candidates[0].t : "";
}

function extractRuvFromJsonLd(html) {
  // Grab JSON-LD scripts
  const scripts = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const raw = stripSoftHyphens(decodeEntities((m[1] || "").trim()));
    if (raw) scripts.push(raw);
    if (scripts.length > 10) break;
  }

  let best = null;

  for (const raw of scripts) {
    const parsed = tryParseJsonSafe(raw);
    if (!parsed) continue;

    // Walk nodes and look for NewsArticle/Article with articleBody
    for (const node of iterateJsonNodes(parsed)) {
      if (!node || typeof node !== "object") continue;

      const type = node["@type"];
      const isArticleType =
        (typeof type === "string" && /newsarticle|article/i.test(type)) ||
        (Array.isArray(type) && type.some(x => typeof x === "string" && /newsarticle|article/i.test(x)));

      if (!isArticleType) continue;

      const body = node.articleBody || node.text || node.description;
      const headline = node.headline || node.name;
      const date = node.datePublished || node.dateModified;

      const bodyStr = typeof body === "string" ? body : "";
      const headStr = typeof headline === "string" ? headline : "";
      const dateStr = typeof date === "string" ? date : "";

      const cleanBody = normSpace(stripTags(bodyStr));
      if (cleanBody.length < 220) continue;
      if (looksLikeMenuNoise(cleanBody)) continue;

      // Pick the longest body
      const score = cleanBody.length;
      if (!best || score > best.score) {
        best = { body: cleanBody, title: headStr, date: dateStr, score };
      }
    }
  }

  return best; // {body,title,date,score} | null
}

function extractRuvFromNextData(html) {
  const m = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return null;
  const raw = stripSoftHyphens(decodeEntities((m[1] || "").trim()));
  const parsed = tryParseJsonSafe(raw);
  if (!parsed) return null;

  // Collect strings and pick best long text
  const strings = [];
  for (const node of iterateJsonNodes(parsed)) {
    if (typeof node === "string") strings.push(node);
    if (strings.length > 8000) break;
  }
  const bestText = pickBestLongText(strings);
  if (!bestText) return null;

  // Title: also try to pick a plausible headline
  const titleCand = strings
    .map(s => normSpace(stripTags(s)))
    .filter(s => s && s.length > 10 && s.length < 220 && /[áðéíóúýþæö]/i.test(s))
    .sort((a, b) => b.length - a.length)[0] || "";

  return { body: bestText, title: titleCand, date: "" };
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
        if (c && !ex.site) ex.site = stripSoftHyphens(decodeEntities(normSpace(c)));
      },
    })
    .on("meta[name='application-name']", {
      element(el) {
        const c = el.getAttribute("content");
        if (c && !ex.site) ex.site = stripSoftHyphens(decodeEntities(normSpace(c)));
      },
    })
    // Best title: og:title if present
    .on("meta[property='og:title']", {
      element(el) {
        const c = el.getAttribute("content");
        if (c) ex.title = stripSoftHyphens(decodeEntities(normSpace(c)));
      },
    })
    // fallback <title>
    .on("title", {
      text(t) {
        if (!ex.title) ex.title += t.text;
      },
      end() {
        ex.title = stripSoftHyphens(decodeEntities(normSpace(ex.title)));
      },
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

  // RÚV special fallback: JSON-LD / __NEXT_DATA__
  if ((host === "ruv.is" || host === "www.ruv.is") && text.length < 220) {
    const ld = extractRuvFromJsonLd(html);
    if (ld && ld.body) {
      paragraphs = splitToParagraphs(ld.body);
      text = normSpace(paragraphs.join("\n\n"));
      if (ld.title && (!ex.title || ex.title.length < 8)) ex.title = ld.title;
    } else {
      const nx = extractRuvFromNextData(html);
      if (nx && nx.body) {
        paragraphs = splitToParagraphs(nx.body);
        text = normSpace(paragraphs.join("\n\n"));
        if (nx.title && (!ex.title || ex.title.length < 8)) ex.title = nx.title;
      }
    }
  }

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
      if (line.length < 90) continue;
      if (looksLikeMenuNoise(line)) continue;
      kept.push(line);
      if (kept.join("\n\n").length > 12000) break;
    }

    paragraphs = kept.slice(0, 120);
    text = normSpace(paragraphs.join("\n\n"));
  }

 // Final cleanup
const cleanTitle = clampText(
  stripSoftHyphens(decodeEntities(normSpace(ex.title))) || "Ónefnd frétt",
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
  .slice(0, 120);

// 👇 cut-marker patch
finalParagraphs = truncateFromCommentDisclaimer(finalParagraphs);

// 👇 build final text ONCE
const finalText = clampText(normSpace(finalParagraphs.join("\n\n")), 15000);
const excerpt = clampText(finalText.replace(/\n+/g, " ").trim(), 240);
const wordCount = finalText ? finalText.split(/\s+/).filter(Boolean).length : 0;

// replace the old `text` variable used below
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
      ruvFallbackUsed: (host === "ruv.is" || host === "www.ruv.is") && ex._pushed === 0,
    };
  }

  return json(payload, 200, debug ? "no-store" : "public, max-age=300");
}
