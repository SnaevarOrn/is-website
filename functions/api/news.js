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
  const limit = clampInt(searchParams.get("limit"), 1, 360, 50);
  const debug = searchParams.get("debug") === "1";

  const feeds = {
    ruv:   { url: "https://www.ruv.is/rss/frettir", label: "RÚV" },
    //mbl: { url: "https://www.mbl.is/feeds/fp/",        label: "Morgunblaðið" },
mbl: {
  label: "Morgunblaðið",
  url: [
    "https://www.mbl.is/feeds/fp/",
    "https://www.mbl.is/feeds/nyjast/",
    "https://www.mbl.is/feeds/innlent/",
    "https://www.mbl.is/feeds/erlent/",
    "https://www.mbl.is/feeds/vidskipti/",
    "https://www.mbl.is/feeds/menning/",
    "https://www.mbl.is/feeds/sport/",
    "https://www.mbl.is/feeds/togt/",
    "https://www.mbl.is/feeds/smartland/",
    "https://www.mbl.is/feeds/matur/",
    "https://www.mbl.is/feeds/ferdalog/",
    "https://www.mbl.is/feeds/200milur/"
  ]
},
    visir: { url: "https://www.visir.is/rss/allt",  label: "Vísir" },
    dv:    { url: "https://www.dv.is/feed/",        label: "DV" },
    frettin:    { url: "https://frettin.is/feed/",        label: "Fréttin" },
    heimildin:  { url: "https://heimildin.is/rss/",       label: "Heimildin" },
    grapevine:  { url: "https://grapevine.is/feed/",      label: "Grapevine" },
    bb:         { url: "https://bb.is/feed/",             label: "Bæjarins Besta" },
    nutiminn:   { url: "https://www.nutiminn.is/feed/",   label: "Nútíminn" },
    feykir:     { url: "https://www.feykir.is/feed",      label: "Feykir" },
    midjan:     { url: "http://www.midjan.is/feed/",      label: "Miðjan" },
    eyjafrettir: { url: "https://eyjafrettir.is/feed/",      label: "Eyjafréttir" },
    fjardarfrettir: { url: "https://www.fjardarfrettir.is/feed",      label: "Fjarðarfréttir" },
    frjalsverslun: { url: "https://vb.is/rss/frjals-verslun/", label: "Frjáls verslun" },
    bbl:   { url: "https://www.bbl.is/rss/",            label: "Bændablaðið" },
    byggingar:   { url: "https://byggingar.is/feed",            label: "Byggingar" },
    visbending: { url: "https://visbending.is/rss/",            label: "Vísbending" },
    // VB: útilokum allt sem bendir á fiskifrettir.vb.is
    vb: {
      url: "https://www.vb.is/rss",
      label: "Viðskiptablaðið",
      excludeLinkHosts: ["fiskifrettir.vb.is"]
    },
    // Fiskifréttir: leyfum bara linka sem eru á fiskifrettir.vb.is
    fiskifrettir: {
      url: "https://fiskifrettir.vb.is/rss/",
      label: "Fiskifréttir",
      includeLinkHosts: ["fiskifrettir.vb.is"]
    },
  };

  // If classification fails for these sources, force into "innlent"
  const FORCE_INNLENT_IF_UNCLASSIFIED = new Set([
    "bb",
    "bbl",
    "byggingar",
    "eyjafrettir",
    "fiskifrettir",
    "frjalsverslun",
    "feykir",
    "fjardarfrettir",
    "midjan",
  ]);

  const activeSources = sources.length ? sources : Object.keys(feeds);

  // Ignore unknown cats instead of filtering everything out
  const activeCats = new Set(
    (catsParam.length ? catsParam : []).filter(id => VALID_CATEGORY_IDS.has(id))
  );

  const items = [];
const debugStats = {};
const seenUrls = new Set(); // ✅ ONE global dedupe set

for (const id of activeSources) {
  const feed = feeds[id];
  if (!feed) continue;

  const urls = Array.isArray(feed.url) ? feed.url : [feed.url];

  for (const feedUrl of urls) {
    try {
      const res = await fetch(feedUrl, {
        headers: {
          "User-Agent": "is.is news bot",
          "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
          "Accept-Language": "is,is-IS;q=0.9,en;q=0.7",
        }
      });

      const xml = await res.text();

      if (!res.ok) {
        console.error("Feed HTTP error:", id, feedUrl, res.status);
        if (debug) {
          debugStats[id] = debugStats[id] || { label: feed.label || id, urls: [] };
          debugStats[id].urls.push({
            url: feedUrl,
            status: res.status,
            ok: res.ok,
            length: xml.length,
            head: xml.slice(0, 220)
          });
        }
        continue;
      }

      const blocks = parseFeedBlocks(xml);

      if (debug) {
        const firstBlock = blocks[0] || "";
        const firstTitle = firstBlock ? extractTagValue(firstBlock, "title") : null;
        const firstLink  = firstBlock ? extractLink(firstBlock) : null;
        const firstCats  = firstBlock ? extractCategories(firstBlock) : [];

        debugStats[id] = debugStats[id] || { label: feed.label || id, urls: [] };
        debugStats[id].urls.push({
          url: feedUrl,
          status: res.status,
          ok: res.ok,
          length: xml.length,
          hasItem: xml.toLowerCase().includes("<item"),
          hasEntry: xml.toLowerCase().includes("<entry"),
          blocksCount: blocks.length,
          firstTitle,
          firstLink,
          firstCats,
          head: xml.slice(0, 220),
          firstBlockHead: firstBlock.slice(0, 220),
        });
      }

      for (const block of blocks) {
        const title = extractTagValue(block, "title");
        const link  = extractLink(block);

        const pubDate =
          extractTagValue(block, "pubDate") ||
          extractTagValue(block, "updated") ||
          extractTagValue(block, "published") ||
          extractTagValue(block, "dc:date");

        if (!title || !link) continue;

        // ✅ Global dedupe (critical for MBL multi-feed)
        if (seenUrls.has(link)) continue;
        seenUrls.add(link);

        // ✅ Per-feed include/exclude (VB vs Fiskifréttir)
        const host = safeHost(link);
        if (feed.includeLinkHosts?.length && !feed.includeLinkHosts.includes(host)) continue;
        if (feed.excludeLinkHosts?.length && feed.excludeLinkHosts.includes(host)) continue;

        const rssCats = extractCategories(block);
        const catText = rssCats.join(" ").trim();

        const description =
          extractTagValue(block, "description") ||
          extractTagValue(block, "summary") ||
          extractTagValue(block, "content:encoded") ||
          "";

        let inferred = inferCategory({
          sourceId: id,
          url: link,
          rssCategories: rssCats,
          rssCategoryText: catText,
          title,
          description
        });

        let { categoryId, categoryLabel, categoryFrom } = inferred;

        if (FORCE_INNLENT_IF_UNCLASSIFIED.has(id) && categoryId === "oflokkad") {
          categoryId = "innlent";
          categoryLabel = labelFor("innlent");
          categoryFrom = `fallbackOverride:${id}`;
        }

        if (activeCats.size > 0 && !activeCats.has(categoryId)) continue;

        const item = {
          title,
          url: link,
          publishedAt: pubDate ? safeToIso(pubDate) : null,
          sourceId: id,
          sourceLabel: feed.label,
          categoryId,
          category: categoryLabel
        };

        if (debug) item.debug = { rssCats, categoryFrom, feedUrl };

        items.push(item);
      }
    } catch (err) {
      console.error("Feed error:", id, feedUrl, err);
      if (debug) {
        debugStats[id] = debugStats[id] || { label: feed.label || id, urls: [] };
        debugStats[id].urls.push({
          url: feedUrl,
          error: String(err?.message || err)
        });
      }
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
      "cache-control": debug ? "no-store" : "public, max-age=300"
    }
  });
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

// Slightly beefed-up entity decoding (handles &amp;ndash; and numeric entities)
function decodeEntities(s) {
  let str = String(s || "");

  // First pass: common named entities
  str = str
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&ndash;", "–")
    .replaceAll("&mdash;", "—");

  // Second pass: if we had &amp;ndash; => now "&ndash;" exists, so convert again
  str = str
    .replaceAll("&ndash;", "–")
    .replaceAll("&mdash;", "—");

  // Numeric entities: &#8211; or &#x2013;
  str = str.replace(/&#(\d+);/g, (_, n) => {
    const code = Number(n);
    return Number.isFinite(code) ? String.fromCodePoint(code) : _;
  });

  str = str.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
    const code = parseInt(hex, 16);
    return Number.isFinite(code) ? String.fromCodePoint(code) : _;
  });

  return str;
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
   Priority: Source-hints -> RSS category -> URL -> text keywords
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

function inferCategory({ sourceId, url, rssCategories, rssCategoryText, title, description }) {
  const host = safeHost(url);

  // 0) Source-specific hints (safe overrides, uses feed categories + obvious patterns)
  const hinted = classifyWithSourceHints({
    host,
    url,
    title,
    description,
    item: { categories: rssCategories }
  });

  if (hinted && VALID_CATEGORY_IDS.has(hinted)) {
    return { categoryId: hinted, categoryLabel: labelFor(hinted), categoryFrom: "sourceHints" };
  }

  const u = normalizeText(url);
  const t = normalizeText(title);

  const rssTermsNorm = (rssCategories || []).map(normalizeText).filter(Boolean);
  const rssNormJoined = normalizeText(rssCategoryText);

  // 1) RSS category mapping (strongest after source-hints)
  const fromRss = mapFromRssCategories(sourceId, rssTermsNorm, rssNormJoined);
  if (fromRss) {
    return { categoryId: fromRss, categoryLabel: labelFor(fromRss), categoryFrom: "rss" };
  }

  // 2) URL mapping (next best)
  const fromUrl = mapFromUrl(sourceId, u, t);
  if (fromUrl) {
    return { categoryId: fromUrl, categoryLabel: labelFor(fromUrl), categoryFrom: "url" };
  }

  // 3) Keyword fallback (weakest)
  const fromText = mapFromText(rssNormJoined) || mapFromText(t);
  const categoryId = fromText || "oflokkad";
  return { categoryId, categoryLabel: labelFor(categoryId), categoryFrom: fromText ? "keywords" : "default" };
}

/* =========================
   Source-specific category hints (Heimildin / BB / Feykir / BBL / Nútíminn)
   Safe: uses explicit feed categories + obvious patterns
   ========================= */

function norm(s){
  return String(s || "")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function extractFeedCategories(item){
  // rss-parser can give: item.categories (array) OR item.category (string) OR raw-ish
  const cats = [];
  if (Array.isArray(item?.categories)) cats.push(...item.categories);
  if (typeof item?.category === "string") cats.push(item.category);

  // de-dup + normalize (keep original letters too, we match via norm())
  const out = [];
  const seen = new Set();
  for (const c of cats){
    const cc = String(c || "").trim();
    if (!cc) continue;
    const key = norm(cc);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cc);
  }
  return out;
}

function mapBbCategoryToBucket(feedCats){
  // BB uses WP categories heavily; trust them.
  const joined = norm(feedCats.join(" | "));
  if (!joined) return null;

  // Aðsendar greinar -> Skoðun (guest columns)
  if (joined.includes("aðsendar greinar")) return "skodun";

  // Menning -> Menning
  if (joined.includes("menning")) return "menning";

  // Samgöngur -> Innlent (avoid new bucket)
  if (joined.includes("samgöngur")) return "innlent";

  // Íþróttir
  if (joined.includes("íþrótt") || joined.includes("ithrott")) return "ithrottir";

  // Vestfirðir / sveitarfélagstög -> Innlent
  if (joined.includes("vestfir")) return "innlent";

  // Default
  return null;
}

function mapNutiminnCategoryToBucket(feedCats){
  // Nútíminn: WordPress categories present; treat a few safely.
  const joined = norm(feedCats.join(" | "));
  if (!joined) return null;

  if (joined.includes("aðsendar")) return "skodun";
  if (joined.includes("brotkast")) return "menning"; // podcasts / shows / media
  if (joined.includes("fréttir")) return "innlent";
  if (joined.includes("forsíða")) return null; // not a category, ignore
  if (joined.includes("í fókus") || joined.includes("i fokus")) return "menning";

  // If sports ever appears
  if (joined.includes("íþrótt") || joined.includes("ithrott")) return "ithrottir";

  return null;
}

function mapBblUrlToBucket(uNorm){
  // Bændablaðið has strong section paths in the link URLs.
  if (!uNorm) return null;
  if (uNorm.includes("/skodun/")) return "skodun";
  if (uNorm.includes("/folk/")) return "menning";
  if (uNorm.includes("/frettir/")) return "innlent";
  return null;
}

function classifyWithSourceHints({ host, url, title, description, item }){
  const h = norm(host);
  const u = norm(url);
  const t = norm(title);
  const d = norm(description);
  const feedCats = extractFeedCategories(item);
  const fcNorm = norm(feedCats.join(" | "));

  /* ---- BB.is: trust feed categories first ---- */
  if (h === "bb.is" || h.endsWith(".bb.is")){
    const bb = mapBbCategoryToBucket(feedCats);
    if (bb) return bb;

    // fallback: Aðsendar greinar / "skrifar" in title often signals opinion
    if (t.includes(" skrifar") || (t.includes("|") && t.includes("skrifar"))) return "skodun";
    return null;
  }

  /* ---- Nútíminn: trust WP categories first ---- */
  if (h === "www.nutiminn.is" || h === "nutiminn.is" || h.endsWith(".nutiminn.is")){
    const nm = mapNutiminnCategoryToBucket(feedCats);
    if (nm) return nm;

    // obvious opinion markers
    if (fcNorm.includes("aðsendar")) return "skodun";
    if (t.includes(" pistill") || t.includes(" leiðari") || t.includes(" skrifar")) return "skodun";

    return null;
  }

  /* ---- Bændablaðið: usually no <category>; use URL sections safely ---- */
  if (h === "www.bbl.is" || h === "bbl.is" || h.endsWith(".bbl.is")){
    const byUrl = mapBblUrlToBucket(u);
    if (byUrl) return byUrl;

    // if they ever add categories later
    if (fcNorm.includes("skodun")) return "skodun";
    if (fcNorm.includes("folk")) return "menning";
    if (fcNorm.includes("frettir")) return "innlent";

    return null;
  }

  /* ---- Heimildin.is: clear split between news vs essays/columns by phrasing ---- */
  if (h === "heimildin.is" || h.endsWith(".heimildin.is") || h === "stundin.is" || h.endsWith(".stundin.is")){
    // Strong opinion markers
    if (t.includes(" skrifar") || t.includes(" pistill") || t.includes(" leiðari")) return "skodun";
    if (d.includes(" kemur fram í pistli") || d.includes(" skrifar") || d.includes(" leiðari")) return "skodun";

    // Culture/arts markers (very safe ones)
    if (t.includes("kvikmynd") || t.includes("leikhús") || t.includes("listasafn") || t.includes("menning"))
      return "menning";

    // Science (safe-ish)
    if (t.includes("homo ") || t.includes("neanderd") || t.includes("forn") || t.includes("vísind") || t.includes("rannsókn"))
      return "visindi";

    // Climate/environment (safe)
    if (t.includes("loftslag") || t.includes("mengun") || t.includes("náttúru") || t.includes("umhverf"))
      return "umhverfi";

    return null;
  }

  /* ---- Feykir.is: lots of sports + local columns ---- */
  if (h === "feykir.is" || h.endsWith(".feykir.is")){
    // Opinion/columns
    if (t.includes(" skrifar") || (t.includes("|") && t.includes("skrifar"))) return "skodun";

    // Sports (very safe terms)
    if (
      t.includes("knattspyrn") || t.includes("körfu") || t.includes("bonus deild") ||
      t.includes("leikur") || t.includes("jafntefli") || t.includes("sigur") ||
      d.includes("knattspyrn") || d.includes("körfu") || d.includes("bonus deild")
    ) return "ithrottir";

    // Food/recipes -> Menning
    if (t.includes("matgæð") || t.includes("uppskrift") || t.includes("mælir með") || d.includes("uppskrift"))
      return "menning";

    // Energy grid / infrastructure often local society/politics
    if (t.includes("byggðalín") || t.includes("landsnet") || t.includes("raforku") || t.includes("flutningskerfi"))
      return "innlent";

    // Aquaculture / sea pens -> Umhverfi
    if (t.includes("sjókvía") || t.includes("lagareldi") || t.includes("eldis") || d.includes("sjókvía"))
      return "umhverfi";

    return null;
  }

  return null;
}

/* =========================
   RSS category mapping
   ========================= */

function mapFromRssCategories(sourceId, termsNorm, joinedNorm) {
  // If no categories present, bail fast
  if ((!termsNorm || termsNorm.length === 0) && !joinedNorm) return null;

  // Source-specific rules first
  const bySource = mapFromRssCategoriesBySource(sourceId, termsNorm, joinedNorm);
  if (bySource) return bySource;

  // Then generic mapping (works for many feeds)
  const generic = mapFromText(termsNorm.join(" ")) || mapFromText(joinedNorm);
  return generic || null;
}

function mapFromRssCategoriesBySource(sourceId, termsNorm, joinedNorm) {
  const has = (needle) => termsNorm.includes(normalizeText(needle)) || String(joinedNorm || "").includes(normalizeText(needle));

  // MBL: categories like "Innlent", "Íþróttir", "Matur", "Smartland", "200 mílur"
  if (sourceId === "mbl") {
    if (has("innlent")) return "innlent";
    if (has("erlent")) return "erlent";
    if (has("íþróttir") || has("ithrottir")) return "ithrottir";
    if (has("viðskipti") || has("vidskipti")) return "vidskipti";

    // MBL lifestyle/culture buckets
    if (has("matur")) return "menning";
    if (has("smartland")) return "menning";
    if (has("200 mílur") || has("200 milur")) return "innlent";
    return null;
  }

  // BBL (Bændablaðið): if they add categories later, honor basic ones
  if (sourceId === "bbl") {
    if (has("frettir")) return "innlent";
    if (has("skodun")) return "skodun";
    if (has("folk")) return "menning";
    return null;
  }

  return null;
}

/* =========================
   Keyword mapping (fallback)
   ========================= */

function mapFromText(x) {
  if (!x) return null;

  const sportWords = [
    "sport", "ithrott", "fotbolta", "fotbolti",
    "handbolti", "nba", "korfubolti", "tennis", "motorsport", "formula",
    "ufc", "olymp", "olympi", "marathon", "darts",

    "hnefaleik", "breidablik", "valur", "tindastoll", "chess", "nfl",
    "premier league", "champions league", "europa league",
    "enska urvalsdeild", "enskar urvalsdeild", "enski boltinn", "enskur boltinn",

    "ronaldo", "messi", "mourinho", "guardiola", "klopp",
    "arsenal", "man city", "manchester city", "man utd", "manchester united",
    "liverpool", "chelsea", "tottenham", "barcelona", "real madrid", "atletico",
    "psg", "bayern", "dortmund", "juventus", "milan", "inter",
    "433", "4-3-3", "4 3 3"
  ];

  const bizWords = [
    "vidskip", "business", "markad", "fjarmal", "kaupholl",
    "verdbref", "gengi", "vext", "hagkerfi", "verdbolga"
  ];

  const cultureWords = [
    "menning", "folk", "lifid", "list", "tonlist", "kvikmynd", "bok",
    "leikhus", "sjonvarp", "utvarp", "svidslist",
    "matur", "kokte", "smartland", "samkvaem", "daisy", "tipsy",
    "tattuin", "tattoo", "stjarna", "model", "fegurd", "afthrey"
  ];

  const opinionWords = [
    "skodun", "comment", "pistill", "leidari", "grein",
    "ummal", "dalkur", "kronika", "nedanmals", "adsendar", "aðsendar"
  ];

  const foreignWords = [
    "erlent", "foreign", "bandarisk", "usa", "iran", "italia", "evropa", "world", "alheim", "althjod",
    "trump", "musk", "russland", "kina", "japan", "ukraina", "bresk", "bandarikin", "epstein",
  ];

  const localWords = [
    "innlent", "island", "reykjavik", "hafnarfjord", "akureyri", "reykjanes", "kopavog",
    "laugarvatn", "vestmannaeyj", "landsbank", "hs ork",
    "logregl", "rettar", "daemd", "dom", "handtek", "sakfelld"
  ];

  const techWords = [
    "taekni", "tolva", "forrit", "forritun", "gervigreind", "ai",
    "netoryggi", "oryggi", "snjallsimi", "apple", "google", "microsoft", "raf"
  ];

  const healthWords = [
    "heilsa", "laekn", "sjuk", "sjukdom", "lyf", "spitali", "naering", "smit", "veira"
  ];

  const envWords = [
    "umhverfi", "loftslag", "mengun", "natur", "jokull", "eldgos", "skjalfti", "vedur", "haf", "fisk",
    "skograekt", "fornleif"
  ];

  const sciWords = [
    "visindi", "rannsokn", "geim", "edlis", "efna", "liffraedi",
    "stjornufraedi", "stjornukerfi", "tungl", "sol"
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

/* =========================
   URL mapping
   ========================= */

function mapFromUrl(sourceId, u, titleNorm) {
  // Generic patterns
  if (u.includes("/sport") || u.includes("/ithrott")) return "ithrottir";
  if (u.includes("/vidskip") || u.includes("/business") || u.includes("/markad")) return "vidskipti";
  if (u.includes("/menning") || u.includes("/lifid") || u.includes("/list") || u.includes("/folk")) return "menning";
  if (u.includes("/skodun") || u.includes("/pistill") || u.includes("/comment")) return "skodun";
  if (u.includes("/taekni") || u.includes("/tech")) return "taekni";
  if (u.includes("/heilsa") || u.includes("/health")) return "heilsa";
  if (u.includes("/umhverfi") || u.includes("/environment")) return "umhverfi";
  if (u.includes("/visindi") || u.includes("/science")) return "visindi";
  if (u.includes("/erlent")) return "erlent";
  if (u.includes("/innlent")) return "innlent";

  // VB: category-less RSS -> section is in URL path
  if (sourceId === "vb") {
    if (u.includes("/frettir/")) return "vidskipti";
    if (u.includes("/skodun/")) return "skodun";
    if (u.includes("/folk/")) return "menning";
    if (u.includes("/eftir-vinnu/")) {
      const t = String(titleNorm || "");
      if (t.includes("taekni") || t.includes("iphone") || t.includes("simi") || t.includes("ai") || t.includes("gervigreind")) {
        return "taekni";
      }
      return "menning";
    }
  }

  // DV: URL sections are strong signals
  if (sourceId === "dv") {
    if (u.includes("/pressan")) return "innlent";
    if (u.includes("/fokus")) return "menning";
    if (u.includes("433.is") || u.includes("/433") || u.includes("4-3-3")) return "ithrottir";
  }

  // Vísir: many links are /g/<id>/<slug> => no section in URL
  if (sourceId === "visir") {
    if (u.includes("/g/")) {
      const t = String(titleNorm || "");
      if (
        t.includes("ronaldo") || t.includes("messi") || t.includes("mourinho") ||
        t.includes("arsenal") || t.includes("man city") || t.includes("premier") ||
        t.includes("olymp") || t.includes("darts") || t.includes("undanurslit")
      ) return "ithrottir";
    }

    if (u.includes("/enski-boltinn") || u.includes("/enskiboltinn")) return "ithrottir";
    if (u.includes("/korfubolti") || u.includes("/handbolti")) return "ithrottir";
  }

  // MBL: URL sections are very consistent; use as fallback when RSS has none/odd buckets
  if (sourceId === "mbl") {
    if (u.includes("/frettir/innlent")) return "innlent";
    if (u.includes("/frettir/erlent")) return "erlent";
    if (u.includes("/sport/")) return "ithrottir";
    if (u.includes("/matur/")) return "menning";
    if (u.includes("/smartland/")) return "menning";
    if (u.includes("/200milur/")) return "innlent";
  }

  if (sourceId === "ruv") {
    if (u.includes("/ithrottir")) return "ithrottir";
    if (u.includes("/vidskipti")) return "vidskipti";
    if (u.includes("/menning")) return "menning";
    if (u.includes("/erlent")) return "erlent";
    if (u.includes("/innlent")) return "innlent";
  }

  // BBL: section-driven URLs
  if (sourceId === "bbl") {
    if (u.includes("/skodun/")) return "skodun";
    if (u.includes("/folk/")) return "menning";
    if (u.includes("/frettir/")) return "innlent";
  }

  return null;
}