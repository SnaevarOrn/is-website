// /assets/js/gdelt.js
"use strict";

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let cooldownUntil = 0;
let inFlight = false;
let lastRun = null;

let map = null;
let mapLoadedFor = null;

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

function parseSeenDate(s) {
  if (!s) return "";
  // examples: 20260203T210000Z
  const m = String(s).match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}`;
  return String(s).slice(0, 19).replace("T", " ");
}

function setStatus(state, msg, meta = "") {
  $("badgeState").textContent = state;
  $("badgeMsg").textContent = msg;
  $("badgeMeta").textContent = meta || "—";
}

function setButton(label, enabled) {
  const b = $("go");
  b.textContent = label;
  b.disabled = !enabled;
}

async function enforceCooldown(ms) {
  const now = Date.now();
  cooldownUntil = Math.max(cooldownUntil, now + ms);

  while (Date.now() < cooldownUntil) {
    const left = Math.ceil((cooldownUntil - Date.now()) / 1000);
    setButton(`Bíða ${left}s`, false);
    setStatus("COOLDOWN", "Respecting upstream rate limit…", `retry in ${left}s`);
    await sleep(250);
  }
  setButton("Sækja", true);
}

async function apiGet(path, params) {
  // central fetch with nice error contract
  const qs = new URLSearchParams(params);
  const url = `${path}?${qs.toString()}`;

  const t0 = performance.now();
  const res = await fetch(url);
  const j = await res.json().catch(() => ({ ok: false, error: "Bad JSON from host" }));
  const ms = Math.round(performance.now() - t0);

  // Function always returns 200; inspect j.ok/j.status
  j._clientMs = ms;
  j._url = url;
  return j;
}

function kpiPill(k, v) {
  const el = document.createElement("span");
  el.className = "pill";
  el.innerHTML = `<span class="muted">${esc(k)}:</span> <span class="mono">${esc(v)}</span>`;
  return el;
}

function clearFeed() {
  $("cards").innerHTML = "";
}

function renderFeed(articles = []) {
  const host = $("cards");
  host.innerHTML = "";

  if (!articles.length) {
    host.innerHTML = `<div class="card"><div class="card-title">Engar niðurstöður</div><div class="card-meta">Prófaðu að breyta query eða lengja gluggann.</div></div>`;
    return;
  }

  for (const a of articles) {
    const title = a.title || "Untitled";
    const url = a.url || "";
    const dom = a.domain || "";
    const lang = a.language || a.sourcelang || "??";
    const src = a.sourcecountry || a.sourceCountry || "??";
    const dt = parseSeenDate(a.seendate || a.seenDate || a.datetime);

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="card-title">${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(title)}</a>` : esc(title)}</div>
      <div class="card-meta">
        <span>${esc(dt)}</span>
        <span>src: <span class="mono">${esc(src)}</span></span>
        <span>lang: <span class="mono">${esc(lang)}</span></span>
      </div>
      <div class="card-badges">
        ${dom ? `<span class="pill">${esc(dom)}</span>` : ""}
      </div>
    `;
    host.appendChild(card);
  }
}

function normalizeTimelineSeries(j) {
  // DOC timeline* responses come as:
  // data.timeline: [{ series, data: [{date,value,toparts?}, ...] }]
  const tl = j?.data?.timeline;
  if (!Array.isArray(tl) || !tl.length) return null;
  const first = tl[0];
  const arr = Array.isArray(first?.data) ? first.data : null;
  if (!arr) return null;
  return { series: first.series || "Series", points: arr.map(p => ({ date: p.date, value: Number(p.value), toparts: p.toparts || [] })) };
}

function avg(arr) {
  const xs = arr.filter(Number.isFinite);
  if (!xs.length) return NaN;
  return xs.reduce((s,x)=>s+x,0) / xs.length;
}

function trendArrow(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "↔";
  const d = b - a;
  if (Math.abs(d) < 0.01) return "↔";
  return d > 0 ? "↑" : "↓";
}

function drawChart(volumeSeries, toneSeries) {
  const canvas = $("chart");
  const ctx2 = canvas.getContext("2d");

  const w = canvas.width;
  const h = canvas.height;

  ctx2.clearRect(0, 0, w, h);

  // background grid
  ctx2.globalAlpha = 1;
  ctx2.lineWidth = 1;
  ctx2.strokeStyle = "rgba(255,255,255,.08)";
  for (let i=1;i<=4;i++){
    const y = (h*i)/5;
    ctx2.beginPath(); ctx2.moveTo(0,y); ctx2.lineTo(w,y); ctx2.stroke();
  }

  function plot(series, yMin, yMax, stroke) {
    const pts = series.points;
    const n = pts.length;
    if (n < 2) return;

    const xs = pts.map((_, i) => (i/(n-1))*(w-20)+10);
    const ys = pts.map((p, i) => {
      const v = p.value;
      const t = (v - yMin) / (yMax - yMin || 1);
      const y = (h-20) - t*(h-40) + 10;
      return Math.max(10, Math.min(h-10, y));
    });

    ctx2.strokeStyle = stroke;
    ctx2.lineWidth = 2;
    ctx2.beginPath();
    ctx2.moveTo(xs[0], ys[0]);
    for (let i=1;i<n;i++) ctx2.lineTo(xs[i], ys[i]);
    ctx2.stroke();

    // dots
    ctx2.fillStyle = stroke;
    for (let i=0;i<n;i++){
      ctx2.beginPath();
      ctx2.arc(xs[i], ys[i], 2.5, 0, Math.PI*2);
      ctx2.fill();
    }
  }

  // volume series (always)
  const volVals = volumeSeries?.points?.map(p=>p.value).filter(Number.isFinite) || [];
  const volMin = 0;
  const volMax = Math.max(0.05, ...volVals, 0.35);

  plot(volumeSeries, volMin, volMax, "rgba(255,255,255,.85)");

  // tone series (optional)
  if (toneSeries?.points?.length) {
    const tVals = toneSeries.points.map(p=>p.value).filter(Number.isFinite);
    const tMin = Math.min(-5, ...tVals, -1);
    const tMax = Math.max(5, ...tVals, 1);
    plot(toneSeries, tMin, tMax, "rgba(255,211,107,.95)");
  }

  // legend
  ctx2.fillStyle = "rgba(255,255,255,.85)";
  ctx2.font = "12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";
  ctx2.fillText("volume intensity", 12, 20);
  if (toneSeries?.points?.length) ctx2.fillText("avg tone", 12, 38);
}

function pickToneMode() {
  // Some installs use timelineavgtone, some timelineavgtoneinfo.
  // We'll try timelineavgtone first, then fallback.
  return ["timelineavgtone", "timelineavgtoneinfo"];
}

async function runIntel() {
  if (inFlight) return;
  inFlight = true;

  const q = $("q").value.trim();
  if (!q) {
    setStatus("IDLE", "Settu inn leitarstreng.", "");
    inFlight = false;
    return;
  }

  const recent = $("recent").value;
  const max = $("max").value;
  const sort = $("sort").value;

  clearFeed();
  $("kpis").innerHTML = "";

  setButton("Sæki…", false);
  setStatus("FETCH", "Contacting intel sources…", "step 1/3");

  // If last run was recent and same query, still allow - but keep cooldown anyway
  // (rate limiting is upstream/global)
  await enforceCooldown(0);

  // 1) timeline volume
  const vol = await apiGet("/api/GDELT", { q, recent, mode: "timelinevolinfo", format: "json", max: 50, sort });
  if (!vol.ok && vol.status === 429) {
    await enforceCooldown(vol.retryAfterMs || 5500);
    setButton("Sækja", true);
    setStatus("COMMS SATURATED", "Upstream throttling (429). Try again.", "");
    inFlight = false;
    return;
  }
  if (!vol.ok) {
    setButton("Sækja", true);
    setStatus("DEGRADED", vol.error || "Timeline fetch failed", `ms=${vol._clientMs}`);
    inFlight = false;
    return;
  }

  const volSeries = normalizeTimelineSeries(vol);
  const volPts = volSeries?.points || [];
  const volAvg = avg(volPts.map(p=>p.value));
  const volLast = volPts.length ? volPts[volPts.length-1].value : NaN;
  const volPrev = volPts.length > 1 ? volPts[volPts.length-2].value : NaN;

  // enforce 5s spacing between upstream calls (extra safe)
  await enforceCooldown(5200);

  // 2) tone timeline (optional; may not exist)
  setStatus("FETCH", "Scanning narrative tone…", "step 2/3");
  let toneSeries = null;

  for (const mode of pickToneMode()) {
    const t = await apiGet("/api/GDELT", { q, recent, mode, format: "json", max: 50, sort });
    if (!t.ok && t.status === 429) {
      await enforceCooldown(t.retryAfterMs || 5500);
      // We'll just skip tone for now; don't fail whole run.
      setStatus("DEGRADED", "Tone throttled; running without tone.", "");
      toneSeries = null;
      break;
    }
    if (t.ok) {
      const s = normalizeTimelineSeries(t);
      if (s?.points?.length) { toneSeries = s; break; }
    }
    // spacing before possible fallback attempt
    await enforceCooldown(5200);
  }

  // enforce spacing again
  await enforceCooldown(5200);

  // 3) feed
  setStatus("FETCH", "Pulling latest headlines…", "step 3/3");
  const feed = await apiGet("/api/GDELT", { q, recent, mode: "ArtList", format: "json", max, sort });

  if (!feed.ok && feed.status === 429) {
    await enforceCooldown(feed.retryAfterMs || 5500);
    setButton("Sækja", true);
    setStatus("COMMS SATURATED", "Upstream throttling (429). Try again.", "");
    inFlight = false;
    return;
  }
  if (!feed.ok) {
    setButton("Sækja", true);
    setStatus("DEGRADED", feed.error || "Feed fetch failed", `ms=${feed._clientMs}`);
    inFlight = false;
    return;
  }

  const articles = feed?.data?.articles || [];
  renderFeed(articles);

  // KPIs + chart
  const kpis = $("kpis");
  kpis.appendChild(kpiPill("volume avg", Number.isFinite(volAvg) ? volAvg.toFixed(3) : "—"));
  kpis.appendChild(kpiPill("volume trend", `${trendArrow(volPrev, volLast)} (${Number.isFinite(volLast) ? volLast.toFixed(3) : "—"})`));
  kpis.appendChild(kpiPill("headlines", String(articles.length)));

  if (toneSeries?.points?.length) {
    const tAvg = avg(toneSeries.points.map(p=>p.value));
    const tLast = toneSeries.points.at(-1)?.value;
    kpis.appendChild(kpiPill("tone avg", Number.isFinite(tAvg) ? tAvg.toFixed(2) : "—"));
    kpis.appendChild(kpiPill("tone last", Number.isFinite(tLast) ? tLast.toFixed(2) : "—"));
  } else {
    kpis.appendChild(kpiPill("tone", "unavailable"));
  }

  drawChart(volSeries, toneSeries);

  lastRun = { q, recent, max, sort, volSeries, toneSeries, articles };
  setButton("Sækja", true);
  setStatus("OK", "Intel updated.", `docMs=${feed.meta?.upstreamMs ?? "?"} clientMs=${feed._clientMs}`);

  inFlight = false;
}

function switchTab(name) {
  for (const b of document.querySelectorAll(".tab")) {
    b.classList.toggle("active", b.dataset.tab === name);
  }
  for (const p of document.querySelectorAll(".tabpane")) {
    p.classList.toggle("active", p.id === `tab-${name}`);
  }
  if (name === "map") maybeLoadMap();
  if (name === "timeline" && lastRun?.volSeries) drawChart(lastRun.volSeries, lastRun.toneSeries);
}

function initTabs() {
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
}

function initPresets() {
  $("presets").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-q]");
    if (!b) return;
    $("q").value = b.dataset.q;
    runIntel();
  });
}

function initActions() {
  $("go").addEventListener("click", runIntel);
  $("q").addEventListener("keydown", (e) => { if (e.key === "Enter") runIntel(); });
}

function ensureMap() {
  if (map) return map;

  map = new maplibregl.Map({
    container: "map",
    style: "https://demotiles.maplibre.org/style.json",
    center: [-19.0, 64.9],
    zoom: 4.2
  });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");

  map.on("load", () => {
    // sources/layers added when data fetched
  });

  return map;
}

async function loadGeo(q, recent) {
  setStatus("FETCH", "Geocoding coverage…", "geo 1/1");
  const geo = await apiGet("/api/GDELT_geo", { q, recent, max: 250, format: "geojson" });

  if (!geo.ok && geo.status === 429) {
    await enforceCooldown(geo.retryAfterMs || 5500);
    setStatus("COMMS SATURATED", "Geo throttled (429). Try again.", "");
    return null;
  }
  if (!geo.ok) {
    setStatus("DEGRADED", geo.error || "Geo fetch failed", `ms=${geo._clientMs}`);
    return null;
  }

  const gj = geo?.data;
  if (!gj || !gj.type) {
    setStatus("DEGRADED", "Geo returned no GeoJSON.", "");
    return null;
  }
  return { gj, meta: geo.meta, clientMs: geo._clientMs };
}

function bindClusterPopup(m) {
  m.on("click", "clusters", async (e) => {
    const features = m.queryRenderedFeatures(e.point, { layers: ["clusters"] });
    const clusterId = features[0].properties.cluster_id;
    const src = m.getSource("gdelt_geo");
    const zoom = await src.getClusterExpansionZoom(clusterId);
    m.easeTo({ center: features[0].geometry.coordinates, zoom });
  });

  m.on("click", "unclustered", (e) => {
    const f = e.features?.[0];
    if (!f) return;

    const p = f.properties || {};
    const title = p.title || "article";
    const url = p.url || "";

    new maplibregl.Popup({ closeButton: true, closeOnClick: true })
      .setLngLat(f.geometry.coordinates)
      .setHTML(`
        <div style="max-width:260px; font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;">
          <div style="font-size:13px; margin-bottom:6px;">${esc(title)}</div>
          ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener" style="font-size:12px;">Open</a>` : ""}
        </div>
      `)
      .addTo(m);
  });

  m.on("mouseenter", "clusters", () => m.getCanvas().style.cursor = "pointer");
  m.on("mouseleave", "clusters", () => m.getCanvas().style.cursor = "");
  m.on("mouseenter", "unclustered", () => m.getCanvas().style.cursor = "pointer");
  m.on("mouseleave", "unclustered", () => m.getCanvas().style.cursor = "");
}

async function maybeLoadMap() {
  const q = $("q").value.trim();
  const recent = $("recent").value;
  if (!q) {
    setStatus("IDLE", "Settu inn leitarstreng fyrir kort.", "");
    return;
  }

  const key = `${q}||${recent}`;
  if (mapLoadedFor === key) return;

  const m = ensureMap();
  // Wait until style loaded
  if (!m.isStyleLoaded()) {
    await new Promise((resolve) => m.once("load", resolve));
  }

  // Respect cooldown
  await enforceCooldown(0);

  // Geo fetch (may trigger 429 if you just ran intel)
  const geoRes = await loadGeo(q, recent);
  if (!geoRes) return;

  const { gj, meta, clientMs } = geoRes;

  // Map expects FeatureCollection; ensure it is
  const fc = gj.type === "FeatureCollection" ? gj : { type: "FeatureCollection", features: [] };

  // Add/replace source
  if (m.getLayer("clusters")) m.removeLayer("clusters");
  if (m.getLayer("cluster-count")) m.removeLayer("cluster-count");
  if (m.getLayer("unclustered")) m.removeLayer("unclustered");
  if (m.getSource("gdelt_geo")) m.removeSource("gdelt_geo");

  m.addSource("gdelt_geo", {
    type: "geojson",
    data: fc,
    cluster: true,
    clusterRadius: 45,
    clusterMaxZoom: 10
  });

  // Clusters
  m.addLayer({
    id: "clusters",
    type: "circle",
    source: "gdelt_geo",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": "rgba(255,255,255,.75)",
      "circle-stroke-color": "rgba(0,0,0,.35)",
      "circle-stroke-width": 1,
      "circle-radius": [
        "step",
        ["get", "point_count"],
        14, 10, 18, 30, 24, 80, 30
      ]
    }
  });

  m.addLayer({
    id: "cluster-count",
    type: "symbol",
    source: "gdelt_geo",
    filter: ["has", "point_count"],
    layout: {
      "text-field": "{point_count_abbreviated}",
      "text-size": 12
    },
    paint: {
      "text-color": "rgba(0,0,0,.85)"
    }
  });

  // Unclustered points
  m.addLayer({
    id: "unclustered",
    type: "circle",
    source: "gdelt_geo",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": "rgba(255,211,107,.95)",
      "circle-stroke-color": "rgba(0,0,0,.35)",
      "circle-stroke-width": 1,
      "circle-radius": 5
    }
  });

  bindClusterPopup(m);

  // Fit bounds if we have features
  const feats = fc.features || [];
  $("geoCount").textContent = `points: ${feats.length}`;

  if (feats.length) {
    let minX=180, minY=90, maxX=-180, maxY=-90;
    for (const f of feats) {
      const c = f?.geometry?.coordinates;
      if (!Array.isArray(c) || c.length < 2) continue;
      const [x,y] = c;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    if (minX <= maxX && minY <= maxY) {
      m.fitBounds([[minX, minY], [maxX, maxY]], { padding: 30, duration: 700 });
    }
  }

  mapLoadedFor = key;
  setStatus("OK", "Geo updated.", `geoMs=${meta?.upstreamMs ?? "?"} clientMs=${clientMs}`);
}

function boot() {
  // default query
  $("q").value = '(iceland OR "reykjanes peninsula") AND (volcano OR eruption OR grindavik)';

  initTabs();
  initPresets();
  initActions();

  setStatus("IDLE", "Ready. Press Sækja.", "");

  // Optional: auto-run once
  runIntel();
}

boot();