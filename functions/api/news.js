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

    // ✅ VB: útilokum allt sem bendir á fiskifrettir.vb.is
    vb:    {
      url: "https://www.vb.is/rss",
      label: "Viðskiptablaðið",
      excludeLinkHosts: ["fiskifrettir.vb.is"]
    },

    stundin:   { url: "https://stundin.is/rss/",     label: "Heimildin" },
    grapevine: { url: "https://grapevine.is/feed/",  label: "Grapevine" },
    bb: { url: "https://bb.is/feed/", label: "Bæjarins Besta" },
    nutiminn: { url: "https://www.nutiminn.is/feed/", label: "Nútíminn" },
    frjalsverslun: { url: "https://www.fjolmidillinn.is/rss/frjalsverslun", label: "Frjáls verslun" },

    // ✅ Fiskifréttir: leyfum bara linka sem eru á fiskifrettir.vb.is
    fiskifrettir: {
      url: "https://fiskifrettir.vb.is/rss/",
      label: "Fiskifréttir",
      includeLinkHosts: ["fiskifrettir.vb.is"]
    },
  };

  const activeSources = sources.length ? sources : Object.keys(feeds);

  // Ignore unknown cats instead of filtering everything out
  const activeCats = new Set(
    (catsParam.length ? catsParam : []).filter(id => VALID_CATEGORY_IDS.has(id))
  );

  const items = [];
  const debugStats = {};

  for (const id of activeSources) {
    const feed = feeds[id];
    if (!feed) continue;

    try {
      const res = await fetch(feed.url, {
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
          debugStats[id] = { url: feed.url, status: res.status, ok: res.ok, length: xml.length, head: xml.slice(0, 220) };
        }
        continue;
      }

      const blocks = parseFeedBlocks(xml);

      // Debug: show whether parsing works at all, and whether title/link extraction works
      if (debug) {
        const firstBlock = blocks[0] || "";
        const firstTitle = firstBlock ? extractTagValue(firstBlock, "title") : null;
        const firstLink = firstBlock ? extractLink(firstBlock) : null;

        debugStats[id] = {
          url: feed.url,
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
        };
      }

      for (const block of blocks) {
        const title = extractTagValue(block, "title");
        const link = extractLink(block);

        const pubDate =
          extractTagValue(block, "pubDate") ||
          extractTagValue(block, "updated") ||
          extractTagValue(block, "published") ||
          extractTagValue(block, "dc:date"); // some feeds

        if (!title || !link) continue;

        // ✅ Per-feed include/exclude (aðskilur VB vs Fiskifréttir)
        const host = safeHost(link);
        if (feed.includeLinkHosts?.length && !feed.includeLinkHosts.includes(host)) continue;
        if (feed.excludeLinkHosts?.length && feed.excludeLinkHosts.includes(host)) continue;

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
   Parsing helpers (RSS + Atom)
   ========================= */

function parseFeedBlocks(xml) {
  // Match <item>, <rss:item>, <content:item>, etc.
  const itemRe = /<(?:\w+:)?item\b[^>]*>[\s\S]*?<\/(?:\w+:)?item>/gi;
  const items = [...String(xml || "").matchAll(itemRe)].map(m => m[0]);
  if (items.length) return items;

  // Atom fallback: <entry> or <atom:entry>
  const entryRe = /<(?:\w+:)?entry\b[^>]*>[\s\S]*?<\/(?:\w+:)?entry>/gi;
  return [...String(xml || "").matchAll(entryRe)].map(m => m[0]);
}

function extractTagValue(xml, tag) {
  const src = String(xml || "");
  const esc = escapeRegExp(tag);

  // namespace-safe + CDATA-safe + captures inner text
  const re = new RegExp(
    `<(?:\\w+:)?${esc}\\b[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/(?:\\w+:)?${esc}>`,
    "i"
  );

  const m = src.match(re);
  return m ? decodeEntities(m[1]).trim() : null;
}

function extractLink(block) {
  const src = String(block || "");

  // 1) Atom style: <link href="..."/>
  const mHref = src.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  if (mHref?.[1]) return decodeEntities(mHref[1]).trim();

  // 2) RSS style: <link>...</link>
  const m = src.match(/<link\b[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i);
  if (m?.[1]) return decodeEntities(m[1]).trim();

  return null;
}

function extractCategories(block) {
  const src = String(block || "");
  const out = [];

  // RSS: <category>Text</category>
  const reRss = /<category\b[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/category>/gi;
  let m;
  while ((m = reRss.exec(src)) !== null) {
    const v = decodeEntities(m[1] || "").trim();
    if (v) out.push(v);
  }

  // Atom: <category term="Text" />
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

function safeHost(url) {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return "";
  }
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

function mapFromText(x) {
  if (!x) return null;

  // --- ÍÞRÓTTIR: víkkað til að grípa Vísir titla sem hafa enga /sport slóð né RSS category ---
  const sportWords = [
    // generic
    "sport", "ithrott", "fotbolta", "fotbolti", "futbol", "bolti",
    "handbolti", "nba", "korfubolti", "golf", "tennis", "motorsport", "formula",
    "ufc", "mma", "olymp", "olympi", "skid", "skidi", "hest", "hlaup", "marathon",
    "darts", "littler", "ally", "pally", "pila", "pilu", "undanu r slit", "undanurslit", "urslit", "leikur", "stodutafla",

    // add
    "hnefaleik", "breidablik", "ka", "kr", "valur", "tindastoll", "skak", "chess", "nfl",

    // competitions/leagues
    "hm", "em", "premier league", "champions league", "europa league",
    "enska urvalsdeild", "enskar urvalsdeild", "enski boltinn", "enskur boltinn",

    // Vísir-style “sports headlines” (names often appear without the word “fótbolti”)
    "ronaldo", "messi", "mourinho", "pep", "guardiola", "klopp",
    "arsenal", "man city", "man. city", "manchester city", "man utd", "manchester united",
    "fulham", "crystal palace", "sunderland", "everton", "liverpool", "chelsea",
    "tottenham", "barcelona", "real madrid", "atletico",
    "psg", "bayern", "dortmund", "juventus", "milan", "inter",

    // ísl. fótbolta orð
    "mark", "markaskor", "jafnarmark", "raud spjald", "gult spjald", "vik", "tabadi",
    "sigur", "tap", "jafntefli",

    // 433 / 4-3-3
    "433", "4-3-3", "4 3 3"
  ];

  const bizWords = [
    "vidskip", "business", "markad", "fjarmal", "kaupholl",
    "verdbref", "gengi", "vext", "hagkerfi", "verdbolga"
  ];

  const cultureWords = [
    "menning", "verold", "gagnryni", "folk", "lifid", "list", "tonlist", "kvikmynd", "bok",
    "leikhus", "sjonvarp", "utvarp", "svidslist",
    // celeb/lifestyle-ish
    "tattuin", "tattoo", "stjarna", "fyrirsaeta", "model", "fegurd"
  ];

  const opinionWords = [
    "skodun", "comment", "pistill", "leidari", "grein",
    "ummal", "dalkur", "vidtal", "kronika"
  ];

  const foreignWords = ["erlent", "foreign", "bandarisk", "usa", "telegraph", "iran", "italia", "byd", "tesla", "evra", "donald", "trump", "world", "alheim", "althjod",
    "grænland", "granland", "russland", "kina", "japan", "ukraina", "bresk", "bandarikin", "bandarikjunum", "portland",
    "venesuela", "pasta", "toyota", "heimsmarkad", "oliuverd",
  ];
  const localWords = [
    "innlent", "island", "vestmannaeyja", "ruv", "vinnslustodin", "kvika", "kviku", "kopavog", "hafnarfjord", "reykjavik", "landid", "borgin",
    "akureyri", "hveragerdi", "kopavogi", "hellisheidi",
    "sjalfstaedisflokk", "framsokn", "samfylking", "vidreisn", "midflokk",
    "hreggvidur", "samherji", "reykjanes", "landeldi", "stod", "pipulagn",
    "ragnar", "vignir", "hilmar", "smari", "magnus", "gudmundur", "ingi", "inga", "hilmar", "eyjolfur",
    // crime/courts – oft DV/Pressan
    "logregl", "rettar", "daemd", "dom", "mor", "radmor", "handtek", "sakfelld"
  ];

  const techWords = [
    "taekni", "tolva", "forrit", "forritun", "gervigreind", "ai",
    "netoryggi", "oryggi", "tolvuleikir", "leikjat", "simi", "snjallsimi",
    "apple", "google", "microsoft", "tesla", "raf", "rafmagn"
  ];

  const healthWords = [
    "heilsa", "laekn", "sjuk", "sjukdom", "lyf", "spitali",
    "naering", "mataraedi", "smit", "veira", "influenza"
  ];

  const envWords = [
    "umhverfi", "loftslag", "mengun", "natur", "jokull", "joklar",
    "eldgos", "skjalfti", "vedur", "haf", "fisk"
  ];

  // IMPORTANT: removed "stjorn" to avoid matching "stjornmal" (politics).
  const sciWords = [
    "visindi", "rannsokn", "geim", "edlis",
    "efna", "liffraedi", "stjornufraedi", "stjarna", "stjornus", "stjornukerfi",
    "tungl", "sol"
  ];

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
  // Generic patterns
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

  // DV: URL sections are strong signals
  if (sourceId === "dv") {
    if (u.includes("/pressan")) return "innlent";
    if (u.includes("/fokus")) return "menning";
    if (u.includes("433.is") || u.includes("/433") || u.includes("4-3-3")) return "ithrottir";
  }

  // Vísir: many links are /g/<id>/<slug> => no section in URL.
  // We add a tiny safety net using title hints (already normalized)
  if (sourceId === "visir") {
    // If Vísir URL has no section, use extra title heuristics
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
