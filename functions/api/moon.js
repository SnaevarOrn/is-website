// /functions/api/moon.js
// GET /api/moon?start=YYYY-MM-DD&days=365&step=1d
// Returns geocentric Moon vector (AU), 2D in ecliptic plane.

export async function onRequestGet({ request, ctx }) {
  try {
    const url = new URL(request.url);

    const start = (url.searchParams.get("start") || new Date().toISOString().slice(0,10)).trim();
    const days  = clampInt(url.searchParams.get("days"), 1, 1461, 90);
    const step  = (url.searchParams.get("step") || "1d").trim();
    const stop  = addDaysISO(start, days - 1);

    const cacheKey = new Request(
      `${url.origin}/__cache__/moon?start=${encodeURIComponent(start)}&days=${days}&step=${encodeURIComponent(step)}`,
      { method: "GET" }
    );

    const cache = caches.default;
    const cached = await cache.match(cacheKey);
    if (cached) {
      ctx.waitUntil(refreshMoon(cacheKey, { start, stop, step }, cache));
      return withHeaders(cached, {
        "x-cache": "HIT",
        "Cache-Control": "public, max-age=60, s-maxage=21600, stale-while-revalidate=86400",
      });
    }

    const res = await fetchHorizonsVectors({
      command: "301",     // Moon
      center: "500@399",  // Earth-centered
      start,
      stop,
      step,
    });

    if (!res.ok) return json({ ok:false, error:res.error, debug: res.debug }, 503);

    const out = {
      ok: true,
      source: "nasa-jpl-horizons",
      frame: "geocentric-ecliptic",
      units: "AU",
      start,
      end: stop,
      step,
      count: res.points.length,
      series: {
        moon: res.points.map(p => ({ x:p.x, y:p.y }))
      }
    };

    const resp = json(out, 200, {
      "Cache-Control": "public, max-age=60, s-maxage=21600, stale-while-revalidate=86400",
      "x-cache": "MISS",
    });

    ctx.waitUntil(cache.put(cacheKey, resp.clone()));
    return resp;

  } catch (err) {
    return json({ ok:false, error:String(err?.message || err) }, 500);
  }
}

async function refreshMoon(cacheKey, { start, stop, step }, cache) {
  try {
    const res = await fetchHorizonsVectors({
      command: "301",
      center: "500@399",
      start,
      stop,
      step,
    });
    if (!res.ok) return;

    const out = {
      ok: true,
      source: "nasa-jpl-horizons",
      frame: "geocentric-ecliptic",
      units: "AU",
      start,
      end: stop,
      step,
      count: res.points.length,
      series: { moon: res.points.map(p => ({ x:p.x, y:p.y })) }
    };

    await cache.put(cacheKey, json(out, 200, {
      "Cache-Control": "public, max-age=60, s-maxage=21600, stale-while-revalidate=86400",
      "x-cache": "REFRESH",
    }));
  } catch {
    // ignore
  }
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

    CENTER: `'${center}'`,
    COMMAND: `'${command}'`,
    START_TIME: `'${start} 00:00'`,
    STOP_TIME:  `'${stop} 00:00'`,
    STEP_SIZE:  `'${step}'`,
  });

  const u = `${base}?${params.toString()}`;

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
        if ([429, 500, 502, 503, 504].includes(resp.status)) {
          lastErr = { ok:false, error:`Horizons HTTP ${resp.status}`, debug: raw.slice(0, 900) };
          continue;
        }
        return { ok:false, error:`Horizons HTTP ${resp.status}`, debug: raw.slice(0, 900) };
      }

      let j;
      try { j = JSON.parse(raw); }
      catch {
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