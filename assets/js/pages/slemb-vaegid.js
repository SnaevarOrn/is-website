/* ís.is — pages/slemb-vaegid.js */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // ---- Theme button (shared prefs) ----
  if (window.prefs) {
    const themeBtn = $("themeBtn");
    if (themeBtn) {
      const sync = () => {
        const t = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
        themeBtn.setAttribute("aria-pressed", t === "dark" ? "true" : "false");
      };
      themeBtn.addEventListener("click", () => { prefs.toggleTheme(); sync(); });
      sync();
      window.addEventListener("storage", (e) => { if (e.key === "is.pref.theme") sync(); });
    }
  } else {
    console.warn("slemb-vaegid.js: prefs.js not loaded");
  }

  // ---- Weighted picker ----
  const HISTORY_KEY = "slemb_vaegid_history_v1";

  function setWarn(msg){
    const w = $("warn");
    if (!w) return;
    if (!msg){
      w.style.display = "none";
      w.textContent = "";
    } else {
      w.style.display = "block";
      w.textContent = msg;
    }
  }

  function cryptoFloat01(){
    const u32 = new Uint32Array(1);
    crypto.getRandomValues(u32);
    // 0..(2^32-1) -> [0,1)
    return u32[0] / 4294967296;
  }

  function parseLines(text){
    // Accept formats:
    // "Pizza 50"
    // "Pizza,50"
    // "Pizza: 50"
    // "Pizza | 50"
    // "50 Pizza" (also works)
    const lines = String(text || "")
      .split("\n")
      .map(s => s.trim())
      .filter(Boolean);

    const items = [];
    for (const raw of lines){
      const line = raw.replace(/\s+/g, " ").trim();
      let name = "";
      let w = NaN;

      // Try: name separator weight
      const m1 = line.match(/^(.*?)(?:\s*[,|:]\s*|\s+)(-?\d+(?:[.,]\d+)?)$/);
      if (m1){
        name = m1[1].trim();
        w = Number(m1[2].replace(",", "."));
      } else {
        // Try: weight first
        const m2 = line.match(/^(-?\d+(?:[.,]\d+)?)\s+(.*)$/);
        if (m2){
          w = Number(m2[1].replace(",", "."));
          name = m2[2].trim();
        }
      }

      if (!name) name = line;

      // If weight missing or invalid => default 1
      if (!Number.isFinite(w)) w = 1;

      items.push({ name, weight: w });
    }
    return items;
  }

  function normalize(items){
    // Filter out non-positive weights
    const cleaned = items
      .map(it => ({ name: String(it.name || "").trim(), weight: Number(it.weight) }))
      .filter(it => it.name.length > 0)
      .filter(it => Number.isFinite(it.weight))
      .filter(it => it.weight > 0);

    return cleaned;
  }

  function pickOne(items){
    const total = items.reduce((s, it) => s + it.weight, 0);
    if (!(total > 0)) throw new Error("Engin jákvæð vigt.");

    const r = cryptoFloat01() * total;
    let acc = 0;
    for (const it of items){
      acc += it.weight;
      if (r < acc) return { picked: it, total };
    }
    // Fallback
    return { picked: items[items.length - 1], total };
  }

  function renderDist(items, total){
    const box = $("dist");
    if (!box) return;

    if (!items.length){
      box.innerHTML = `<div class="sv-hint">Ekkert til að sýna enn. Settu inn línur og ýttu á “Velja”.</div>`;
      return;
    }

    const maxP = Math.max(...items.map(it => it.weight / total));
    const rows = items
      .slice()
      .sort((a,b) => (b.weight - a.weight))
      .slice(0, 12); // keep it snappy

    box.innerHTML = `
      <div class="sv-table" aria-label="Dreifing">
        ${rows.map(it => {
          const p = it.weight / total;
          const wPct = maxP > 0 ? (p / maxP) * 100 : 0;
          const pTxt = (p * 100).toFixed(p >= 0.1 ? 1 : 2);
          return `
            <div class="sv-trow">
              <div class="sv-name" title="${escapeHtml(it.name)}">${escapeHtml(it.name)}</div>
              <div class="sv-weight">${pTxt}%</div>
              <div class="sv-bar" aria-hidden="true"><div style="width:${wPct.toFixed(1)}%"></div></div>
            </div>
          `;
        }).join("")}
      </div>
      <div class="sv-mini" style="margin-top:10px;">
        Sýni topp 12 eftir líkum. (Restin er samt með í valinu.)
      </div>
    `;
  }

  function escapeHtml(s){
    return String(s)
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function formatWhen(){
    const d = new Date();
    return d.toLocaleString("is-IS", {
      year:"numeric", month:"2-digit", day:"2-digit",
      hour:"2-digit", minute:"2-digit", second:"2-digit"
    });
  }

  function pushHistory(entry){
    const hist = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    hist.unshift(entry);
    hist.splice(10);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(hist));
    renderHistory();
  }

  function renderHistory(){
    const box = $("history");
    const empty = $("historyEmpty");
    if (!box || !empty) return;

    const hist = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    if (!hist.length){
      empty.style.display = "block";
      box.innerHTML = "";
      return;
    }

    empty.style.display = "none";
    box.innerHTML = "";

    hist.forEach(h => {
      const div = document.createElement("div");
      div.className = "sv-hint";
      div.style.display = "grid";
      div.style.gap = "6px";

      const top = document.createElement("div");
      top.style.fontWeight = "900";
      top.textContent = h.pick;

      const meta = document.createElement("div");
      meta.style.fontSize = "12px";
      meta.style.opacity = ".9";
      meta.textContent = `${h.when} • ${h.count} valkostir`;

      div.appendChild(top);
      div.appendChild(meta);
      box.appendChild(div);
    });
  }

  function getExample(){
    return [
      "Pizza 50",
      "Borgari 25",
      "Salat 10",
      "Sushi 15",
      "",
      "# þú getur líka sleppt vigt => default 1",
      "Teningur",
    ].join("\n");
  }

  function loadPreset(){
    const area = $("items");
    if (!area) return;
    area.value = getExample();
  }

  function doPick(){
    setWarn("");

    const area = $("items");
    const kInput = $("k");
    const includeDist = $("showDist");

    if (!area || !kInput || !includeDist) return;

    const rawItems = parseLines(area.value);
    const items = normalize(rawItems);

    if (items.length < 1){
      setWarn("Settu inn að minnsta kosti 1 valkost.");
      return;
    }

    let k = Math.trunc(Number(kInput.value));
    if (!Number.isFinite(k) || k < 1) k = 1;
    if (k > 50) k = 50;

    // Without replacement for k>1 (simple + snappy)
    const pool = items.slice();
    const picks = [];
    let total = pool.reduce((s, it) => s + it.weight, 0);

    if (k > pool.length){
      setWarn(`Þú baðst um ${k} niðurstöður en ert bara með ${pool.length} gilda valkosti (jákvæðar vigtir).`);
      return;
    }

    for (let i=0; i<k; i++){
      const { picked } = pickOne(pool);
      picks.push(picked);

      // remove picked (no replacement) for multi-pick
      const idx = pool.indexOf(picked);
      if (idx >= 0) pool.splice(idx, 1);
      total = pool.reduce((s, it) => s + it.weight, 0);
    }

    const resultBox = $("result");
    const picksBox = $("picks");
    const metaBox = $("meta");
    if (!resultBox || !picksBox || !metaBox) return;

    picksBox.innerHTML = "";
    picks.forEach((p) => {
      const span = document.createElement("span");
      span.className = "sv-pill";
      span.textContent = p.name;
      picksBox.appendChild(span);
    });

    const baseTotal = items.reduce((s, it) => s + it.weight, 0);
    const uniq = new Set(picks.map(p => p.name)).size;
    metaBox.textContent = `Valið: ${picks.length} (einstök: ${uniq}) • Valkostir: ${items.length} • Samtals vigt: ${baseTotal}`;

    // distribution (optional)
    if (includeDist.checked){
      renderDist(items, baseTotal);
    } else {
      $("dist").innerHTML = `<div class="sv-hint">Dreifing falin. Kveiktu á “Sýna líkur” ef þú vilt.</div>`;
    }

    pushHistory({ pick: picks.map(p=>p.name).join(", "), when: formatWhen(), count: items.length });
  }

  async function copyPicks(){
    const pills = Array.from(document.querySelectorAll("#picks .sv-pill"));
    const txt = pills.map(p => p.textContent.trim()).filter(Boolean).join(", ");
    if (!txt){
      setWarn("Ekkert til að afrita enn. Ýttu á “Velja” fyrst.");
      return;
    }
    try{
      await navigator.clipboard.writeText(txt);
      setWarn("");
    } catch {
      setWarn("Gat ekki afritað (iOS getur verið þrjóskur).");
    }
  }

  function clearAll(){
    setWarn("");
    $("items").value = "";
    $("picks").innerHTML = "";
    $("meta").textContent = "";
    $("dist").innerHTML = `<div class="sv-hint">Ekkert til að sýna.</div>`;
  }

  // ---- Wire ----
  $("pickBtn")?.addEventListener("click", doPick);
  $("copyBtn")?.addEventListener("click", copyPicks);
  $("clearBtn")?.addEventListener("click", clearAll);
  $("presetBtn")?.addEventListener("click", loadPreset);

  // Ctrl/Cmd+Enter to pick
  $("items")?.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") doPick();
  });

  renderHistory();
  if ($("dist")) $("dist").innerHTML = `<div class="sv-hint">Settu inn valkosti og ýttu á “Velja”.</div>`;
})();
