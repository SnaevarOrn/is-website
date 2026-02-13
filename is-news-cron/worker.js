// worker.js (copy/paste ready)

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

/* =========================
   CORS + Security headers
   ========================= */

// Lockdown: settu þetta á þitt domain þegar þú ert tilbúinn.
// const CORS_ALLOW_ORIGIN = "https://xn--s-iga.is";
const CORS_ALLOW_ORIGIN = "*";

function securityHeaders() {
  return {
    // API hardening (sérstaklega gagnlegt ef einhver reynir að embedda / sniffa)
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
    // API svar á ekki að vera iframe-að
    "X-Frame-Options": "DENY",
    // Fyrir “bara JSON” er þetta fínt:
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    // HSTS: notaðu bara ef þú ert 100% á HTTPS (sem þú ert á workers.dev + eigin domain)
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  };
}

function corsHeaders(request) {
  // Ef þú vilt læsa við eitt origin:
  // const origin = request.headers.get("Origin") || "";
  // const allow = origin === CORS_ALLOW_ORIGIN ? origin : "";
  // return { "Access-Control-Allow-Origin": allow, "Vary": "Origin", ... }

  return {
    "Access-Control-Allow-Origin": CORS_ALLOW_ORIGIN,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

function withCors(request, init = {}) {
  const base = init.headers ? Object.fromEntries(new Headers(init.headers)) : {};
  return {
    ...init,
    headers: {
      ...base,
      ...securityHeaders(),
      ...corsHeaders(request),
    },
  };
}

__name(withCors, "withCors");

/* =========================
   Categories
   ========================= */

var CATEGORY_MAP = [
  { id: "innlent", label: "Innlent" },
  { id: "erlent", label: "Erlent" },
  { id: "ithrottir", label: "Íþróttir" },
  { id: "vidskipti", label: "Viðskipti" },
  { id: "menning", label: "Menning" },
  { id: "skodun", label: "Skoðun" },
  { id: "taekni", label: "Tækni" },
  { id: "heilsa", label: "Heilsa" },
  { id: "umhverfi", label: "Umhverfi" },
  { id: "visindi", label: "Vísindi" },
  { id: "oflokkad", label: "Óflokkað" }
];

var VALID_CATEGORY_IDS = new Set(CATEGORY_MAP.map((c) => c.id));

function labelFor(id) {
  return CATEGORY_MAP.find((c) => c.id === id)?.label || "Óflokkað";
}
__name(labelFor, "labelFor");

/* =========================
   Feeds
   ========================= */

var FEEDS = {
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
      "https://www.visir.is/rss/allt"
    ]
  },
  ruv: { url: "https://www.ruv.is/rss/frettir", label: "RÚV" },
  dv: { url: "https://www.dv.is/feed/", label: "DV" },
  akureyri: { label: "Akureyri", url: ["https://www.akureyri.net/feed", "https://www.akureyri.is/feed.xml"] },
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
  }
};

var FORCE_INNLENT_IF_UNCLASSIFIED = new Set([
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

/* =========================
   Worker entry
   ========================= */

var worker_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

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

export { worker_default as default };

/* =========================
   Cron
   ========================= */

async function runCron(env, event) {
  const started = new Date().toISOString();
  console.log("🕒 runCron start", started, event?.cron);

  const cutoffDays = 31;
  const cutoffIso = new Date(Date.now() - cutoffDays * 24 * 60 * 60 * 1000).toISOString();

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

        // Default headers
        let headers = {
          "User-Agent": "is.is news cron",
          "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
          "Accept-Language": "is,is-IS;q=0.9,en;q=0.7"
        };

        if (state?.etag) headers["If-None-Match"] = state.etag;
        if (state?.last_modified) headers["If-Modified-Since"] = state.last_modified;

        let res = await fetch(feedUrl, { headers });

        // Some sites block CF worker UA and/or conditional headers → try a browser-ish fallback
        if (res.status === 403) {
          headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
            "Accept-Language": "is,is-IS;q=0.9,en;q=0.7"
          };
          res = await fetch(feedUrl, { headers });
        }

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

  console.log("✅ runCron done", { fetchedFeeds, http200, http304, inserted, skippedOld, errors });
}
__name(runCron, "runCron");

async function upsertFeedState(env, { feedUrl, sourceId, status, etag, lastModified, error }) {
  const now = new Date().toISOString();
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

/* =========================
   API
   ========================= */

async function handleNewsApi(request, env) {
  const { searchParams } = new URL(request.url);

  const sources = (searchParams.get("sources") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const catsParam = (searchParams.get("cats") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const limit = clampInt(searchParams.get("limit"), 1, 1200, 50);
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

  const payload = debug
    ? { items, availableCategories: [...availableSet], debug: { q, sources, cats: [...activeCats], limit } }
    : { items, availableCategories: [...availableSet] };

  return new Response(JSON.stringify(payload), withCors(request, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=60"
    }
  }));
}
__name(handleNewsApi, "handleNewsApi");

/* =========================
   Search index helpers
   ========================= */

function buildHaystack(title, description) {
  const t = normalizeText(title || "");
  const d = normalizeText(description || "");
  return `${t} ${d}`.trim();
}
__name(buildHaystack, "buildHaystack");

/* =========================
   RSS/Atom parsing helpers
   ========================= */

function canonicalizeUrl(u) {
  try {
    const url = new URL(String(u).trim());
    url.hash = "";

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

    const entries = [...url.searchParams.entries()].sort(
      (a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1])
    );

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

/* =========================
   Category inference
   ========================= */

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
  return noMarks
    .replaceAll("ð", "d")
    .replaceAll("þ", "th")
    .replaceAll("æ", "ae")
    .replaceAll("ö", "o");
}
__name(normalizeText, "normalizeText");

function inferCategory({ sourceId, url, rssCategories, rssCategoryText, title, description }) {
  const host = safeHost(url);

  // Source-specific heuristics FIRST (these were missing in your broken 600-line version)
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

function norm(s) {
  return String(s || "")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
__name(norm, "norm");

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
__name(extractFeedCategories, "extractFeedCategories");

function mapBbCategoryToBucket(feedCats) {
  const joined = norm(feedCats.join(" | "));
  if (!joined) return null;
  if (joined.includes("aðsendar greinar") || joined.includes("adsendar greinar")) return "skodun";
  if (joined.includes("menning")) return "menning";
  if (joined.includes("samgöngur") || joined.includes("samgongur")) return "innlent";
  if (joined.includes("íþrótt") || joined.includes("ithrott")) return "ithrottir";
  if (joined.includes("vestfir")) return "innlent";
  return null;
}
__name(mapBbCategoryToBucket, "mapBbCategoryToBucket");

function mapNutiminnCategoryToBucket(feedCats) {
  const joined = norm(feedCats.join(" | "));
  if (!joined) return null;
  if (joined.includes("aðsendar") || joined.includes("adsendar")) return "skodun";
  if (joined.includes("brotkast")) return "menning";
  if (joined.includes("fréttir") || joined.includes("frettir")) return "innlent";
  if (joined.includes("forsíða") || joined.includes("forsida")) return null;
  if (joined.includes("í fókus") || joined.includes("i fokus")) return "menning";
  if (joined.includes("íþrótt") || joined.includes("ithrott")) return "ithrottir";
  return null;
}
__name(mapNutiminnCategoryToBucket, "mapNutiminnCategoryToBucket");

function mapBblUrlToBucket(uNorm) {
  if (!uNorm) return null;
  if (uNorm.includes("/skodun/")) return "skodun";
  if (uNorm.includes("/folk/")) return "menning";
  if (uNorm.includes("/frettir/")) return "innlent";
  return null;
}
__name(mapBblUrlToBucket, "mapBblUrlToBucket");

function classifyWithSourceHints({ host, url, title, description, item }) {
  const h = norm(host);
  const u = norm(url);
  const t = norm(title);
  const d = norm(description);

  const feedCats = extractFeedCategories(item);
  const fcNorm = norm(feedCats.join(" | "));

  if (h === "bb.is" || h.endsWith(".bb.is")) {
    const bb = mapBbCategoryToBucket(feedCats);
    if (bb) return bb;
    if (t.includes(" skrifar") || (t.includes("|") && t.includes("skrifar"))) return "skodun";
    return null;
  }

  if (h === "www.nutiminn.is" || h === "nutiminn.is" || h.endsWith(".nutiminn.is")) {
    const nm = mapNutiminnCategoryToBucket(feedCats);
    if (nm) return nm;
    if (fcNorm.includes("aðsendar") || fcNorm.includes("adsendar")) return "skodun";
    if (t.includes(" pistill") || t.includes(" leiðari") || t.includes(" leidari") || t.includes(" skrifar")) return "skodun";
    return null;
  }

  if (h === "www.bbl.is" || h === "bbl.is" || h.endsWith(".bbl.is")) {
    const byUrl = mapBblUrlToBucket(u);
    if (byUrl) return byUrl;
    if (fcNorm.includes("skodun")) return "skodun";
    if (fcNorm.includes("folk")) return "menning";
    if (fcNorm.includes("frettir")) return "innlent";
    return null;
  }

  if (h === "heimildin.is" || h.endsWith(".heimildin.is") || h === "stundin.is" || h.endsWith(".stundin.is")) {
    if (t.includes(" skrifar") || t.includes(" pistill") || t.includes(" leiðari") || t.includes(" leidari")) return "skodun";
    if (d.includes(" kemur fram í pistli") || d.includes(" skrifar") || d.includes(" leiðari") || d.includes(" leidari")) return "skodun";
    if (t.includes("kvikmynd") || t.includes("leikhús") || t.includes("leikhus") || t.includes("listasafn") || t.includes("menning")) return "menning";
    if (t.includes("vísind") || t.includes("visind") || t.includes("rannsókn") || t.includes("rannsokn") || t.includes("geim")) return "visindi";
    if (t.includes("loftslag") || t.includes("mengun") || t.includes("náttúru") || t.includes("natturu") || t.includes("umhverf")) return "umhverfi";
    return null;
  }

  if (h === "feykir.is" || h.endsWith(".feykir.is")) {
    if (t.includes(" skrifar") || (t.includes("|") && t.includes("skrifar"))) return "skodun";

    if (
      t.includes("knattspyrn") || t.includes("körfu") || t.includes("korfu") || t.includes("bónus deild") || t.includes("bonus deild") ||
      t.includes("leikur") || t.includes("jafntefli") || t.includes("sigur") ||
      d.includes("knattspyrn") || d.includes("körfu") || d.includes("korfu") || d.includes("bónus deild") || d.includes("bonus deild")
    ) return "ithrottir";

    if (t.includes("matgæð") || t.includes("matgaed") || t.includes("uppskrift") || t.includes("mælir með") || t.includes("maelir med") || d.includes("uppskrift"))
      return "menning";

    if (t.includes("byggðalín") || t.includes("byggdalin") || t.includes("landsnet") || t.includes("raforku") || t.includes("flutningskerfi"))
      return "innlent";

    if (t.includes("sjókvía") || t.includes("sjokvia") || t.includes("lagareldi") || t.includes("eldis") || d.includes("sjókvía") || d.includes("sjokvia"))
      return "umhverfi";

    return null;
  }

  return null;
}
__name(classifyWithSourceHints, "classifyWithSourceHints");

function mapFromRssCategories(sourceId, termsNorm, joinedNorm) {
  if ((!termsNorm || termsNorm.length === 0) && !joinedNorm) return null;

  const bySource = mapFromRssCategoriesBySource(sourceId, termsNorm, joinedNorm);
  if (bySource) return bySource;

  const generic = mapFromText(termsNorm.join(" ")) || mapFromText(joinedNorm);
  return generic || null;
}
__name(mapFromRssCategories, "mapFromRssCategories");

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
__name(mapFromRssCategoriesBySource, "mapFromRssCategoriesBySource");

function mapFromText(x) {
  if (!x) return null;

  const sportWords = [
    "sport","ithrott","fotbolta","fotbolti","handbolti","nba","korfubolti","tennis",
    "motorsport","formula","ufc","olymp","olympi","marathon","darts","hnefaleik",
    "breidablik","valur","tindastoll","chess","nfl","premier league","champions league",
    "europa league","enska urvalsdeild","enskar urvalsdeild","enski boltinn","enskur boltinn",
    "ronaldo","messi","mourinho","guardiola","klopp","arsenal","man city","manchester city",
    "man utd","manchester united","liverpool","chelsea","tottenham","barcelona","real madrid",
    "atletico","psg","bayern","dortmund","juventus","milan","inter","433","4-3-3","4 3 3"
  ];

  const bizWords = ["vidskip","business","markad","fjarmal","kaupholl","verdbref","gengi","vext","hagkerfi","verdbolga"];

  const cultureWords = [
    "menning","folk","lifid","list","tonlist","kvikmynd","bok","leikhus","sjonvarp","utvarp",
    "svidslist","matur","kokte","smartland","samkvaem","daisy","tipsy","tattuin","tattoo",
    "stjarna","model","fegurd","afthrey"
  ];

  const opinionWords = ["skodun","comment","pistill","leidari","grein","ummal","dalkur","kronika","nedanmals","adsendar","aðsendar"];

  const foreignWords = [
    "erlent","foreign","bandarisk","usa","iran","italia","evropa","world","alheim","althjod",
    "trump","musk","russland","kina","japan","ukraina","bresk","bandarikin","epstein"
  ];

  const localWords = [
    "innlent","island","reykjavik","hafnarfjord","akureyri","reykjanes","kopavog","laugarvatn",
    "vestmannaeyj","landsbank","hs ork","logregl","rettar","daemd","dom","handtek","sakfelld"
  ];

  const techWords = ["taekni","tolva","forrit","forritun","gervigreind","ai","netoryggi","oryggi","snjallsimi","apple","google","microsoft","raf"];

  const healthWords = ["heilsa","laekn","sjuk","sjukdom","lyf","spitali","naering","smit","veira"];

  const envWords = ["umhverfi","loftslag","mengun","natur","jokull","eldgos","skjalfti","vedur","haf","fisk","skograekt","fornleif"];

  const sciWords = ["visindi","rannsokn","geim","edlis","efna","liffraedi","stjornufraedi","stjornukerfi","tungl","sol"];

  if (sportWords.some((w) => x.includes(w))) return "ithrottir";
  if (bizWords.some((w) => x.includes(w))) return "vidskipti";
  if (cultureWords.some((w) => x.includes(w))) return "menning";
  if (opinionWords.some((w) => x.includes(w))) return "skodun";
  if (techWords.some((w) => x.includes(w))) return "taekni";
  if (healthWords.some((w) => x.includes(w))) return "heilsa";
  if (envWords.some((w) => x.includes(w))) return "umhverfi";
  if (sciWords.some((w) => x.includes(w))) return "visindi";
  if (foreignWords.some((w) => x.includes(w))) return "erlent";
  if (localWords.some((w) => x.includes(w))) return "innlent";

  return null;
}
__name(mapFromText, "mapFromText");

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
      if (t.includes("ronaldo") || t.includes("messi") || t.includes("mourinho") || t.includes("arsenal") || t.includes("man city") || t.includes("premier") || t.includes("olymp") || t.includes("darts") || t.includes("undanurslit")) return "ithrottir";
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
__name(mapFromUrl, "mapFromUrl");
