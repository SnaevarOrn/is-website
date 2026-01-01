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
  // ✅ hunsa óþekkt cats í stað þess að sía allt út
const activeCats = new Set(
  (catsParam.length ? catsParam : []).filter(id => VALID_CATEGORY_IDS.has(id))
);

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

        // ✅ Read ALL categories (many feeds put the useful one later)
        const rssCats = extractAll(block, "category");
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

// ✅ availableCategories á að byggjast á "sliced" ÁN þess að cats-filter tæmi það.
// Til að ná því: reiknaðu categories úr sliced en tryggðu að oflokkad sé alltaf í boði.
const availableSet = new Set(sliced.map(x => x.categoryId).filter(Boolean));
availableSet.add("oflokkad");
const availableCategories = [...availableSet];

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

  // ✅ More buckets (optional, but useful)
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

function normalizeText(s) {
  const str = String(s || "").toLowerCase();

  // Remove diacritics: á/é/ó/ú/ý/í -> a/e/o/u/y/i, etc.
  const noMarks = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Icelandic special cases
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

  // Prefer RSS/category/title signals; fall back to URL patterns
  const fromRss = mapFromText(c) || mapFromText(t);
  const fromUrl = mapFromUrl(sourceId, u);

  const categoryId = fromRss || fromUrl || "oflokkad";
  return { categoryId, categoryLabel: labelFor(categoryId) };
}

function mapFromText(x) {
  if (!x) return null;

  // ----- Sports -----
  const sportWords = [
    "sport", "ithrott", "fotbolti", "bolti", "enski boltinn",
    "premier league", "champions league", "europa league",
    "handbolti", "korfubolti", "golf", "tennis", "motorsport", "formula",
    "ufc", "mma", "olymp", "skidi", "skid", "hest", "hlaup", "marathon",
    "433", "4-3-3", "4 3 3"
  ];

  // ----- Business -----
  const bizWords = [
    "vidskip", "business", "markad", "fjarmal", "kaupholl",
    "verdbref", "gengi", "vext", "hagkerfi", "verdbolga"
  ];

  // ----- Culture -----
  const cultureWords = [
    "menning", "lifid", "list", "tonlist", "kvikmynd", "bok",
    "leikhus", "sjonvarp", "utvarp", "svidslist"
  ];

  // ----- Opinion -----
  const opinionWords = [
    "skodun", "comment", "pistill", "leidari", "grein",
    "ummal", "dalkur", "vidtal", "kronika"
  ];

  // ----- Foreign / Local -----
  const foreignWords = ["erlent", "foreign", "world", "alheim", "althjod"];
  const localWords = ["innlent", "island", "reykjavik", "landid", "borgin"];

  // ----- Tech -----
  const techWords = [
    "taekni", "tölva", "tolva", "forrit", "forritun", "gervigreind", "ai",
    "netoryggi", "oryggi", "tolvuleikir", "leikjat", "simi", "snjallsimi",
    "apple", "google", "microsoft", "tesla", "rafr", "rafmagnsbill"
  ];

  // ----- Health -----
  const healthWords = [
    "heilsa", "laekn", "sjuk", "sjukdom", "lyf", "spitali",
    "naering", "mataraedi", "smit", "veira", "influenza"
  ];

  // ----- Environment -----
  const envWords = [
    "umhverfi", "loftslag", "mengun", "natur", "jokull", "joklar",
    "eldgos", "skjalfti", "vedur", "haf", "fisk"
  ];

  // ----- Science -----
  const sciWords = [
    "visindi", "rannsokn", "geim", "stjorn", "eðlis", "edlis",
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

  // Source-specific tweaks
  if (sourceId === "ruv") {
    if (u.includes("/ithrottir")) return "ithrottir";
    if (u.includes("/vidskipti")) return "vidskipti";
    if (u.includes("/menning")) return "menning";
    if (u.includes("/erlent")) return "erlent";
    if (u.includes("/innlent")) return "innlent";
  }

  if (sourceId === "mbl") {
    if (u.includes("/sport") || u.includes("/ithrott")) return "ithrottir";
    if (u.includes("/vidskipti")) return "vidskipti";
    if (u.includes("/frettir/innlent")) return "innlent";
    if (u.includes("/frettir/erlent")) return "erlent";
  }

  if (sourceId === "visir") {
    if (u.includes("/sport")) return "ithrottir";
    if (u.includes("/vidskipti")) return "vidskipti";
    if (u.includes("/frettir/innlent")) return "innlent";
    if (u.includes("/frettir/erlent")) return "erlent";

    // ✅ Vísir sport underpaths
    if (u.includes("/enski-boltinn") || u.includes("/enskiboltinn")) return "ithrottir";
    if (u.includes("/korfubolti") || u.includes("/handbolti")) return "ithrottir";
  }

  if (sourceId === "dv") {
    if (u.includes("/sport")) return "ithrottir";
    if (u.includes("/vidskipti")) return "vidskipti";
    if (u.includes("/frettir")) return "innlent";

    // ✅ DV/433 patterns
    if (u.includes("433.is") || u.includes("/433") || u.includes("4-3-3")) return "ithrottir";
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