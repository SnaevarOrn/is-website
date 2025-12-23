// /functions/api/news.js

export async function onRequestGet({ request }) {
  const { searchParams } = new URL(request.url);

  const sources = (searchParams.get("sources") || "").split(",").filter(Boolean);
  const catsParam = (searchParams.get("cats") || "").split(",").filter(Boolean);
  const limit = Math.min(200, Number(searchParams.get("limit") || 50));
  const debug = searchParams.get("debug") === "1";

  const feeds = {
    ruv:   { url: "https://www.ruv.is/rss/frettir", label: "RÚV",      domain: "ruv.is" },
    mbl:   { url: "https://www.mbl.is/feeds/fp/",   label: "mbl.is",   domain: "mbl.is" },
    visir: { url: "https://www.visir.is/rss/allt",  label: "Vísir",    domain: "visir.is" },
    dv:    { url: "https://www.dv.is/feed/",       label: "DV",       domain: "dv.is" },

    // (við bætum þessum inn þegar við höfum réttar feed-slóðir staðfestar)
    // stundin:   { url: "...", label: "Stundin",        domain: "stundin.is" },
    // heimildin: { url: "...", label: "Heimildin",      domain: "heimildin.is" },
    // frettin:   { url: "...", label: "Fréttin",        domain: "frettin.is" },
    // vb:        { url: "...", label: "Viðskiptablaðið",domain: "vb.is" },
  };

  const activeSources = sources.length ? sources : Object.keys(feeds);
  const activeCats = new Set(catsParam.length ? catsParam : []); // empty => no filtering

  const items = [];
  const diag = {};

  for (const id of activeSources) {
    const feed = feeds[id];
    if (!feed) continue;

    diag[id] = { ok: false, status: null, parsed: 0, error: null };

    try {
      const res = await fetch(feed.url, {
        headers: {
          "User-Agent": "is.is news bot",
          "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
        },
      });

      diag[id].status = res.status;

      if (!res.ok) {
        diag[id].error = `HTTP ${res.status}`;
        continue;
      }

      const xml = await res.text();

      const parsed = parseFeed(xml); // returns array of { title, link, publishedAt, categories[] }
      diag[id].ok = true;
      diag[id].parsed = parsed.length;

      for (const it of parsed) {
        if (!it.title || !it.link) continue;

        const { categoryIds, categoryLabels } = inferCategories({
          sourceId: id,
          url: it.link,
          rssCategoryTexts: it.categories || [],
          title: it.title,
        });

        // cats filtering: OR-match (any selected category matches)
        if (activeCats.size > 0) {
          const ok = categoryIds.some(cid => activeCats.has(cid));
          // fail-open: ef ekkert match og þetta er bara "oflokkad", þá sleppum við EKKI (annars “deyr” allt)
          if (!ok && !categoryIds.includes("oflokkad")) continue;
        }

        items.push({
          title: it.title,
          url: it.link,
          publishedAt: it.publishedAt,
          sourceId: id,
          sourceLabel: feed.label,
          sourceDomain: feed.domain,
          categoryIds,
          categoryLabels,
          // legacy:
          categoryId: categoryIds[0] || "oflokkad",
          category: (categoryLabels[0] || "Óflokkað"),
        });
      }
    } catch (err) {
      diag[id].error = String(err?.message || err);
    }
  }

  items.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));

  const sliced = items.slice(0, limit);
  const availableCategories = [...new Set(sliced.flatMap(x => x.categoryIds || []).filter(Boolean))];

  const payload = debug
    ? { items: sliced, availableCategories, diag }
    : { items: sliced, availableCategories };

  return new Response(JSON.stringify(payload), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=120",
    },
  });
}

/* ----------------- Parsing (RSS + Atom) ----------------- */

function parseFeed(xml) {
  // RSS: <item ...>...</item>
  const rssItems = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(m => m[1]);

  // Atom: <entry ...>...</entry>
  const atomEntries = [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)].map(m => m[1]);

  const blocks = rssItems.length ? rssItems : atomEntries;

  return blocks.map(block => {
    const title = decodeEntities(extractTagText(block, "title"));
    const pub =
      extractTagText(block, "pubDate") ||
      extractTagText(block, "updated") ||
      extractTagText(block, "published");

    const link =
      extractTagText(block, "link") ||
      extractLinkHref(block); // Atom style

    const cats = extractAllTagText(block, "category")
      .map(decodeEntities)
      .filter(Boolean);

    return {
      title: clean(title),
      link: clean(link),
      publishedAt: pub ? safeISO(pub) : null,
      categories: cats,
    };
  }).filter(x => x.title && x.link);
}

function extractTagText(xml, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*>(<!\$begin:math:display$CDATA\\\\\[\)\?\(\[\\\\s\\\\S\]\*\?\)\(\\$end:math:display$\\]>)?<\\/${tag}>`, "i");
  const m = xml.match(re);
  return m ? (m[2] || "").trim() : null;
}

function extractAllTagText(xml, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*>(<!\$begin:math:display$CDATA\\\\\[\)\?\(\[\\\\s\\\\S\]\*\?\)\(\\$end:math:display$\\]>)?<\\/${tag}>`, "gi");
  const out = [];
  let m;
  while ((m = re.exec(xml)) !== null) out.push((m[2] || "").trim());
  return out;
}

function extractLinkHref(xml) {
  // Atom: <link href="https://..." ... />
  const m = xml.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  return m ? m[1].trim() : null;
}

function safeISO(s) {
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function clean(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function decodeEntities(s) {
  if (!s) return s;
  return String(s)
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'");
}

/* ----------------- Categories (multi) ----------------- */

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
  return CATEGORY_MAP.find(c => c.id === id)?.label || "Óflokkað";
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

function inferCategories({ sourceId, url, rssCategoryTexts, title }) {
  const u = normalizeText(url);
  const t = normalizeText(title);
  const catTexts = (rssCategoryTexts || []).map(normalizeText);

  const ids = new Set();

  // 1) from RSS <category> (get multiple)
  for (const c of catTexts) {
    const cid = mapFromText(c);
    if (cid) ids.add(cid);
  }

  // 2) from title (weak signal)
  const fromTitle = mapFromText(t);
  if (fromTitle) ids.add(fromTitle);

  // 3) from URL (often strongest)
  const fromUrl = mapFromUrl(sourceId, u);
  if (fromUrl) ids.add(fromUrl);

  if (ids.size === 0) ids.add("oflokkad");

  const categoryIds = [...ids];
  const categoryLabels = categoryIds.map(labelFor);

  return { categoryIds, categoryLabels };
}

function mapFromText(x) {
  if (!x) return null;
  if (x.includes("sport") || x.includes("ithrott")) return "ithrottir";
  if (x.includes("vidskip") || x.includes("business") || x.includes("markad")) return "vidskipti";
  if (x.includes("menning") || x.includes("lifid") || x.includes("list")) return "menning";
  if (x.includes("skodun") || x.includes("comment") || x.includes("pistill")) return "skodun";
  if (x.includes("erlent") || x.includes("foreign")) return "erlent";
  if (x.includes("innlent") || x.includes("island")) return "innlent";
  return null;
}

function mapFromUrl(sourceId, u) {
  if (u.includes("/sport") || u.includes("/ithrott")) return "ithrottir";
  if (u.includes("/vidskip") || u.includes("/business") || u.includes("/markad")) return "vidskipti";
  if (u.includes("/menning") || u.includes("/lifid") || u.includes("/list")) return "menning";
  if (u.includes("/skodun") || u.includes("/pistill") || u.includes("/comment")) return "skodun";
  if (u.includes("/erlent")) return "erlent";
  if (u.includes("/innlent")) return "innlent";

  // Source-specific nudges
  if (sourceId === "ruv") {
    if (u.includes("/ithrottir")) return "ithrottir";
    if (u.includes("/vidskipti")) return "vidskipti";
    if (u.includes("/menning")) return "menning";
    if (u.includes("/erlent")) return "erlent";
    if (u.includes("/innlent")) return "innlent";
  }
  if (sourceId === "mbl") {
    if (u.includes("/sport")) return "ithrottir";
    if (u.includes("/vidskipti")) return "vidskipti";
    if (u.includes("/frettir/innlent")) return "innlent";
    if (u.includes("/frettir/erlent")) return "erlent";
  }
  if (sourceId === "visir") {
    if (u.includes("/sport")) return "ithrottir";
    if (u.includes("/vidskipti")) return "vidskipti";
    if (u.includes("/frettir/innlent")) return "innlent";
    if (u.includes("/frettir/erlent")) return "erlent";
  }
  if (sourceId === "dv") {
    if (u.includes("/sport")) return "ithrottir";
    if (u.includes("/vidskipti")) return "vidskipti";
    if (u.includes("/frettir")) return "innlent";
  }

  return null;
}}}