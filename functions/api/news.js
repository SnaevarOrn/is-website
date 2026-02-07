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

  { id: "taekni",    label: "Tækni" },
  { id: "heilsa",    label: "Heilsa" },
  { id: "umhverfi",  label: "Umhverfi" },
  { id: "visindi",   label: "Vísindi" },

  { id: "oflokkad",  label: "Óflokkað" },
];

const VALID_CATEGORY_IDS = new Set(CATEGORY_MAP.map(c => c.id));
const labelFor = (id) => (CATEGORY_MAP.find(c => c.id === id)?.label) || "Óflokkað";

/* =========================
   API
   ========================= */

export async function onRequestGet({ request }) {
  const { searchParams } = new URL(request.url);

  const sources = (searchParams.get("sources") || "").split(",").filter(Boolean);
  const catsParam = (searchParams.get("cats") || "").split(",").filter(Boolean);
  const limit = clampInt(searchParams.get("limit"), 1, 360, 50);
  const debug = searchParams.get("debug") === "1";

  // ---- Time budget (avoid CF function timeouts => empty results) ----
  const START_MS = Date.now();
  const TIME_BUDGET_MS = debug ? 12000 : 8500;
  const outOfTime = () => (Date.now() - START_MS) > TIME_BUDGET_MS;

  // Per fetch timeout
  const FETCH_TIMEOUT_MS = debug ? 6500 : 4200;

  // Concurrency for sub-feeds (MBL pack)
  const SUBFEED_CONCURRENCY = 4;

  // MBL: mörg feed undir einu source
  // (ATH: helstu var 404 í debug hjá þér, fjarlægt)
  const MBL_FEEDS = [
    // Core first
    "https://www.mbl.is/feeds/fp/",
    "https://www.mbl.is/feeds/nyjast/",
    "https://www.mbl.is/feeds/innlent/",
    "https://www.mbl.is/feeds/erlent/",
    "https://www.mbl.is/feeds/vidskipti/",
    "https://www.mbl.is/feeds/menning/",
    "https://www.mbl.is/feeds/sport/",
    "https://www.mbl.is/feeds/togt/",

    // More
    "https://www.mbl.is/feeds/smartland/",
    "https://www.mbl.is/feeds/matur/",
    "https://www.mbl.is/feeds/ferdalog/",
    "https://www.mbl.is/feeds/bilar/",
    "https://www.mbl.is/feeds/200milur/",
    "https://www.mbl.is/feeds/sjonvarp/",
    "https://www.mbl.is/feeds/folk/",
    "https://www.mbl.is/feeds/verold/",

    // Sports subfeeds
    "https://www.mbl.is/feeds/fotbolti/",
    "https://www.mbl.is/feeds/enskiboltinn/",
    "https://www.mbl.is/feeds/handbolti/",
    "https://www.mbl.is/feeds/korfubolti/",
    "https://www.mbl.is/feeds/golf/",
    "https://www.mbl.is/feeds/pepsideildin/",
    "https://www.mbl.is/feeds/formula1/",
    "https://www.mbl.is/feeds/hestar/",
    "https://www.mbl.is/feeds/rafithrottir/",
  ];

  const feeds = {
    ruv:   { url: "https://www.ruv.is/rss/frettir", label: "RÚV" },
    mbl:   { url: MBL_FEEDS, label: "Morgunblaðið" },
    visir: { url: "https://www.visir.is/rss/allt",  label: "Vísir" },
    dv:    { url: "https://www.dv.is/feed/",        label: "DV" },

    frettin:         { url: "https://frettin.is/feed/",               label: "Fréttin" },
    heimildin:       { url: "https://heimildin.is/rss/",              label: "Heimildin" },
    grapevine:       { url: "https://grapevine.is/feed/",             label: "Grapevine" },
    bb:              { url: "https://bb.is/feed/",                    label: "Bæjarins Besta" },
    nutiminn:        { url: "https://www.nutiminn.is/feed/",          label: "Nútíminn" },
    feykir:          { url: "https://www.feykir.is/feed",             label: "Feykir" },
    midjan:          { url: "http://www.midjan.is/feed/",             label: "Miðjan" },
    eyjafrettir:     { url: "https://eyjafrettir.is/feed/",           label: "Eyjafréttir" },
    fjardarfrettir:  { url: "https://www.fjardarfrettir.is/feed",     label: "Fjarðarfréttir" },
    frjalsverslun:   { url: "https://vb.is/rss/frjals-verslun/",      label: "Frjáls verslun" },
    bbl:             { url: "https://www.bbl.is/rss/",                label: "Bændablaðið" },
    byggingar:       { url: "https://byggingar.is/feed",              label: "Byggingar" },
    visbending:      { url: "https://visbending.is/rss/",             label: "Vísbending" },

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
  const seenUrls = new Set();
  const debugStats = {};

  // Budget-friendly cap (we still sort & slice to limit later)
  const HARD_ITEM_CAP = Math.max(limit * 6, 240);

  for (const id of activeSources) {
    if (outOfTime()) break;

    const feed = feeds[id];
    if (!feed) continue;

    const urls = Array.isArray(feed.url) ? feed.url : [feed.url];

    // per-source cap
    const MAX_PER_SOURCE = Math.max(limit * 3, 120);
    let addedForSource = 0;

    const batches = chunkArray(urls, SUBFEED_CONCURRENCY);

    for (const batch of batches) {
      if (outOfTime()) break;
      if (items.length >= HARD_ITEM_CAP) break;
      if (addedForSource >= MAX_PER_SOURCE) break;

      const results = await Promise.allSettled(
        batch.map(feedUrl => fetchFeedXml({ sourceId: id, feedUrl, timeoutMs: FETCH_TIMEOUT_MS }))
      );

      for (let i = 0; i < results.length; i++) {
        if (outOfTime()) break;
        if (items.length >= HARD_ITEM_CAP) break;
        if (addedForSource >= MAX_PER_SOURCE) break;

        const feedUrl = batch[i];
        const r = results[i];

        if (r.status !== "fulfilled") {
          if (debug) pushDebugUrl(debugStats, id, feed?.label, feedUrl, { error: String(r.reason || "fetch failed") });
          continue;
        }

        const { ok, status, xml, aborted } = r.value;

        if (!ok) {
          if (debug) pushDebugUrl(debugStats, id, feed?.label, feedUrl, {
            status,
            ok,
            aborted,
            length: (xml || "").length,
            head: String(xml || "").slice(0, 220),
          });
          continue;
        }

        const blocks = parseFeedBlocks(xml);

        if (debug) {
          const firstBlock = blocks[0] || "";
          const firstTitle = firstBlock ? extractTagValue(firstBlock, "title") : null;
          const firstLink = firstBlock ? extractLink(firstBlock) : null;
          const firstCats = firstBlock ? extractCategories(firstBlock) : [];
          pushDebugUrl(debugStats, id, feed?.label, feedUrl, {
            status,
            ok: true,
            aborted,
            length: (xml || "").length,
            hasItem: String(xml || "").toLowerCase().includes("<item"),
            hasEntry: String(xml || "").toLowerCase().includes("<entry"),
            blocksCount: blocks.length,
            firstTitle,
            firstLink,
            firstCats,
            head: String(xml || "").slice(0, 220),
            firstBlockHead: String(firstBlock || "").slice(0, 220),
          });
        }

        for (const block of blocks) {
          if (outOfTime()) break;
          if (items.length >= HARD_ITEM_CAP) break;
          if (addedForSource >= MAX_PER_SOURCE) break;

          const title = extractTagValue(block, "title");
          const link = extractLink(block);

          const pubDate =
            extractTagValue(block, "pubDate") ||
            extractTagValue(block, "updated") ||
            extractTagValue(block, "published") ||
            extractTagValue(block, "dc:date");

          if (!title || !link) continue;

          const host = safeHost(link);
          if (feed.includeLinkHosts?.length && !feed.includeLinkHosts.includes(host)) continue;
          if (feed.excludeLinkHosts?.length && feed.excludeLinkHosts.includes(host)) continue;

          if (seenUrls.has(link)) continue;
          seenUrls.add(link);

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
          addedForSource++;
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
    ? { items: sliced, availableCategories, debugStats, meta: { tookMs: Date.now() - START_MS, budgetMs: TIME_BUDGET_MS } }
    : { items: sliced, availableCategories };

  return new Response(JSON.stringify(payload), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": debug ? "no-store" : "public, max-age=300"
    }
  });
}

/* =========================
   Fetch helper (timeout + headers)
   ========================= */

async function fetchFeedXml({ sourceId, feedUrl, timeoutMs }) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort("timeout"), timeoutMs);

  const headers = {
    "User-Agent": "is.is news bot",
    "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
    "Accept-Language": "is,is-IS;q=0.9,en;q=0.7",
  };

  // Referer bara fyrir MBL
  if (sourceId === "mbl") headers["Referer"] = "https://www.mbl.is/feeds/";

  try {
    const res = await fetch(feedUrl, { headers, signal: controller.signal });
    const xml = await res.text().catch(() => "");
    clearTimeout(t);
    return { ok: res.ok, status: res.status, xml, aborted: false };
  } catch (err) {
    clearTimeout(t);
    const aborted = String(err?.name || "").toLowerCase().includes("abort");
    return { ok: false, status: 0, xml: "", aborted };
  }
}

function pushDebugUrl(debugStats, id, label, feedUrl, obj) {
  debugStats[id] = debugStats[id] || { label: label || id, urls: [] };
  debugStats[id].urls.push({ url: feedUrl, ...obj });
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < (arr || []).length; i += size) out.push(arr.slice(i, i + size));
  return out;
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

// ✅ Fixið sem bjargar þessu öllu:
// robust tag extraction (MBL title var annars að verða null => allt filtered út)
function extractTagValue(xml, tag) {
  const src = String(xml || "");
  const esc = escapeRegExp(tag);

  const re = new RegExp(
    `<\\s*(?:\\w+:)?${esc}(?:\\s[^>]*)?>` +   // <title ...>
    `([\\s\\S]*?)` +                         // content
    `<\\s*\\/\\s*(?:\\w+:)?${esc}\\s*>`,     // </title>
    "i"
  );

  const m = src.match(re);
  if (!m) return null;

  let v = m[1] ?? "";
  v = v.replace(/^\\s*<!\\[CDATA\\[\\s*/i, "");
  v = v.replace(/\\s*\\]\\]>\\s*$/i, "");
  v = decodeEntities(v).trim();
  return v || null;
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

function safeHost(url) {
  try { return new URL(url).host.toLowerCase(); } catch { return ""; }
}

function decodeEntities(s) {
  let str = String(s || "");

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

  str = str
    .replaceAll("&ndash;", "–")
    .replaceAll("&mdash;", "—");

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

  // 0) Source-hints
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

  // 1) RSS category mapping
  const fromRss = mapFromRssCategories(sourceId, rssTermsNorm, rssNormJoined);
  if (fromRss) return { categoryId: fromRss, categoryLabel: labelFor(fromRss), categoryFrom: "rss" };

  // 2) URL mapping
  const fromUrl = mapFromUrl(sourceId, u, t);
  if (fromUrl) return { categoryId: fromUrl, categoryLabel: labelFor(fromUrl), categoryFrom: "url" };

  // 3) Keyword fallback
  const fromText = mapFromText(rssNormJoined) || mapFromText(t);
  const categoryId = fromText || "oflokkad";
  return { categoryId, categoryLabel: labelFor(categoryId), categoryFrom: fromText ? "keywords" : "default" };
}

/* =========================
   Source-specific hints
   ========================= */

function norm(s) {
  return String(s || "")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function extractFeedCategories(item) {
  const cats = [];
  if (Array.isArray(item?.categories)) cats.push(...item.categories);
  if (typeof item?.category === "string") cats.push(item.category);

  const out = [];
  const seen = new Set();
  for (const c of cats) {
    const cc = String(c || "").trim();
    if (!cc) continue;
    const key = norm(cc);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cc);
  }
  return out;
}

function mapBbCategoryToBucket(feedCats) {
  const joined = norm(feedCats.join(" | "));
  if (!joined) return null;
  if (joined.includes("aðsendar greinar")) return "skodun";
  if (joined.includes("menning")) return "menning";
  if (joined.includes("samgöngur")) return "innlent";
  if (joined.includes("íþrótt") || joined.includes("ithrott")) return "ithrottir";
  if (joined.includes("vestfir")) return "innlent";
  return null;
}

function mapNutiminnCategoryToBucket(feedCats) {
  const joined = norm(feedCats.join(" | "));
  if (!joined) return null;
  if (joined.includes("aðsendar")) return "skodun";
  if (joined.includes("brotkast")) return "menning";
  if (joined.includes("fréttir")) return "innlent";
  if (joined.includes("forsíða")) return null;
  if (joined.includes("í fókus") || joined.includes("i fokus")) return "menning";
  if (joined.includes("íþrótt") || joined.includes("ithrott")) return "ithrottir";
  return null;
}

function mapBblUrlToBucket(uNorm) {
  if (!uNorm) return null;
  if (uNorm.includes("/skodun/")) return "skodun";
  if (uNorm.includes("/folk/")) return "menning";
  if (uNorm.includes("/frettir/")) return "innlent";
  return null;
}

function classifyWithSourceHints({ host, url, title, description, item }) {
  const h = norm(host);
  const u = norm(url);
  const t = norm(title);
  const d = norm(description);
  const feedCats = extractFeedCategories(item);
  const fcNorm = norm(feedCats.join(" | "));

  // BB.is
  if (h === "bb.is" || h.endsWith(".bb.is")) {
    const bb = mapBbCategoryToBucket(feedCats);
    if (bb) return bb;
    if (t.includes(" skrifar") || (t.includes("|") && t.includes("skrifar"))) return "skodun";
    return null;
  }

  // Nútíminn
  if (h === "www.nutiminn.is" || h === "nutiminn.is" || h.endsWith(".nutiminn.is")) {
    const nm = mapNutiminnCategoryToBucket(feedCats);
    if (nm) return nm;
    if (fcNorm.includes("aðsendar")) return "skodun";
    if (t.includes(" pistill") || t.includes(" leiðari") || t.includes(" skrifar")) return "skodun";
    return null;
  }

  // Bændablaðið
  if (h === "www.bbl.is" || h === "bbl.is" || h.endsWith(".bbl.is")) {
    const byUrl = mapBblUrlToBucket(u);
    if (byUrl) return byUrl;
    if (fcNorm.includes("skodun")) return "skodun";
    if (fcNorm.includes("folk")) return "menning";
    if (fcNorm.includes("frettir")) return "innlent";
    return null;
  }

  // Heimildin
  if (h === "heimildin.is" || h.endsWith(".heimildin.is") || h === "stundin.is" || h.endsWith(".stundin.is")) {
    if (t.includes(" skrifar") || t.includes(" pistill") || t.includes(" leiðari")) return "skodun";
    if (d.includes(" kemur fram í pistli") || d.includes(" skrifar") || d.includes(" leiðari")) return "skodun";
    if (t.includes("kvikmynd") || t.includes("leikhús") || t.includes("listasafn") || t.includes("menning")) return "menning";
    if (t.includes("vísind") || t.includes("rannsókn")) return "visindi";
    if (t.includes("loftslag") || t.includes("umhverf")) return "umhverfi";
    return null;
  }

  // Feykir
  if (h === "feykir.is" || h.endsWith(".feykir.is")) {
    if (t.includes(" skrifar") || (t.includes("|") && t.includes("skrifar"))) return "skodun";
    if (t.includes("knattspyrn") || t.includes("körfu") || t.includes("bonus deild") || d.includes("knattspyrn") || d.includes("körfu"))
      return "ithrottir";
    if (t.includes("uppskrift") || d.includes("uppskrift")) return "menning";
    if (t.includes("sjókvía") || d.includes("sjókvía")) return "umhverfi";
    return null;
  }

  return null;
}

/* =========================
   RSS category mapping
   ========================= */

function mapFromRssCategories(sourceId, termsNorm, joinedNorm) {
  if ((!termsNorm || termsNorm.length === 0) && !joinedNorm) return null;

  const bySource = mapFromRssCategoriesBySource(sourceId, termsNorm, joinedNorm);
  if (bySource) return bySource;

  return mapFromText(termsNorm.join(" ")) || mapFromText(joinedNorm) || null;
}

function mapFromRssCategoriesBySource(sourceId, termsNorm, joinedNorm) {
  const has = (needle) =>
    termsNorm.includes(normalizeText(needle)) || String(joinedNorm || "").includes(normalizeText(needle));

  if (sourceId === "mbl") {
    if (has("innlent")) return "innlent";
    if (has("erlent")) return "erlent";
    if (has("íþróttir") || has("ithrottir")) return "ithrottir";
    if (has("viðskipti") || has("vidskipti")) return "vidskipti";
    if (has("matur")) return "menning";
    if (has("smartland")) return "menning";
    if (has("200 mílur") || has("200 milur")) return "innlent";
    if (has("tækni") || has("taekni") || has("togt")) return "taekni";
    if (has("vísindi") || has("visindi")) return "visindi";
    return null;
  }

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
    "sport","ithrott","fotbolta","fotbolti","handbolti","korfubolti","tennis","formula","ufc",
    "olymp","premier league","champions league","europa league","ronaldo","messi","arsenal","liverpool",
    "man city","manchester united","chelsea","tottenham","barcelona","real madrid","433","4-3-3"
  ];

  const bizWords = ["vidskip","business","markad","fjarmal","kaupholl","gengi","vext","verdbolga"];
  const cultureWords = ["menning","folk","lifid","list","tonlist","kvikmynd","bok","leikhus","matur","smartland"];
  const opinionWords = ["skodun","comment","pistill","leidari","adsendar","aðsendar"];
  const foreignWords = ["erlent","world","alheim","althjod","ukraina","russland","kina","evropa","usa"];
  const localWords = ["innlent","island","reykjavik","akureyri","reykjanes","logregl","dom","handtek"];
  const techWords = ["taekni","tolva","forrit","gervigreind","ai","netoryggi","snjallsimi","apple","google","microsoft"];
  const healthWords = ["heilsa","laekn","sjuk","lyf","spitali","smit","veira"];
  const envWords = ["umhverfi","loftslag","mengun","natur","eldgos","skjalfti","vedur","haf"];
  const sciWords = ["visindi","rannsokn","geim","edlis","efna","stjornufraedi","tungl","sol"];

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
  if (u.includes("/taekni") || u.includes("/tech") || u.includes("/togt")) return "taekni";
  if (u.includes("/heilsa") || u.includes("/health")) return "heilsa";
  if (u.includes("/umhverfi") || u.includes("/environment")) return "umhverfi";
  if (u.includes("/visindi") || u.includes("/science")) return "visindi";
  if (u.includes("/erlent")) return "erlent";
  if (u.includes("/innlent")) return "innlent";

  // VB
  if (sourceId === "vb") {
    if (u.includes("/frettir/")) return "vidskipti";
    if (u.includes("/skodun/")) return "skodun";
    if (u.includes("/folk/")) return "menning";
    if (u.includes("/eftir-vinnu/")) {
      const t = String(titleNorm || "");
      if (t.includes("taekni") || t.includes("iphone") || t.includes("ai") || t.includes("gervigreind")) return "taekni";
      return "menning";
    }
  }

  // DV
  if (sourceId === "dv") {
    if (u.includes("/pressan")) return "innlent";
    if (u.includes("/fokus")) return "menning";
    if (u.includes("433.is") || u.includes("/433") || u.includes("4-3-3")) return "ithrottir";
  }

  // Vísir
  if (sourceId === "visir") {
    if (u.includes("/enski-boltinn") || u.includes("/enskiboltinn")) return "ithrottir";
    if (u.includes("/korfubolti") || u.includes("/handbolti")) return "ithrottir";
  }

  // MBL
  if (sourceId === "mbl") {
    if (u.includes("/frettir/innlent")) return "innlent";
    if (u.includes("/frettir/erlent")) return "erlent";
    if (u.includes("/sport/")) return "ithrottir";
    if (u.includes("/vidskipti/")) return "vidskipti";
    if (u.includes("/matur/")) return "menning";
    if (u.includes("/smartland/")) return "menning";
    if (u.includes("/200milur/")) return "innlent";
    if (u.includes("/togt/")) return "taekni";
  }

  // RÚV
  if (sourceId === "ruv") {
    if (u.includes("/ithrottir")) return "ithrottir";
    if (u.includes("/vidskipti")) return "vidskipti";
    if (u.includes("/menning")) return "menning";
    if (u.includes("/erlent")) return "erlent";
    if (u.includes("/innlent")) return "innlent";
  }

  // BBL
  if (sourceId === "bbl") {
    if (u.includes("/skodun/")) return "skodun";
    if (u.includes("/folk/")) return "menning";
    if (u.includes("/frettir/")) return "innlent";
  }

  return null;
}