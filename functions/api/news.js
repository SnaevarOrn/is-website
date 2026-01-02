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
    `<(?:\\w+:)?${esc}\\b[^>]*>(?:<!\$begin:math:display$CDATA\\\\\[\)\?\(\[\\\\s\\\\S\]\*\?\)\(\?\:\\$end:math:display$\\]>)?<\\/(?:\\w+:)?${esc}>`,
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

  // 1) RSS/Atom category text er oft “sterkasta” merkið.
  const fromText = mapFromText(c) || mapFromText(t);

  // 2) URL-heuristics (source-specific + generic)
  const fromUrl = mapFromUrl(sourceId, u, t);

  const categoryId = fromText || fromUrl || "oflokkad";
  return { categoryId, categoryLabel: labelFor(categoryId) };
}

function mapFromText(x) {
  if (!x) return null;

  // =========================
  // ÍÞRÓTTIR (yfirflokkur)
  // =========================
  //
  // Þetta er skipulagt sem “undirflokkar” í athugasemdum til að þú getir
  // seinna splittað í t.d. ithrottir_skak / ithrottir_korfa / ithrottir_bardagi.
  //
  // MIKILVÆGT:
  // - Forðast stutt/hættuleg orð sem passa út um allt (t.d. "ehf", "hf", "var", "leik" eitt og sér).
  // - Nota frekar “sterk” sport-orð og mynstur.
  //
  // Ef þú vilt seinna sundurflokka:
  // - Láttu mapFromText skila t.d. "ithrottir_skak" fyrst, og mappa það yfir í "ithrottir" í response.

  const SPORT = {
    // Almenn sport-merki (nota sem fallback; samt reyni ég að hafa þau tiltölulega “sértæk”)
    general: [
      "sport", "ithrott", "ithrottir",
      "stodutafla", "deild", "umferd", "urslit", "undanurslit",
      "jafntefli", "vitaskot", "vitakeppni", "rangstada",
      "raud spjald", "raudspjald", "gult spjald", "gultspjald"
    ],

    // Fótbolti
    football: [
      "fotbolti", "futbol", "bolti",
      "premier league", "champions league", "europa league", "conference league",
      "enska urvalsdeild", "enskar urvalsdeild", "enski boltinn", "enskur boltinn",
      "besta deild", "lengjudeild", "urvalsdeild",
      "landslid", "undankeppni", "kvalleikur",
      "markaskor", "jafnarmark", "hornspyrna"
    ],

    // Handbolti (ATH: EKKI "ehf"!)
    handball: [
      "handbolti",
      // Evrópukeppnir – notið þessi sem “sértæk” handbolta-merki
      "meistaradeild", "evropudeild"
    ],

    // Körfubolti
    basketball: [
      "korfubolti", "korfuknattleik",
      "dominos deild", "subway deild",
      "nba", "euroleague", "euroliga",
      "thristig", "frikast", "frikost", "rebound", "assist"
    ],

    // Skák
    chess: [
      "skak", "skakid", "stormeistari",
      "fide", "elo", "heimsmeistari", "heimsmeistaramot", "candidates"
    ],

    // Bardagaíþróttir (fight news)
    combat: [
      "ufc", "mma", "bellator", "one championship", "pfl",
      "hnefaleik", "boxing", "kickbox", "muay thai", "muaythai",
      "taekwondo", "karate", "judo", "wrestling", "bjj", "jiu jitsu", "jiujitsu", "grappling"
    ],

    // Mótorsport
    motorsport: [
      "formula 1", "formula", "f1",
      "rally", "ralli", "wrc",
      "nascar", "indycar", "motocross"
    ],

    // Vetraríþróttir
    winter: [
      "skidi", "skidaganga", "snowboard",
      "ishokk", "ishockey", "skautun", "biathlon"
    ],

    // Hlaup / úthald
    endurance: [
      "marathon", "half marathon", "ultra", "triathlon", "ironman"
    ],

    // Golf / Tennis / o.fl.
    racket: [
      "golf", "pga", "lpga",
      "tennis", "atp", "wta", "wimbledon", "roland garros", "us open", "australian open",
      "badminton", "squash", "padel"
    ],

    // Nafnabanki (Vísir notar oft nöfn/lið í sportfyrirsögnum)
    // Nota sparlega. Þetta hjálpar /g/ titlum þar sem “fótbolti” stendur ekki.
    footballNames: [
      "ronaldo", "messi", "mourinho", "guardiola", "klopp",
      "arsenal", "man city", "man. city", "manchester city", "manchester united",
      "liverpool", "chelsea", "tottenham",
      "barcelona", "real madrid", "atletico",
      "psg", "bayern", "dortmund", "juventus", "milan", "inter"
    ],

    // Taktík/kerfi
    tactics: ["433", "4-3-3", "4 3 3", "3-5-2", "4-4-2", "4-2-3-1"]
  };

  const sportWords = [
    ...SPORT.general,
    ...SPORT.football,
    ...SPORT.handball,
    ...SPORT.basketball,
    ...SPORT.chess,
    ...SPORT.combat,
    ...SPORT.motorsport,
    ...SPORT.winter,
    ...SPORT.endurance,
    ...SPORT.racket,
    ...SPORT.footballNames,
    ...SPORT.tactics
  ];

  const bizWords = [
    "vidskip", "business", "markad", "fjarmal", "kaupholl",
    "verdbref", "gengi", "vext", "hagkerfi", "verdbolga",
    "hagnadur", "taprekstur", "arsreikning", "uppgjor", "arsskyrsla",
    "samruni", "yfirtek", "fjarmognun", "skuld", "virdisauk",
    "hlutabr", "hlutabref", "arid", "fjarfest", "stefna"
  ];

  const cultureWords = [
    "menning", "lifid", "list", "tonlist", "kvikmynd", "bok",
    "leikhus", "sjonvarp", "utvarp", "svidslist",
    "listamann", "safn", "syning", "utgafa"
  ];

  const opinionWords = [
    // Þetta minnkar “Óflokkað” fyrir pistla/áramóta- og hugleiðingargreinar
    "skodun", "comment", "pistill", "leidari", "grein", "kronika",
    "ummal", "dalkur", "vidhorf", "hugleid", "hugleiding",
    "skrifar:", "ritstjornargrein",
    "aramotaheit", "aramot", "nytt ar", "nyju ari", "kvedja 2025", "maeta 2026"
  ];

  const foreignWords = ["erlent", "foreign", "world", "alheim", "althjod", "utanrikis"];
  const localWords = [
    "innlent", "island", "reykjavik", "landid",
    // dómsmál / lögregla (oft innlent)
    "logregl", "rettar", "daemd", "dom", "handtek", "sakfelld", "akra", "slys", "eldur i bil"
  ];

  const techWords = [
    "taekni", "tolva", "forrit", "forritun", "gervigreind", "ai",
    "netoryggi", "oryggi", "tolvuleikir", "leikjat", "simi", "snjallsimi",
    "apple", "google", "microsoft", "tesla", "rafbil", "rafmagn"
  ];

  const healthWords = [
    "heilsa", "laekn", "sjuk", "sjukdom", "lyf", "spitali",
    "naering", "mataraedi", "smit", "veira", "influenza",
    "ofnaemi", "megrun", "kviði", "thunglyndi"
  ];

  const envWords = [
    "umhverfi", "loftslag", "mengun", "natur", "jokull", "joklar",
    "eldgos", "skjalfti", "vedur", "haf", "fisk", "hval", "plast"
  ];

  // IMPORTANT: removed "stjorn" to avoid matching "stjornmal" (politics).
  const sciWords = [
    "visindi", "rannsokn", "geim", "edlis",
    "efna", "liffraedi", "stjornufraedi", "stjornus", "stjornukerfi",
    "tungl", "sol", "reikistjarna", "svarthol", "gervihnottur"
  ];

  // Röðin skiptir máli: sport fyrst => minnka “Óflokkað” fyrir /g/ sporttitla.
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
    if (u.includes("/skodun") || u.includes("/pistlar")) return "skodun";
  }

  // Vísir: many links are /g/<id>/<slug> => no section in URL.
  // We add a safety net using title hints (already normalized)
  if (sourceId === "visir") {
    if (u.includes("/g/")) {
      const t = String(titleNorm || "");

      // Vísir /g/ er oft án greinilegs flokks í slóð.
      // Því notum við titil-heuristics til að grípa sport.
      // ATH: Forðast “stutt og hættuleg” orð. Nota frekar sértæk sport-merki.
      if (
        // Fótbolti
        t.includes("premier") || t.includes("champions") || t.includes("europa") ||
        t.includes("enska urvalsdeild") || t.includes("enski boltinn") || t.includes("enskur boltinn") ||
        t.includes("fotbolti") || t.includes("vitakeppni") || t.includes("rangstada") ||
        t.includes("raudspjald") || t.includes("gultspjald") ||

        // Körfubolti
        t.includes("korfubolti") || t.includes("dominos deild") || t.includes("subway deild") || t.includes("nba") ||

        // Handbolti
        t.includes("handbolti") || t.includes("meistaradeild") || t.includes("evropudeild") ||

        // Skák
        t.includes("skak") || t.includes("fide") || t.includes("elo") || t.includes("stormeistari") ||

        // Bardagaíþróttir
        t.includes("ufc") || t.includes("mma") || t.includes("hnefaleik") || t.includes("kickbox") || t.includes("muay") ||

        // Mótorsport
        t.includes("formula") || t.includes("f1") || t.includes("rally") || t.includes("wrc") ||

        // Úrslit/undanúrslit/stöðutöflur
        t.includes("undanurslit") || t.includes("urslit") || t.includes("stodutafla") ||

        // Nafnabanki
        t.includes("ronaldo") || t.includes("messi") || t.includes("mourinho") ||
        t.includes("arsenal") || t.includes("man city") || t.includes("manchester") ||
        t.includes("liverpool") || t.includes("chelsea") || t.includes("tottenham") ||
        t.includes("barcelona") || t.includes("real madrid") || t.includes("bayern")
      ) return "ithrottir";

      // Skoðun-heuristics fyrir /g/ (áramóta/pistlar)
      if (
        t.includes("skrifar:") || t.includes("pistill") || t.includes("leidari") ||
        t.includes("aramota") || t.includes("aramotaheit") || t.includes("kvedja 2025") || t.includes("maeta 2026")
      ) return "skodun";
    }

    if (u.includes("/enski-boltinn") || u.includes("/enskiboltinn")) return "ithrottir";
    if (u.includes("/korfubolti") || u.includes("/handbolti") || u.includes("/skak")) return "ithrottir";
    if (u.includes("/skodun") || u.includes("/pistlar")) return "skodun";
  }

  if (sourceId === "mbl") {
    if (u.includes("/frettir/innlent")) return "innlent";
    if (u.includes("/frettir/erlent")) return "erlent";
    if (u.includes("/sport")) return "ithrottir";
    if (u.includes("/vidskipti")) return "vidskipti";
    if (u.includes("/menning")) return "menning";
  }

  if (sourceId === "ruv") {
    if (u.includes("/ithrottir")) return "ithrottir";
    if (u.includes("/vidskipti")) return "vidskipti";
    if (u.includes("/menning")) return "menning";
    if (u.includes("/erlent")) return "erlent";
    if (u.includes("/innlent")) return "innlent";
    if (u.includes("/skodun")) return "skodun";
  }

  return null;
}