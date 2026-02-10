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
function labelFor(id) {
  return (CATEGORY_MAP.find(c => c.id === id)?.label) || "Óflokkað";
}

/* =========================
   Feeds config
   ========================= */

const FEEDS = {
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

  visir: {
    label: "Vísir",
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
      "https://www.visir.is/rss/allt",
    ]
  },

  ruv: { url: "https://www.ruv.is/rss/frettir", label: "RÚV" },
  dv:  { url: "https://www.dv.is/feed/", label: "DV" },

  akureyri: {
    label: "Akureyri",
    url: ["https://www.akureyri.net/feed", "https://www.akureyri.is/feed.xml"]
  },

  bb: { url: "https://bb.is/feed/", label: "Bæjarins Besta" },
  bbl: { url: "https://www.bbl.is/rss/", label: "Bændablaðið" },
  byggingar: { url: "https://byggingar.is/feed", label: "Byggingar" },
  eyjafrettir: { url: "https://eyjafrettir.is/feed/", label: "Eyjafréttir" },
  fjardarfrettir: { url: "https://www.fjardarfrettir.is/feed", label: "Fjarðarfréttir" },
  frjalsverslun: { url: "https://vb.is/rss/frjals-verslun/", label: "Frjáls verslun" },
  frettin: { url: "https://frettin.is/feed/", label: "Fréttin" },
  feykir: { url: "https://www.feykir.is/feed", label: "Feykir" },
  heimildin: { url: "https://heimildin.is/rss/", label: "Heimildin" },
  grapevine: { url: "https://grapevine.is/feed/", label: "Grapevine" },
  mannlif: { url: "https://mannlif.is/rss/", label: "Mannlíf" },
  midjan: { url: "http://www.midjan.is/feed/", label: "Miðjan" },
  nutiminn: { url: "https://www.nutiminn.is/feed/", label: "Nútíminn" },
  sunnlenska: { url: "https://www.sunnlenska.is/feed/", label: "Sunnlenska" },
  tigull: { url: "https://tigull.is/feed/", label: "Tígull" },
  trolli: { url: "https://trolli.is/feed/", label: "Trölli" },
  visbending: { url: "https://visbending.is/rss/", label: "Vísbending" },

  vb: {
    url: "https://www.vb.is/rss",
    label: "Viðskiptablaðið",
    excludeLinkHosts: ["fiskifrettir.vb.is"]
  },
  fiskifrettir: {
    url: "https://fiskifrettir.vb.is/rss/",
    label: "Fiskifréttir",
    includeLinkHosts: ["fiskifrettir.vb.is"]
  },
};

const FORCE_INNLENT_IF_UNCLASSIFIED = new Set([
  "bb","bbl","byggingar","eyjafrettir","fiskifrettir","frjalsverslun",
  "feykir","fjardarfrettir","midjan","sunnlenska","tigull","trolli",
]);

/* =========================
   Worker entrypoints
   ========================= */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response("is-news-cron alive");
    }

    if (url.pathname === "/news") {
      return handleNewsApi(request, env);
    }

    return new Response("Not found", { status: 404 });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runCron(env, event));
  }
};

/* =========================
   Cron job
   ========================= */

async function runCron(env, event) {
  const started = new Date().toISOString();
  console.log("🕒 runCron start", started, event?.cron);

  const cutoffDays = 14;
  const cutoffMs = cutoffDays * 24 * 60 * 60 * 1000;
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
          "Accept-Language": "is,is-IS;q=0.9,en;q=0.7",
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

          // include/exclude host rules
          const host = safeHost(linkRaw);
          if (feed.includeLinkHosts?.length && !feed.includeLinkHosts.includes(host)) continue;
          if (feed.excludeLinkHosts?.length && feed.excludeLinkHosts.includes(host)) continue;

          const pubDate =
            extractTagValue(block, "pubDate") ||
            extractTagValue(block, "updated") ||
            extractTagValue(block, "published") ||
            extractTagValue(block, "dc:date");

          const publishedAt = pubDate ? safeToIso(pubDate) : null;
          if (publishedAt && publishedAt < cutoffIso) {
            skippedOld++;
            continue;
          }

          const description =
            extractTagValue(block, "description") ||
            extractTagValue(block, "summary") ||
            extractTagValue(block, "content:encoded") ||
            "";

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

          // Vísir feedUrl hint fallback
          if (sourceId === "visir" && categoryId === "oflokkad") {
            const hinted = visirCategoryFromFeedUrl(feedUrl);
            if (hinted) categoryId = hinted;
          }

          if (FORCE_INNLENT_IF_UNCLASSIFIED.has(sourceId) && categoryId === "oflokkad") {
            categoryId = "innlent";
          }

          const canonical = canonicalizeUrl(linkRaw);
          const urlNorm = normalizeUrlKey(canonical);

          const fetchedAt = new Date().toISOString();

          // 1) insert article (idempotent via UNIQUE(url_norm))
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

          // 2) ensure search row exists/updated (cheap + robust)
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

  console.log("✅ runCron done", { fetchedFeeds, http200, http304, inserted, skippedOld, errors });
}

/* =========================
   Feed state upsert (D1: feeds table)
   ========================= */

async function upsertFeedState(env, { feedUrl, sourceId, status, etag, lastModified, error }) {
  const now = new Date().toISOString();
  const okAt = (Number(status) >= 200 && Number(status) < 400) ? now : null;

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

/* =========================
   API: read from D1 (+ search)
   GET /news?sources=a,b&cats=innlent&limit=50&q=...
   ========================= */

async function handleNewsApi(request, env) {
  const { searchParams } = new URL(request.url);

  const sources = (searchParams.get("sources") || "").split(",").map(s => s.trim()).filter(Boolean);
  const catsParam = (searchParams.get("cats") || "").split(",").map(s => s.trim()).filter(Boolean);
  const limit = clampInt(searchParams.get("limit"), 1, 360, 50);
  const q = (searchParams.get("q") || "").trim();
  const debug = searchParams.get("debug") === "1";

  const activeCats = new Set((catsParam.length ? catsParam : []).filter(id => VALID_CATEGORY_IDS.has(id)));

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
    // Simple LIKE search on normalized haystack
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

  const items = rows.map(r => ({
    title: r.title,
    url: r.url,
    publishedAt: r.published_at || null,
    sourceId: r.source_id,
    sourceLabel: r.source_label,
    categoryId: r.category_id,
    category: labelFor(r.category_id)
  }));

  const availableSet = new Set(items.map(x => x.categoryId).filter(Boolean));
  availableSet.add("oflokkad");

  const payload = debug
    ? { items, availableCategories: [...availableSet], debug: { q, sources, cats: [...activeCats], limit } }
    : { items, availableCategories: [...availableSet] };

  return new Response(JSON.stringify(payload), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=60"
    }
  });
}

/* =========================
   Search haystack helpers
   ========================= */

function buildHaystack(title, description) {
  const t = normalizeText(title || "");
  const d = normalizeText(description || "");
  // space-separated normalized text – good enough for LIKE MVP
  return `${t} ${d}`.trim();
}

/* =========================
   URL canonicalization + DB de-dupe key
   ========================= */

function canonicalizeUrl(u) {
  try {
    const url = new URL(String(u).trim());
    url.hash = "";

    // Drop common tracking params
    const drop = new Set([
      "utm_source","utm_medium","utm_campaign","utm_term","utm_content",
      "fbclid","gclid","yclid","mc_cid","mc_eid"
    ]);
    for (const k of [...url.searchParams.keys()]) {
      if (drop.has(k.toLowerCase())) url.searchParams.delete(k);
    }

    url.host = url.host.toLowerCase();

    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }

    const entries = [...url.searchParams.entries()]
      .sort((a,b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));

    url.search = "";
    for (const [k,v] of entries) url.searchParams.append(k, v);

    return url.toString();
  } catch {
    return String(u || "").trim();
  }
}

function normalizeUrlKey(url) {
  // canonical url -> normalized key for UNIQUE(url_norm)
  return normalizeText(String(url || "").trim());
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

function safeHost(url) {
  try { return new URL(url).host.toLowerCase(); } catch { return ""; }
}

// Entity decoding (handles &amp;ndash; + numeric entities)
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
   Vísir feedUrl hint
   ========================= */

function visirCategoryFromFeedUrl(feedUrl) {
  const u = String(feedUrl || "").toLowerCase();

  if (u.includes("/rss/innlent")) return "innlent";
  if (u.includes("/rss/erlent")) return "erlent";

  if (u.includes("/rss/ithrottir") || u.includes("/rss/fotbolti") || u.includes("/rss/sport")) return "ithrottir";
  if (u.includes("/rss/vidskipti")) return "vidskipti";

  if (
    u.includes("/rss/menning") ||
    u.includes("/rss/lifid") ||
    u.includes("/rss/tonlist") ||
    u.includes("/rss/gagnryni")
  ) return "menning";

  if (u.includes("/rss/skodun")) return "skodun";
  return null;
}

/* =========================
   Categorization
   Priority: Source-hints -> RSS category -> URL -> keywords
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

/* ---- Source-specific hints ---- */

function norm(s){
  return String(s || "")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function extractFeedCategories(item){
  const cats = [];
  if (Array.isArray(item?.categories)) cats.push(...item.categories);
  if (typeof item?.category === "string") cats.push(item.category);

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
  const joined = norm(feedCats.join(" | "));
  if (!joined) return null;

  if (joined.includes("aðsendar greinar")) return "skodun";
  if (joined.includes("menning")) return "menning";
  if (joined.includes("samgöngur")) return "innlent";
  if (joined.includes("íþrótt") || joined.includes("ithrott")) return "ithrottir";
  if (joined.includes("vestfir")) return "innlent";

  return null;
}

function mapNutiminnCategoryToBucket(feedCats){
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

function mapBblUrlToBucket(uNorm){
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

  if (h === "bb.is" || h.endsWith(".bb.is")){
    const bb = mapBbCategoryToBucket(feedCats);
    if (bb) return bb;
    if (t.includes(" skrifar") || (t.includes("|") && t.includes("skrifar"))) return "skodun";
    return null;
  }

  if (h === "www.nutiminn.is" || h === "nutiminn.is" || h.endsWith(".nutiminn.is")){
    const nm = mapNutiminnCategoryToBucket(feedCats);
    if (nm) return nm;
    if (fcNorm.includes("aðsendar")) return "skodun";
    if (t.includes(" pistill") || t.includes(" leiðari") || t.includes(" skrifar")) return "skodun";
    return null;
  }

  if (h === "www.bbl.is" || h === "bbl.is" || h.endsWith(".bbl.is")){
    const byUrl = mapBblUrlToBucket(u);
    if (byUrl) return byUrl;
    if (fcNorm.includes("skodun")) return "skodun";
    if (fcNorm.includes("folk")) return "menning";
    if (fcNorm.includes("frettir")) return "innlent";
    return null;
  }

  if (h === "heimildin.is" || h.endsWith(".heimildin.is") || h === "stundin.is" || h.endsWith(".stundin.is")){
    if (t.includes(" skrifar") || t.includes(" pistill") || t.includes(" leiðari")) return "skodun";
    if (d.includes(" kemur fram í pistli") || d.includes(" skrifar") || d.includes(" leiðari")) return "skodun";

    if (t.includes("kvikmynd") || t.includes("leikhús") || t.includes("listasafn") || t.includes("menning")) return "menning";
    if (t.includes("homo ") || t.includes("neanderd") || t.includes("forn") || t.includes("vísind") || t.includes("rannsókn")) return "visindi";
    if (t.includes("loftslag") || t.includes("mengun") || t.includes("náttúru") || t.includes("umhverf")) return "umhverfi";

    return null;
  }

  if (h === "feykir.is" || h.endsWith(".feykir.is")){
    if (t.includes(" skrifar") || (t.includes("|") && t.includes("skrifar"))) return "skodun";

    if (
      t.includes("knattspyrn") || t.includes("körfu") || t.includes("bonus deild") ||
      t.includes("leikur") || t.includes("jafntefli") || t.includes("sigur") ||
      d.includes("knattspyrn") || d.includes("körfu") || d.includes("bonus deild")
    ) return "ithrottir";

    if (t.includes("matgæð") || t.includes("uppskrift") || t.includes("mælir með") || d.includes("uppskrift")) return "menning";
    if (t.includes("byggðalín") || t.includes("landsnet") || t.includes("raforku") || t.includes("flutningskerfi")) return "innlent";
    if (t.includes("sjókvía") || t.includes("lagareldi") || t.includes("eldis") || d.includes("sjókvía")) return "umhverfi";

    return null;
  }

  return null;
}

/* ---- RSS category mapping ---- */

function mapFromRssCategories(sourceId, termsNorm, joinedNorm) {
  if ((!termsNorm || termsNorm.length === 0) && !joinedNorm) return null;

  const bySource = mapFromRssCategoriesBySource(sourceId, termsNorm, joinedNorm);
  if (bySource) return bySource;

  const generic = mapFromText(termsNorm.join(" ")) || mapFromText(joinedNorm);
  return generic || null;
}

function mapFromRssCategoriesBySource(sourceId, termsNorm, joinedNorm) {
  const has = (needle) => termsNorm.includes(normalizeText(needle)) || String(joinedNorm || "").includes(normalizeText(needle));

  if (sourceId === "mbl") {
    if (has("innlent")) return "innlent";
    if (has("erlent")) return "erlent";
    if (has("íþróttir") || has("ithrottir")) return "ithrottir";
    if (has("viðskipti") || has("vidskipti")) return "vidskipti";
    if (has("matur")) return "menning";
    if (has("smartland")) return "menning";
    if (has("200 mílur") || has("200 milur")) return "innlent";
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

/* ---- Keyword mapping fallback ---- */

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

/* ---- URL mapping ---- */

function mapFromUrl(sourceId, u, titleNorm) {
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

  if (sourceId === "vb") {
    if (u.includes("/frettir/")) return "vidskipti";
    if (u.includes("/skodun/")) return "skodun";
    if (u.includes("/folk/")) return "menning";
    if (u.includes("/eftir-vinnu/")) {
      const t = String(titleNorm || "");
      if (t.includes("taekni") || t.includes("iphone") || t.includes("simi") || t.includes("ai") || t.includes("gervigreind")) return "taekni";
      return "menning";
    }
  }

  if (sourceId === "dv") {
    if (u.includes("/pressan")) return "innlent";
    if (u.includes("/fokus")) return "menning";
    if (u.includes("433.is") || u.includes("/433") || u.includes("4-3-3")) return "ithrottir";
  }

  if (sourceId === "visir") {
    if (u.includes("/menning") || u.includes("/lifid") || u.includes("/tonlist") || u.includes("/gagnryni/")) return "menning";
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

  if (sourceId === "mbl") {
    if (u.includes("/frettir/innlent")) return "innlent";
    if (u.includes("/frettir/erlent")) return "erlent";
    if (u.includes("/sport/")) return "ithrottir";
    if (u.includes("/matur/") || u.includes("/ferdalog/") || u.includes("/smartland/")) return "menning";
    if (u.includes("/200milur/")) return "innlent";
  }

  if (sourceId === "ruv") {
    if (u.includes("/ithrottir")) return "ithrottir";
    if (u.includes("/vidskipti")) return "vidskipti";
    if (u.includes("/menning")) return "menning";
    if (u.includes("/erlent")) return "erlent";
    if (u.includes("/innlent")) return "innlent";
  }

  if (sourceId === "bbl") {
    if (u.includes("/skodun/")) return "skodun";
    if (u.includes("/folk/")) return "menning";
    if (u.includes("/frettir/")) return "innlent";
  }

  return null;
}