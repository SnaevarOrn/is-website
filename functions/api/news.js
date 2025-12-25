// /functions/api/news.js
export async function onRequestGet({ request }) {
  const { searchParams } = new URL(request.url);

  const sources = (searchParams.get("sources") || "").split(",").filter(Boolean);
  const catsParam = (searchParams.get("cats") || "").split(",").filter(Boolean);
  const limit = Number(searchParams.get("limit") || 50);

  // Debug: ?debug=1 (or true)
  const debugOn = ["1", "true", "yes", "on"].includes((searchParams.get("debug") || "").toLowerCase());

  // How many evidence samples to include
  const EVIDENCE_LIMIT = 40;

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
  const activeCats = new Set(catsParam.length ? catsParam : []); // empty => no filtering

  const items = [];

  // ---------- Debug counters ----------
  const dbg = debugOn ? {
    activeSources,
    activeCats: [...activeCats],
    totals: {
      fetchedFeeds: 0,
      feedHttpErrors: 0,
      feedParseErrors: 0,
      itemsParsed: 0,
      itemsKept: 0,
      itemsFilteredByCat: 0
    },
    bySource: {},          // id -> {ok, httpErr, itemsParsed, kept}
    byCategory: {},        // catId -> count
    decision: {            // why did we classify as X
      fromRss: 0,
      fromTitle: 0,
      fromUrl: 0,
      fallbackOflokkad: 0
    },

    // Evidence: shows which rule actually triggered (sampled)
    evidenceSamples: [],   // [{sourceId, categoryId, reason, match, where, url, rssCategoryText, title}]

    // Focused: examples that ended up as "oflokkad"
    oflokkadExamples: []   // sample rows
  } : null;

  const bump = (obj, key, n = 1) => { obj[key] = (obj[key] || 0) + n; };

  for (const id of activeSources) {
    const feed = feeds[id];
    if (!feed) continue;

    if (dbg) dbg.bySource[id] = dbg.bySource[id] || { ok: 0, httpErr: 0, itemsParsed: 0, kept: 0 };

    try {
      const res = await fetch(feed.url, {
        headers: { "User-Agent": "is.is news bot" }
      });

      if (dbg) dbg.totals.fetchedFeeds++;

      if (!res.ok) {
        console.error("Feed HTTP error:", id, res.status);
        if (dbg) {
          dbg.totals.feedHttpErrors++;
          dbg.bySource[id].httpErr++;
        }
        continue;
      }

      if (dbg) dbg.bySource[id].ok++;

      const xml = await res.text();
      const matches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];

      for (const m of matches) {
        const block = m[1];

        const title = extract(block, "title");
        const link = extract(block, "link");
        const pubDate = extract(block, "pubDate");

        if (!title || !link) continue;

        if (dbg) {
          dbg.totals.itemsParsed++;
          dbg.bySource[id].itemsParsed++;
        }

        const rssCats = extractAll(block, "category");
        const rssCatText = (rssCats[0] || "").trim();

        const inferred = inferCategoryDebug({
          sourceId: id,
          url: link,
          rssCategoryText: rssCatText,
          title
        });

        // Debug bookkeeping
        if (dbg) {
          bump(dbg.byCategory, inferred.categoryId);
          bump(dbg.decision, inferred.reasonKey);

          // Evidence sampling (keep small)
          if (dbg.evidenceSamples.length < EVIDENCE_LIMIT) {
            dbg.evidenceSamples.push({
              sourceId: id,
              categoryId: inferred.categoryId,
              reason: inferred.reasonKey,
              where: inferred.evidence?.where || null,      // "rss" | "title" | "url"
              match: inferred.evidence?.match || null,      // substring/rule id
              url: link,
              rssCategoryText: rssCatText || null,
              title: String(title).slice(0, 140)
            });
          }

          if (inferred.categoryId === "oflokkad" && dbg.oflokkadExamples.length < 40) {
            dbg.oflokkadExamples.push({
              sourceId: id,
              title: String(title).slice(0, 140),
              url: link,
              rssCategoryText: rssCatText || null
            });
          }
        }

        if (activeCats.size > 0 && !activeCats.has(inferred.categoryId)) {
          if (dbg) dbg.totals.itemsFilteredByCat++;
          continue;
        }

        items.push({
          title,
          url: link,
          publishedAt: pubDate ? new Date(pubDate).toISOString() : null,
          sourceId: id,
          sourceLabel: feed.label,
          categoryId: inferred.categoryId,
          category: inferred.categoryLabel
        });

        if (dbg) {
          dbg.totals.itemsKept++;
          dbg.bySource[id].kept++;
        }
      }
    } catch (err) {
      console.error("Feed error:", id, err);
      if (dbg) dbg.totals.feedParseErrors++;
    }
  }

  items.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));

  const sliced = items.slice(0, limit);
  const availableCategories = [...new Set(sliced.map(x => x.categoryId).filter(Boolean))];

  const payload = debugOn
    ? { items: sliced, availableCategories, debug: dbg }
    : { items: sliced, availableCategories };

  return new Response(JSON.stringify(payload), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300"
    }
  });
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
  { id: "oflokkad",  label: "Óflokkað" },
];

function labelFor(id) {
  return (CATEGORY_MAP.find(c => c.id === id)?.label) || "Óflokkað";
}

function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .replaceAll("í", "i")
    .replaceAll("ð", "d")
    .replaceAll("þ", "th")
    .replaceAll("æ", "ae")
    .replaceAll("ö", "o");
}

/**
 * Returns {categoryId, categoryLabel, reasonKey, evidence}
 * evidence = { where: "rss"|"title"|"url", match: "<rule/substr>", detail?: string }
 */
function inferCategoryDebug({ sourceId, url, rssCategoryText, title }) {
  const u = normalizeText(url);
  const c = normalizeText(rssCategoryText);
  const t = normalizeText(title);

  const rssHit = mapFromTextWithEvidence(c);
  const titleHit = rssHit ? null : mapFromTextWithEvidence(t);
  const urlHit = mapFromUrlWithEvidence(sourceId, u);

  const chosen = (rssHit?.id) || (titleHit?.id) || (urlHit?.id) || "oflokkad";

  let reasonKey = "fallbackOflokkad";
  let evidence = null;

  if (rssHit?.id) {
    reasonKey = "fromRss";
    evidence = { where: "rss", match: rssHit.match };
  } else if (titleHit?.id) {
    reasonKey = "fromTitle";
    evidence = { where: "title", match: titleHit.match };
  } else if (urlHit?.id) {
    reasonKey = "fromUrl";
    evidence = { where: "url", match: urlHit.match };
  } else {
    reasonKey = "fallbackOflokkad";
    evidence = { where: null, match: null };
  }

  return { categoryId: chosen, categoryLabel: labelFor(chosen), reasonKey, evidence };
}

// ---- Evidence helpers ----

function mapFromTextWithEvidence(x) {
  if (!x) return null;
  // Keep these in a clear order
  if (x.includes("sport")) return { id: "ithrottir", match: "text:sport" };
  if (x.includes("ithrott")) return { id: "ithrottir", match: "text:ithrott" };

  if (x.includes("vidskip")) return { id: "vidskipti", match: "text:vidskip" };
  if (x.includes("business")) return { id: "vidskipti", match: "text:business" };
  if (x.includes("markad")) return { id: "vidskipti", match: "text:markad" };

  if (x.includes("menning")) return { id: "menning", match: "text:menning" };
  if (x.includes("lifid")) return { id: "menning", match: "text:lifid" };
  if (x.includes("list")) return { id: "menning", match: "text:list" };

  if (x.includes("skodun")) return { id: "skodun", match: "text:skodun" };
  if (x.includes("comment")) return { id: "skodun", match: "text:comment" };
  if (x.includes("pistill")) return { id: "skodun", match: "text:pistill" };

  if (x.includes("erlent")) return { id: "erlent", match: "text:erlent" };
  if (x.includes("foreign")) return { id: "erlent", match: "text:foreign" };

  if (x.includes("innlent")) return { id: "innlent", match: "text:innlent" };
  if (x.includes("island")) return { id: "innlent", match: "text:island" };

  return null;
}

function mapFromUrlWithEvidence(sourceId, u) {
  // Generic patterns
  if (u.includes("/sport")) return { id: "ithrottir", match: "url:/sport" };
  if (u.includes("/ithrott")) return { id: "ithrottir", match: "url:/ithrott" };

  if (u.includes("/vidskip")) return { id: "vidskipti", match: "url:/vidskip" };
  if (u.includes("/business")) return { id: "vidskipti", match: "url:/business" };
  if (u.includes("/markad")) return { id: "vidskipti", match: "url:/markad" };

  if (u.includes("/menning")) return { id: "menning", match: "url:/menning" };
  if (u.includes("/lifid")) return { id: "menning", match: "url:/lifid" };
  if (u.includes("/list")) return { id: "menning", match: "url:/list" };

  if (u.includes("/skodun")) return { id: "skodun", match: "url:/skodun" };
  if (u.includes("/pistill")) return { id: "skodun", match: "url:/pistill" };
  if (u.includes("/comment")) return { id: "skodun", match: "url:/comment" };

  if (u.includes("/erlent")) return { id: "erlent", match: "url:/erlent" };
  if (u.includes("/innlent")) return { id: "innlent", match: "url:/innlent" };

  // Source-specific tweaks (same logic, just with evidence tags)
  if (sourceId === "ruv") {
    if (u.includes("/ithrottir")) return { id: "ithrottir", match: "ruv:/ithrottir" };
    if (u.includes("/vidskipti")) return { id: "vidskipti", match: "ruv:/vidskipti" };
    if (u.includes("/menning")) return { id: "menning", match: "ruv:/menning" };
    if (u.includes("/erlent")) return { id: "erlent", match: "ruv:/erlent" };
    if (u.includes("/innlent")) return { id: "innlent", match: "ruv:/innlent" };
  }

  if (sourceId === "mbl") {
    if (u.includes("/sport")) return { id: "ithrottir", match: "mbl:/sport" };
    if (u.includes("/vidskipti")) return { id: "vidskipti", match: "mbl:/vidskipti" };
    if (u.includes("/frettir/innlent")) return { id: "innlent", match: "mbl:/frettir/innlent" };
    if (u.includes("/frettir/erlent")) return { id: "erlent", match: "mbl:/frettir/erlent" };
  }

  if (sourceId === "visir") {
    if (u.includes("/sport")) return { id: "ithrottir", match: "visir:/sport" };
    if (u.includes("/vidskipti")) return { id: "vidskipti", match: "visir:/vidskipti" };
    if (u.includes("/frettir/innlent")) return { id: "innlent", match: "visir:/frettir/innlent" };
    if (u.includes("/frettir/erlent")) return { id: "erlent", match: "visir:/frettir/erlent" };
  }

  if (sourceId === "dv") {
    if (u.includes("/sport")) return { id: "ithrottir", match: "dv:/sport" };
    if (u.includes("/vidskipti")) return { id: "vidskipti", match: "dv:/vidskipti" };
    if (u.includes("/frettir")) return { id: "innlent", match: "dv:/frettir" };
  }

  if (sourceId === "vb") {
    if (u.includes("/sport")) return { id: "ithrottir", match: "vb:/sport" };
    if (u.includes("/vidskipti") || u.includes("/markad")) return { id: "vidskipti", match: u.includes("/vidskipti") ? "vb:/vidskipti" : "vb:/markad" };
    if (u.includes("/menning") || u.includes("/lifid")) return { id: "menning", match: u.includes("/menning") ? "vb:/menning" : "vb:/lifid" };
    if (u.includes("/pistill") || u.includes("/skodun")) return { id: "skodun", match: u.includes("/pistill") ? "vb:/pistill" : "vb:/skodun" };
    if (u.includes("/erlent")) return { id: "erlent", match: "vb:/erlent" };
    if (u.includes("/innlent")) return { id: "innlent", match: "vb:/innlent" };
  }

  return null;
}