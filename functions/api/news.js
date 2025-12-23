// /functions/api/news.js

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const sp = url.searchParams;

  const sources = (sp.get("sources") || "").split(",").map(s => s.trim()).filter(Boolean);
  const catsParam = (sp.get("cats") || "").split(",").map(s => s.trim()).filter(Boolean);
  const limit = clampInt(sp.get("limit"), 1, 200, 60);
  const debug = sp.get("debug") === "1";

  const feeds = {
    ruv:   { url: "https://www.ruv.is/rss/frettir", label: "RÚV",    domain: "ruv.is" },
    mbl:   { url: "https://www.mbl.is/feeds/fp/",   label: "mbl.is", domain: "mbl.is" },
    visir: { url: "https://www.visir.is/rss/allt",  label: "Vísir",  domain: "visir.is" },
    dv:    { url: "https://www.dv.is/feed/",        label: "DV",     domain: "dv.is" },

    // Setjum fleiri miðla inn þegar við erum með 100% réttar feed-slóðir:
    // stundin:   { url: "...", label: "Stundin",        domain: "stundin.is" },
    // heimildin: { url: "...", label: "Heimildin",      domain: "heimildin.is" },
    // frettin:   { url: "...", label: "Fréttin",        domain: "frettin.is" },
    // vb:        { url: "...", label: "Viðskiptablaðið",domain: "vb.is" },
  };

  const activeSources = sources.length ? sources : Object.keys(feeds);
  const activeCats = new Set(catsParam); // empty => no filtering

  const items = [];
  const dbg = [];

  for (const id of activeSources) {
    const feed = feeds[id];
    if (!feed?.url) {
      if (debug) dbg.push({ id, ok: false, error: "unknown-source-or-missing-url" });
      continue;
    }

    const d = { id, url: feed.url, http: null, ok: false, parsed: 0, added: 0, sampleTitle: null, err: null };

    try {
      const xml = await fetchText(feed.url, 9000);
      // RSS: <item> ... </item>
      const rssItems = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(m => m[1]);

      // Atom fallback: <entry> ... </entry>
      const atomEntries = rssItems.length ? [] : [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)].map(m => m[1]);
      const blocks = rssItems.length ? rssItems : atomEntries;

      d.ok = true;
      d.parsed = blocks.length;

      for (const block of blocks) {
        // RSS fields
        const title = extract(block, "title") || extract(block, "atom:title");
        const link = extractLinkFromBlock(block);
        const pubDate = extract(block, "pubDate") || extract(block, "updated") || extract(block, "published");

        if (!title || !link) continue;
        if (!d.sampleTitle) d.sampleTitle = title.slice(0, 80);

        const rssCats = extractAll(block, "category");
        const inferred = inferCategories({ sourceId: id, url: link, rssCats, title });

        // filter: OR (matchar ef einhver flokkur í inferred er í activeCats)
        if (activeCats.size > 0) {
          const hit = inferred.categoryIds.some(cid => activeCats.has(cid));
          if (!hit) continue;
        }

        items.push({
          title,
          url: link,
          publishedAt: pubDate ? safeISO(pubDate) : null,
          sourceId: id,
          sourceLabel: feed.label,
          // icon api (bara strengur – engin ytri köll hér)
          iconUrl: feed.domain ? `/api/icon?domain=${encodeURIComponent(feed.domain)}` : null,

          categoryIds: inferred.categoryIds,
          categoryLabels: inferred.categoryLabels,

          // til baka-samhæfis ef eitthvað í front-end les "category"
          categoryId: inferred.categoryIds[0] || "oflokkad",
          category: inferred.categoryLabels[0] || "Óflokkað",
        });

        d.added++;
      }
    } catch (err) {
      d.err = String(err?.message || err);
    }

    if (debug) dbg.push(d);
  }

  items.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));

  const sliced = items.slice(0, limit);

  // hvaða flokkar eru raunverulega til staðar í þessu “batch”
  const availableCategories = uniq(
    sliced.flatMap(x => Array.isArray(x.categoryIds) ? x.categoryIds : [])
  );

  const body = debug
    ? { items: sliced, availableCategories, debug: dbg }
    : { items: sliced, availableCategories };

  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=120"
    }
  });
}

/* ---------------- Helpers ---------------- */

function clampInt(v, min, max, def) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}
function extractLinkFromBlock(block) {
  // 1. RSS <link>
  let link =
    extract(block, "link") ||
    extract(block, "guid");

  // 2. Atom <link href="...">
  if (!link) link = extractAtomLink(block);

  if (!link) return null;

  const s = String(link).trim();

  // samþykkjum bæði http og https
  if (s.startsWith("http://") || s.startsWith("https://")) return s;

  return null;
}

function uniq(arr) {
  return [...new Set(arr.filter(Boolean))];
}

async function fetchText(url, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "is.is news bot",
        "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8"
      }
    });
    if (!res.ok) throw new Error(`Feed HTTP ${res.status} (${url})`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

function extract(xml, tag) {
  const safe = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<${safe}\\b[^>]*>(<!\$begin:math:display$CDATA\\\\\[\)\?\(\[\\\\s\\\\S\]\*\?\)\(\\$end:math:display$\\]>)?<\\/${safe}>`, "i");
  const m = xml.match(re);
  return m ? (m[2] || "").trim() : null;
}

function extractAll(xml, tag) {
  const safe = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<${safe}\\b[^>]*>(<!\$begin:math:display$CDATA\\\\\[\)\?\(\[\\\\s\\\\S\]\*\?\)\(\\$end:math:display$\\]>)?<\\/${safe}>`, "gi");
  const out = [];
  let m;
  while ((m = re.exec(xml)) !== null) out.push((m[2] || "").trim());
  return out;
}

function extractAtomLink(entryXml) {
  // <link href="..."/>
  const m = entryXml.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  return m ? m[1].trim() : null;
}

function normalizeLink(link) {
  if (!link) return null;
  // RSS <link> getur verið með whitespace/newlines
  const s = String(link).trim();
  return s.startsWith("http") ? s : null;
}

function safeISO(dateStr) {
  const t = Date.parse(dateStr);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/* ---------- Categories (multi) ---------- */

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

function inferCategories({ sourceId, url, rssCats, title }) {
  const u = normalizeText(url);
  const t = normalizeText(title);
  const catsText = normalizeText((rssCats || []).join(" "));

  const hits = new Set();

  // text-based
  addFromText(hits, catsText);
  addFromText(hits, t);

  // url-based
  addFromUrl(hits, sourceId, u);

  if (hits.size === 0) hits.add("oflokkad");

  const categoryIds = [...hits];
  const categoryLabels = categoryIds.map(labelFor);

  return { categoryIds, categoryLabels };
}

function addFromText(set, x) {
  if (!x) return;
  if (x.includes("sport") || x.includes("ithrott")) set.add("ithrottir");
  if (x.includes("vidskip") || x.includes("business") || x.includes("markad") || x.includes("efnahag")) set.add("vidskipti");
  if (x.includes("menning") || x.includes("lifid") || x.includes("list") || x.includes("tonlist") || x.includes("kvikmynd")) set.add("menning");
  if (x.includes("skodun") || x.includes("comment") || x.includes("pistill") || x.includes("leidari")) set.add("skodun");
  if (x.includes("erlent") || x.includes("foreign") || x.includes("world")) set.add("erlent");
  if (x.includes("innlent") || x.includes("island") || x.includes("innanlands")) set.add("innlent");
}

function addFromUrl(set, sourceId, u) {
  // generic
  if (u.includes("/sport") || u.includes("/ithrott")) set.add("ithrottir");
  if (u.includes("/vidskip") || u.includes("/business") || u.includes("/markad")) set.add("vidskipti");
  if (u.includes("/menning") || u.includes("/lifid") || u.includes("/list")) set.add("menning");
  if (u.includes("/skodun") || u.includes("/pistill") || u.includes("/comment")) set.add("skodun");
  if (u.includes("/erlent")) set.add("erlent");
  if (u.includes("/innlent")) set.add("innlent");

  // source tweaks
  if (sourceId === "ruv") {
    if (u.includes("/ithrottir")) set.add("ithrottir");
    if (u.includes("/vidskipti")) set.add("vidskipti");
    if (u.includes("/menning")) set.add("menning");
    if (u.includes("/erlent")) set.add("erlent");
    if (u.includes("/innlent")) set.add("innlent");
  }
  if (sourceId === "mbl") {
    if (u.includes("/sport")) set.add("ithrottir");
    if (u.includes("/vidskipti")) set.add("vidskipti");
    if (u.includes("/frettir/innlent")) set.add("innlent");
    if (u.includes("/frettir/erlent")) set.add("erlent");
  }
  if (sourceId === "visir") {
    if (u.includes("/sport")) set.add("ithrottir");
    if (u.includes("/vidskipti")) set.add("vidskipti");
    if (u.includes("/frettir/innlent")) set.add("innlent");
    if (u.includes("/frettir/erlent")) set.add("erlent");
  }
  if (sourceId === "dv") {
    if (u.includes("/sport")) set.add("ithrottir");
    if (u.includes("/vidskipti")) set.add("vidskipti");
    if (u.includes("/frettir")) set.add("innlent");
  }
}

