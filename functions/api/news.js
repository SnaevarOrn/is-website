// /functions/api/news.js

export async function onRequestGet({ request }) {
  const { searchParams } = new URL(request.url);

  const sources = (searchParams.get("sources") || "").split(",").filter(Boolean);
  const catsParam = (searchParams.get("cats") || "").split(",").filter(Boolean);
  const limit = Math.min(120, Math.max(1, Number(searchParams.get("limit") || 50)));
  const debug = searchParams.get("debug") === "1";

  const feeds = {
    ruv:   { url: "https://www.ruv.is/rss/frettir", label: "RÚV", domain: "ruv.is" },
    mbl:   { url: "https://www.mbl.is/feeds/fp/",   label: "mbl.is", domain: "mbl.is" },
    visir: { url: "https://www.visir.is/rss/allt",  label: "Vísir", domain: "visir.is" },
    dv:    { url: "https://www.dv.is/feed/",        label: "DV", domain: "dv.is" },

    // Best-guess RSS endpoints (virka oft á WP). Ef eitthvað þeirra er ekki WP -> slökkva í UI eða breyta url.
    frettin:   { url: "https://frettin.is/feed/",    label: "Fréttin", domain: "frettin.is" },
    vb:        { url: "https://vb.is/feed/",         label: "Viðskiptablaðið", domain: "vb.is" },
    stundin:   { url: "https://stundin.is/feed/",    label: "Stundin", domain: "stundin.is" },
    heimildin: { url: "https://heimildin.is/feed/",  label: "Heimildin", domain: "heimildin.is" },
  };

  const activeSources = sources.length ? sources : Object.keys(feeds);
  const activeCats = new Set(catsParam.length ? catsParam : []); // empty => no filtering

  const items = [];
  const dbg = [];

  for (const id of activeSources) {
    const feed = feeds[id];
    if (!feed) continue;

    const one = { id, url: feed.url, http: null, ok: false, parsed: 0, added: 0, skippedNoTitle: 0, skippedNoLink: 0, err: null, sampleTitle: null };
    try {
      const res = await fetch(feed.url, {
        headers: {
          "User-Agent": "is.is news bot",
          "Accept": "application/rss+xml, application/atom+xml, text/xml, */*"
        }
      });

      one.http = res.status;
      if (!res.ok) {
        one.err = `HTTP ${res.status}`;
        dbg.push(one);
        continue;
      }

      const xml = await res.text();
      const parsed = parseFeedItems(xml); // returns normalized list
      one.ok = true;
      one.parsed = parsed.length;

      for (const it of parsed) {
        const title = it.title?.trim() || null;
        const link = it.url?.trim() || null;
        const pubDate = it.publishedAt || null;

        if (!title) { one.skippedNoTitle++; continue; }
        if (!link)  { one.skippedNoLink++; continue; }
        if (!one.sampleTitle) one.sampleTitle = title;

        const rssCats = Array.isArray(it.categories) ? it.categories : [];
        const inferred = inferCategories({ sourceId: id, url: link, rssCategories: rssCats, title });

        // cats filtering (OR: match any)
        if (activeCats.size > 0) {
          const hasAny = inferred.categoryIds.some(c => activeCats.has(c));
          if (!hasAny) continue;
        }

        items.push({
          title,
          url: link,
          publishedAt: pubDate ? new Date(pubDate).toISOString() : null,

          sourceId: id,
          sourceLabel: feed.label,
          sourceDomain: feed.domain,
          iconUrl: `/api/icon?domain=${encodeURIComponent(feed.domain)}`,

          categoryIds: inferred.categoryIds,
          categoryLabels: inferred.categoryLabels
        });

        one.added++;
      }

      dbg.push(one);
    } catch (err) {
      one.err = String(err?.message || err);
      dbg.push(one);
    }
  }

  items.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
  const sliced = items.slice(0, limit);

  const availableCategories = [...new Set(
    sliced.flatMap(x => Array.isArray(x.categoryIds) ? x.categoryIds : []).filter(Boolean)
  )];

  const body = debug
    ? { items: sliced, availableCategories, debug: dbg }
    : { items: sliced, availableCategories };

  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300"
    }
  });
}

/* ----------------- Feed parsing (RSS + Atom) ----------------- */

function parseFeedItems(xml) {
  // RSS 2.0 <item>
  const rssBlocks = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(m => m[1]);
  if (rssBlocks.length) {
    return rssBlocks.map(block => ({
      title: extract(block, "title"),
      url: extract(block, "link") || extract(block, "guid"),
      publishedAt: extract(block, "pubDate") || extract(block, "dc:date"),
      categories: extractAll(block, "category")
    }));
  }

  // Atom <entry>
  const atomBlocks = [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)].map(m => m[1]);
  if (!atomBlocks.length) return [];

  return atomBlocks.map(block => {
    const title = extract(block, "title");
    const updated = extract(block, "updated") || extract(block, "published");
    // Atom link is usually <link href="..."/>
    const link =
      extractAttr(block, "link", "href", /rel=["']alternate["']/i) ||
      extractAttr(block, "link", "href") ||
      null;

    return {
      title,
      url: link,
      publishedAt: updated,
      categories: extractAll(block, "category") // some Atom feeds use <category term="...">
    };
  });
}

/* -------- XML helpers (whitespace-safe) -------- */

function extract(xml, tag) {
  // Handles whitespace/newlines after <tag> and before CDATA/text
  const re = new RegExp(`<${escapeRe(tag)}\\b[^>]*>\\s*(<!\$begin:math:display$CDATA\\\\\[\)\?\(\[\\\\s\\\\S\]\*\?\)\(\\$end:math:display$\\]>)?\\s*<\\/${escapeRe(tag)}>`, "i");
  const m = xml.match(re);
  return m ? (m[2] || "").trim() : null;
}

function extractAll(xml, tag) {
  const re = new RegExp(`<${escapeRe(tag)}\\b[^>]*>\\s*(<!\$begin:math:display$CDATA\\\\\[\)\?\(\[\\\\s\\\\S\]\*\?\)\(\\$end:math:display$\\]>)?\\s*<\\/${escapeRe(tag)}>`, "ig");
  const out = [];
  let m;
  while ((m = re.exec(xml)) !== null) out.push((m[2] || "").trim());
  return out;
}

function extractAttr(xml, tag, attr, mustContainRe) {
  const re = new RegExp(`<${escapeRe(tag)}\\b[^>]*>`, "ig");
  let m;
  while ((m = re.exec(xml)) !== null) {
    const full = m[0];
    if (mustContainRe && !mustContainRe.test(full)) continue;
    const a = full.match(new RegExp(`${escapeRe(attr)}=["']([^"']+)["']`, "i"));
    if (a) return a[1];
  }
  // Also allow self-closing tags inside block
  const re2 = new RegExp(`<${escapeRe(tag)}\\b[^>]*\\/?>`, "ig");
  while ((m = re2.exec(xml)) !== null) {
    const full = m[0];
    if (mustContainRe && !mustContainRe.test(full)) continue;
    const a = full.match(new RegExp(`${escapeRe(attr)}=["']([^"']+)["']`, "i"));
    if (a) return a[1];
  }
  return null;
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function inferCategories({ sourceId, url, rssCategories, title }) {
  const u = normalizeText(url);
  const t = normalizeText(title);

  const fromRss = (rssCategories || [])
    .map(x => mapFromText(normalizeText(x)))
    .filter(Boolean);

  const fromTitle = mapFromText(t);
  const fromUrl = mapFromUrl(sourceId, u);

  const set = new Set();
  fromRss.forEach(x => set.add(x));
  if (fromTitle) set.add(fromTitle);
  if (fromUrl) set.add(fromUrl);

  if (set.size === 0) set.add("oflokkad");

  const categoryIds = [...set];
  const categoryLabels = categoryIds.map(labelFor);

  return { categoryIds, categoryLabels };
}

function mapFromText(x) {
  if (!x) return null;
  if (x.includes("sport") || x.includes("ithrott")) return "ithrottir";
  if (x.includes("vidskip") || x.includes("business") || x.includes("markad") || x.includes("fjarmal")) return "vidskipti";
  if (x.includes("menning") || x.includes("lifid") || x.includes("list")) return "menning";
  if (x.includes("skodun") || x.includes("comment") || x.includes("pistill") || x.includes("leidari")) return "skodun";
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

  // mild source tweaks
  if (sourceId === "mbl" && u.includes("/frettir/innlent")) return "innlent";
  if (sourceId === "mbl" && u.includes("/frettir/erlent"))  return "erlent";
  if (sourceId === "visir" && u.includes("/frettir/innlent")) return "innlent";
  if (sourceId === "visir" && u.includes("/frettir/erlent"))  return "erlent";

  return null;
}