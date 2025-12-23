// /functions/api/news.js

export async function onRequestGet({ request }) {
  const { searchParams } = new URL(request.url);

  const sources = (searchParams.get("sources") || "").split(",").filter(Boolean);
  const catsParam = (searchParams.get("cats") || "").split(",").filter(Boolean);
  const limit = Number(searchParams.get("limit") || 50);

  const feeds = {
    ruv:   { url: "https://www.ruv.is/rss/frettir", label: "RÚV",  domain: "ruv.is" },
    mbl:   { url: "https://www.mbl.is/feeds/fp/",   label: "mbl.is", domain: "mbl.is" },
    visir: { url: "https://www.visir.is/rss/allt",  label: "Vísir", domain: "visir.is" },
    dv:    { url: "https://www.dv.is/feed/",        label: "DV", domain: "dv.is" },

    // Nýir miðlar (RSS slóðir geta þurft fínstillingu ef eitthvað skilar 404/HTML)
    stundin:   { url: "https://stundin.is/feed/",   label: "Stundin",        domain: "stundin.is" },
    heimildin: { url: "https://heimildin.is/feed/", label: "Heimildin",      domain: "heimildin.is" },
    frettin:   { url: "https://frettin.is/feed/",   label: "Fréttin",        domain: "frettin.is" },
    vb:        { url: "https://vb.is/feed/",        label: "Viðskiptablaðið",domain: "vb.is" },
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
        console.error("Feed HTTP error:", id, res.status, feed.url);
        continue;
      }

      const xml = await res.text();

      // Basic sanity: RSS should contain <item>
      if (!xml.includes("<item")) {
        console.error("Feed not RSS (no <item>):", id, feed.url);
        continue;
      }

      const matches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];

      for (const m of matches) {
        const block = m[1];

        const title = extract(block, "title");
        const link = extract(block, "link");
        const pubDate = extract(block, "pubDate");
        if (!title || !link) continue;

        const rssCats = extractAll(block, "category");
        const rssCatText = (rssCats.join(" ") || "").trim();

        const { categoryId, categoryLabel, categoryIds, categoryLabels } = inferCategoryMulti({
          sourceId: id,
          url: link,
          rssCategoryText: rssCatText,
          title
        });

        // cats filtering (OR): ef einhver flokkur matchar
        if (activeCats.size > 0 && !categoryIds.some(c => activeCats.has(c))) continue;

        items.push({
          title,
          url: link,
          publishedAt: pubDate ? safeIso(pubDate) : null,
          sourceId: id,
          sourceLabel: feed.label,

          // NÝTT: nota þinn icon API
          iconUrl: `/api/icon?d=${encodeURIComponent(feed.domain)}`,

          // heldur backwards-compat
          categoryId,
          category: categoryLabel,

          // NÝTT: multi flokkar (valfrjálst í frontend)
          categoryIds,
          categoryLabels,
        });
      }
    } catch (err) {
      console.error("Feed error:", id, err);
    }
  }

  items.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));

  const sliced = items.slice(0, limit);
  const availableCategories = [...new Set(sliced.flatMap(x => x.categoryIds || []).filter(Boolean))];

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

function safeIso(pubDate) {
  const t = Date.parse(pubDate);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
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

// Multi-category inference (safe + simple)
function inferCategoryMulti({ sourceId, url, rssCategoryText, title }) {
  const u = normalizeText(url);
  const c = normalizeText(rssCategoryText);
  const t = normalizeText(title);

  const ids = new Set();

  for (const id of mapFromText(c)) ids.add(id);
  for (const id of mapFromText(t)) ids.add(id);
  for (const id of mapFromUrl(sourceId, u)) ids.add(id);

  if (ids.size === 0) ids.add("oflokkad");

  // stable order for display
  const ordered = CATEGORY_MAP.map(x => x.id).filter(id => ids.has(id));
  const primary = ordered[0] || "oflokkad";

  return {
    categoryId: primary,
    categoryLabel: labelFor(primary),
    categoryIds: ordered.length ? ordered : ["oflokkad"],
    categoryLabels: (ordered.length ? ordered : ["oflokkad"]).map(labelFor),
  };
}

function mapFromText(x) {
  const out = [];
  if (!x) return out;
  if (x.includes("sport") || x.includes("ithrott")) out.push("ithrottir");
  if (x.includes("vidskip") || x.includes("business") || x.includes("markad") || x.includes("econom")) out.push("vidskipti");
  if (x.includes("menning") || x.includes("lifid") || x.includes("list") || x.includes("kultur")) out.push("menning");
  if (x.includes("skodun") || x.includes("comment") || x.includes("pistill") || x.includes("leidari")) out.push("skodun");
  if (x.includes("erlent") || x.includes("foreign") || x.includes("international")) out.push("erlent");
  if (x.includes("innlent") || x.includes("island")) out.push("innlent");
  return [...new Set(out)];
}

function mapFromUrl(sourceId, u) {
  const out = [];
  if (u.includes("/sport") || u.includes("/ithrott")) out.push("ithrottir");
  if (u.includes("/vidskip") || u.includes("/business") || u.includes("/markad")) out.push("vidskipti");
  if (u.includes("/menning") || u.includes("/lifid") || u.includes("/list")) out.push("menning");
  if (u.includes("/skodun") || u.includes("/pistill") || u.includes("/comment")) out.push("skodun");
  if (u.includes("/erlent")) out.push("erlent");
  if (u.includes("/innlent")) out.push("innlent");

  // smá source tweaks (má stækka)
  if (sourceId === "dv" && u.includes("/frettir")) out.push("innlent");

  return [...new Set(out)];
}