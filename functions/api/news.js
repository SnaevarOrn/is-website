// /functions/api/news.js 
export async function onRequestGet({ request }) {
  const { searchParams } = new URL(request.url);

  const sources = (searchParams.get("sources") || "").split(",").filter(Boolean);
  const catsParam = (searchParams.get("cats") || "").split(",").filter(Boolean);
  const limit = Number(searchParams.get("limit") || 50);

  const feeds = {
    // ✅ ACTIVE
    ruv:   { url: "https://www.ruv.is/rss/frettir", label: "RÚV" },
    mbl:   { url: "https://www.mbl.is/feeds/fp/",   label: "mbl.is" },
    visir: { url: "https://www.visir.is/rss/allt",  label: "Vísir" },
    dv:    { url: "https://www.dv.is/feed/",        label: "DV" },
    vb:    { url: "https://www.vb.is/rss",          label: "Viðskiptablaðið" },
    stundin:   { url: "https://stundin.is/rss/",     label: "Heimildin" },
    grapevine: { url: "https://grapevine.is/feed/",  label: "Grapevine" },
    
    // 🔒 COMMENTED OUT — enable one by one when you want

    
    // romur:     { url: "https://romur.is/feed/",      label: "Rómur" },
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

        const title = extract(block, "title");
        const link = extract(block, "link");
        const pubDate = extract(block, "pubDate");

        if (!title || !link) continue;

        const rssCats = extractAll(block, "category");
        const rssCatText = (rssCats[0] || "").trim();

        const { categoryId, categoryLabel } = inferCategory({
          sourceId: id,
          url: link,
          rssCategoryText: rssCatText,
          title
        });

        if (activeCats.size > 0 && !activeCats.has(categoryId)) continue;

        items.push({
          title,
          url: link,
          publishedAt: pubDate ? new Date(pubDate).toISOString() : null,
          sourceId: id,
          sourceLabel: feed.label,
          categoryId,
          category: categoryLabel
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

function extract(xml, tag) {
  const m = xml.match(new RegExp(<${tag}>(<!\\[CDATA\\[)?([\\s\\S]*?)(\\]\\]>)?<\\/${tag}>));
  return m ? m[2].trim() : null;
}

function extractAll(xml, tag) {
  const re = new RegExp(<${tag}>(<!\\[CDATA\\[)?([\\s\\S]*?)(\\]\\]>)?<\\/${tag}>, "g");
  const out = [];
  let m;
  while ((m = re.exec(xml)) !== null) out.push((m[2] || "").trim());
  return out;
}

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

function inferCategory({ sourceId, url, rssCategoryText, title }) {
  const u = normalizeText(url);
  const c = normalizeText(rssCategoryText);
  const t = normalizeText(title);

  const fromRss = mapFromText(c) || mapFromText(t);
  const fromUrl = mapFromUrl(sourceId, u);

  const categoryId = fromRss || fromUrl || "oflokkad";
  return { categoryId, categoryLabel: labelFor(categoryId) };
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

  // ✅ VB tweaks
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