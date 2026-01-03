// /functions/api/readingview.js
// ís.is — Reading View scraper (Cloudflare Pages Functions)
//
// Usage:
//   /api/readingview?url=https%3A%2F%2Fexample.com%2Farticle
//
// Returns JSON:
//   { ok, url, title, site, text, excerpt, wordCount, charCount }

"use strict";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      // CORS (still same-origin friendly)
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}

function isHttpUrl(s) {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// Basic SSRF guard: block localhost + obvious private hostnames.
// Note: This does NOT fully resolve DNS-to-private tricks, but it blocks the common stuff.
// If you want to be stricter, you can whitelist domains from your RSS sources instead.
function isBlockedHost(host) {
  const h = (host || "").toLowerCase().trim();

  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "127.0.0.1") return true;
  if (h === "::1") return true;

  // Block raw private IP literals (v4)
  // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]);
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 127) return true;
    if (a === 0) return true;
  }

  return false;
}

function normSpace(s) {
  return (s || "")
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function clampText(s, maxChars) {
  const t = s || "";
  if (t.length <= maxChars) return t;
  return t.slice(0, maxChars).trimEnd() + "…";
}

// Heuristics: keep text from article-ish containers, and ignore obvious chrome/ads.
function isBadContainerIdClass(idClass) {
  const s = (idClass || "").toLowerCase();
  return (
    s.includes("cookie") ||
    s.includes("consent") ||
    s.includes("banner") ||
    s.includes("ad") ||
    s.includes("ads") ||
    s.includes("advert") ||
    s.includes("promo") ||
    s.includes("subscribe") ||
    s.includes("newsletter") ||
    s.includes("paywall") ||
    s.includes("modal") ||
    s.includes("nav") ||
    s.includes("menu") ||
    s.includes("footer") ||
    s.includes("header") ||
    s.includes("sidebar") ||
    s.includes("related") ||
    s.includes("comments")
  );
}

class ReadingExtractor {
  constructor() {
    this.title = "";
    this.site = "";
    this._inTitle = false;
    this._inH1 = false;

    this._inArticleish = 0; // nesting depth inside main/article
    this._inBad = 0;        // nesting depth inside bad containers
    this._collect = false;  // inside a text-y tag (p/li/h2 etc.)

    this._buf = [];
  }

  push(text) {
    const t = normSpace(text);
    if (!t) return;
    this._buf.push(t);
  }

  getText() {
    // Join paragraphs with blank line.
    // Also de-dup accidental repeats a bit.
    const joined = this._buf.join("\n\n");
    return normSpace(joined);
  }
}

export async function onRequestOptions() {
  return json({ ok: true });
}

export async function onRequestGet({ request }) {
  const { searchParams } = new URL(request.url);
  const rawUrl = (searchParams.get("url") || "").trim();

  if (!rawUrl) return json({ ok: false, error: "Missing ?url=" }, 400);
  if (!isHttpUrl(rawUrl)) return json({ ok: false, error: "Invalid URL" }, 400);

  let target;
  try {
    target = new URL(rawUrl);
  } catch {
    return json({ ok: false, error: "Invalid URL" }, 400);
  }

  if (isBlockedHost(target.hostname)) {
    return json({ ok: false, error: "Blocked host" }, 403);
  }

  // Fetch with a short timeout
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort("timeout"), 8000);

  let html = "";
  try {
    const res = await fetch(target.toString(), {
      signal: ac.signal,
      headers: {
        // Pretend to be a normal browser to avoid some dumb blocks
        "user-agent":
          "Mozilla/5.0 (compatible; is.is readingview; +https://is.is)",
        "accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "is-IS,is;q=0.9,en;q=0.7",
      },
      redirect: "follow",
    });

    const ct = res.headers.get("content-type") || "";
    if (!ct.toLowerCase().includes("text/html")) {
      clearTimeout(t);
      return json({ ok: false, error: "URL did not return HTML" }, 415);
    }

    // Limit size (basic)
    html = await res.text();
    if (html.length > 2_000_000) html = html.slice(0, 2_000_000);
  } catch (e) {
    clearTimeout(t);
    return json({ ok: false, error: "Fetch failed", details: String(e) }, 502);
  } finally {
    clearTimeout(t);
  }

  const ex = new ReadingExtractor();

  // HTMLRewriter runs in CF Workers runtime (Pages Functions too).
  // We:
  //  - grab <title> and <h1> if present
  //  - collect text from <article>, <main> preferably
  //  - skip obvious bad containers (cookie banners, ads, nav, etc.)
  //  - collect from p/li/h2/h3/blockquote inside article-ish area
  const rewriter = new HTMLRewriter()
    .on("title", {
      text(t) {
        ex._inTitle = true;
        ex.title += t.text;
      },
      end() {
        ex._inTitle = false;
        ex.title = normSpace(ex.title);
      },
    })
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
    .on("h1", {
      element(el) {
        ex._inH1 = true;
        // treat bad container h1 as non-article
        const idc = (el.getAttribute("id") || "") + " " + (el.getAttribute("class") || "");
        if (isBadContainerIdClass(idc)) ex._inBad++;
      },
      text(t) {
        if (!ex._inBad) ex.title = normSpace(ex.title || t.text);
      },
      end() {
        ex._inH1 = false;
        if (ex._inBad) ex._inBad--;
      },
    })
    .on("article, main", {
      element(el) {
        const idc = (el.getAttribute("id") || "") + " " + (el.getAttribute("class") || "");
        if (isBadContainerIdClass(idc)) ex._inBad++;
        else ex._inArticleish++;
      },
      end(el) {
        const idc = (el.getAttribute("id") || "") + " " + (el.getAttribute("class") || "");
        if (isBadContainerIdClass(idc)) ex._inBad--;
        else ex._inArticleish--;
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
        // If something is clearly ad/cookie/etc, mark as bad subtree
        const idc = (el.getAttribute("id") || "") + " " + (el.getAttribute("class") || "");
        if (isBadContainerIdClass(idc)) ex._inBad++;
      },
      end(el) {
        const idc = (el.getAttribute("id") || "") + " " + (el.getAttribute("class") || "");
        if (isBadContainerIdClass(idc)) ex._inBad--;
      },
    })
    .on("p, li, h2, h3, blockquote", {
      element() {
        // Collect preferably inside article/main; but if site is messy, allow fallback later.
        ex._collect = true;
      },
      text(t) {
        if (!ex._collect) return;
        if (ex._inBad) return;

        // Prefer within article/main; but still allow if title exists and paragraph looks long.
        const txt = normSpace(t.text);
        if (!txt) return;

        const inPreferred = ex._inArticleish > 0;
        const looksLikeContent = txt.length >= 40;

        if (inPreferred || looksLikeContent) ex.push(txt);
      },
      end() {
        ex._collect = false;
      },
    });

  // HTMLRewriter wants a Response input.
  await rewriter.transform(new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } })).text();

  let text = ex.getText();

  // Fallback: if we got almost nothing, just strip tags crudely and grab long-ish lines.
  if (text.length < 200) {
    const stripped = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<\/(p|div|br|li|h\d|blockquote)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // split to “sentences-ish” chunks
    const chunks = stripped.split(/(?<=[\.\!\?])\s+/).filter(Boolean);
    const kept = [];
    let acc = 0;
    for (const c of chunks) {
      const cc = c.trim();
      if (cc.length < 60) continue;
      kept.push(cc);
      acc += cc.length;
      if (acc > 8000) break;
    }
    text = normSpace(kept.join("\n\n"));
  }

  text = clampText(text, 15000);
  const title = clampText(normSpace(ex.title) || "", 240) || "Ónefnd frétt";
  const site = clampText(normSpace(ex.site) || target.hostname, 120);

  const excerpt = clampText(text.replace(/\n+/g, " ").trim(), 240);
  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;

  return json({
    ok: true,
    url: target.toString(),
    title,
    site,
    excerpt,
    wordCount,
    charCount: text.length,
    text,
  });
}