// /functions/api/moon.js
// GET /api/moon?start=YYYY-MM-DD&days=365&step=1d
// Returns geocentric (Earth-centered) Moon vector (AU), 2D in ecliptic plane for V1.

export async function onRequestGet({ request }) {
  try {
    const url = new URL(request.url);

    const start = (url.searchParams.get("start") || new Date().toISOString().slice(0,10)).trim();
    const days = clampInt(url.searchParams.get("days"), 1, 1461, 365);
    const step = (url.searchParams.get("step") || "1d").trim();
    const stop = addDaysISO(start, days - 1);

    const res = await fetchHorizonsVectors({
      command: "301",     // Moon
      center: "500@399",  // Earth-centered
      start,
      stop,
      step,
    });

    if (!res.ok) return json({ ok:false, error:res.error }, 500);

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

    return json(out, 200, {
      "Cache-Control": "public, max-age=3600, s-maxage=21600"
    });

  } catch (err) {
    return json({ ok:false, error:String(err?.message || err) }, 500);
  }
}

async function fetchHorizonsVectors({ command, center, start, stop, step }) {
  const base = "https://ssd.jpl.nasa.gov/api/horizons.api";

  const params = new URLSearchParams({
    format: "text",
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
    START_TIME: `'${start}'`,
    STOP_TIME: `'${stop}'`,
    STEP_SIZE: `'${step}'`,
  });

  const u = `${base}?${params.toString()}`;
  const resp = await fetch(u, { headers: { "User-Agent": "is.is-solar/1.0" } });
  if (!resp.ok) return { ok:false, error:`Horizons HTTP ${resp.status}` };

  const text = await resp.text();
  const i0 = text.indexOf("$$SOE");
  const i1 = text.indexOf("$$EOE");
  if (i0 === -1 || i1 === -1 || i1 <= i0) {
    return { ok:false, error:"Gat ekki lesið $$SOE/$$EOE úr Horizons svari" };
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

  if (!points.length) return { ok:false, error:"Engin punktar parse-uðust úr Horizons CSV" };
  return { ok:true, points };
}

function json(obj, status=200, headers={}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type":"application/json; charset=utf-8", ...headers }
  });
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
