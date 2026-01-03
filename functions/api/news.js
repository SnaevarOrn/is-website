// /functions/api/news.js
// News RSS/Atom aggregator for ís.is (Cloudflare Pages Functions)

"use strict";

/* =========================
   Category model
   ========================= */

const CATEGORY_MAP = [
  { id: "innlent",   label: "Innlent" },
  { id: "erlent",    label: "Erlent" },
  { id: "ithrottir", label: "Íþróttir" },
  { id: "vidskipti", label: "Viðskipti" },
  { id: "menning",   label: "Menning" },
  { id: "skodun",    label: "Skoðun" },

  // Extra buckets
  { id: "taekni",    label: "Tækni" },
  { id: "heilsa",    label: "Heilsa" },
  { id: "umhverfi",  label: "Umhverfi" },
  { id: "visindi",   label: "Vísindi" },

  { id: "oflokkad",  label: "Óflokkað" },
];

const VALID_CATEGORY_IDS = new Set(CATEGORY_MAP.map(c => c.id));

function labelFor(id) {
  return (CATEGORY_MAP.find(c => c.id === id)?.label) || "Óflokkað";
}

/* =========================
   API
   ========================= */

export async function onRequestGet({ request }) {
  const { searchParams } = new URL(request.url);

  const sources = (searchParams.get("sources") || "").split(",").filter(Boolean);
  const catsParam = (searchParams.get("cats") || "").split(",").filter(Boolean);
  const limit = clampInt(searchParams.get("limit"), 1, 200, 50);
  const debug = searchParams.get("debug") === "1";

  const feeds = {
    ruv:   { url: "https://www.ruv.is/rss/frettir", label: "RÚV" },
    mbl:   { url: "https://www.mbl.is/feeds/fp/",   label: "mbl.is" },
    visir: { url: "https://www.visir.is/rss/allt",  label: "Vísir" },
    dv:    { url: "https://www.dv.is/feed/",        label: "DV" },
    vb:    { url: "https://www.vb.is/rss",          label: "Viðskiptablaðið" },
    stundin:   { url: "https://stundin.is/rss/",     label: "Heimildin" },
    grapevine: { url: "https://grapevine.is/feed/",  label: "Grapevine" },
  };

  const activeSources = sources.length ? sources : Object.keys(feeds);

  // Ignore unknown cats instead of filtering everything out
  const activeCats = new Set(
    (catsParam.length ? catsParam : []).filter(id => VALID_CATEGORY_IDS.has(id))
  );

  // Try to pull enough per feed when user filters to a single source (e.g. DV-only)
  const srcCount = Math.max(1, activeSources.filter(id => !!feeds[id]).length);
  const perFeedWanted = clampInt(Math.ceil(limit / srcCount) + 12, 10, 120, 30);

  const items = [];
  const debugStats = {};

  for (const id of activeSources) {
    const feed = feeds[id];
    if (!feed) continue;

    try {
      const fetchUrl = buildFeedUrl(feed.url, id, perFeedWanted);

      const res = await fetch(fetchUrl, {
        headers: {
          "User-Agent": "is.is news bot",
          "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
          "Accept-Language": "is,is-IS;q=0.9,en;q=0.7",
        }
      });

      const xml = await res.text();

      if (!res.ok) {
        console.error("Feed HTTP error:", id, res.status);
        if (debug) {
          debugStats[id] = { url: fetchUrl, status: res.status, ok: res.ok, length: xml.length, head: xml.slice(0, 220) };
        }
        continue;
      }

      const blocks = parseFeedBlocks(xml);

      if (debug) {
        const firstBlock = blocks[0] || "";
        const firstTitle = firstBlock ? extractTagValue(firstBlock, "title") : null;
        const firstLink = firstBlock ? extractLink(firstBlock) : null;

        debugStats[id] = {
          url: fetchUrl,
          status: res.status,
          ok: res.ok,
          length: xml.length,
          hasItem: xml.toLowerCase().includes("<item"),
          hasEntry: xml.toLowerCase().includes("<entry"),
          blocksCount: blocks.length,
          firstTitle,
          firstLink,
          head: xml.slice(0, 220),
          firstBlockHead: firstBlock.slice(0, 220),
          perFeedWanted,
          limit,
          srcCount,
        };
      }

      for (const block of blocks) {
        const title = extractTagValue(block, "title");
        const link = extractLink(block);

        const pubDate =
          extractTagValue(block, "pubDate") ||
          extractTagValue(block, "updated") ||
          extractTagValue(block, "published") ||
          extractTagValue(block, "dc:date");

        if (!title || !link) continue;

        const cats = extractCategories(block);
        const catText = cats.join(" ").trim();

        const { categoryId, categoryLabel } = inferCategory({
          sourceId: id,
          url: link,
          rssCategoryText: catText,
          title
        });

        if (activeCats.size > 0 && !activeCats.has(categoryId)) continue;

        items.push({
          title,
          url: link,
          publishedAt: pubDate ? safeToIso(pubDate) : null,
          sourceId: id,
          sourceLabel: feed.label,
          categoryId,
          category: categoryLabel
        });
      }
    } catch (err) {
      console.error("Feed error:", id, err);
      if (debug) debugStats[id] = { url: feeds[id]?.url, error: String(err?.message || err) };
    }
  }

  items.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));

  const sliced = items.slice(0, limit);

  const availableSet = new Set(sliced.map(x => x.categoryId).filter(Boolean));
  availableSet.add("oflokkad");
  const availableCategories = [...availableSet];

  const payload = debug
    ? { items: sliced, availableCategories, debugStats }
    : { items: sliced, availableCategories };

  return new Response(JSON.stringify(payload), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": debug ? "no-store" : "public, max-age=300"
    }
  });
}

/* =========================
   Feed URL helper
   ========================= */

function buildFeedUrl(baseUrl, sourceId, perFeedWanted) {
  // WP feeds often accept `posts_per_page`. If ignored, harmless.
  const wpLikeSources = new Set(["dv", "grapevine", "stundin"]);

  try {
    const u = new URL(baseUrl);
    if (wpLikeSources.has(sourceId)) {
      if (!u.searchParams.has("posts_per_page")) {
        u.searchParams.set("posts_per_page", String(perFeedWanted));
      }
    }
    return u.toString();
  } catch {
    if (wpLikeSources.has(sourceId)) {
      const sep = baseUrl.includes("?") ? "&" : "?";
      return `${baseUrl}${sep}posts_per_page=${encodeURIComponent(String(perFeedWanted))}`;
    }
    return baseUrl;
  }
}

/* =========================
   Parsing helpers (RSS + Atom)
   ========================= */

function parseFeedBlocks(xml) {
  const itemRe = /<(?:\w+:)?item\b[^>]*>[\s\S]*?<\/(?:\w+:)?item>/gi;
  const items = [...String(xml || "").matchAll(itemRe)].map(m => m[0]);
  if (items.length) return items;

  const entryRe = /<(?:\w+:)?entry\b[^>]*>[\s\S]*?<\/(?:\w+:)?entry>/gi;
  return [...String(xml || "").matchAll(entryRe)].map(m => m[0]);
}

function extractTagValue(xml, tag) {
  const src = String(xml || "");
  const esc = escapeRegExp(tag);

  // Find opening tag (namespace-safe)
  const openRe = new RegExp(`<(?:(?:\\w+:)?)${esc}\\b[^>]*>`, "i");
  const mOpen = openRe.exec(src);
  if (!mOpen) return null;

  const start = mOpen.index + mOpen[0].length;

  // Find closing tag (namespace-safe)
  const closeRe = new RegExp(`</(?:(?:\\w+:)?)${esc}>`, "i");
  const mClose = closeRe.exec(src.slice(start));
  if (!mClose) return null;

  let inner = src.slice(start, start + mClose.index);

  // Strip CDATA safely without using \[ \] (avoids LaTeX/copy corruption)
  inner = inner
    .replace(/<!\u005BCDATA\u005B/gi, "")
    .replace(/\u005D\u005D>/g, "");

  return decodeEntities(inner).trim() || null;
}

function extractLink(block) {
  const src = String(block || "");

  const mHref = src.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  if (mHref?.[1]) return decodeEntities(mHref[1]).trim();

  const m = src.match(/<link\b[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i);
  if (m?.[1]) return decodeEntities(m[1]).trim();

  return null;
}

function extractCategories(block) {
  const src = String(block || "");
  const out = [];

  const reRss = /<category\b[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/category>/gi;
  let m;
  while ((m = reRss.exec(src)) !== null) {
    const v = decodeEntities(m[1] || "").trim();
    if (v) out.push(v);
  }

  const reAtom = /<category\b[^>]*\bterm=["']([^"']+)["'][^>]*\/?>/gi;
  while ((m = reAtom.exec(src)) !== null) {
    const v = decodeEntities(m[1] || "").trim();
    if (v) out.push(v);
  }

  return out;
}

function safeToIso(dateString) {
  const d = new Date(dateString);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function decodeEntities(s) {
  return String(s || "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'");
}

function escapeRegExp(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

/* =========================
   Categorization
   ========================= */

function normalizeText(s) {
  const str = String(s || "").toLowerCase();
  const noMarks = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return noMarks
    .replaceAll("ð", "d")
    .replaceAll("þ", "th")
    .replaceAll("æ", "ae")
    .replaceAll("ö", "o");
}

function inferCategory({ sourceId, url, rssCategoryText, title }) {
  const u = normalizeText(url);
  const c = normalizeText(rssCategoryText);
  const t = normalizeText(title);

  const fromText = mapFromText(c) || mapFromText(t);
  const fromUrl = mapFromUrl(sourceId, u, t);

  const categoryId = fromText || fromUrl || "oflokkad";
  return { categoryId, categoryLabel: labelFor(categoryId) };
}

/* ---- mapFromText + mapFromUrl: ÓBREYTT frá þér ---- */

function mapFromText(x) {
  if (!x) return null;

  const sportWords = [
    "sport", "ithrott", "fotbolti", "futbol", "bolti",
    "handbolti", "korfubolti", "golf", "tennis", "motorsport", "formula",
    "ufc", "mma", "olymp", "olympi", "skid", "skidi", "hest", "hlaup", "marathon",
    "darts", "littler", "ally", "pally", "pila", "pilu", "undanu r slit", "undanurslit", "urslit", "leikur", "stodutafla",
    "hnefaleik", "skak", "chess", "nfl",
    "premier league", "champions league", "europa league",
    "enska urvalsdeild", "enskar urvalsdeild", "enski boltinn", "enskur boltinn",
    "ronaldo", "messi", "mourinho", "pep", "guardiola", "klopp",
    "arsenal", "man city", "man. city", "manchester city", "manchester united",
    "fulham", "crystal palace", "sunderland", "liverpool", "chelsea",
    "tottenham", "barcelona", "real madrid", "atletico",
    "psg", "bayern", "dortmund", "juventus", "milan", "inter",
    "mark", "markaskor", "jafnarmark", "raud spjald", "gult spjald", "vik", "tabadi",
    "sigur", "tap", "jafntefli",
    "433", "4-3-3", "4 3 3"
  ];

  const bizWords = ["vidskip", "business", "markad", "fjarmal", "kaupholl", "verdbref", "gengi", "vext", "hagkerfi", "verdbolga"];

  const cultureWords = [
    "menning", "verold", "gagnryni", "folk", "lifid", "list", "tonlist", "kvikmynd", "bok",
    "leikhus", "sjonvarp", "utvarp", "svidslist",
    "tattuin", "tattoo", "stjarna", "fyrirsaeta", "model", "fegurd"
  ];

  const opinionWords = ["skodun", "comment", "pistill", "leidari", "grein", "ummal", "dalkur", "vidtal", "kronika"];

  const foreignWords = ["erlent", "foreign", "bandarisk", "usa", "telegraph", "italia", "byd", "tesla", "evra", "donald", "trump", "world", "alheim", "althjod"];

  const localWords = [
    "innlent", "island", "vestmannaeyja", "ruv", "vinnslustodin", "kvika", "kviku", "kopavog", "hafnarfjord", "reykjavik", "landid", "borgin",
    "sjalfstaedisflokk", "framsokn", "samfylking", "vidreisn", "midflokk",
    "hreggvidur", "stod",
    "logregl", "rettar", "daemd", "dom", "mor", "radmor", "handtek", "sakfelld"
  ];

  const techWords = ["taekni", "tolva", "forrit", "forritun", "gervigreind", "ai", "netoryggi", "oryggi", "tolvuleikir", "leikjat", "simi", "snjallsimi", "apple", "google", "microsoft", "tesla", "raf", "rafmagn"];
  const healthWords = ["heilsa", "laekn", "sjuk", "sjukdom", "lyf", "spitali", "naering", "mataraedi", "smit", "veira", "influenza"];
  const envWords = ["umhverfi", "loftslag", "mengun", "natur", "jokull", "joklar", "eldgos", "skjalfti", "vedur", "haf", "fisk"];

  const sciWords = ["visindi", "rannsokn", "geim", "edlis", "efna", "liffraedi", "stjornufraedi", "stjarna", "stjornus", "stjornukerfi", "tungl", "sol"];

  if (sportWords.some(w => x.includes(w))) return "ithrottir";
  if (bizWords.some(w => x.includes(w))) return "vidskipti";
  if (cultureWords.some(w => x.includes(w))) return "menning";
  if (opinionWords.some(w => x.includes(w))) return "skodun";
  if (techWords.some(w => x.includes(w))) return "taekni";
  if (healthWords.some(w => x.includes(w))) return "heilsa";
  if (envWords.some(w => x.includes(w))) return "umhverfi";
  if (sciWords.some(w => x.includes(w))) return "visindi";
  if (foreignWords.some(w => x.includes(w))) return "erlent";
  if (localWords.some(w => x.includes(w))) return "innlent";

  return null;
}

function mapFromUrl(sourceId, u, titleNorm) {
  if (u.includes("/sport") || u.includes("/ithrott")) return "ithrottir";
  if (u.includes("/vidskip") || u.includes("/business") || u.includes("/markad")) return "vidskipti";
  if (u.includes("/menning") || u.includes("/lifid") || u.includes("/list")) return "menning";
  if (u.includes("/skodun") || u.includes("/pistill") || u.includes("/comment")) return "skodun";
  if (u.includes("/taekni") || u.includes("/tech")) return "taekni";
  if (u.includes("/heilsa") || u.includes("/health")) return "heilsa";
  if (u.includes("/umhverfi") || u.includes("/environment")) return "umhverfi";
  if (u.includes("/visindi") || u.includes("/science")) return "visindi";
  if (u.includes("/erlent")) return "erlent";
  if (u.includes("/innlent")) return "innlent";

  if (sourceId === "dv") {
    if (u.includes("/pressan")) return "innlent";
    if (u.includes("/fokus")) return "menning";
    if (u.includes("433.is") || u.includes("/433") || u.includes("4-3-3")) return "ithrottir";
  }

  if (sourceId === "visir") {
    if (u.includes("/g/")) {
      const t = String(titleNorm || "");
      if (
        t.includes("ronaldo") || t.includes("messi") || t.includes("mourinho") ||
        t.includes("arsenal") || t.includes("man city") || t.includes("man. city") ||
        t.includes("premier") || t.includes("enska urvalsdeild") || t.includes("enski boltinn") ||
        t.includes("olymp") || t.includes("darts") || t.includes("undanu r slit") || t.includes("undanurslit")
      ) return "ithrottir";
    }

    if (u.includes("/enski-boltinn") || u.includes("/enskiboltinn")) return "ithrottir";
    if (u.includes("/korfubolti") || u.includes("/handbolti")) return "ithrottir";
  }

  if (sourceId === "mbl") {
    if (u.includes("/frettir/innlent")) return "innlent";
    if (u.includes("/frettir/erlent")) return "erlent";
    if (u.includes("/sport")) return "ithrottir";
  }

  if (sourceId === "ruv") {
    if (u.includes("/ithrottir")) return "ithrottir";
    if (u.includes("/vidskipti")) return "vidskipti";
    if (u.includes("/menning")) return "menning";
    if (u.includes("/erlent")) return "erlent";
    if (u.includes("/innlent")) return "innlent";
  }

  return null;
}