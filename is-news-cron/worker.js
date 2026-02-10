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
      "https://www.mbl.is/feeds/200milur/",
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

    // Manual trigger (nice for debugging)
    if (url.pathname === "/run") {
      ctx.waitUntil(runCron(env, { cron: "manual:/run" }));
      return new Response("ok");
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
  const cutoffIso = new Date(Date.now() - cutoffDays * 86400000).toISOString();

  let fetchedFeeds = 0, http304 = 0, http200 = 0, inserted = 0, skippedOld = 0, errors = 0, parsedItems = 0;

  for (const sourceId of Object.keys(FEEDS)) {
    const feed = FEEDS[sourceId];
    const urls = Array.isArray(feed.url) ? feed.url : [feed.url];

    for (const feedUrl of urls) {
      fetchedFeeds++;

      try {
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
          await upsertFeedState(env, { feedUrl, sourceId, status: res.status, lastError: `HTTP ${res.status}` });
          continue;
        }

        http200++;

        await upsertFeedState(env, {
          feedUrl,
          sourceId,
          status: res.status,
          etag: res.headers.get("etag"),
          lastModified: res.headers.get("last-modified"),
          lastError: null,
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

          let { categoryId } = inferCategory({
            sourceId,
            url: linkRaw,
            rssCategories: rssCats,
            rssCategoryText: catText,
            title,
            description
          });

          if (sourceId === "visir" && categoryId === "oflokkad") {
            const hinted = visirCategoryFromFeedUrl(feedUrl);
            if (hinted) categoryId = hinted;
          }

          if (FORCE_INNLENT_IF_UNCLASSIFIED.has(sourceId) && categoryId === "oflokkad") {
            categoryId = "innlent";
          }

          const canonical = canonicalizeUrl(linkRaw);
          const urlNorm = canonical; // url_norm in DB is our canonical URL
          const fetchedAt = new Date().toISOString();

          parsedItems++;

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
            VALID_CATEGORY_IDS.has(categoryId) ? categoryId : "oflokkad",
            String(description || "").trim(),
            fetchedAt
          ).run();

          if (ins?.meta?.changes === 1) {
            inserted++;

            // update search index
            const row = await env.DB.prepare(
              "SELECT id FROM articles WHERE url_norm = ?"
            ).bind(urlNorm).first();

            if (row?.id) {
              const hay = buildHaystack({
                title,
                description,
                sourceLabel: feed.label || sourceId,
                categoryLabel: labelFor(categoryId),
                rssCats
              });

              await env.DB.prepare(`
                INSERT OR REPLACE INTO article_search (article_id, haystack)
                VALUES (?, ?)
              `).bind(Number(row.id), hay).run();
            }
          }
        }

      } catch (e) {
        errors++;
        console.error("Feed error:", sourceId, feedUrl, String(e?.message || e));
        await upsertFeedState(env, { feedUrl, sourceId, status: 0, lastError: String(e?.message || e) });
      }
    }
  }

  console.log("✅ runCron done", {
    fetchedFeeds, http200, http304, parsedItems, inserted, skippedOld, errors
  });
}

function buildHaystack({ title, description, sourceLabel, categoryLabel, rssCats }) {
  const parts = [
    String(title || ""),
    String(description || ""),
    String(sourceLabel || ""),
    String(categoryLabel || ""),
    ...(Array.isArray(rssCats) ? rssCats : [])
  ];
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

async function upsertFeedState(env, { feedUrl, sourceId, status, etag, lastModified, lastError }) {
  const now = new Date().toISOString();
  const okAt = (Number(status) >= 200 && Number(status) < 300) ? now : null;

  await env.DB.prepare(`
    INSERT INTO feeds
      (source_id, feed_url, etag, last_modified, last_polled_at, last_ok_at, last_status, last_error)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?)
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
    lastError || null
  ).run();
}

/* =========================
   API: read from D1 (+ LIKE search)
   ========================= */

async function handleNewsApi(request, env) {
  const { searchParams } = new URL(request.url);

  const sources = (searchParams.get("sources") || "").split(",").filter(Boolean);
  const catsParam = (searchParams.get("cats") || "").split(",").filter(Boolean);
  const limit = clampInt(searchParams.get("limit"), 1, 360, 50);
  const q = (searchParams.get("q") || "").trim();
  const debug = searchParams.get("debug") === "1";

  const activeSources = sources.length ? sources : [];
  const activeCats = new Set((catsParam.length ? catsParam : []).filter(id => VALID_CATEGORY_IDS.has(id)));

  const wh = [];
  const args = [];

  if (activeSources.length) {
    wh.push(`a.source_id IN (${activeSources.map(() => "?").join(",")})`);
    args.push(...activeSources);
  }
  if (activeCats.size) {
    const a = [...activeCats];
    wh.push(`a.category_id IN (${a.map(() => "?").join(",")})`);
    args.push(...a);
  }

  let rows = [];

  if (q) {
    wh.push(`s.haystack LIKE ?`);
    args.push(`%${q}%`);

    const where = wh.length ? `WHERE ${wh.join(" AND ")}` : "";
    const stmt = env.DB.prepare(`
      SELECT a.*
      FROM article_search s
      JOIN articles a ON a.id = s.article_id
      ${where}
      ORDER BY COALESCE(a.published_at, a.fetched_at) DESC
      LIMIT ?
    `);

    rows = (await stmt.bind(...args, limit).all()).results || [];
  } else {
    const where = wh.length ? `WHERE ${wh.join(" AND ")}` : "";
    const stmt = env.DB.prepare(`
      SELECT a.*
      FROM articles a
      ${where}
      ORDER BY COALESCE(a.published_at, a.fetched_at) DESC
      LIMIT ?
    `);

    rows = (await stmt.bind(...args, limit).all()).results || [];
  }

  const items = rows.map(r => ({
    title: r.title,
    url: r.url,
    publishedAt: r.published_at || null,
    sourceId: r.source_id,
    sourceLabel: r.source_label,
    categoryId: r.category_id,
    category: labelFor(r.category_id),
    fetchedAt: r.fetched_at
  }));

  const availableSet = new Set(items.map(x => x.categoryId).filter(Boolean));
  availableSet.add("oflokkad");

  const payload = debug
    ? { items, availableCategories: [...availableSet], debug: { q, sources: activeSources, cats: [...activeCats] } }
    : { items, availableCategories: [...availableSet] };

  return new Response(JSON.stringify(payload), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=60"
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

  const mHref = src.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  if (mHref?.[1]) return decodeEntities(mHref[1]).trim();

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
    .replaceAll("&nbsp;", " ");

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
   URL canonicalization
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

    const entries = [...url.searchParams.entries()].sort((a,b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
    url.search = "";
    for (const [k,v] of entries) url.searchParams.append(k, v);

    return url.toString();
  } catch {
    return String(u || "").trim();
  }
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
  if (u.includes("/rss/menning") || u.includes("/rss/lifid") || u.includes("/rss/tonlist") || u.includes("/rss/gagnryni")) return "menning";
  if (u.includes("/rss/skodun")) return "skodun";
  return null;
}

/* =========================
   Categorization (reuse your existing heuristics)
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
  const u = normalizeText(url);
  const t = normalizeText(title);
  const d = normalizeText(description);
  const rssNormJoined = normalizeText(rssCategoryText);

  const fromText = mapFromText(rssNormJoined) || mapFromText(t) || mapFromText(d);
  const fromUrl = mapFromUrl(sourceId, u, t);

  const categoryId = (fromUrl || fromText || "oflokkad");
  return { categoryId, categoryLabel: labelFor(categoryId), categoryFrom: fromUrl ? "url" : (fromText ? "keywords" : "default") };
}

function mapFromText(x) {
  if (!x) return null;

  const sportWords = ["sport","ithrott","fotbolta","fotbolti","handbolti","nba","korfubolti","tennis","ufc","olymp","marathon","darts","nfl","premier league","champions league","europa league"];
  const bizWords = ["vidskip","business","markad","fjarmal","kaupholl","verdbref","gengi","vext","hagkerfi","verdbolga"];
  const cultureWords = ["menning","folk","lifid","list","tonlist","kvikmynd","bok","leikhus","matur","smartland"];
  const opinionWords = ["skodun","comment","pistill","leidari","adsendar","aðsendar"];
  const techWords = ["taekni","tolva","forrit","forritun","gervigreind","ai","netoryggi","oryggi","snjallsimi","apple","google","microsoft"];
  const healthWords = ["heilsa","laekn","sjuk","sjukdom","lyf","spitali","naering","smit","veira"];
  const envWords = ["umhverfi","loftslag","mengun","natur","jokull","eldgos","skjalfti","vedur","haf"];
  const sciWords = ["visindi","rannsokn","geim","edlis","efna","liffraedi","stjornufraedi","tungl","sol"];
  const foreignWords = ["erlent","foreign","usa","iran","evropa","world","althjod","russland","kina","ukraina"];
  const localWords = ["innlent","island","reykjavik","hafnarfjord","akureyri","reykjanes","kopavog","logregl","rettar","dom"];

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

  // source-specific small hints
  if (sourceId === "dv") {
    if (u.includes("/pressan")) return "innlent";
    if (u.includes("/fokus")) return "menning";
    if (u.includes("433.is") || u.includes("/433") || u.includes("4-3-3")) return "ithrottir";
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

  return null;
}
