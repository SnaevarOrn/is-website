// /functions/api/readingview.js
// Reading View scraper for ís.is (Cloudflare Pages Functions)
//
// Key ideas:
//  1) Collect text ONLY inside "content zones" (article/main/articleBody/entry-content/etc.)
//  2) Only if content zones yield almost nothing, do a safer global fallback
//  3) Fix Icelandic ordinal dates like "31. ágúst" being treated as paragraph breaks
//  4) Avoid dropping legit short/legal sentences (DV loves those)
//
// Output: { ok, url, host, title, byline, date, text, paragraphs[], wordCount, charCount }

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
    },
  });
}

function err(message, status = 400) {
  return json({ ok: false, error: message }, status, "no-store");
}

/* =========================
   Text normalization helpers
   ========================= */

const IS_MONTHS = [
  "janúar", "febrúar", "mars", "apríl", "maí", "júní",
  "júlí", "ágúst", "september", "október", "nóvember", "desember",
];

// Protect ordinals like "31. ágúst" so "." isn't treated like a hard boundary.
// We swap "." -> \u2024 (ONE DOT LEADER) during processing and swap back at the end.
function protectOrdinalDates(s) {
  if (!s) return s;
  const months = IS_MONTHS.join("|");
  return s.replace(
    new RegExp(`(\\b\\d{1,2})\\.\\s+(${months})(\\b)`, "gi"),
    "$1\u2024 $2$3"
  );
}
function unprotectOrdinalDates(s) {
  return (s || "").replace(/\u2024/g, ".");
}

function normalizeSpaces(s) {
  return (s || "")
    .replace(/\u00A0/g, " ")           // nbsp
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

// Heuristic boilerplate filter — deliberately conservative.
function isBoilerplateLine(line) {
  const t = (line || "").trim().toLowerCase();
  if (!t) return true;

  // Cookie/consent/subscription/share junk
  const bad = [
    "samþykkja", "vafrakökur", "cookie", "persónuvernd",
    "áskrift", "skráðu þig", "innskrá", "login",
    "deila", "share", "facebook", "twitter", "instagram", "linkedin",
    "lesa meira", "sjá meira", "auglýsing", "advertisement",
  ];
  if (bad.some(x => t.includes(x))) return true;

  // Pure UI crumbs / very short non-sentence fragments
  // NOTE: keep short legal sentences => only drop if it does NOT look like a sentence.
  if (t.length < 18 && !/[.!?…]$/.test(t) && !/[a-záðéíóúýþæö]/i.test(t)) return true;

  return false;
}

// Don’t overdrop: DV and courts love short sentences.
function keepLine(line) {
  const t = (line || "").trim();
  if (!t) return false;
  if (isBoilerplateLine(t)) return false;

  // If it's short, keep it if it "looks like" a real sentence/statement.
  if (t.length < 40) {
    if (/[.!?…]$/.test(t)) return true;
    if (/\b(hann|hún|þau|því|loks|nú|svo|enda|samkvæmt|dómur|ákæruvaldið|réttur|lögregla)\b/i.test(t)) return true;
  }

  return true;
}

function joinParagraphsSmart(lines) {
  // Build paragraphs from lines without turning "31. ágúst" into a break.
  // Also avoid hard breaks when next line starts with lowercase.
  const out = [];
  let cur = "";

  const isLowerStart = (s) => /^[a-záðéíóúýþæö]/.test((s || "").trim());

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (cur) {
        out.push(cur.trim());
        cur = "";
      }
      continue;
    }

    if (!cur) {
      cur = line;
      continue;
    }

    // If current ends with sentence punctuation, it *might* be a paragraph boundary.
    // But if next line starts with lowercase (or common continuation tokens), merge.
    const endsHard = /[.!?…]$/.test(cur);
    const contToken = /^(og|en|því|þá|svo|enda|þar|sem|auk þess|hins vegar|annars vegar)\b/i.test(line);

    if (endsHard && (isLowerStart(line) || contToken)) {
      cur += " " + line;
    } else if (!endsHard) {
      cur += " " + line;
    } else {
      // genuine boundary
      out.push(cur.trim());
      cur = line;
    }
  }

  if (cur) out.push(cur.trim());
  return out;
}

function finalizeText(paragraphs) {
  const cleaned = (paragraphs || [])
    .map(p => normalizeSpaces(unprotectOrdinalDates(p)))
    .filter(p => keepLine(p));

  const text = cleaned.join("\n\n").trim();
  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;

  return {
    paragraphs: cleaned,
    text,
    wordCount: words,
    charCount: text.length,
  };
}

/* =========================
   HTMLRewriter collectors
   ========================= */

class TextInElementCollector {
  constructor(pushFn) {
    this.pushFn = pushFn;
    this.stack = []; // per-element buffers
  }

  element(el) {
    // New buffer for this matched element
    this.stack.push("");

    el.onEndTag(() => {
      const buf = this.stack.pop() || "";
      const s = normalizeSpaces(buf);
      if (s) this.pushFn(s);
    });
  }

  text(t) {
    if (!this.stack.length) return;
    // Keep spacing sane; HTMLRewriter streams chunks.
    const i = this.stack.length - 1;
    this.stack[i] += t.text;
  }
}

class MetaCollector {
  constructor() {
    this.title = "";
    this.date = "";
    this.byline = "";
    this._titleChunks = [];
    this._bylineChunks = [];
    this._dateChunks = [];
    this._inTitle = false;
    this._inByline = false;
    this._inDate = false;
  }

  // Title
  titleElement(el) {
    this._inTitle = true;
    el.onEndTag(() => {
      this._inTitle = false;
      this.title = normalizeSpaces(this._titleChunks.join(" "));
    });
  }
  titleText(t) {
    if (this._inTitle) this._titleChunks.push(t.text);
  }

  // Byline (author)
  bylineElement(el) {
    this._inByline = true;
    el.onEndTag(() => {
      this._inByline = false;
      this.byline = normalizeSpaces(this._bylineChunks.join(" "));
    });
  }
  bylineText(t) {
    if (this._inByline) this._bylineChunks.push(t.text);
  }

  // Date/time
  dateElement(el) {
    this._inDate = true;
    el.onEndTag(() => {
      this._inDate = false;
      this.date = normalizeSpaces(this._dateChunks.join(" "));
    });
  }
  dateText(t) {
    if (this._inDate) this._dateChunks.push(t.text);
  }
}

/* =========================
   Selectors
   ========================= */

// "Content zones" — we only pull blocks inside these, unless empty.
const CONTENT_ZONE_SELECTORS = [
  "article",
  "main article",
  "main",
  "[role='main']",
  ".article",
  ".article-body",
  ".articleBody",
  ".entry-content",
  ".post-content",
  ".content",
  ".story",
  ".story-body",
  ".news__content",
  ".text",
];

// Within zones, collect these "block-ish" elements as paragraphs.
const BLOCK_SELECTORS = [
  "p",
  "h1", "h2", "h3",
  "blockquote",
  "li",
];

const GLOBAL_BLOCK_SELECTORS = [
  "article " + BLOCK_SELECTORS.join(", article "),
  "main " + BLOCK_SELECTORS.join(", main "),
  BLOCK_SELECTORS.join(", "),
].join(", ");

// Prevent obvious junk areas even inside zones.
const JUNK_SELECTORS = [
  "nav", "footer", "header", "aside",
  "script", "style", "noscript",
  ".share", ".sharing", ".social", ".social-share",
  ".related", ".recommend", ".newsletter",
  ".comments", "#comments",
].join(", ");

/* =========================
   Main handler
   ========================= */

export async function onRequestGet({ request }) {
  try {
    const u = new URL(request.url);
    const target = (u.searchParams.get("url") || "").trim();

    if (!target) return err('Missing "url" query param, e.g. ?url=https://dv.is/...');

    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch {
      return err("Invalid url");
    }

    const host = targetUrl.hostname.toLowerCase();
    if (!ALLOWED_HOSTS.has(host)) {
      return err("Host not allowed");
    }

    const upstream = await fetch(targetUrl.toString(), {
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; is.is ReadingView/1.0; +https://is.is)",
        "accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "is,is-IS;q=0.9,en;q=0.7",
      },
      redirect: "follow",
      cf: {
        cacheTtl: 300,
        cacheEverything: true,
      },
    });

    if (!upstream.ok) {
      return err(`Upstream fetch failed (${upstream.status})`, 502);
    }

    const meta = new MetaCollector();

    const zoneBlocks = [];
    const globalBlocks = [];

    // Collector for blocks — pushes as found.
    const zoneBlockCollector = new TextInElementCollector((s) => zoneBlocks.push(s));
    const globalBlockCollector = new TextInElementCollector((s) => globalBlocks.push(s));

    // Phase A: collect blocks INSIDE content zones
    // We do this by selecting "zone selector + block selector" combos.
    const zoneBlockSelectors = [];
    for (const zone of CONTENT_ZONE_SELECTORS) {
      for (const blk of BLOCK_SELECTORS) {
        zoneBlockSelectors.push(`${zone} ${blk}`);
      }
    }
    const zoneSelector = zoneBlockSelectors.join(", ");

    // Run rewriter once, but collect both zone + global (global used only if needed).
    const rewriter = new HTMLRewriter()
      // Title: prefer <h1>, fall back to <title>
      .on("article h1, main h1, h1", {
        element: (el) => meta.titleElement(el),
        text: (t) => meta.titleText(t),
      })
      .on("head title", {
        element: (el) => {
          if (!meta.title) meta.titleElement(el);
        },
        text: (t) => {
          if (!meta.title) meta.titleText(t);
        },
      })
      // Byline/author (best-effort)
      .on("[rel='author'], .author, .byline, .article-author, .entry-author", {
        element: (el) => meta.bylineElement(el),
        text: (t) => meta.bylineText(t),
      })
      // Date/time (best-effort)
      .on("time, .date, .published, .article-date, .entry-date", {
        element: (el) => meta.dateElement(el),
        text: (t) => meta.dateText(t),
      })
      // Collect zone blocks
      .on(zoneSelector, zoneBlockCollector)
      // Collect global blocks (used only if zone empty)
      .on(GLOBAL_BLOCK_SELECTORS, globalBlockCollector);

    // Force stream to complete so collectors fill.
    await rewriter.transform(upstream).arrayBuffer();

    // Drop obviously junk blocks early (but conservatively)
    const sanitizeBlocks = (arr) => {
      return arr
        .map(s => normalizeSpaces(s))
        .filter(Boolean)
        .filter(s => !isBoilerplateLine(s));
    };

    let blocks = sanitizeBlocks(zoneBlocks);

    // If content-zone yielded almost nothing, fall back to global blocks.
    if (blocks.join(" ").length < 400) {
      blocks = sanitizeBlocks(globalBlocks);
    }

    // Final paragraph assembly:
    // - Protect Icelandic ordinal dates before any joining/splitting heuristics.
    const protectedBlocks = blocks.map(protectOrdinalDates);

    // If blocks look like real paragraphs already, keep them as-is.
    // But if we have tons of tiny lines, rebuild into paragraphs smartly.
    const avgLen = protectedBlocks.length
      ? protectedBlocks.reduce((a, b) => a + b.length, 0) / protectedBlocks.length
      : 0;

    let paragraphs;
    if (protectedBlocks.length > 35 && avgLen < 80) {
      paragraphs = joinParagraphsSmart(protectedBlocks);
    } else {
      paragraphs = protectedBlocks;
    }

    // Final clean: unprotect ordinals, normalize, keep short legit sentences, compute stats.
    const fin = finalizeText(paragraphs);

    // Small excerpt
    const excerpt = fin.text.slice(0, 280).trim();

    return json({
      ok: true,
      url: targetUrl.toString(),
      host,
      title: meta.title || "",
      byline: meta.byline || "",
      date: meta.date || "",
      excerpt,
      ...fin,
    });
  } catch (e) {
    return err(e && e.message ? e.message : "Unknown error", 500);
  }
}