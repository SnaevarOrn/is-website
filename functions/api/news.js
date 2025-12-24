// /functions/api/news.js
export async function onRequestGet({ request }) {
  const { searchParams } = new URL(request.url);

  const sources = (searchParams.get("sources") || "").split(",").filter(Boolean);
  const catsParam = (searchParams.get("cats") || "").split(",").filter(Boolean);
  const limit = clampInt(searchParams.get("limit"), 50, 1, 200);

  const feeds = {
    // ✅ ACTIVE
    ruv:   { url: "https://www.ruv.is/rss/frettir", label: "RÚV" },
    mbl:   { url: "https://www.mbl.is/feeds/fp/",   label: "mbl.is" },
    visir: { url: "https://www.visir.is/rss/allt",  label: "Vísir" },
    dv:    { url: "https://www.dv.is/feed/",        label: "DV" },
    vb:    { url: "https://www.vb.is/rss",          label: "Viðskiptablaðið" },
    stundin:   { url: "https://stundin.is/rss/",     label: "Heimildin" },
    grapevine: { url: "https://grapevine.is/feed/",  label: "Grapevine" },
  };

  const activeSources = sources.length ? sources : Object.keys(feeds);
  const activeCats = new Set(catsParam.length ? catsParam : []); // empty => no filtering

  const items = [];

  for (const id of activeSources) {
    const feed = feeds[id];
    if (!feed) continue;

    try {
      const res = await fetch(feed.url, {
        headers: { "User-Agent": "is.is news bot" }
      });

      if (!res.ok) {
        console.error("Feed HTTP error:", id, res.status);
        continue;
      }

      const xml = await res.text();
      const matches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];

      for (const m of matches) {
        const block = m[1];

        const rawTitle = extract(block, "title");
        const rawLink = extract(block, "link");
        const pubDate = extract(block, "pubDate");

        if (!rawTitle || !rawLink) continue;

        const title = cleanText(rawTitle);
        const link = cleanUrl(rawLink);

        const rssCats = extractAll(block, "category").map(cleanText).filter(Boolean);

        const { categoryId, categoryLabel } = inferCategory({
          sourceId: id,
          url: link,
          rssCategories: rssCats,
          title
        });

        if (activeCats.size > 0 && !activeCats.has(categoryId)) continue;

        const host = safeHostname(link);

        items.push({
          title,
          url: link,
          publishedAt: pubDate ? safeISO(pubDate) : null,
          sourceId: id,
          sourceLabel: feed.label,
          domain: host || undefined,

          // ✅ consistent category fields
          categoryId,
          category: categoryLabel,                // keep for backwards compat with your frontend
          categoryLabels: [categoryLabel],        // nice for UI (badges)
        });
      }
    } catch (err) {
      console.error("Feed error:", id, err);
    }
  }

  items.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));

  const sliced = items.slice(0, limit);
  const availableCategories = [...new Set(sliced.map(x => x.categoryId).filter(Boolean))];

  return new Response(
    JSON.stringify({ items: sliced, availableCategories }),
    {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=300"
      }
    }
  );
}

/* -------- Helpers -------- */

function clampInt(x, fallback, min, max) {
  const n = Number(x);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function safeISO(pubDate) {
  const t = Date.parse(pubDate);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function safeHostname(url) {
  try { return new URL(url).hostname; } catch { return ""; }
}

function cleanUrl(u) {
  // RSS getur stundum innihaldið whitespace/newlines í link
  return String(u || "").trim();
}

function extract(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}>(<!\$begin:math:display$CDATA\\\\\[\)\?\(\[\\\\s\\\\S\]\*\?\)\(\\$end:math:display$\\]>)?<\\/${tag}>`));
  return m ? (m[2] || "").trim() : null;
}

function extractAll(xml, tag) {
  const re = new RegExp(`<${tag}>(<!\$begin:math:display$CDATA\\\\\[\)\?\(\[\\\\s\\\\S\]\*\?\)\(\\$end:math:display$\\]>)?<\\/${tag}>`, "g");
  const out = [];
  let m;
  while ((m = re.exec(xml)) !== null) out.push((m[2] || "").trim());
  return out;
}

/* --- Category model --- */

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

/* --- Text cleaning / decoding --- */

function decodeHtmlEntities(s) {
  // decode numeric: &#8211; and hex: &#x2013;
  let out = String(s ?? "");

  out = out.replace(/&#(\d+);/g, (_, n) => {
    const cp = Number(n);
    return Number.isFinite(cp) ? String.fromCodePoint(cp) : _;
  });

  out = out.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
    const cp = parseInt(hex, 16);
    return Number.isFinite(cp) ? String.fromCodePoint(cp) : _;
  });

  // common named entities (RSS feeds often use these)
  out = out
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&nbsp;", " ");

  return out;
}

function cleanText(s) {
  let out = decodeHtmlEntities(s);

  // strip tags just in case (some feeds include <em> etc.)
  out = out.replace(/<[^>]*>/g, "");

  // normalize dash chaos to a simple hyphen
  out = out.replace(/[\u2012-\u2015]/g, "-");

  // normalize whitespace
  out = out.replace(/\s+/g, " ").trim();

  return out;
}

function normKey(s) {
  // robust “folding” for icelandic + punctuation
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")      // remove diacritics
    .replace(/[^a-z0-9\/\s-]/g, " ");     // drop odd punctuation
}

/* --- Category inference --- */

function inferCategory({ sourceId, url, rssCategories, title }) {
  const u = normKey(url);
  const cats = Array.isArray(rssCategories) ? rssCategories : [];
  const catKeys = cats.map(normKey).filter(Boolean);

  // 1) RSS categories (try ALL, not only first)
  for (const ck of catKeys) {
    const mapped = mapFromText(ck);
    if (mapped) return { categoryId: mapped, categoryLabel: labelFor(mapped) };
  }

  // 2) URL patterns
  const fromUrl = mapFromUrl(sourceId, u);
  if (fromUrl) return { categoryId: fromUrl, categoryLabel: labelFor(fromUrl) };

  // 3) title keywords only as last resort (avoid false positives)
  const t = normKey(title);
  const fromTitle = mapFromText(t);
  if (fromTitle) return { categoryId: fromTitle, categoryLabel: labelFor(fromTitle) };

  return { categoryId: "oflokkad", categoryLabel: labelFor("oflokkad") };
}

function mapFromText(x) {
  if (!x) return null;

  // sports
  if (x.includes("sport") || x.includes("ithrott")) return "ithrottir";

  // business
  if (x.includes("vidskip") || x.includes("business") || x.includes("markad") || x.includes("fjarmal")) return "vidskipti";

  // culture
  if (x.includes("menning") || x.includes("lifid") || x.includes("list") || x.includes("skemmt")) return "menning";

  // opinion
  if (x.includes("skodun") || x.includes("comment") || x.includes("pistill") || x.includes("leidari")) return "skodun";

  // foreign/domestic
  if (x.includes("erlent") || x.includes("foreign") || x.includes("world")) return "erlent";
  if (x.includes("innlent") || x.includes("island")) return "innlent";

  return null;
}

function mapFromUrl(sourceId, u) {
  // Generic patterns
  if (u.includes("/sport") || u.includes("/ithrott")) return "ithrottir";
  if (u.includes("/vidskip") || u.includes("/business") || u.includes("/markad")) return "vidskipti";
  if (u.includes("/menning") || u.includes("/lifid") || u.includes("/list")) return "menning";
  if (u.includes("/skodun") || u.includes("/pistill") || u.includes("/comment")) return "skodun";
  if (u.includes("/erlent")) return "erlent";
  if (u.includes("/innlent")) return "innlent";

  // Source-specific tweaks
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

  if (sourceId === "vb") {
    if (u.includes("/sport")) return "ithrottir";
    if (u.includes("/vidskipti") || u.includes("/markad")) return "vidskipti";
    if (u.includes("/menning") || u.includes("/lifid")) return "menning";
    if (u.includes("/pistill") || u.includes("/skodun")) return "skodun";
    if (u.includes("/erlent")) return "erlent";
    if (u.includes("/innlent")) return "innlent";
  }

  return null;
}