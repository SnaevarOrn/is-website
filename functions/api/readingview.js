// /functions/api/readingview.js
// Reading View scraper for ís.is (Cloudflare Pages Functions)
//
// Key changes (better DV + cleaner output):
//  - Collect text ONLY inside "content zones" (article/main/articleBody/entry-content/etc.)
//  - Remove common newsletter/social/disclaimer noise lines
//  - Hard-stop when "related lists" start (Fleiri fréttir / Mest lesið / Rétt í þessu / Nýlegt ...)
//  - Global fallback runs ONLY if content zones yield almost nothing.

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

function clampText(s, maxChars) {
  const t = String(s || "");
  if (t.length <= maxChars) return t;
  return t.slice(0, maxChars).trimEnd() + "…";
}

function normSpace(s) {
  return String(s || "")
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
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
    s.includes("ad") ||
    s.includes("ads") ||
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
    s.includes("search")
  );
}

// Light sanity filter against “menu dump” paragraphs
function looksLikeMenuNoise(txt) {
  const t = normSpace(txt).toLowerCase();
  if (!t) return true;

  // Too many very short tokens => menu-like
  const tokens = t.split(/\s+/).filter(Boolean);
  if (tokens.length >= 18) {
    const short = tokens.filter(w => w.length <= 3).length;
    if (short / tokens.length > 0.55) return true;
  }

  // Lots of separators/arrow patterns typical in scraped nav text
  const sepHits = (t.match(/-->|\|\||»|›|</g) || []).length;
  if (sepHits >= 2) return true;

  // Looks like a "list of sections"
  const navWords = [
    "hafa samband", "um dv", "yfirlýsing um persónuvernd", "leit", "search for",
    "fréttir", "fókus", "pressan", "eyjan", "433", "menning", "tónlist",
    "uppskriftir", "fasteignir", "kynning"
  ];
  const hits = navWords.reduce((acc, w) => acc + (t.includes(w) ? 1 : 0), 0);
  if (hits >= 4) return true;

  return false;
}

// Lines that are not part of the article body (newsletter/social/disclaimer etc.)
function isNoiseLine(s) {
  const t = normSpace(s).toLowerCase();

  // Keep these pretty strict: we only remove obvious boilerplate.
  const badPhrases = [
    "ekki missa af",
    "helstu tíðindum dagsins",
    "í pósthólfið",
    "pósthólfið þitt",
    "lesa nánar",
    "skráðu þig",
    "fáðu helstu",
    "facebook",
    "twitter",
    "linkedin",
    "athugasemdir eru á ábyrgð",
    "áskilur sér rétt",
    "rétt til að eyða ummælum",
    "persónuvernd",
  ];

  if (badPhrases.some(p => t.includes(p))) return true;

  // Pure social row / “share” crumbs
  if (/^(facebook|twitter|linkedin)\b/.test(t)) return true;

  return false;
}

// When these appear, the article is basically over and lists begin
function isStopAnchor(s) {
  const t = normSpace(s).toLowerCase();

  const anchors = [
    "fleiri fréttir",
    "mest lesið",
    "tengdar fréttir",
    "rétt í þessu",
    "nýlegt",
  ];

  // strict match or a very close start
  return anchors.some(a => t === a || t.startsWith(a + " "));
}

// Reject tiny crumbs like "janúar 2026 12:00" etc.
function isLikelyCrumb(txt) {
  const s = normSpace(txt);
  const low = s.toLowerCase();

  // time-only or time-dominant
  if (/\b\d{1,2}:\d{2}\b/.test(low) && s.length < 90) return true;

  // date-ish lead with month name (Icelandic) and short length
  if (
    /^(janúar|febrúar|mars|apríl|maí|júní|júlí|ágúst|september|október|nóvember|desember)\b/.test(low) &&
    s.length < 80
  ) return true;

  // "3. janúar" style
  if (/^\d{1,2}\.\s*[a-záðéíóúýþæö]+/.test(low) && s.length < 70) return true;

  return false;
}

class Extractor {
  constructor() {
    this.title = "";
    this.site = "";

    this._inBad = 0;
    this._inContent = 0;   // IMPORTANT: only collect inside content zones
    this._buf = [];

    this._pushed = 0;
    this._stop = false;    // hard stop after anchors
  }

  push(txt) {
    if (this._stop) return;

    const s = normSpace(txt);
    if (!s) return;

    // Stop when "related lists" begin
    if (isStopAnchor(s)) {
      this._stop = true;
      return;
    }

    if (looksLikeMenuNoise(s)) return;
    if (isNoiseLine(s)) return;
    if (isLikelyCrumb(s)) return;

    this._buf.push(s);
    this._pushed++;
  }

  getText() {
    // de-dupe adjacent duplicates a bit
    const out = [];
    let prev = "";
    for (const p of this._buf) {
      if (p && p !== prev) out.push(p);
      prev = p;
    }
    return normSpace(out.join("\n\n"));
  }
}

export async function onRequestGet({ request }) {
  const { searchParams } = new URL(request.url);
  const rawUrl = (searchParams.get("url") || "").trim();
  const debug = searchParams.get("debug") === "1";

  if (!rawUrl) return json({ ok: false, error: "Missing ?url=" }, 400, "no-store");
  if (!isHttpUrl(rawUrl)) return json({ ok: false, error: "Invalid URL" }, 400, "no-store");

  let target;
  try { target = new URL(rawUrl); }
  catch { return json({ ok: false, error: "Invalid URL" }, 400, "no-store"); }

  if (!hostAllowed(target.hostname)) {
    return json({ ok: false, error: "Host not allowed", host: target.hostname }, 403, "no-store");
  }

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
        "User-Agent": "is.is readingview bot",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "is,is-IS;q=0.9,en;q=0.7",
      },
    });

    status = res.status;
    contentType = res.headers.get("content-type") || "";

    if (!res.ok) {
      clearTimeout(timer);
      return json({ ok: false, error: "Fetch failed", status, contentType }, 502, "no-store");
    }
    if (!contentType.toLowerCase().includes("text/html")) {
      clearTimeout(timer);
      return json({ ok: false, error: "URL did not return HTML", status, contentType }, 415, "no-store");
    }

    html = await res.text();
    if (html.length > 2_000_000) html = html.slice(0, 2_000_000);
  } catch (e) {
    clearTimeout(timer);
    return json({ ok: false, error: "Fetch exception", details: String(e?.message || e) }, 502, "no-store");
  } finally {
    clearTimeout(timer);
  }

  const ex = new Extractor();

  // CONTENT ZONES:
  // - article/main
  // - common WP content containers (entry-content/post-content/article-body)
  // - schema.org articleBody
  const CONTENT_SELECTOR =
    "article, main, [itemprop='articleBody'], .entry-content, .post-content, .article-body, .article__body, .content__body";

  // "bad zones" we never want
  const BAD_SELECTOR =
    "nav, header, footer, aside, form, button, script, style, noscript";

  const rewriter = new HTMLRewriter()
    .on("meta[property='og:site_name']", {
      element(el) {
        const c = el.getAttribute("content");
        if (c && !ex.site) ex.site = normSpace(c);
      },
    })
    .on("meta[name='application-name']", {
      element(el) {
        const c = el.getAttribute("content");
        if (c && !ex.site) ex.site = normSpace(c);
      },
    })
    // Better title: og:title if present
    .on("meta[property='og:title']", {
      element(el) {
        const c = el.getAttribute("content");
        if (c) ex.title = normSpace(c);
      },
    })
    .on("title", {
      text(t) {
        // only use <title> if og:title hasn't filled it
        if (!ex.title) ex.title += t.text;
      },
      end() {
        ex.title = normSpace(ex.title);
      },
    })
    // h1 is often best, but only if it's not in a "bad subtree"
    .on("h1", {
      element(el) {
        const idc = (el.getAttribute("id") || "") + " " + (el.getAttribute("class") || "");
        if (isBadIdClass(idc)) ex._inBad++;
      },
      text(t) {
        if (ex._inBad) return;
        const h1 = normSpace(t.text);
        if (h1 && h1.length > 4) ex.title = h1;
      },
      end() {
        if (ex._inBad) ex._inBad--;
      },
    })
    .on(BAD_SELECTOR, {
      element() { ex._inBad++; },
      end() { ex._inBad--; },
    })
    // mark obvious bad containers by id/class keywords
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
    // collect text only inside content zones
    .on("p, li, h2, h3, blockquote", {
      text(t) {
        if (ex._inBad) return;
        if (ex._inContent <= 0) return;
        if (ex._stop) return;

        const txt = normSpace(t.text);
        if (!txt) return;

        // Require some substance
        if (txt.length < 35) return;

        ex.push(txt);
      },
    });

  await rewriter
    .transform(new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } }))
    .text();

  let text = ex.getText();

  // Fallback ONLY if we got almost nothing from content zones
  if (text.length < 200) {
    const stripped = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<\/(p|div|br|li|h\d|blockquote)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const chunks = stripped.split(/(?<=[\.\!\?])\s+/).filter(Boolean);
    const kept = [];
    let acc = 0;

    for (const c of chunks) {
      const cc = c.trim();
      if (cc.length < 90) continue;
      if (looksLikeMenuNoise(cc)) continue;
      if (isNoiseLine(cc)) continue;
      if (isStopAnchor(cc)) break; // if we meet anchors here, stop too
      kept.push(cc);
      acc += cc.length;
      if (acc > 8000) break;
    }

    text = normSpace(kept.join("\n\n"));
  }

  text = clampText(text, 15000);
  const title = clampText(normSpace(ex.title) || "Ónefnd frétt", 240);
  const site = clampText(normSpace(ex.site) || target.hostname, 120);
  const excerpt = clampText(text.replace(/\n+/g, " ").trim(), 240);
  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;

  const payload = {
    ok: true,
    url: target.toString(),
    site,
    title,
    excerpt,
    wordCount,
    charCount: text.length,
    text,
  };

  if (debug) {
    payload.debug = {
      fetch: { status, contentType, htmlLen: html.length, host: target.hostname },
      extract: { pushed: ex._pushed, finalLen: text.length, stopped: ex._stop },
    };
  }

  return json(payload, 200, debug ? "no-store" : "public, max-age=300");
}