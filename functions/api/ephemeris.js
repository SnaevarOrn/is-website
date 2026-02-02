// /functions/api/ephemeris.js
// Horizons proxy for ís.is (Cloudflare Pages Functions)
//
// GET /api/ephemeris?start=YYYY-MM-DD&days=365&step=1d&bodies=earth,mars,venus
// Returns heliocentric ecliptic positions (AU) for each body per day.
//
// Data source: NASA/JPL SSD Horizons API
// Docs: https://ssd-api.jpl.nasa.gov/doc/horizons.html

export async function onRequestGet({ request }) {
  try {
    const url = new URL(request.url);

    const start = (url.searchParams.get("start") || new Date().toISOString().slice(0, 10)).trim();
    const days  = clampInt(url.searchParams.get("days"), 1, 1461, 365); // up to 4 years
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

    const end = addDaysISO(start, days - 1);

    const out = {
      ok: true,
      source: "nasa-jpl-horizons",
      frame: "heliocentric-ecliptic-j2000-ish",
      units: "AU",
      start,
      end,
      step,
      count: days,
      dates: Array.from({ length: days }, (_, i) => addDaysISO(start, i)),
      series: {}
    };

    const results = await Promise.all(bodyList.map(async (id) => {
      const cmd = HMAP[id];
      if (!cmd) return { id, ok:false, error:`óþekktur body: ${id}` };

      const res = await fetchHorizonsVectors({
        command: cmd,
        center: "500@10", // Sun-centered
        start,
        stop: end,
        step,
      });

      if (!res.ok) return { id, ok:false, error: res.error, debug: res.debug };

      // Trim to exactly "days" samples (we may have forced stop+1d for Horizons)
      const points = res.points.slice(0, days);
      return { id, ok:true, points };
    }));

    for (const r of results) {
      if (!r.ok) return json({ ok:false, error:r.error, debug:r.debug, body:r.id }, 400);
      out.series[r.id] = r.points.map(p => ({ x: p.x, y: p.y }));
    }

    return json(out, 200, {
      "Cache-Control": "public, max-age=3600, s-maxage=21600"
    });

  } catch (err) {
    return json({ ok:false, error: String(err?.message || err) }, 500);
  }
}

// ---- Horizons fetch + parse ----
// We use Horizons API and parse the $$SOE ... $$EOE block (CSV_FORMAT=YES).
async function fetchHorizonsVectors({ command, center, start, stop, step }) {
  const base = "https://ssd.jpl.nasa.gov/api/horizons.api";

  // Horizons requires STOP_TIME strictly later than START_TIME
  const startT = `${start} 00:00`;
  let stopDate = stop;
  if (stop === start) stopDate = addDaysISO(stop, 1);
  const stopT = `${stopDate} 00:00`;

  // Make STEP more Horizons-friendly: "1 d" instead of "1d"
  const stepSafe = /^\d+\s*d$/i.test(step) ? step.replace(/d/i, " d") : step;

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

    // Horizons wants these quoted (control-file style)
    CENTER: `'${center}'`,
    COMMAND: `'${command}'`,
    START_TIME: `'${startT}'`,
    STOP_TIME: `'${stopT}'`,
    STEP_SIZE: `'${stepSafe}'`,
  });

  const u = `${base}?${params.toString()}`;
  const resp = await fetch(u, { headers: { "User-Agent": "is.is-solar/1.0" } });
  const raw = await resp.text();

  if (!resp.ok) {
    return { ok: false, error: `Horizons HTTP ${resp.status}`, debug: raw.slice(0, 1200) };
  }

  let j;
  try {
    j = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Horizons svar var ekki JSON", debug: raw.slice(0, 1200) };
  }

  const text = (j && typeof j.result === "string") ? j.result : "";
  const i0 = text.indexOf("$$SOE");
  const i1 = text.indexOf("$$EOE");

  if (i0 === -1 || i1 === -1 || i1 <= i0) {
    const snippet = text ? text.slice(0, 1200) : raw.slice(0, 1200);
    return { ok: false, error: "Vantar $$SOE/$$EOE í Horizons result", debug: snippet };
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
    return { ok: false, error: "Engin punktar parse-uðust", debug: block.slice(0, 1200) };
  }

  return { ok: true, points };
}

// ---- utilities ----
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
  return d.toISOString().slice(0, 10);
}
