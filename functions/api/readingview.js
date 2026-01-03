// /functions/api/readingview.js
// Reading View scraper for ís.is (Cloudflare Pages Functions)
// - Scrapes readable text (title + article-ish body) from a news URL
// - No ads/cookies: returns clean JSON for your own UI
//
// Usage:
//   /api/readingview?url=https%3A%2F%2Fwww.dv.is%2F...&debug=1
//
// Returns:
//   { ok, url, site, title, excerpt, wordCount, charCount, text, debug? }

"use strict";

const ALLOWED_HOSTS = new Set([
  // Your current sources (plus common variants)
  "www.ruv.is",
  "ruv.is",

  "www.mbl.is",
  "mbl.is",

  "www.visir.is",
  "visir.is",

  "www.dv.is",
  "dv.is",

  "www.vb.is",
  "vb.is",

  "stundin.is",
  "www.stundin.is",

  "grapevine.is",
  "www.grapevine.is",

  // DV sports sometimes uses 433.is (you already map this in news.js)
  "433.is",
  "www.433.is",
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

function hostAllowed(host) {
  const h = String(host || "").toLowerCase().trim();
  if (!h) return false;
  return ALLOWED_HOSTS.has(h);
}

// crude “bad subtree” heuristic
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
    s.includes("comment")
  );
}

class Extractor {
  constructor() {
    this.title = "";
    this.site = "";
    this._inBad = 0;
    this._inMain = 0;       // article/main depth
    this._buf = [];

    // debug counters
    this._pushed = 0;
    this._pushedPreferred = 0;
    this._pushedFallback = 0;
  }

  push(t, preferred) {
    const s = normSpace(t);
    if (!s) return;
    this._buf.push(s);
    this._pushed++;
    if (preferred) this._pushedPreferred++;
    else this._pushedFallback++;
  }

  getText() {
    return normSpace(this._buf.join("\n\n"));
  }
}

export async function onRequestGet({ request }) {
  const { searchParams } = new URL(request.url);

  const rawUrl = (searchParams.get("url") || "").trim();
  const debug = searchParams.get("debug") === "1";

  if (!rawUrl) return json({ ok: false, error: "Missing ?url=" }, 400, "no-store");
  if (!isHttpUrl(rawUrl)) return json({ ok: false, error: "Invalid URL" }, 400, "no-store");

  let target;
  try {
    target = new URL(rawUrl);
  } catch {
    return json({ ok: false, error: "Invalid URL" }, 400, "no-store");
  }

  // whitelist = clean SSRF protection and predictable behavior
  if (!hostAllowed(target.hostname)) {
    return json(
      { ok: false, error: "Host not allowed", host: target.hostname },
      403,
      "no-store"
    );
  }

  // Fetch with timeout
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort("timeout"), 8000);

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
      return json(
        { ok: false, error: "Fetch failed", status, contentType },
        502,
        "no-store"
      );
    }

    if (!contentType.toLowerCase().includes("text/html")) {
      clearTimeout(timer);
      return json(
        { ok: false, error: "URL did not return HTML", status, contentType },
        415,
        "no-store"
      );
    }

    html = await res.text();
    if (html.length > 2_000_000) html = html.slice(0, 2_000_000);
  } catch (e) {
    clearTimeout(timer);
    return json(
      { ok: false, error: "Fetch exception", details: String(e?.message || e) },
      502,
      "no-store"
    );
  } finally {
    clearTimeout(timer);
  }

  const ex = new Extractor();

  // Prefer content inside <article> or <main>.
  // Collect from p/li/h2/h3/blockquote.
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
    .on("title", {
      text(t) {
        ex.title += t.text;
      },
      end() {
        ex.title = normSpace(ex.title);
      },
    })
    .on("h1", {
      text(t) {
        // If many sites have better <h1> than <title>, use as primary title
        const h1 = normSpace(t.text);
        if (h1 && h1.length > 4) ex.title = h1;
      },
    })
    .on("article, main", {
      element(el) {
        const idc = (el.getAttribute("id") || "") + " " + (el.getAttribute("class") || "");
        if (isBadIdClass(idc)) ex._inBad++;
        else ex._inMain++;
      },
      end(el) {
        const idc = (el.getAttribute("id") || "") + " " + (el.getAttribute("class") || "");
        if (isBadIdClass(idc)) ex._inBad--;
        else ex._inMain--;
      },
    })
    .on("nav, header, footer, aside, form, button, script, style, noscript", {
      element() {
        ex._inBad++;
      },
      end() {
        ex._inBad--;
      },
    })
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
    .on("p, li, h2, h3, blockquote", {
      text(t) {
        if (ex._inBad) return;

        const txt = normSpace(t.text);
        if (!txt) return;

        const preferred = ex._inMain > 0;
        const looksLikeContent = txt.length >= 40;

        // Primary: inside article/main
        if (preferred) {
          ex.push(txt, true);
          return;
        }

        // Secondary: allow long paragraphs even if page has weird markup
        if (looksLikeContent) ex.push(txt, false);
      },
    });

  // Feed HTMLRewriter a Response
  await rewriter
    .transform(new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } }))
    .text();

  let text = ex.getText();

  // Last-resort fallback: strip tags & keep long-ish sentences
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
      if (cc.length < 70) continue;
      kept.push(cc);
      acc += cc.length;
      if (acc > 9000) break;
    }

    text = normSpace(kept.join("\n\n"));
  }

  // clamp output sizes
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
      extract: {
        pushed: ex._pushed,
        pushedPreferred: ex._pushedPreferred,
        pushedFallback: ex._pushedFallback,
        finalLen: text.length,
      },
    };
  }

  return json(payload, 200, debug ? "no-store" : "public, max-age=300");
}