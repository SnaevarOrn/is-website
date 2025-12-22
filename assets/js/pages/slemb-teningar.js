/* ís.is — pages/slemb-teningar.js */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const HISTORY_KEY = "slemb_teningar_history_v1";

  // Theme button (shared prefs)
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
  }

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

  function cryptoInt(min, max){
    // inclusive min/max
    const range = max - min + 1;
    if (range <= 0) throw new Error("Ólöglegt bil.");
    const maxUint = 0xFFFFFFFF;
    const bucketSize = Math.floor((maxUint + 1) / range) * range;
    const u32 = new Uint32Array(1);
    let x;
    do {
      crypto.getRandomValues(u32);
      x = u32[0];
    } while (x >= bucketSize);
    return min + (x % range);
  }

  function formatWhen(){
    const d = new Date();
    return d.toLocaleString("is-IS", {
      year:"numeric", month:"2-digit", day:"2-digit",
      hour:"2-digit", minute:"2-digit", second:"2-digit"
    });
  }

  // Parse dice notation:
  // - "d6" => 1d6
  // - "2d20+3"
  // - "4d8-2"
  // - also accepts spaces: "2 d 6 + 1"
  // Returns { n, sides, mod }
  function parseExpr(input){
    const raw = String(input || "").trim();
    if (!raw) throw new Error("Skrifaðu formúlu, t.d. 2d6+1.");

    const s = raw.replace(/\s+/g, "").toLowerCase();

    // Allow "d6"
    const m = s.match(/^(\d*)d(\d+)([+-]\d+)?$/);
    if (!m) throw new Error("Ólöglegt snið. Dæmi: 1d6, d20, 2d8+3, 4d10-2.");

    const n = m[1] ? parseInt(m[1], 10) : 1;
    const sides = parseInt(m[2], 10);
    const mod = m[3] ? parseInt(m[3], 10) : 0;

    if (!Number.isFinite(n) || n < 1) throw new Error("Fjöldi teninga þarf að vera ≥ 1.");
    if (!Number.isFinite(sides) || sides < 2) throw new Error("Hliðar (dX) þurfa að vera ≥ 2.");

    // Safety limits for phones
    if (n > 2000) throw new Error("Of margir teningar (max 2000).");
    if (sides > 1_000_000) throw new Error("Of margar hliðar (max 1,000,000).");

    return { n, sides, mod, norm: `${n}d${sides}${mod ? (mod > 0 ? `+${mod}` : `${mod}`) : ""}` };
  }

  function roll({ n, sides, mod }){
    const rolls = [];
    let sum = 0;
    for (let i=0; i<n; i++){
      const r = cryptoInt(1, sides);
      rolls.push(r);
      sum += r;
    }
    const total = sum + mod;
    return { rolls, sum, total };
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
      div.className = "std-hint";
      div.style.display = "grid";
      div.style.gap = "6px";

      const top = document.createElement("div");
      top.style.fontWeight = "900";
      top.textContent = `${h.expr} → ${h.total}`;

      const meta = document.createElement("div");
      meta.style.fontSize = "12px";
      meta.style.opacity = ".9";
      meta.textContent = `${h.when} • [${h.rolls.join(", ")}]`;

      div.appendChild(top);
      div.appendChild(meta);
      box.appendChild(div);
    });
  }

  function renderResult(expr, data){
    $("rolls").innerHTML = "";
    data.rolls.forEach((r) => {
      const span = document.createElement("span");
      span.className = "pill-out";
      span.textContent = String(r);
      $("rolls").appendChild(span);
    });

    const modTxt = data.total === data.sum ? "" : ` • mod: ${data.total - data.sum}`;
    $("meta").textContent = `Summa: ${data.sum}${modTxt}`;
    $("total").textContent = `Heild: ${data.total}`;
    $("exprOut").textContent = expr;
  }

  async function copyTotal(){
    const total = $("total")?.textContent?.replace(/^Heild:\s*/, "").trim() || "";
    if (!total){
      setWarn("Ekkert til að afrita enn. Ýttu á “Kasta”.");
      return;
    }
    try{
      await navigator.clipboard.writeText(total);
      setWarn("");
    } catch {
      setWarn("Gat ekki afritað (iOS getur verið þrjóskur).");
    }
  }

  function quickSet(expr){
    $("expr").value = expr;
    doRoll();
  }

  function doRoll(){
    setWarn("");

    let parsed;
    try{
      parsed = parseExpr($("expr").value);
    } catch (e){
      setWarn(e.message || "Villa í formúlu.");
      return;
    }

    let times = Math.trunc(Number($("times").value));
    if (!Number.isFinite(times) || times < 1) times = 1;
    if (times > 50) times = 50;

    // If times > 1: show totals list
    if (times === 1){
      const data = roll(parsed);
      renderResult(parsed.norm, data);
      pushHistory({ when: formatWhen(), expr: parsed.norm, rolls: data.rolls, total: data.total });
      return;
    }

    // Multi-run
    const totals = [];
    for (let i=0; i<times; i++){
      const d = roll(parsed);
      totals.push(d.total);
    }

    $("rolls").innerHTML = "";
    totals.forEach((t) => {
      const span = document.createElement("span");
      span.className = "pill-out";
      span.textContent = String(t);
      $("rolls").appendChild(span);
    });

    const min = Math.min(...totals);
    const max = Math.max(...totals);
    const avg = totals.reduce((s,x)=>s+x,0) / totals.length;

    $("exprOut").textContent = `${parsed.norm} × ${times}`;
    $("meta").textContent = `Min: ${min} • Max: ${max} • Meðaltal: ${avg.toFixed(2)}`;
    $("total").textContent = `Heild: ${totals[totals.length-1]} (síðasta)`;

    pushHistory({ when: formatWhen(), expr: `${parsed.norm}×${times}`, rolls: totals, total: totals[totals.length-1] });
  }

  function resetAll(){
    setWarn("");
    $("expr").value = "2d6+1";
    $("times").value = 1;
    $("rolls").innerHTML = "";
    $("meta").textContent = "";
    $("total").textContent = "";
    $("exprOut").textContent = "";
  }

  // Wire
  $("rollBtn")?.addEventListener("click", doRoll);
  $("copyBtn")?.addEventListener("click", copyTotal);
  $("resetBtn")?.addEventListener("click", resetAll);

  $("q_d6")?.addEventListener("click", () => quickSet("1d6"));
  $("q_2d6")?.addEventListener("click", () => quickSet("2d6"));
  $("q_d20")?.addEventListener("click", () => quickSet("d20"));
  $("q_2d20")?.addEventListener("click", () => quickSet("2d20"));
  $("q_4d6")?.addEventListener("click", () => quickSet("4d6"));
  $("q_3d8p2")?.addEventListener("click", () => quickSet("3d8+2"));

  // Enter to roll
  $("expr")?.addEventListener("keydown", (e) => { if (e.key === "Enter") doRoll(); });

  renderHistory();
})();
