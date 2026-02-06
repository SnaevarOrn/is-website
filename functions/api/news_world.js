// /functions/api/news_world.js
// World/foreign RSS/Atom aggregator for ís.is (Cloudflare Pages Functions)
//
// Goals:
//  - Keep /api/news (Iceland) fast & stable by splitting world feeds out.
//  - Parallel fetching + per-feed timeout.
//  - RSS + Atom parsing (same style as your current news.js).
//  - Simple categorization for world news (English keywords + URL hints).
//
// Output (same shape as /api/news):
// { items: [...], availableCategories: [...] , debugStats? }

"use strict";

/* =========================
   Category model (same ids as your UI expects)
   ========================= */

const CATEGORY_MAP = [
  { id: "innlent",   label: "Innlent" },   // rarely used for world, but kept for compatibility
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
   Feeds (WORLD)
   =========================
   Notes:
   - Some “big” sites don’t provide a clean free RSS anymore, or use paywalls.
   - Below are known RSS endpoints that are commonly available. If any breaks,
     debug=1 will show per-feed parsing stats quickly.
*/

const FEEDS = {
  // Wire / global agencies
  // NOTE: Reuters/AP no longer provide reliable free RSS. Use RSSHub as a proxy.
  reuters:  { url: "https://news.google.com/rss/search?q=site%3Areuters.com&hl=en-US&gl=US&ceid=US%3Aen",             label: "Reuters" },
  ap:       { url: "https://news.google.com/rss/search?q=when:24h allinurl:apnews.com", label: "AP News" },
  bloomberg: { url: "https://news.google.com/rss/search?q=when:24h allinurl:bloomberg.com", label: "Bloomberg" },
  
  // Public service / large broadcasters
  bbc:      { url: "https://feeds.bbci.co.uk/news/rss.xml",             label: "BBC News" },
  npr:      { url: "https://feeds.npr.org/1001/rss.xml",                label: "NPR" },
  aljazeera:{ url: "https://www.aljazeera.com/xml/rss/all.xml",         label: "Al Jazeera" },

  // Newspapers / magazines (where RSS exists)
  guardian: { url: "https://www.theguardian.com/world/rss",             label: "The Guardian" },
  politico: { url: "https://www.politico.com/rss/politicopicks.xml",    label: "POLITICO" },
  economist:{ url: "https://www.economist.com/the-world-this-week/rss.xml", label: "The Economist" },

  // Tech / science-ish (often useful buckets)
  verge:    { url: "https://www.theverge.com/rss/index.xml",            label: "The Verge" },
  ars:      { url: "https://feeds.arstechnica.com/arstechnica/index",   label: "Ars Technica" },
  wired:    { url: "https://www.wired.com/feed/rss",                    label: "WIRED" },
  natgeo:   { url: "https://www.nationalgeographic.com/content/natgeo/en_us/index.rss", label: "NatGeo" },
};

/* =========================
   API
   ========================= */

export async function onRequestGet({ request }) {
  const { searchParams } = new URL(request.url);

  const sources = (searchParams.get("sources") || "").split(",").filter(Boolean);
  const catsParam = (searchParams.get("cats") || "").split(",").filter(Boolean);
  const limit = clampInt(searchParams.get("limit"), 1, 200, 60);
  const debug = searchParams.get("debug") === "1";

  // If no sources param -> default to all FEEDS keys
  const activeSources = sources.length ? sources : Object.keys(FEEDS);

  // If cats passed, ignore unknown cats; if none passed => no cat filter
  const activeCats = new Set(
    (catsParam.length ? catsParam : []).filter(id => VALID_CATEGORY_IDS.has(id))
  );

  // Parallel fetch with per-feed timeout
  const timeoutMs = clampInt(searchParams.get("timeout"), 1500, 12000, 4500);

  const debugStats = {};
  const allItems = [];

  const tasks = activeSources.map(async (id) => {
    const feed = FEEDS[id];
    if (!feed) return;

    try {
      const { ok, status, text, ms } = await fetchWithTimeout(feed.url, timeoutMs, {
        headers: {
          "User-Agent": "is.is news bot",
          "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
          "Accept-Language": "is,is-IS;q=0.9,en;q=0.7",
        }
      });

      if (!ok) {
        if (debug) {
          debugStats[id] = {
            url: feed.url,
            ok,
            status,
            fetchMs: ms,
            length: (text || "").length,
            head: String(text || "").slice(0, 220),
          };
        }
        return;
      }

      const blocks = parseFeedBlocks(text);

      if (debug) {
        const firstBlock = blocks[0] || "";
        const firstTitle = firstBlock ? extractTagValue(firstBlock, "title") : null;
        const firstLink = firstBlock ? extractLink(firstBlock) : null;
        debugStats[id] = {
          url: feed.url,
          ok,
          status,
          fetchMs: ms,
          length: String(text || "").length,
          hasItem: String(text || "").toLowerCase().includes("<item"),
          hasEntry: String(text || "").toLowerCase().includes("<entry"),
          blocksCount: blocks.length,
          firstTitle,
          firstLink,
          head: String(text || "").slice(0, 220),
          firstBlockHead: String(firstBlock || "").slice(0, 220),
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

        // If a category filter is present, enforce it
        if (activeCats.size > 0 && !activeCats.has(categoryId)) continue;

        allItems.push({
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
      if (debug) debugStats[id] = { url: FEEDS[id]?.url, error: String(err?.message || err) };
      return;
    }
  });

  await Promise.allSettled(tasks);

  // Sort newest first
  allItems.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));

  const sliced = allItems.slice(0, limit);

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
   Fetch with timeout
   ========================= */

async function fetchWithTimeout(url, timeoutMs, init) {
  const ac = new AbortController();
  const t0 = Date.now();
  const to = setTimeout(() => ac.abort("timeout"), timeoutMs);

  try {
    const res = await fetch(url, { ...init, signal: ac.signal });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, status: 0, text: "", ms: Date.now() - t0, error: String(e?.message || e) };
  } finally {
    clearTimeout(to);
  }
}

/* =========================
   Parsing helpers (RSS + Atom)
   ========================= */

function parseFeedBlocks(xml) {
  const src = String(xml || "");
  const itemRe = /<(?:\w+:)?item\b[^>]*>[\s\S]*?<\/(?:\w+:)?item>/gi;
  const items = [...src.matchAll(itemRe)].map(m => m[0]);
  if (items.length) return items;

  const entryRe = /<(?:\w+:)?entry\b[^>]*>[\s\S]*?<\/(?:\w+:)?entry>/gi;
  return [...src.matchAll(entryRe)].map(m => m[0]);
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
   Categorization (WORLD)
   ========================= */

function normalizeText(s) {
  const str = String(s || "").toLowerCase();
  const noMarks = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return noMarks;
}

function inferCategory({ sourceId, url, rssCategoryText, title }) {
  const u = normalizeText(url);
  const c = normalizeText(rssCategoryText);
  const t = normalizeText(title);

  // Prefer feed-provided category text, then title, then URL hints
  const fromText = mapFromText(c) || mapFromText(t);
  const fromUrl = mapFromUrl(u, t);

  const categoryId = fromText || fromUrl || "erlent"; // world defaults to "Erlent"
  return { categoryId, categoryLabel: labelFor(categoryId) };
}

function mapFromText(x) {
  if (!x) return null;

  const sport = [
    "sport", "sports", "football", "soccer", "nba", "nfl", "mlb", "nhl", "formula", "f1",
    "tennis", "golf", "mma", "ufc", "boxing", "olymp"
  ];

  const biz = [
    "business", "markets", "market", "finance", "economy", "economics",
    "stocks", "shares", "earnings", "inflation", "interest rate", "bank", "oil", "gas"
  ];

  const culture = [
    "culture", "arts", "music", "film", "movies", "tv", "television", "books", "theatre",
    "fashion", "celebrity"
  ];

  const opinion = [
    "opinion", "editorial", "comment", "column", "analysis", "letters"
  ];

  const tech = [
    "technology", "tech", "ai", "artificial intelligence", "software", "cyber", "cybersecurity",
    "gadgets", "apple", "google", "microsoft", "tesla", "startup"
  ];

  const health = [
    "health", "medicine", "medical", "hospital", "disease", "virus", "flu", "covid", "nutrition"
  ];

  const env = [
    "climate", "environment", "weather", "wildfire", "flood", "earthquake", "volcano",
    "pollution", "nature"
  ];

  const sci = [
    "science", "space", "nasa", "astronomy", "physics", "biology", "chemistry", "research"
  ];

  if (sport.some(w => x.includes(w))) return "ithrottir";
  if (biz.some(w => x.includes(w))) return "vidskipti";
  if (culture.some(w => x.includes(w))) return "menning";
  if (opinion.some(w => x.includes(w))) return "skodun";
  if (tech.some(w => x.includes(w))) return "taekni";
  if (health.some(w => x.includes(w))) return "heilsa";
  if (env.some(w => x.includes(w))) return "umhverfi";
  if (sci.some(w => x.includes(w))) return "visindi";

  // Otherwise: world/general
  return null;
}

function mapFromUrl(u, t) {
  // Simple URL section hints
  if (u.includes("/sport") || u.includes("/sports")) return "ithrottir";
  if (u.includes("/business") || u.includes("/markets") || u.includes("/finance")) return "vidskipti";
  if (u.includes("/culture") || u.includes("/arts") || u.includes("/entertainment")) return "menning";
  if (u.includes("/opinion") || u.includes("/comment")) return "skodun";
  if (u.includes("/tech") || u.includes("/technology")) return "taekni";
  if (u.includes("/health")) return "heilsa";
  if (u.includes("/environment") || u.includes("/climate")) return "umhverfi";
  if (u.includes("/science")) return "visindi";

  // Title fallback: if it smells like business/sport/etc.
  return mapFromText(t);
}
