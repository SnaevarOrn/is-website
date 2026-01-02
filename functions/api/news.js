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

  const sources = (searchParams.get("sources") || "").split(",").map(s => s.trim()).filter(Boolean);
  const catsParam = (searchParams.get("cats") || "").split(",").map(s => s.trim()).filter(Boolean);
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
          debugStats[id] = {
            url: feed.url,
            status: res.status,
            ok: res.ok,
            length: xml.length,
            head: xml.slice(0, 220),
          };
        }
        continue;
      }

      const blocks = parseFeedBlocks(xml);

      if (debug) {
        const firstBlock = blocks[0] || "";
        debugStats[id] = {
          url: feed.url,
          status: res.status,
          ok: res.ok,
          length: xml.length,
          hasItem: xml.toLowerCase().includes("<item"),
          hasEntry: xml.toLowerCase().includes("<entry"),
          blocksCount: blocks.length,
          firstTitle: firstBlock ? extractTagValue(firstBlock, "title") : null,
          firstLink: firstBlock ? extractLink(firstBlock) : null,
          firstCats: firstBlock ? extractCategories(firstBlock) : [],
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
          extractTagValue(block, "dc:date");

        if (!title || !link) continue;

        const cats = extractCategories(block);
        const catText = cats.join(" ").trim();

        const inf = inferCategory({
          sourceId: id,
          url: link,
          rssCategoryText: catText,
          title,
          debug
        });

        if (activeCats.size > 0 && !activeCats.has(inf.categoryId)) continue;

        const item = {
          title,
          url: link,
          publishedAt: pubDate ? safeToIso(pubDate) : null,
          sourceId: id,
          sourceLabel: feed.label,
          categoryId: inf.categoryId,
          category: inf.categoryLabel,
        };

        if (debug) {
          item._debug = {
            catText,
            fromText: inf._fromText || null,
            fromUrl: inf._fromUrl || null,
            reason: inf._reason || null,
          };
        }

        items.push(item);
      }
    } catch (err) {
      console.error("Feed error:", id, err);
      if (debug) {
        debugStats[id] = { url: feeds[id]?.url, error: String(err?.message || err) };
      }
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
      "cache-control": debug ? "no-store" : "public, max-age=300",
    }
  });
}

/* =========================
   Parsing helpers (RSS + Atom)
   ========================= */

function parseFeedBlocks(xml) {
  const src = String(xml || "");
  // <item> (RSS)
  const itemRe = /<(?:\w+:)?item\b[^>]*>[\s\S]*?<\/(?:\w+:)?item>/gi;
  const items = [...src.matchAll(itemRe)].map(m => m[0]);
  if (items.length) return items;

  // <entry> (Atom)
  const entryRe = /<(?:\w+:)?entry\b[^>]*>[\s\S]*?<\/(?:\w+:)?entry>/gi;
  return [...src.matchAll(entryRe)].map(m => m[0]);
}

function extractTagValue(xml, tag) {
  // Robust: namespace-safe + CDATA-safe
  const src = String(xml || "");
  const esc = escapeRegExp(tag);

  // Allow optional namespace prefix on open/close tag:
  // <dc:date>...</dc:date> OR <date>...</date>
  const re = new RegExp(
    `<(?:\\w+:)?${esc}\\b[^>]*>(?:<!\$begin:math:display$CDATA\\\\\[\)\?\(\[\\\\s\\\\S\]\*\?\)\(\?\:\\$end:math:display$\\]>)?<\\/(?:\\w+:)?${esc}>`,
    "i"
  );

  const m = src.match(re);
  return m ? decodeEntities(m[1]).trim() : null;
}

function extractLink(block) {
  const src = String(block || "");

  // Atom: <link href="..."/>
  const mHref = src.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  if (mHref?.[1]) return decodeEntities(mHref[1]).trim();

  // RSS: <link>...</link>
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

function inferCategory({ sourceId, url, rssCategoryText, title, debug }) {
  const u = normalizeText(url);
  const c = normalizeText(rssCategoryText);
  const t = normalizeText(title);

  // Text first (RSS category text is often best), then title
  const fromText = mapFromText(c) || mapFromText(t);

  // URL (and source-specific rules). We also allow title hints for Vísir /g/ links.
  const fromUrl = mapFromUrl(sourceId, u, t);

  const categoryId = fromText || fromUrl || "oflokkad";

  const out = {
    categoryId,
    categoryLabel: labelFor(categoryId),
  };

  if (debug) {
    out._fromText = fromText || null;
    out._fromUrl = fromUrl || null;
    out._reason = fromText ? "text" : (fromUrl ? "url" : "fallback");
  }

  return out;
}

function mapFromText(x) {
  if (!x) return null;

  // --- ÍÞRÓTTIR ---
  const sportWords = [
    "sport", "ithrott", "fotbolti", "futbol", "bolti",
    "enski boltinn", "enskur boltinn", "enska urvalsdeild", "enskar urvalsdeild",
    "premier league", "champions league", "europa league", "conference league",
    "deild", "urslit", "urslitaleik", "urslitaleiknum", "undanurslit", "undanu r slit",
    "undankeppni", "leiktid", "mark", "markaskor", "jafnarmark",
    "stodutafla", "lid", "leikmadur", "studningsmenn", "studningsmadur",
    "var", "raudspjald", "gultspjald", "hattrick",
    "handbolti", "korfubolti", "golf", "tennis", "motorsport", "formula",
    "ufc", "mma", "olymp", "olympi", "skid", "skidi", "hlaup", "marathon",
    "darts", "pila",
    // Vísir titles (oft bara nöfn/líð)
    "ronaldo", "messi", "mourinho", "guardiola", "klopp",
    "arsenal", "man city", "man. city", "manchester city", "manchester united",
    "liverpool", "chelsea", "tottenham", "barcelona", "real madrid", "atletico",
    "psg", "bayern", "dortmund", "juventus", "milan", "inter",
    "schumacher" // oft sport-fréttir (F1)
  ];

  // --- VIÐSKIPTI ---
  const bizWords = [
    "vidskip", "business", "markad", "fjarmal", "kaupholl",
    "verdbref", "gengi", "vext", "hagkerfi", "verdbolga",
    "laun", "launahækkun", "felagaskipti", "samruni", "hlutabr",
    "arð", "tekjur", "tap", "hagnadur", "reikningsskil"
  ];

  // --- MENNING / AFÞREYING ---
  const cultureWords = [
    "menning", "lifid", "list", "tonlist", "kvikmynd", "bok",
    "leikhus", "sjonvarp", "utvarp", "svidslist",
    "stjarna", "hollywood", "leikari", "leikkona", "fyrirs",
    "tattuin", "tattoo", "tisku", "ahrifavald", "influencer",
    "dottir", "sonur", "fannst latin", "andlat", "minning"
  ];

  // --- SKOÐUN / GREINAR / RÁÐ ---
  const opinionWords = [
    "skodun", "comment", "pistill", "leidari", "grein",
    "ummal", "dalkur", "vidtal", "kronika",
    "rad", "godh rad", "gott rad", "aramotaheit", "aramotaheitin",
    "hvernig", "af hverju"
  ];

  // --- HEILSA ---
  const healthWords = [
    "heilsa", "laekn", "sjuk", "sjukdom", "lyf", "spitali",
    "naering", "mataraedi", "smit", "veira", "influenza",
    "magnes", "magnesium", "magnyl", "verkjalyf", "bata",
    "skammt", "skammtar", "taug", "kviði", "svefn", "streita"
  ];

  // --- TÆKNI ---
  const techWords = [
    "taekni", "tolva", "forrit", "forritun", "gervigreind", "ai",
    "netoryggi", "oryggi", "tolvuleikir", "leikjat", "simi", "snjallsimi",
    "apple", "google", "microsoft", "tesla", "rafmagn", "rafbil",
    "gagnalek", "hakk", "net", "internet"
  ];

  // --- UMGJÖRÐ / NÁTTÚRA ---
  const envWords = [
    "umhverfi", "loftslag", "mengun", "natur", "jokull", "joklar",
    "eldgos", "skjalfti", "vedur", "haf", "fisk", "rusl", "plast",
    "orkan", "jarðvarmi"
  ];

  // --- VÍSINDI ---
  const sciWords = [
    "visindi", "rannsokn", "geim", "edlis", "efna", "liffraedi",
    "stjornufraedi", "tungl", "sol", "gervitungl"
  ];

  // --- ERLENT / HEIMSFRÉTTIR ---
  const foreignWords = [
    "erlent", "foreign", "world", "althjod", "alheim",
    "iran", "irak", "syria", "israel", "gaza", "ukraine", "russland",
    "sviss", "norður-korea", "kina", "bandarikin", "evropa",
    "thjodarsorg", "uppreisn", "mótmæli", "barist a gotum", "gotu",
    "klerkastjorn"
  ];

  // --- INNLENT / LÖGREGLA / SLYS ---
  const icelandWords = [
    "innlent", "island", "reykjavik", "keflavik", "akureyri", "hafnarfjord",
    "kopavog", "gardabae", "mosfells", "selfoss", "austurland", "vesturland",
    "sudurland", "nordurland", "breidhella",
    "logregl", "rettar", "dom", "daemd", "sakfelld", "handtek",
    "eldur i bil", "eldur", "bruni", "sprenging", "slys"
  ];

  if (sportWords.some(w => x.includes(w))) return "ithrottir";
  if (bizWords.some(w => x.includes(w))) return "vidskipti";
  if (healthWords.some(w => x.includes(w))) return "heilsa";
  if (techWords.some(w => x.includes(w))) return "taekni";
  if (envWords.some(w => x.includes(w))) return "umhverfi";
  if (sciWords.some(w => x.includes(w))) return "visindi";
  if (opinionWords.some(w => x.includes(w))) return "skodun";
  if (cultureWords.some(w => x.includes(w))) return "menning";
  if (foreignWords.some(w => x.includes(w))) return "erlent";
  if (icelandWords.some(w => x.includes(w))) return "innlent";

  return null;
}

function mapFromUrl(sourceId, u, titleNorm) {
  // Generic patterns (strong)
  if (u.includes("/sport") || u.includes("/ithrott")) return "ithrottir";
  if (u.includes("/vidskip") || u.includes("/business") || u.includes("/markad")) return "vidskipti";
  if (u.includes("/menning") || u.includes("/lifid") || u.includes("/list") || u.includes("/fokus")) return "menning";
  if (u.includes("/skodun") || u.includes("/pistill") || u.includes("/comment")) return "skodun";
  if (u.includes("/taekni") || u.includes("/tech")) return "taekni";
  if (u.includes("/heilsa") || u.includes("/health")) return "heilsa";
  if (u.includes("/umhverfi") || u.includes("/environment")) return "umhverfi";
  if (u.includes("/visindi") || u.includes("/science")) return "visindi";
  if (u.includes("/erlent")) return "erlent";
  if (u.includes("/innlent")) return "innlent";

  // DV sections
  if (sourceId === "dv") {
    if (u.includes("/pressan")) return "innlent";
    if (u.includes("/fokus")) return "menning";
    if (u.includes("433.is") || u.includes("/433") || u.includes("4-3-3")) return "ithrottir";
  }

  // Vísir: many links are /g/<id>/<slug> (no section). Add title heuristics.
  if (sourceId === "visir") {
    const t = String(titleNorm || "");

    // If it’s a Vísir /g/ link, lean on title keywords
    if (u.includes("/g/")) {
      if (
        t.includes("sport") || t.includes("fotbolti") || t.includes("enski boltinn") ||
        t.includes("enska urvalsdeild") || t.includes("urslit") || t.includes("undanurslit") ||
        t.includes("var") || t.includes("studnings") || t.includes("leikmadur") ||
        t.includes("arsenal") || t.includes("man city") || t.includes("premier") ||
        t.includes("ronaldo") || t.includes("mourinho") || t.includes("schumacher") ||
        t.includes("darts") || t.includes("pila") || t.includes("olymp")
      ) return "ithrottir";

      if (
        t.includes("iran") || t.includes("sviss") || t.includes("thjodarsorg") ||
        t.includes("mótm") || t.includes("barist a gotum") || t.includes("gaza") || t.includes("ukraine")
      ) return "erlent";

      if (
        t.includes("magnyl") || t.includes("magnes") || t.includes("skammt") ||
        t.includes("heilsa") || t.includes("lyf") || t.includes("sjuk")
      ) return "heilsa";

      if (
        t.includes("tommy lee") || t.includes("hollywood") || t.includes("leikari") ||
        t.includes("tatt") || t.includes("tisku") || t.includes("ahrifavald")
      ) return "menning";
    }

    // Old rules still help:
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