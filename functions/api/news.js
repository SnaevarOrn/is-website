// /functions/api/news.js

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
  const limit = Number(searchParams.get("limit") || 50);
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

  // ✅ Ignore unknown cats instead of filtering everything out
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
          "Accept-Language": "is,is-IS;q=0.9,en;q=0.7"
        }
      });

      const xml = await res.text();

      if (debug) {
        debugStats[id] = {
          url: feed.url,
          status: res.status,
          ok: res.ok,
          length: xml.length,
          hasItem: xml.includes("<item"),
          hasEntry: xml.includes("<entry"),
          head: xml.slice(0, 220)
        };
      }

      if (!res.ok) {
        console.error("Feed HTTP error:", id, res.status);
        continue;
      }

      // Parse RSS <item> blocks OR Atom <entry> blocks
      const blocks = parseFeedBlocks(xml);

      for (const block of blocks) {
        const title = extractTagValue(block, "title");

        // Link can be <link>URL</link> OR <link href="..."/>
        const link = extractLink(block);

        // RSS uses <pubDate>, Atom uses <updated>/<published>
        const pubDate =
          extractTagValue(block, "pubDate") ||
          extractTagValue(block, "updated") ||
          extractTagValue(block, "published");

        if (!title || !link) continue;

        // Categories:
        // RSS: <category>Text</category>
        // Atom: <category term="Text"/>
        const rssCats = extractCategories(block);
        const rssCatText = rssCats.join(" ").trim();

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
          publishedAt: pubDate ? safeToIso(pubDate) : null,
          sourceId: id,
          sourceLabel: feed.label,
          categoryId,
          category: categoryLabel
        });
      }
    } catch (err) {
      console.error("Feed error:", id, err);
      if (debug) {
        debugStats[id] = {
          url: feeds[id]?.url,
          error: String(err?.message || err)
        };
      }
    }
  }

  items.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));

  const sliced = items.slice(0, limit);

  // ✅ availableCategories from sliced + always include oflokkad
  const availableSet = new Set(sliced.map(x => x.categoryId).filter(Boolean));
  availableSet.add("oflokkad");
  const availableCategories = [...availableSet];

  const payload = debug
    ? { items: sliced, availableCategories, debugStats }
    : { items: sliced, availableCategories };

  return new Response(JSON.stringify(payload), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300"
    }
  });
}

/* =========================
   Parsing helpers (RSS + Atom)
   ========================= */

function parseFeedBlocks(xml) {
  // Prefer RSS items if present, else Atom entries
  const items = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)].map(m => m[0]);
  if (items.length) return items;

  const entries = [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/g)].map(m => m[0]);
  return entries;
}

function extractTagValue(xml, tag) {
  // Matches <tag>...</tag> and <tag><![CDATA[...]]></tag>
  const m = xml.match(new RegExp(`<${tag}\\b[^>]*>(?:<!\$begin:math:display$CDATA\\\\\[\)\?\(\[\\\\s\\\\S\]\*\?\)\(\?\:\\$end:math:display$\\]>)?<\\/${tag}>`, "i"));
  return m ? decodeEntities(m[1]).trim() : null;
}

function extractLink(block) {
  // 1) Atom style: <link href="..."/>
  const mHref = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  if (mHref?.[1]) return decodeEntities(mHref[1]).trim();

  // 2) RSS style: <link>...</link>
  const m = block.match(/<link\b[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i);
  if (m?.[1]) return decodeEntities(m[1]).trim();

  return null;
}

function extractCategories(block) {
  const out = [];

  // RSS: <category>Text</category>
  const reRss = /<category\b[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/category>/gi;
  let m;
  while ((m = reRss.exec(block)) !== null) {
    const v = decodeEntities(m[1] || "").trim();
    if (v) out.push(v);
  }

  // Atom: <category term="Text" />
  const reAtom = /<category\b[^>]*\bterm=["']([^"']+)["'][^>]*\/?>/gi;
  while ((m = reAtom.exec(block)) !== null) {
    const v = decodeEntities(m[1] || "").trim();
    if (v) out.push(v);
  }

  return out;
}

function safeToIso(dateString) {
  // Some feeds give weird strings; avoid throwing
  const d = new Date(dateString);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function decodeEntities(s) {
  // Minimal XML entity decoding (enough for URLs/titles)
  return String(s || "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'");
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
  const fromUrl = mapFromUrl(sourceId, u);

  const categoryId = fromText || fromUrl || "oflokkad";
  return { categoryId, categoryLabel: labelFor(categoryId) };
}

function mapFromText(x) {
  if (!x) return null;

  const sportWords = [
    "sport", "ithrott", "fotbolti", "bolti", "enski boltinn",
    "premier league", "champions league", "europa league",
    "handbolti", "korfubolti", "golf", "tennis", "motorsport", "formula",
    "ufc", "mma", "olymp", "skid", "skidi", "hest", "hlaup", "marathon",
    "433", "4-3-3", "4 3 3"
  ];

  const bizWords = [
    "vidskip", "business", "markad", "fjarmal", "kaupholl",
    "verdbref", "gengi", "vext", "hagkerfi", "verdbolga"
  ];

  const cultureWords = [
    "menning", "lifid", "list", "tonlist", "kvikmynd", "bok",
    "leikhus", "sjonvarp", "utvarp", "svidslist"
  ];

  const opinionWords = [
    "skodun", "comment", "pistill", "leidari", "grein",
    "ummal", "dalkur", "vidtal", "kronika"
  ];

  const foreignWords = ["erlent", "foreign", "world", "alheim", "althjod"];
  const localWords = ["innlent", "island", "reykjavik", "landid", "borgin"];

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

  const sciWords = [
    "visindi", "rannsokn", "geim", "stjorn", "edlis",
    "efna", "liffraedi", "stjornufraedi", "tungl", "sol"
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

function mapFromUrl(sourceId, u) {
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

  // Source-specific tweaks (safe, minimal)
  if (sourceId === "visir") {
    if (u.includes("/enski-boltinn") || u.includes("/enskiboltinn")) return "ithrottir";
    if (u.includes("/korfubolti") || u.includes("/handbolti")) return "ithrottir";
  }

  if (sourceId === "dv") {
    if (u.includes("433.is") || u.includes("/433") || u.includes("4-3-3")) return "ithrottir";
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