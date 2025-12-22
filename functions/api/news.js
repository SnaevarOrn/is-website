export async function onRequestGet({ request }) {
  const { searchParams } = new URL(request.url);

  const sources = (searchParams.get("sources") || "").split(",").filter(Boolean);
  const limit = Number(searchParams.get("limit") || 50);

  const feeds = {
    ruv:  { url: "https://www.ruv.is/rss/frettir", label: "RÚV" },
    mbl:  { url: "https://www.mbl.is/feeds/fp/", label: "mbl.is" },
    visir:{ url: "https://www.visir.is/rss/allt", label: "Vísir" },
    dv:   { url: "https://www.dv.is/feed/", label: "DV" },
  };

  const active = sources.length ? sources : Object.keys(feeds);

  const items = [];

  for (const id of active) {
    const feed = feeds[id];
    if (!feed) continue;

    try {
      const res = await fetch(feed.url, {
        headers: { "User-Agent": "is.is news bot" }
      });

      const xml = await res.text();
      const matches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];

      for (const m of matches) {
        const block = m[1];

        const title = extract(block, "title");
        const link = extract(block, "link");
        const pubDate = extract(block, "pubDate");

        if (!title || !link) continue;

        items.push({
          title,
          url: link,
          publishedAt: pubDate ? new Date(pubDate).toISOString() : null,
          sourceId: id,
          sourceLabel: feed.label,
          category: "Óflokkað"
        });
      }
    } catch (err) {
      console.error("Feed error:", id, err);
    }
  }

  items.sort((a, b) => {
    return new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
  });

  return new Response(
    JSON.stringify({ items: items.slice(0, limit) }),
    {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=300"
      }
    }
  );
}

function extract(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}>(<!\\[CDATA\\[)?([\\s\\S]*?)(\\]\\]>)?<\\/${tag}>`));
  return m ? m[2].trim() : null;
}
