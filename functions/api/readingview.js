// /functions/api/readingview.js
// Reading View scraper for ís.is (Cloudflare Pages Functions)
//
// Goals:
//  - Kill menu/nav “dump” text (DV/mbl/Heimildin/Vísir etc.)
//  - Decode HTML entities (&#8211;, &#xF0;, &amp; …) so text looks normal
//  - Keep real short sentences (courts/press love those)
//  - Return clean paragraphs[] + text
//
// Output: { ok, url, host, title, byline, date, excerpt, text, paragraphs[], wordCount, charCount }

"use strict";

/* =========================
   Allowlist
   ========================= */

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

/* =========================
   Response helpers
   ========================= */

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

function err(message, status = 400) {
  return json({ ok: false, error: message }, status, "no-store");
}

function isHttpUrl(s) {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/* =========================
   Entity decoding + text utils
   ========================= */

// Decode a practical subset of HTML entities (numeric + common named).
function decodeHtmlEntities(input) {
  let s = String(input || "");
  if (!s || s.indexOf("&") === -1) return s;

  // numeric: &#8211; and hex: &#x2014;
  s = s.replace(/&#(\d+);/g, (_, d) => {
    const n = Number(d);
    return Number.isFinite(n) ? String.fromCodePoint(n) : _;
  });
  s = s.replace(/&#x([0-9a-fA-F]+);/g, (_, hx) => {
    const n = parseInt(hx, 16);
    return Number.isFinite(n) ? String.fromCodePoint(n) : _;
  });

  // common named
  const map = {
    "&nbsp;": " ",
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": "\"",
    "&apos;": "'",
    "&ndash;": "–",
    "&mdash;": "—",
    "&hellip;": "…",
    "&shy;": "", // soft hyphen
  };
  s = s.replace(/&(nbsp|amp|lt|gt|quot|apos|ndash|mdash|hellip|shy);/g, (m) => map[m] ?? m);

  return s;
}

function normalizeSpaces(input) {
  return decodeHtmlEntities(input)
    .replace(/\u00A0/g, " ")
    .replace(/\u200B/g, "")            // zero-width space
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function clampText(s, maxChars) {
  const t = String(s || "");
  if (t.length <= maxChars) return t;
  return t.slice(0, maxChars).trimEnd() + "…";
}

/* =========================
   Icelandic date ordinal protection
   ========================= */

const IS_MONTHS = [
  "janúar", "febrúar", "mars", "apríl", "maí", "júní",
  "júlí", "ágúst", "september", "október", "nóvember", "desember",
];

// Swap "." -> \u2024 inside “31. ágúst” so paragraph logic won’t split on it.
function protectOrdinalDates(s) {
  if (!s) return s;
  const months = IS_MONTHS.join("|");
  return s.replace(
    new RegExp(`(\\b\\d{1,2})\\.\\s+(${months})(\\b)`, "gi"),
    "$1\u2024 $2$3"
  );
}
function unprotectOrdinalDates(s) {
  return String(s || "").replace(/\u2024/g, ".");
}

/* =========================
   Junk detection
   ========================= */

function badIdClass(idc) {
  const s = String(idc || "").toLowerCase();
  if (!s) return false;
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
    s.includes("overlay") ||
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
    s.includes("recommend") ||
    s.includes("comment") ||
    s.includes("breadcrumbs") ||
    s.includes("search") ||
    s.includes("share") ||
    s.includes("social")
  );
}

// Strong “menu dump” detector (DV/mbl/Heimildin style).
function looksLikeMenuDump(txt) {
  const t = normalizeSpaces(txt).toLowerCase();
  if (!t) return true;

  // Many short tokens => nav-ish
  const tokens = t.split(/\s+/).filter(Boolean);
  if (tokens.length >= 16) {
    const short = tokens.filter(w => w.length <= 3).length;
    if (short / tokens.length > 0.55) return true;
  }

  // “section list” vocabulary across Icelandic media
  const navPhrases = [
    "forsíða", "fréttir", "innlent", "erlent", "viðskipti", "menning",
    "íþróttir", "sport", "fókus", "pressan", "eyjan", "tímavélin",
    "skrá inn", "innskrá", "styrkja", "áskrift", "hafa samband",
    "leita", "leit", "search for", "um okkur", "um dv", "persónuvernd",
    "kvikmyndir", "fasteignir", "atvinna", "veður", "bílar", "hljóðvarp",
    "kynning", "auglýsing", "uppskriftir", "korter í kvöldmat",
    "starfsfólk", "rekstur og stjórn", "upplýsingar",
  ];
  let hits = 0;
  for (const p of navPhrases) if (t.includes(p)) hits++;
  if (hits >= 4) return true;

  // Looks like “category strip”: lots of Titlecase-ish tokens
  const capLike = tokens.filter(w => /^[a-záðéíóúýþæö]/i.test(w) && w.length <= 14)
    .filter(w => w[0] === w[0].toUpperCase()).length;
  if (tokens.length >= 12 && capLike / tokens.length > 0.65) return true;

  return false;
}

// Conservative boilerplate line filter (still tries to keep real content).
function isBoilerplateLine(line) {
  const t = normalizeSpaces(line).toLowerCase();
  if (!t) return true;

  // pure UI/share/cookie/subscription junk
  const bad = [
    "vafrakök", "cookie", "samþykk", "persónuvernd",
    "áskrift", "skráðu þig", "innskrá", "login",
    "deila", "share", "facebook", "twitter", "instagram", "linkedin",
    "auglýsing", "advertisement",
  ];
  if (bad.some(x => t.includes(x))) return true;

  // explicit nav dump
  if (looksLikeMenuDump(t)) return true;

  return false;
}

// Keep short legit sentences; drop short crumbs.
function keepLine(line) {
  const t = normalizeSpaces(line);
  if (!t) return false;
  if (isBoilerplateLine(t)) return false;

  // if very short, keep only if it looks sentence-like
  if (t.length < 40) {
    if (/[.!?…]$/.test(t)) return true;
    if (/\b(dómur|ákæruvaldið|héraðsdómur|hæstiréttur|lögregla|samkvæmt|segir|sagði|í gær|í dag|nú)\b/i.test(t)) return true;
    return false;
  }

  return true;
}

function joinParagraphsSmart(lines) {
  const out = [];
  let cur = "";

  const lowerStart = (s) => /^[a-záðéíóúýþæö]/.test((s || "").trim());
  const contToken = (s) => /^(og|en|því|þá|svo|enda|þar|sem|auk þess|hins vegar|annars vegar)\b/i.test((s || "").trim());

  for (const raw of lines) {
    const line = normalizeSpaces(raw);
    if (!line) {
      if (cur) out.push(cur.trim());
      cur = "";
      continue;
    }

    if (!cur) {
      cur = line;
      continue;
    }

    const endsHard = /[.!?…]$/.test(cur);
    if (!endsHard) {
      cur += " " + line;
    } else if (lowerStart(line) || contToken(line)) {
      cur += " " + line;
    } else {
      out.push(cur.trim());
      cur = line;
    }
  }
  if (cur) out.push(cur.trim());
  return out;
}

function finalizeParagraphs(blocks) {
  // Normalize + protect ordinals for joining heuristics
  const cleaned = (blocks || [])
    .map(b => protectOrdinalDates(normalizeSpaces(b)))
    .filter(Boolean)
    .filter(b => !isBoilerplateLine(b));

  // If we have lots of small-ish blocks, rebuild paragraphs smartly.
  const avgLen = cleaned.length ? cleaned.reduce((a, b) => a + b.length, 0) / cleaned.length : 0;
  let paras = cleaned;

  if (cleaned.length > 30 && avgLen < 90) {
    paras = joinParagraphsSmart(cleaned);
  }

  // Final cleanup + keep/drop rules
  paras = paras
    .map(p => normalizeSpaces(unprotectOrdinalDates(p)))
    .filter(p => keepLine(p));

  // De-dupe adjacent duplicates
  const out = [];
  let prev = "";
  for (const p of paras) {
    const x = p.trim();
    if (x && x !== prev) out.push(x);
    prev = x;
  }

  const text = out.join("\n\n").trim();
  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;

  return { paragraphs: out, text, wordCount, charCount: text.length };
}

/* =========================
   HTMLRewriter extraction
   ========================= */

class Extractor {
  constructor() {
    this.title = "";
    this.byline = "";
    this.date = "";

    this._inContent = 0;
    this._inJunk = 0;

    this._buf = [];
    this._pushed = 0;
  }

  pushBlock(txt) {
    const s = normalizeSpaces(txt);
    if (!s) return;
    if (looksLikeMenuDump(s)) return;
    this._buf.push(s);
    this._pushed++;
  }
}

// Collect full text of a matched element (p/li/h2/blockquote...) into one block.
class BlockCollector {
  constructor(ex) {
    this.ex = ex;
    this.stack = [];
    this.okStack = [];
  }

  element(el) {
    const ex = this.ex;

    const idc = (el.getAttribute("id") || "") + " " + (el.getAttribute("class") || "");
    const selfBad = badIdClass(idc);

    // Only collect if currently inside content AND not in junk
    const ok = ex._inContent > 0 && ex._inJunk === 0 && !selfBad;
    this.okStack.push(ok);
    this.stack.push("");

    el.onEndTag(() => {
      const buf = this.stack.pop() || "";
      const ok2 = this.okStack.pop();
      if (!ok2) return;

      const s = normalizeSpaces(buf);
      if (!s) return;

      // Don’t allow the classic “category wall” through.
      if (looksLikeMenuDump(s)) return;

      // Minimum substance unless sentence-like (keeps short legit lines)
      if (s.length < 45 && !/[.!?…]$/.test(s)) return;

      this.ex.pushBlock(s);
    });
  }

  text(t) {
    if (!this.stack.length) return;
    const i = this.stack.length - 1;
    // preserve spaces between streamed chunks
    this.stack[i] += t.text;
  }
}

/* =========================
   Selectors
   ========================= */

const CONTENT_SELECTORS = [
  "article",
  "main article",
  "main",
  "[role='main']",
  "[itemprop='articleBody']",
  ".entry-content",
  ".post-content",
  ".article-body",
  ".article__body",
  ".content__body",
  ".story-body",
  ".story__body",
  ".news__content",
  ".article-content",
].join(", ");

const JUNK_SELECTORS = [
  "nav", "header", "footer", "aside",
  "form", "button",
  "script", "style", "noscript",
  "[aria-label*='menu' i]",
  "[aria-label*='search' i]",
  "[class*='cookie' i]", "[id*='cookie' i]",
  "[class*='consent' i]", "[id*='consent' i]",
  "[class*='paywall' i]", "[id*='paywall' i]",
  "[class*='subscribe' i]", "[id*='subscribe' i]",
  "[class*='newsletter' i]", "[id*='newsletter' i]",
  "[class*='share' i]", "[id*='share' i]",
  "[class*='social' i]", "[id*='social' i]",
  "[class*='related' i]", "[id*='related' i]",
  "[class*='comment' i]", "[id*='comment' i]",
].join(", ");

const BLOCK_SELECTORS = "p, li, blockquote, h2, h3";

/* =========================
   Main handler
   ========================= */

export async function onRequestGet({ request }) {
  const u = new URL(request.url);
  const rawUrl = (u.searchParams.get("url") || "").trim();
  const debug = u.searchParams.get("debug") === "1";

  if (!rawUrl) return err('Missing "url" query param, e.g. ?url=https://dv.is/...');

  if (!isHttpUrl(rawUrl)) return err("Invalid URL");
  let targetUrl;
  try {
    targetUrl = new URL(rawUrl);
  } catch {
    return err("Invalid URL");
  }

  const host = targetUrl.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) return err("Host not allowed", 403);

  // Fetch with timeout
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort("timeout"), 9000);

  let html = "";
  let status = 0;
  let contentType = "";

  try {
    const res = await fetch(targetUrl.toString(), {
      signal: ac.signal,
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; is.is ReadingView/1.1)",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "is,is-IS;q=0.9,en;q=0.7",
      },
      cf: { cacheTtl: 300, cacheEverything: true },
    });

    status = res.status;
    contentType = res.headers.get("content-type") || "";

    if (!res.ok) return err(`Upstream fetch failed (${status})`, 502);
    if (!contentType.toLowerCase().includes("text/html")) return err("URL did not return HTML", 415);

    html = await res.text();
    if (html.length > 2_000_000) html = html.slice(0, 2_000_000);
  } catch (e) {
    return err(`Fetch exception: ${String(e?.message || e)}`, 502);
  } finally {
    clearTimeout(timer);
  }

  const ex = new Extractor();
  const blockCollector = new BlockCollector(ex);

  const rewriter = new HTMLRewriter()
    // Better title sources
    .on("meta[property='og:title']", {
      element(el) {
        const c = el.getAttribute("content");
        if (c) ex.title = normalizeSpaces(c);
      },
    })
    .on("meta[name='author'], meta[property='article:author']", {
      element(el) {
        const c = el.getAttribute("content");
        if (c && !ex.byline) ex.byline = normalizeSpaces(c);
      },
    })
    .on("meta[property='article:published_time'], meta[name='date'], meta[name='pubdate']", {
      element(el) {
        const c = el.getAttribute("content");
        if (c && !ex.date) ex.date = normalizeSpaces(c);
      },
    })
    .on("title", {
      text(t) {
        if (!ex.title) ex.title += t.text;
      },
      end() {
        ex.title = normalizeSpaces(ex.title);
      },
    })
    // Prefer an in-article h1 if it exists
    .on("article h1, main h1, h1", {
      element(el) {
        const idc = (el.getAttribute("id") || "") + " " + (el.getAttribute("class") || "");
        if (badIdClass(idc)) ex._inJunk++;
        el.onEndTag(() => {
          if (badIdClass(idc)) ex._inJunk--;
        });
      },
      text(t) {
        if (ex._inJunk) return;
        const s = normalizeSpaces(t.text);
        if (s && s.length > 4) ex.title = s;
      },
    })
    // Content zone depth
    .on(CONTENT_SELECTORS, {
      element(el) {
        const idc = (el.getAttribute("id") || "") + " " + (el.getAttribute("class") || "");
        if (badIdClass(idc)) ex._inJunk++;
        else ex._inContent++;

        el.onEndTag(() => {
          if (badIdClass(idc)) ex._inJunk--;
          else ex._inContent--;
        });
      },
    })
    // Junk zone depth (hard exclude)
    .on(JUNK_SELECTORS, {
      element(el) {
        ex._inJunk++;
        el.onEndTag(() => ex._inJunk--);
      },
    })
    // Collect blocks (only if inside content and not junk)
    .on(BLOCK_SELECTORS, blockCollector);

  // Run transformer fully
  await rewriter.transform(new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } })).arrayBuffer();

  // If we still got basically nothing, do a safer global fallback (but stricter than before)
  let blocks = ex._buf.slice();
  const joinedLen = blocks.join(" ").length;

  if (joinedLen < 350) {
    // very conservative strip+chunk
    const stripped = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<\/(p|div|br|li|h\d|blockquote)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const chunks = stripped
      .split(/(?<=[.!?…])\s+/)
      .map(s => normalizeSpaces(s))
      .filter(Boolean);

    const kept = [];
    let acc = 0;
    for (const c of chunks) {
      if (c.length < 120) continue;           // stronger than before (kills nav scraps)
      if (looksLikeMenuDump(c)) continue;
      if (isBoilerplateLine(c)) continue;
      kept.push(c);
      acc += c.length;
      if (acc > 10_000) break;
    }
    blocks = kept;
  }

  const fin = finalizeParagraphs(blocks);

  // Final clamps
  const text = clampText(fin.text, 15000);
  const paragraphs = fin.paragraphs;
  const title = clampText(normalizeSpaces(ex.title) || "Ónefnd frétt", 240);
  const byline = clampText(normalizeSpaces(ex.byline) || "", 160);
  const date = clampText(normalizeSpaces(ex.date) || "", 160);
  const excerpt = clampText(text.replace(/\n+/g, " ").trim(), 280);
  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;

  const payload = {
    ok: true,
    url: targetUrl.toString(),
    host,
    title,
    byline,
    date,
    excerpt,
    text,
    paragraphs,
    wordCount,
    charCount: text.length,
  };

  if (debug) {
    payload.debug = {
      fetch: { status, contentType, htmlLen: html.length, host },
      extract: { pushed: ex._pushed, initialBlocks: ex._buf.length, finalParas: paragraphs.length },
    };
  }

  return json(payload, 200, debug ? "no-store" : "public, max-age=300");
}