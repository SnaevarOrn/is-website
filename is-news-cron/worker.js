var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

/* =========================
   CORS (NEW)
   ========================= */

// Change this to lock it down:
// const CORS_ALLOW_ORIGIN = "https://xn--s-iga.is";
const CORS_ALLOW_ORIGIN = "*";

function corsHeaders(request) {
  // If you lock down to a single origin, you can reflect Origin safely like this:
  // const origin = request.headers.get("Origin") || "";
  // const allow = origin === CORS_ALLOW_ORIGIN ? origin : "";
  // return { "Access-Control-Allow-Origin": allow, ... }

  return {
    "Access-Control-Allow-Origin": CORS_ALLOW_ORIGIN,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    // Useful so caches don't mix origins (only relevant if not using "*")
    "Vary": "Origin"
  };
}
__name(corsHeaders, "corsHeaders");

function withCors(request, init = {}) {
  const base = init.headers ? Object.fromEntries(new Headers(init.headers)) : {};
  return {
    ...init,
    headers: {
      ...base,
      ...corsHeaders(request)
    }
  };
}
__name(withCors, "withCors");

// worker.js
var CATEGORY_MAP = [
  { id: "innlent", label: "Innlent" },
  { id: "erlent", label: "Erlent" },
  { id: "ithrottir", label: "\xCD\xFEr\xF3ttir" },
  { id: "vidskipti", label: "Vi\xF0skipti" },
  { id: "menning", label: "Menning" },
  { id: "skodun", label: "Sko\xF0un" },
  { id: "taekni", label: "T\xE6kni" },
  { id: "heilsa", label: "Heilsa" },
  { id: "umhverfi", label: "Umhverfi" },
  { id: "visindi", label: "V\xEDsindi" },
  { id: "oflokkad", label: "\xD3flokka\xF0" }
];
var VALID_CATEGORY_IDS = new Set(CATEGORY_MAP.map((c) => c.id));
function labelFor(id) {
  return CATEGORY_MAP.find((c) => c.id === id)?.label || "\xD3flokka\xF0";
}
__name(labelFor, "labelFor");
var FEEDS = {
  mbl: {
    label: "Morgunbla\xF0i\xF0",
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
  visir: {
    label: "V\xEDsir",
    url: [
      "https://www.visir.is/rss/innlent",
      "https://www.visir.is/rss/erlent",
      "https://www.visir.is/rss/ithrottir",
      "https://www.visir.is/rss/sport",
      "https://www.visir.is/rss/fotbolti",
      "https://www.visir.is/rss/vidskipti",
      "https://www.visir.is/rss/menning",
      "https://www.visir.is/rss/skodun",
      "https://www.visir.is/rss/lifid",
      "https://www.visir.is/rss/gagnryni",
      "https://www.visir.is/rss/tonlist",
      "https://www.visir.is/rss/allt"
    ]
  },
  ruv: { url: "https://www.ruv.is/rss/frettir", label: "R\xDAV" },
  dv: { url: "https://www.dv.is/feed/", label: "DV" },
  akureyri: {
    label: "Akureyri",
    url: ["https://www.akureyri.net/feed", "https://www.akureyri.is/feed.xml"]
  },
  bb: { url: "https://bb.is/feed/", label: "B\xE6jarins Besta" },
  bbl: { url: "https://www.bbl.is/rss/", label: "B\xE6ndabla\xF0i\xF0" },
  byggingar: { url: "https://byggingar.is/feed", label: "Byggingar" },
  eyjafrettir: { url: "https://eyjafrettir.is/feed/", label: "Eyjafr\xE9ttir" },
  fjardarfrettir: { url: "https://www.fjardarfrettir.is/feed", label: "Fjar\xF0arfr\xE9ttir" },
  frjalsverslun: { url: "https://vb.is/rss/frjals-verslun/", label: "Frj\xE1ls verslun" },
  frettin: { url: "https://frettin.is/feed/", label: "Fr\xE9ttin" },
  feykir: { url: "https://www.feykir.is/feed", label: "Feykir" },
  heimildin: { url: "https://heimildin.is/rss/", label: "Heimildin" },
  grapevine: { url: "https://grapevine.is/feed/", label: "Grapevine" },
  mannlif: { url: "https://mannlif.is/rss/", label: "Mannl\xEDf" },
  midjan: { url: "http://www.midjan.is/feed/", label: "Mi\xF0jan" },
  nutiminn: { url: "https://www.nutiminn.is/feed/", label: "N\xFAt\xEDminn" },
  sunnlenska: { url: "https://www.sunnlenska.is/feed/", label: "Sunnlenska" },
  tigull: { url: "https://tigull.is/feed/", label: "T\xEDgull" },
  trolli: { url: "https://trolli.is/feed/", label: "Tr\xF6lli" },
  visbending: { url: "https://visbending.is/rss/", label: "V\xEDsbending" },
  vb: {
    url: "https://www.vb.is/rss",
    label: "Vi\xF0skiptabla\xF0i\xF0",
    excludeLinkHosts: ["fiskifrettir.vb.is"]
  },
  fiskifrettir: {
    url: "https://fiskifrettir.vb.is/rss/",
    label: "Fiskifr\xE9ttir",
    includeLinkHosts: ["fiskifrettir.vb.is"]
  }
};
var FORCE_INNLENT_IF_UNCLASSIFIED = /* @__PURE__ */ new Set([
  "bb",
  "bbl",
  "byggingar",
  "eyjafrettir",
  "fiskifrettir",
  "frjalsverslun",
  "feykir",
  "fjardarfrettir",
  "midjan",
  "sunnlenska",
  "tigull",
  "trolli"
]);

var worker_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // ✅ CORS preflight (NEW)
    if (request.method === "OPTIONS") {
      return new Response(null, withCors(request, { status: 204 }));
    }

    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response("is-news-cron alive", withCors(request, {
        headers: { "content-type": "text/plain; charset=utf-8" }
      }));
    }
    if (url.pathname === "/news") {
      return handleNewsApi(request, env);
    }
    return new Response("Not found", withCors(request, { status: 404 }));
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runCron(env, event));
  }
};

async function runCron(env, event) {
  const started = (/* @__PURE__ */ new Date()).toISOString();
  console.log("\u{1F552} runCron start", started, event?.cron);
  const cutoffDays = 14;
  const cutoffMs = cutoffDays * 24 * 60 * 60 * 1e3;
  const cutoffIso = new Date(Date.now() - cutoffMs).toISOString();
  let fetchedFeeds = 0, http304 = 0, http200 = 0, inserted = 0, skippedOld = 0, errors = 0;
  for (const sourceId of Object.keys(FEEDS)) {
    const feed = FEEDS[sourceId];
    const urls = Array.isArray(feed.url) ? feed.url : [feed.url];
    for (const feedUrl of urls) {
      try {
        fetchedFeeds++;
        const state = await env.DB.prepare(
          "SELECT etag, last_modified FROM feeds WHERE feed_url = ?"
        ).bind(feedUrl).first();
        const headers = {
          "User-Agent": "is.is news cron",
          "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
          "Accept-Language": "is,is-IS;q=0.9,en;q=0.7"
        };
        if (state?.etag) headers["If-None-Match"] = state.etag;
        if (state?.last_modified) headers["If-Modified-Since"] = state.last_modified;
        const res = await fetch(feedUrl, { headers });
        if (res.status === 304) {
          http304++;
          await upsertFeedState(env, { feedUrl, sourceId, status: 304 });
          continue;
        }
        const xml = await res.text();
        if (!res.ok) {
          errors++;
          console.error("Feed HTTP error:", sourceId, feedUrl, res.status, xml.slice(0, 180));
          await upsertFeedState(env, { feedUrl, sourceId, status: res.status, error: `HTTP ${res.status}` });
          continue;
        }
        http200++;
        await upsertFeedState(env, {
          feedUrl,
          sourceId,
          status: res.status,
          etag: res.headers.get("etag"),
          lastModified: res.headers.get("last-modified"),
          error: null
        });
        const blocks = parseFeedBlocks(xml);
        for (const block of blocks) {
          const title = extractTagValue(block, "title");
          const linkRaw = extractLink(block);
          if (!title || !linkRaw) continue;
          const host = safeHost(linkRaw);
          if (feed.includeLinkHosts?.length && !feed.includeLinkHosts.includes(host)) continue;
          if (feed.excludeLinkHosts?.length && feed.excludeLinkHosts.includes(host)) continue;
          const pubDate = extractTagValue(block, "pubDate") || extractTagValue(block, "updated") || extractTagValue(block, "published") || extractTagValue(block, "dc:date");
          const publishedAt = pubDate ? safeToIso(pubDate) : null;
          if (publishedAt && publishedAt < cutoffIso) {
            skippedOld++;
            continue;
          }
          const description = extractTagValue(block, "description") || extractTagValue(block, "summary") || extractTagValue(block, "content:encoded") || "";
          const rssCats = extractCategories(block);
          const catText = rssCats.join(" ").trim();
          let inferred = inferCategory({
            sourceId,
            url: linkRaw,
            rssCategories: rssCats,
            rssCategoryText: catText,
            title,
            description
          });
          let { categoryId } = inferred;
          if (sourceId === "visir" && categoryId === "oflokkad") {
            const hinted = visirCategoryFromFeedUrl(feedUrl);
            if (hinted) categoryId = hinted;
          }
          if (FORCE_INNLENT_IF_UNCLASSIFIED.has(sourceId) && categoryId === "oflokkad") {
            categoryId = "innlent";
          }
          const canonical = canonicalizeUrl(linkRaw);
          const urlNorm = normalizeUrlKey(canonical);
          const fetchedAt = (/* @__PURE__ */ new Date()).toISOString();
          const ins = await env.DB.prepare(`
            INSERT OR IGNORE INTO articles
              (url, url_norm, title, published_at, source_id, source_label, category_id, description, fetched_at)
            VALUES
              (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            canonical,
            urlNorm,
            String(title).trim(),
            publishedAt,
            sourceId,
            feed.label || sourceId,
            categoryId,
            String(description || "").trim(),
            fetchedAt
          ).run();
          if (ins?.meta?.changes === 1) inserted++;
          const row = await env.DB.prepare(
            "SELECT id, title, description FROM articles WHERE url_norm = ?"
          ).bind(urlNorm).first();
          if (row?.id) {
            const haystack = buildHaystack(row.title, row.description);
            await env.DB.prepare(`
              INSERT INTO article_search (article_id, haystack)
              VALUES (?, ?)
              ON CONFLICT(article_id) DO UPDATE SET haystack = excluded.haystack
            `).bind(row.id, haystack).run();
          }
        }
      } catch (e) {
        errors++;
        console.error("Feed error:", sourceId, feedUrl, String(e?.message || e));
        await upsertFeedState(env, { feedUrl, sourceId, status: 0, error: String(e?.message || e) });
      }
    }
  }
  console.log("\u2705 runCron done", { fetchedFeeds, http200, http304, inserted, skippedOld, errors });
}
__name(runCron, "runCron");

async function upsertFeedState(env, { feedUrl, sourceId, status, etag, lastModified, error }) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const okAt = Number(status) >= 200 && Number(status) < 400 ? now : null;
  await env.DB.prepare(`
    INSERT INTO feeds (
      source_id, feed_url, etag, last_modified,
      last_polled_at, last_ok_at, last_status, last_error
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(feed_url) DO UPDATE SET
      source_id      = excluded.source_id,
      etag           = COALESCE(excluded.etag, feeds.etag),
      last_modified  = COALESCE(excluded.last_modified, feeds.last_modified),
      last_polled_at = excluded.last_polled_at,
      last_ok_at     = COALESCE(excluded.last_ok_at, feeds.last_ok_at),
      last_status    = excluded.last_status,
      last_error     = excluded.last_error
  `).bind(
    sourceId,
    feedUrl,
    etag || null,
    lastModified || null,
    now,
    okAt,
    Number(status || 0),
    error || null
  ).run();
}
__name(upsertFeedState, "upsertFeedState");

async function handleNewsApi(request, env) {
  const { searchParams } = new URL(request.url);
  const sources = (searchParams.get("sources") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const catsParam = (searchParams.get("cats") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const limit = clampInt(searchParams.get("limit"), 1, 360, 50);
  const q = (searchParams.get("q") || "").trim();
  const debug = searchParams.get("debug") === "1";
  const activeCats = new Set((catsParam.length ? catsParam : []).filter((id) => VALID_CATEGORY_IDS.has(id)));
  const wh = [];
  const args = [];
  if (sources.length) {
    wh.push(`a.source_id IN (${sources.map(() => "?").join(",")})`);
    args.push(...sources);
  }
  if (activeCats.size) {
    const a = [...activeCats];
    wh.push(`a.category_id IN (${a.map(() => "?").join(",")})`);
    args.push(...a);
  }
  let sql = "";
  let bindArgs = [];
  if (q) {
    const qNorm = normalizeText(q);
    const like = `%${qNorm}%`;
    const whereExtra = wh.length ? `AND ${wh.join(" AND ")}` : "";
    sql = `
      SELECT a.*
      FROM article_search s
      JOIN articles a ON a.id = s.article_id
      WHERE s.haystack LIKE ?
      ${whereExtra}
      ORDER BY COALESCE(a.published_at, a.fetched_at) DESC
      LIMIT ?
    `;
    bindArgs = [like, ...args, limit];
  } else {
    const where = wh.length ? `WHERE ${wh.join(" AND ")}` : "";
    sql = `
      SELECT a.*
      FROM articles a
      ${where}
      ORDER BY COALESCE(a.published_at, a.fetched_at) DESC
      LIMIT ?
    `;
    bindArgs = [...args, limit];
  }
  const rows = (await env.DB.prepare(sql).bind(...bindArgs).all()).results || [];
  const items = rows.map((r) => ({
    title: r.title,
    url: r.url,
    publishedAt: r.published_at || null,
    sourceId: r.source_id,
    sourceLabel: r.source_label,
    categoryId: r.category_id,
    category: labelFor(r.category_id)
  }));
  const availableSet = new Set(items.map((x) => x.categoryId).filter(Boolean));
  availableSet.add("oflokkad");
  const payload = debug ? { items, availableCategories: [...availableSet], debug: { q, sources, cats: [...activeCats], limit } } : { items, availableCategories: [...availableSet] };

  return new Response(JSON.stringify(payload), withCors(request, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=60"
    }
  }));
}
__name(handleNewsApi, "handleNewsApi");

function buildHaystack(title, description) {
  const t = normalizeText(title || "");
  const d = normalizeText(description || "");
  return `${t} ${d}`.trim();
}
__name(buildHaystack, "buildHaystack");

function canonicalizeUrl(u) {
  try {
    const url = new URL(String(u).trim());
    url.hash = "";
    const drop = /* @__PURE__ */ new Set([
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "fbclid",
      "gclid",
      "yclid",
      "mc_cid",
      "mc_eid"
    ]);
    for (const k of [...url.searchParams.keys()]) {
      if (drop.has(k.toLowerCase())) url.searchParams.delete(k);
    }
    url.host = url.host.toLowerCase();
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }
    const entries = [...url.searchParams.entries()].sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
    url.search = "";
    for (const [k, v] of entries) url.searchParams.append(k, v);
    return url.toString();
  } catch {
    return String(u || "").trim();
  }
}
__name(canonicalizeUrl, "canonicalizeUrl");

function normalizeUrlKey(url) {
  return normalizeText(String(url || "").trim());
}
__name(normalizeUrlKey, "normalizeUrlKey");

function parseFeedBlocks(xml) {
  const itemRe = /<(?:\w+:)?item\b[^>]*>[\s\S]*?<\/(?:\w+:)?item>/gi;
  const items = [...String(xml || "").matchAll(itemRe)].map((m) => m[0]);
  if (items.length) return items;
  const entryRe = /<(?:\w+:)?entry\b[^>]*>[\s\S]*?<\/(?:\w+:)?entry>/gi;
  return [...String(xml || "").matchAll(entryRe)].map((m) => m[0]);
}
__name(parseFeedBlocks, "parseFeedBlocks");

function extractTagValue(xml, tag) {
  const src = String(xml || "");
  const esc = escapeRegExp(tag);

  // matches: <title>...</title> and <content:encoded>...</content:encoded>
  // handles optional CDATA
  const re = new RegExp(
    `<(?:\\w+:)?${esc}\\b[^>]*>` +
      `(?:<!\\[CDATA\\[)?` +
      `([\\s\\S]*?)` +
      `(?:\\]\\]>)?` +
    `<\\/(?:\\w+:)?${esc}>`,
    "i"
  );

  const m = src.match(re);
  return m ? decodeEntities(m[1]).trim() : null;
}

__name(extractTagValue, "extractTagValue");

function extractLink(block) {
  const src = String(block || "");
  const mHref = src.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  if (mHref?.[1]) return decodeEntities(mHref[1]).trim();
  const m = src.match(/<link\b[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i);
  if (m?.[1]) return decodeEntities(m[1]).trim();
  return null;
}
__name(extractLink, "extractLink");

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
__name(extractCategories, "extractCategories");

function safeToIso(dateString) {
  const d = new Date(dateString);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
__name(safeToIso, "safeToIso");

function safeHost(url) {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return "";
  }
}
__name(safeHost, "safeHost");

function decodeEntities(s) {
  let str = String(s || "");
  str = str.replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&#39;", "'").replaceAll("&apos;", "'").replaceAll("&nbsp;", " ").replaceAll("&ndash;", "\u2013").replaceAll("&mdash;", "\u2014");
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
__name(decodeEntities, "decodeEntities");

function escapeRegExp(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
__name(escapeRegExp, "escapeRegExp");

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}
__name(clampInt, "clampInt");

function visirCategoryFromFeedUrl(feedUrl) {
  const u = String(feedUrl || "").toLowerCase();
  if (u.includes("/rss/innlent")) return "innlent";
  if (u.includes("/rss/erlent")) return "erlent";
  if (u.includes("/rss/ithrottir") || u.includes("/rss/fotbolti") || u.includes("/rss/sport")) return "ithrottir";
  if (u.includes("/rss/vidskipti")) return "vidskipti";
  if (u.includes("/rss/menning") || u.includes("/rss/lifid") || u.includes("/rss/tonlist") || u.includes("/rss/gagnryni")) return "menning";
  if (u.includes("/rss/skodun")) return "skodun";
  return null;
}
__name(visirCategoryFromFeedUrl, "visirCategoryFromFeedUrl");

function normalizeText(s) {
  const str = String(s || "").toLowerCase();
  const noMarks = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return noMarks.replaceAll("\xF0", "d").replaceAll("\xFE", "th").replaceAll("\xE6", "ae").replaceAll("\xF6", "o");
}
__name(normalizeText, "normalizeText");

/* --- Rest of your code unchanged --- */

function inferCategory({ sourceId, url, rssCategories, rssCategoryText, title, description }) {
  const host = safeHost(url);
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
  const fromRss = mapFromRssCategories(sourceId, rssTermsNorm, rssNormJoined);
  if (fromRss) return { categoryId: fromRss, categoryLabel: labelFor(fromRss), categoryFrom: "rss" };
  const fromUrl = mapFromUrl(sourceId, u, t);
  if (fromUrl) return { categoryId: fromUrl, categoryLabel: labelFor(fromUrl), categoryFrom: "url" };
  const fromText = mapFromText(rssNormJoined) || mapFromText(t);
  const categoryId = fromText || "oflokkad";
  return { categoryId, categoryLabel: labelFor(categoryId), categoryFrom: fromText ? "keywords" : "default" };
}
__name(inferCategory, "inferCategory");

function norm(s) { return String(s || "").replace(/&nbsp;|&#160;/g, " ").replace(/\s+/g, " ").trim().toLowerCase(); }
__name(norm, "norm");

// ... (the remaining functions you provided are unchanged)
function extractFeedCategories(item) { /* unchanged */ 
  const cats = [];
  if (Array.isArray(item?.categories)) cats.push(...item.categories);
  if (typeof item?.category === "string") cats.push(item.category);
  const out = [];
  const seen = /* @__PURE__ */ new Set();
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
__name(extractFeedCategories, "extractFeedCategories");

// (keep everything else exactly as you had it)
function mapBbCategoryToBucket(feedCats) { /* unchanged */ 
  const joined = norm(feedCats.join(" | "));
  if (!joined) return null;
  if (joined.includes("a\xF0sendar greinar")) return "skodun";
  if (joined.includes("menning")) return "menning";
  if (joined.includes("samg\xF6ngur")) return "innlent";
  if (joined.includes("\xED\xFEr\xF3tt") || joined.includes("ithrott")) return "ithrottir";
  if (joined.includes("vestfir")) return "innlent";
  return null;
}
__name(mapBbCategoryToBucket, "mapBbCategoryToBucket");

// ... etc ...

export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
