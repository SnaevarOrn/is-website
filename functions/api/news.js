// /functions/api/news.js

export async function onRequestGet({ request }) {
  const { searchParams } = new URL(request.url);

  const sources = (searchParams.get("sources") || "").split(",").filter(Boolean);
  const catsParam = (searchParams.get("cats") || "").split(",").filter(Boolean);
  const limit = clampInt(searchParams.get("limit"), 1, 120, 60);

  const feeds = {
    // RSS
    ruv:   { kind: "rss",  url: "https://www.ruv.is/rss/frettir", label: "RÚV",    domain: "ruv.is" },
    mbl:   { kind: "rss",  url: "https://www.mbl.is/feeds/fp/",   label: "mbl.is", domain: "mbl.is" },
    visir: { kind: "rss",  url: "https://www.visir.is/rss/allt",  label: "Vísir",  domain: "visir.is" },
    dv:    { kind: "rss",  url: "https://www.dv.is/feed/",        label: "DV",     domain: "dv.is" },

    // “Aðalfrettir” (HTML) — grunnur, má fínstilla með patterns þegar þú sérð betur slóðir
    stundin:   { kind: "html", url: "https://stundin.is/",   label: "Stundin",        domain: "stundin.is" },
    heimildin: { kind: "html", url: "https://heimildin.is/", label: "Heimildin",      domain: "heimildin.is" },
    frettin:   { kind: "html", url: "https://frettin.is/",   label: "Fréttin",        domain: "frettin.is" },
    vb:        { kind: "html", url: "https://vb.is/",        label: "Viðskiptablaðið",domain: "vb.is" },
  };

  const activeSources = sources.length ? sources : Object.keys(feeds);
  const activeCats = new Set(catsParam.length ? catsParam : []); // empty => no filtering

  const items = [];

  for (const id of activeSources) {
    const feed = feeds[id];
    if (!feed) continue;

    try {
      const res = await fetch(feed.url, {
        headers: {
          "User-Agent": "is.is news bot",
          "Accept": feed.kind === "rss" ? "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.1" : "text/html, */*;q=0.1",
        },
      });

      if (!res.ok) {
        console.error("Feed HTTP error:", id, res.status);
        continue;
      }

      const text = await res.text();

      if (feed.kind === "rss") {
        const rssItems = parseRssItems(text);
        for (const block of rssItems) {
          const title = extract(block, "title");
          const link = extract(block, "link");
          const pubDate = extract(block, "pubDate");
          if (!title || !link) continue;

          const rssCats = extractAll(block, "category");
          const rssCatText = (rssCats.join(" ") || "").trim();

          const { categoryIds, categoryLabels } = inferCategories({
            sourceId: id,
            url: link,
            rssCategoryText: rssCatText,
            title,
          });

          if (activeCats.size > 0 && !intersects(activeCats, categoryIds)) continue;

          items.push({
            title,
            url: link,
            publishedAt: pubDate ? safeToIso(pubDate) : null,
            sourceId: id,
            sourceLabel: feed.label,
            iconUrl: faviconUrl(feed.domain),
            categoryIds,
            categoryLabels,
            categoryId: categoryIds[0] || "oflokkad",
            category: categoryLabels[0] || "Óflokkað",
          });
        }
      } else {
        // HTML “aðalfrettir” (grunnur)
        const htmlItems = parseHtmlHeadlines(text, feed.url);
        for (const it of htmlItems) {
          const { categoryIds, categoryLabels } = inferCategories({
            sourceId: id,
            url: it.url,
            rssCategoryText: "",
            title: it.title,
          });

          if (activeCats.size > 0 && !intersects(activeCats, categoryIds)) continue;

          items.push({
            title: it.title,
            url: it.url,
            publishedAt: it.publishedAt || null, // oft null hér í grunninum
            sourceId: id,
            sourceLabel: feed.label,
            iconUrl: faviconUrl(feed.domain),
            categoryIds,
            categoryLabels,
            categoryId: categoryIds[0] || "oflokkad",
            category: categoryLabels[0] || "Óflokkað",
          });
        }
      }
    } catch (err) {
      console.error("Feed error:", id, err);
    }
  }

  // sort: með dagsetningu ef til, annars neðst
  items.sort((a, b) => {
    const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    return tb - ta;
  });

  const sliced = items.slice(0, limit);
  const availableCategories = [
    ...new Set(sliced.flatMap(x => (x.categoryIds || [])).filter(Boolean)),
  ];

  return new Response(JSON.stringify({ items: sliced, availableCategories }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}

/* ---------- Helpers ---------- */

function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function faviconUrl(domain) {
  // Smooth + cacheable + engin “api/icon” nauðsyn strax
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}

function safeToIso(pubDate) {
  const t = Date.parse(pubDate);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function parseRssItems(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => m[1]);
}

function extract(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}>(<!\$begin:math:display$CDATA\\\\\[\)\?\(\[\\\\s\\\\S\]\*\?\)\(\\$end:math:display$\\]>)?<\\/${tag}>`));
  return m ? m[2].trim() : null;
}

function extractAll(xml, tag) {
  const re = new RegExp(`<${tag}>(<!\$begin:math:display$CDATA\\\\\[\)\?\(\[\\\\s\\\\S\]\*\?\)\(\\$end:math:display$\\]>)?<\\/${tag}>`, "g");
  const out = [];
  let m;
  while ((m = re.exec(xml)) !== null) out.push((m[2] || "").trim());
  return out;
}

function parseHtmlHeadlines(html, baseUrl) {
  // very lightweight headline scrape:
  // - tekur anchor-text sem lítur út eins og “fyrirsögn”
  // - dregur slóðir í absolute
  const out = [];
  const seen = new Set();

  // 1) reyna <a ... href="...">TEXT</a>
  const re = /<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = (m[1] || "").trim();
    let text = stripTags(m[2] || "").trim();

    // heuristics: sleppa stuttu/skrítnu
    if (!href || text.length < 18) continue;
    if (text.length > 140) text = text.slice(0, 140).trim();

    const url = toAbsUrl(href, baseUrl);
    if (!url) continue;

    // sleppa “/tag/”, “/category/”, etc (gróft)
    const u = url.toLowerCase();
    if (u.includes("/tag/") || u.includes("/flokkur") || u.includes("/category/")) continue;

    const key = url + "|" + text;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({ title: text, url, publishedAt: null });
    if (out.length >= 40) break; // per source cap
  }

  return out;
}

function stripTags(s) {
  return String(s)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

function toAbsUrl(href, baseUrl) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function intersects(set, arr) {
  for (const v of arr) if (set.has(v)) return true;
  return false;
}

/* ---------- Category inference (multi) ---------- */

const CATEGORY_MAP = [
  { id: "innlent",   label: "Innlent" },
  { id: "erlent",    label: "Erlent" },
  { id: "ithrottir", label: "Íþróttir" },
  { id: "vidskipti", label: "Viðskipti" },
  { id: "menning",   label: "Menning" },
  { id: "skodun",    label: "Skoðun" },
  { id: "oflokkad",  label: "Óflokkað" },
];

function labelFor(id) {
  return (CATEGORY_MAP.find(c => c.id === id)?.label) || "Óflokkað";
}

function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .replaceAll("í", "i")
    .replaceAll("ð", "d")
    .replaceAll("þ", "th")
    .replaceAll("æ", "ae")
    .replaceAll("ö", "o");
}

function inferCategories({ sourceId, url, rssCategoryText, title }) {
  const u = normalizeText(url);
  const c = normalizeText(rssCategoryText);
  const t = normalizeText(title);

  const ids = new Set();

  // frá RSS “category” og titli
  for (const x of [c, t]) {
    const fromText = mapFromTextMulti(x);
    for (const id of fromText) ids.add(id);
  }

  // frá URL
  for (const id of mapFromUrlMulti(sourceId, u)) ids.add(id);

  if (ids.size === 0) ids.add("oflokkad");

  // stable ordering (for display)
  const ordered = CATEGORY_MAP.map(x => x.id).filter(id => ids.has(id));
  if (ordered.length === 0) ordered.push("oflokkad");

  return {
    categoryIds: ordered,
    categoryLabels: ordered.map(labelFor),
  };
}

function mapFromTextMulti(x) {
  const out = [];
  if (!x) return out;

  if (x.includes("sport") || x.includes("ithrott")) out.push("ithrottir");
  if (x.includes("vidskip") || x.includes("business") || x.includes("markad") || x.includes("econom")) out.push("vidskipti");
  if (x.includes("menning") || x.includes("lifid") || x.includes("list") || x.includes("kultur")) out.push("menning");
  if (x.includes("skodun") || x.includes("comment") || x.includes("pistill") || x.includes("leidari")) out.push("skodun");
  if (x.includes("erlent") || x.includes("foreign") || x.includes("international")) out.push("erlent");
  if (x.includes("innlent") || x.includes("island")) out.push("innlent");

  return uniq(out);
}

function mapFromUrlMulti(sourceId, u) {
  const out = [];

  // generic
  if (u.includes("/sport") || u.includes("/ithrott")) out.push("ithrottir");
  if (u.includes("/vidskip") || u.includes("/business") || u.includes("/markad")) out.push("vidskipti");
  if (u.includes("/menning") || u.includes("/lifid") || u.includes("/list")) out.push("menning");
  if (u.includes("/skodun") || u.includes("/pistill") || u.includes("/comment")) out.push("skodun");
  if (u.includes("/erlent")) out.push("erlent");
  if (u.includes("/innlent")) out.push("innlent");

  // source tweaks (optional)
  if (sourceId === "ruv") {
    if (u.includes("/ithrottir")) out.push("ithrottir");
    if (u.includes("/vidskipti")) out.push("vidskipti");
  }

  return uniq(out);
}

function uniq(arr) {
  return [...new Set(arr)];
}