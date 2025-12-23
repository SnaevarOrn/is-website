// /functions/api/news.js

export async function onRequestGet({ request }) {
  const { searchParams } = new URL(request.url);

  const sources = (searchParams.get("sources") || "").split(",").map(s => s.trim()).filter(Boolean);
  const catsParam = (searchParams.get("cats") || "").split(",").map(s => s.trim()).filter(Boolean);
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") || 60)));

  // Ath: RSS = “feed” (XML) sem miðlar bjóða til að sækja nýjustu fréttir.
  // Ef einhver af þessum URL-um reynist rangur hjá ákveðnum miðli, segðu mér og ég laga.
  const feeds = {
    ruv:       { url: "https://www.ruv.is/rss/frettir",     label: "RÚV",            domain: "ruv.is" },
    mbl:       { url: "https://www.mbl.is/feeds/fp/",       label: "mbl.is",         domain: "mbl.is" },
    visir:     { url: "https://www.visir.is/rss/allt",      label: "Vísir",          domain: "visir.is" },
    dv:        { url: "https://www.dv.is/feed/",            label: "DV",             domain: "dv.is" },

    // Nýir (best-effort feed endpoints; laga ef þarf)
    heimildin: { url: "https://heimildin.is/feed/",         label: "Heimildin",      domain: "heimildin.is" },
    stundin:   { url: "https://heimildin.is/feed/",         label: "Stundin",        domain: "stundin.is" },
    frettin:   { url: "https://frettin.is/feed/",           label: "Fréttin",        domain: "frettin.is" },
    vb:        { url: "https://vb.is/feed/",                label: "Viðskiptablaðið",domain: "vb.is" },
  };

  const activeSources = sources.length ? sources : Object.keys(feeds);
  const activeCats = new Set(catsParam.length ? catsParam : []); // empty => no filtering

  const items = [];

  for (const id of activeSources) {
    const feed = feeds[id];
    if (!feed) continue;

    try {
      const res = await fetch(feed.url, { headers: { "User-Agent": "is.is news bot" } });
      if (!res.ok) continue;

      const xml = await res.text();
      const matches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];

      for (const m of matches) {
        const block = m[1];

        const title = extract(block, "title");
        const link = extract(block, "link");
        const pubDate = extract(block, "pubDate");

        if (!title || !link) continue;

        const rssCats = extractAll(block, "category"); // getur verið 0..N
        const inferred = inferCategories({
          sourceId: id,
          url: link,
          rssCategoryTexts: rssCats,
          title
        });

        // filtering: ef cats eru gefin, þá þarf ALLAVEGA eitt match
        if (activeCats.size > 0) {
          const ok = inferred.categoryIds.some(cid => activeCats.has(cid));
          if (!ok) continue;
        }

        items.push({
          title,
          url: link,
          publishedAt: pubDate ? new Date(pubDate).toISOString() : null,
          sourceId: id,
          sourceLabel: feed.label,
          iconUrl: `/api/icon?domain=${encodeURIComponent(feed.domain)}`,

          categoryIds: inferred.categoryIds,
          categoryLabels: inferred.categoryLabels,

          // legacy fields (ef frontend er enn að nota þau)
          categoryId: inferred.categoryIds[0] || "oflokkad",
          category: inferred.categoryLabels[0] || "Óflokkað",
        });
      }
    } catch (err) {
      console.error("Feed error:", id, err);
    }
  }

  items.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
  const sliced = items.slice(0, limit);

  const availableCategories = [
    ...new Set(sliced.flatMap(x => (Array.isArray(x.categoryIds) ? x.categoryIds : [])))
  ];

  return new Response(JSON.stringify({ items: sliced, availableCategories }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=180, s-maxage=180"
    }
  });
}

/* -------- Helpers -------- */

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

// Skilar multi-cats: 1–2 “best” (til að halda UI smooth)
function inferCategories({ sourceId, url, rssCategoryTexts, title }) {
  const u = normalizeText(url);
  const t = normalizeText(title);

  const candidates = [];

  // 1) RSS category text (0..N)
  for (const raw of (rssCategoryTexts || [])) {
    const c = normalizeText(raw);
    const mapped = mapFromText(c);
    if (mapped) candidates.push(mapped);
  }

  // 2) Title (fallback hint)
  {
    const mapped = mapFromText(t);
    if (mapped) candidates.push(mapped);
  }

  // 3) URL (oft best)
  {
    const mapped = mapFromUrl(sourceId, u);
    if (mapped) candidates.push(mapped);
  }

  // dedupe, max 2
  const uniq = [...new Set(candidates)];
  const finalIds = uniq.length ? uniq.slice(0, 2) : ["oflokkad"];

  return {
    categoryIds: finalIds,
    categoryLabels: finalIds.map(labelFor),
  };
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

  // Source-specific tweaks (við bætum þessu bara ef við sjáum mynstur)
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
}}