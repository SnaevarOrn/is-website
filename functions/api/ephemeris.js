// /functions/api/ephemeris.js
// Horizons proxy for ís.is (Cloudflare Pages Functions)
//
// GET /api/ephemeris?start=YYYY-MM-DD&days=365&step=1d&bodies=earth,mars,venus
// Returns heliocentric ecliptic positions (AU) for each body.
//
// Hardening:
// - Serialize per-body calls (avoid burst)
// - Retry w/ backoff on 503/429/5xx
// - Cache last good response (serve stale on Horizons outage)

export async function onRequestGet({ request, ctx }) {
  try {
    const url = new URL(request.url);

    const start = (url.searchParams.get("start") || new Date().toISOString().slice(0,10)).trim();
    const days  = clampInt(url.searchParams.get("days"), 1, 1461, 90);
    const step  = (url.searchParams.get("step") || "1d").trim();
    const bodies = (url.searchParams.get("bodies") || "earth,mars,venus,mercury,jupiter,saturn").trim();

    const bodyList = bodies.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
    if (!bodyList.length) return json({ ok:false, error:"bodies vantar" }, 400);

    const HMAP = {
      mercury: "199",
      venus:   "299",
      earth:   "399",
      mars:    "499",
      jupiter: "599",
      saturn:  "699",
    };

    const stop = addDaysISO(start, days - 1);

    // ----- Cache key (include all inputs that affect output) -----
    const cacheKey = new Request(
      `${url.origin}/__cache__/ephemeris?start=${encodeURIComponent(start)}&days=${days}&step=${encodeURIComponent(step)}&bodies=${encodeURIComponent(bodyList.join(","))}`,
      { method: "GET" }
    );

    // Serve cached immediately if present
    const cache = caches.default;
    const cached = await cache.match(cacheKey);
    if (cached) {
      // fire-and-forget refresh (best effort)
      ctx.waitUntil(refreshEphemeris(cacheKey, { start, stop, step, days, bodyList, HMAP }, cache));
      return withHeaders(cached, {
        "x-cache": "HIT",
        "Cache-Control": "public, max-age=60, s-maxage=21600, stale-while-revalidate=86400",
      });
    }

    // No cache: build fresh (may still fail -> then return error)
    const fresh = await buildEphemeris({ start, stop, step, days, bodyList, HMAP });

    const resp = json(fresh, 200, {
      "Cache-Control": "public, max-age=60, s-maxage=21600, stale-while-revalidate=86400",
      "x-cache": "MISS",
    });

    ctx.waitUntil(cache.put(cacheKey, resp.clone()));
    return resp;

  } catch (err) {
    return json({ ok:false, error: String(err?.message || err) }, 500);
  }
}

async function refreshEphemeris(cacheKey, args, cache) {
  try {
    const fresh = await buildEphemeris(args);
    const resp = json(fresh, 200, {
      "Cache-Control": "public, max-age=60, s-maxage=21600, stale-while-revalidate=86400",
      "x-cache": "REFRESH",
    });
    await cache.put(cacheKey, resp);
  } catch {
    // ignore refresh failures; cached stays
  }
}

async function buildEphemeris({ start, stop, step, days, bodyList, HMAP }) {
  const out = {
    ok: true,
    source: "nasa-jpl-horizons",
    frame: "heliocentric-ecliptic-j2000-ish",
    units: "AU",
    start,
    end: stop,
    step,
    count: days,
    dates: Array.from({ length: days }, (_, i) => addDaysISO(start, i)),
    series: {}
  };

  // IMPORTANT: serialize requests to avoid burst 503
  for (const id of bodyList) {
    const cmd = HMAP[id];
    if (!cmd) return { ok:false, error:`óþekktur body: ${id}`, body: id };

    const res = await fetchHorizonsVectors({
      command: cmd,
      center: "500@10",   // Sun-centered
      start,
      stop,
      step,
    });

    if (!res.ok) {
      // if Horizons is down, propagate error (HTML/503 will be in debug)
      return { ok:false, error: res.error, debug: res.debug, body: id };
    }

    out.series[id] = res.points.map(p => ({ x:p.x, y:p.y }));
    // tiny delay to be polite
    await sleep(120);
  }

  return out;
}

// ---- Horizons fetch + parse ----
async function fetchHorizonsVectors({ command, center, start, stop, step }) {
  const base = "https://ssd.jpl.nasa.gov/api/horizons.api";

  const params = new URLSearchParams({
    format: "json",
    MAKE_EPHEM: "YES",
    TABLE_TYPE: "VEC",
    VEC_TABLE: "1",
    CSV_FORMAT: "YES",
    VEC_LABELS: "NO",
    OUT_UNITS: "AU-D",
    REF_PLANE: "ECLIPTIC",
    REF_SYSTEM: "ICRF",
    OBJ_DATA: "NO",

    // Quote values properly for Horizons
    CENTER: `'${center}'`,
    COMMAND: `'${command}'`,
    START_TIME: `'${start} 00:00'`,
    STOP_TIME:  `'${stop} 00:00'`,
    STEP_SIZE:  `'${step}'`,
  });

  const u = `${base}?${params.toString()}`;

  // retries on transient failures (503/429/5xx + network)
  const attempts = [
    { t: 0 },
    { t: 400 },
    { t: 1200 },
    { t: 2500 },
  ];

  let lastErr = null;

  for (const a of attempts) {
    if (a.t) await sleep(a.t);

    try {
      const resp = await fetchWithTimeout(u, {
        headers: { "User-Agent": "is.is-solar/1.1", "accept": "application/json" }
      }, 18000);

      const raw = await resp.text();

      if (!resp.ok) {
        // If Horizons returns HTML 503 page etc.
        // retry for transient codes
        if ([429, 500, 502, 503, 504].includes(resp.status)) {
          lastErr = { ok:false, error:`Horizons HTTP ${resp.status}`, debug: raw.slice(0, 900) };
          continue;
        }
        return { ok:false, error:`Horizons HTTP ${resp.status}`, debug: raw.slice(0, 900) };
      }

      let j;
      try { j = JSON.parse(raw); }
      catch {
        // Horizons sometimes returns HTML even when status=200 (rare)
        lastErr = { ok:false, error:"Horizons svar var ekki JSON", debug: raw.slice(0, 900) };
        continue;
      }

      const text = (j && typeof j.result === "string") ? j.result : "";
      const i0 = text.indexOf("$$SOE");
      const i1 = text.indexOf("$$EOE");
      if (i0 === -1 || i1 === -1 || i1 <= i0) {
        const snippet = text ? text.slice(0, 900) : raw.slice(0, 900);
        lastErr = { ok:false, error:"Vantar $$SOE/$$EOE í Horizons result", debug: snippet };
        continue;
      }

      const block = text.slice(i0 + 5, i1).trim();
      const lines = block.split("\n").map(l => l.trim()).filter(Boolean);

      const points = [];
      for (const line of lines) {
        const parts = line.split(",").map(s => s.trim());
        if (parts.length < 5) continue;
        const x = parseFloat(parts[2]);
        const y = parseFloat(parts[3]);
        const z = parseFloat(parts[4]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        points.push({ x, y, z });
      }

      if (!points.length) {
        lastErr = { ok:false, error:"Engin punktar parse-uðust", debug: block.slice(0, 900) };
        continue;
      }

      return { ok:true, points };

    } catch (e) {
      lastErr = { ok:false, error:"Horizons fetch mistókst", debug:String(e?.message || e).slice(0,900) };
      continue;
    }
  }

  return lastErr || { ok:false, error:"Horizons fetch mistókst", debug:"unknown" };
}

// ---- utilities ----
function json(obj, status=200, headers={}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type":"application/json; charset=utf-8", ...headers }
  });
}
function withHeaders(resp, headers={}) {
  const h = new Headers(resp.headers);
  for (const [k,v] of Object.entries(headers)) h.set(k, v);
  return new Response(resp.body, { status: resp.status, headers: h });
}
function clampInt(x, min, max, dflt) {
  const n = parseInt(String(x ?? ""), 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, n));
}
function addDaysISO(iso, add) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + add);
  return d.toISOString().slice(0,10);
}
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
async function fetchWithTimeout(url, init, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}