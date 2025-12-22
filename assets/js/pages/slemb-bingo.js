/* =========================================================
   ís.is — bingo.js (slemb / bingó)
   - Draws without replacement
   - Supports 1–75 and 1–90
   - Draw N at a time, undo last batch
   ========================================================= */

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const rangeEl = $("range");
  const drawNEl = $("drawN");
  const drawBtn = $("drawBtn");
  const undoBtn = $("undoBtn");
  const resetBtn = $("resetBtn");
  const copyBtn = $("copyBtn");
  const toggleListBtn = $("toggleListBtn");

  const warnEl = $("warn");

  const bigEl = $("big");
  const drawnCountEl = $("drawnCount");
  const leftCountEl = $("leftCount");
  const lastTimeEl = $("lastTime");

  const listsBox = $("lists");
  const last12El = $("last12");
  const allDrawnEl = $("allDrawn");
  const leftEl = $("left");

  const STATE_KEY = "slemb_bingo_state_v1";

  const state = {
    max: 75,
    pool: [],        // remaining numbers
    drawn: [],       // all drawn numbers in order
    batches: [],     // array of arrays (each draw batch)
    lastWhen: null,
  };

  function pad2(n){ return String(n).padStart(2, "0"); }
  function whenStr(){
    const d = new Date();
    return d.toLocaleString("is-IS", {
      year:"numeric", month:"2-digit", day:"2-digit",
      hour:"2-digit", minute:"2-digit", second:"2-digit"
    });
  }

  function setWarn(msg, kind=""){
    warnEl.classList.remove("bad","ok");
    if (kind) warnEl.classList.add(kind);
    warnEl.textContent = msg || "";
  }

  function secureU32(){
    const u = new Uint32Array(1);
    crypto.getRandomValues(u);
    return u[0];
  }

  function secureInt(min, max){
    const range = max - min + 1;
    if (range <= 0) throw new Error("bad range");
    const maxUint = 0xFFFFFFFF;
    const bucket = Math.floor((maxUint + 1) / range) * range;
    let x;
    do { x = secureU32(); } while (x >= bucket);
    return min + (x % range);
  }

  function buildPool(max){
    const a = [];
    for (let i=1; i<=max; i++) a.push(i);
    return a;
  }

  function save(){
    const payload = {
      max: state.max,
      pool: state.pool,
      drawn: state.drawn,
      batches: state.batches,
      lastWhen: state.lastWhen,
    };
    localStorage.setItem(STATE_KEY, JSON.stringify(payload));
  }

  function load(){
    try{
      const raw = localStorage.getItem(STATE_KEY);
      if(!raw) return false;
      const x = JSON.parse(raw);
      if(!x || !Array.isArray(x.pool) || !Array.isArray(x.drawn) || !Array.isArray(x.batches)) return false;
      state.max = (x.max === 90) ? 90 : 75;
      state.pool = x.pool;
      state.drawn = x.drawn;
      state.batches = x.batches;
      state.lastWhen = x.lastWhen || null;
      return true;
    }catch{
      return false;
    }
  }

  function syncUI(){
    rangeEl.value = String(state.max);
    leftCountEl.textContent = String(state.pool.length);
    drawnCountEl.textContent = String(state.drawn.length);
    lastTimeEl.textContent = state.lastWhen ? state.lastWhen : "—";

    // Big display shows last batch (comma-separated)
    if (!state.batches.length){
      bigEl.textContent = "—";
    } else {
      const last = state.batches[0] || [];
      bigEl.textContent = last.join(", ");
    }

    // Lists
    renderLists();

    // Buttons
    undoBtn.disabled = state.batches.length === 0;
    copyBtn.disabled = state.batches.length === 0;

    // If finished
    if (state.pool.length === 0 && state.drawn.length > 0){
      setWarn("Allar tölur dregnar. Ný umferð?", "ok");
      drawBtn.disabled = true;
    } else {
      drawBtn.disabled = false;
    }
  }

  function renderChips(el, nums){
    el.innerHTML = "";
    if (!nums.length){
      const s = document.createElement("span");
      s.className = "chip";
      s.textContent = "—";
      el.appendChild(s);
      return;
    }
    nums.forEach(n => {
      const span = document.createElement("span");
      span.className = "chip";
      span.textContent = String(n);
      el.appendChild(span);
    });
  }

  function renderLists(){
    const last12 = state.drawn.slice(0, 12);
    renderChips(last12El, last12);

    // show all drawn (could be many) – keep it ok for 90 max
    renderChips(allDrawnEl, state.drawn);

    // remaining
    const left = [...state.pool].sort((a,b)=>a-b);
    renderChips(leftEl, left);
  }

  function newGame(max){
    state.max = (max === 90) ? 90 : 75;
    state.pool = buildPool(state.max);
    state.drawn = [];
    state.batches = [];
    state.lastWhen = null;
    setWarn("");
    save();
    syncUI();
  }

  function drawBatch(){
    setWarn("");

    const n = Math.max(1, parseInt(drawNEl.value, 10) || 1);
    if (state.pool.length === 0){
      setWarn("Ekkert eftir að draga.", "bad");
      syncUI();
      return;
    }

    const take = Math.min(n, state.pool.length);
    const batch = [];

    for (let i=0; i<take; i++){
      const idx = secureInt(0, state.pool.length - 1);
      const picked = state.pool.splice(idx, 1)[0];
      batch.push(picked);
    }

    // Keep a record: newest batch first
    state.batches.unshift(batch);

    // Keep drawn list: newest first (fits “Síðustu 12” easily)
    state.drawn = batch.concat(state.drawn);

    state.lastWhen = whenStr();
    save();

    setWarn(`Dregið: ${batch.join(", ")}`, "ok");
    syncUI();
  }

  function undo(){
    setWarn("");
    if (!state.batches.length){
      setWarn("Ekkert til að afturkalla.", "bad");
      return;
    }

    const batch = state.batches.shift();
    if (!Array.isArray(batch) || !batch.length){
      save();
      syncUI();
      return;
    }

    // remove these from drawn (they are at the very front)
    const front = state.drawn.slice(0, batch.length);
    // if mismatch, do safer remove by filtering
    const same =
      front.length === batch.length &&
      front.every((v,i)=>v === batch[i]);

    if (same){
      state.drawn = state.drawn.slice(batch.length);
    } else {
      const set = new Set(batch);
      state.drawn = state.drawn.filter(x => !set.has(x));
    }

    // return numbers back into pool
    state.pool.push(...batch);

    state.lastWhen = whenStr();
    save();

    setWarn(`Afturkallað: ${batch.join(", ")}`, "ok");
    syncUI();
  }

  async function copyLast(){
    setWarn("");
    if (!state.batches.length){
      setWarn("Ekkert til að afrita enn.", "bad");
      return;
    }
    const batch = state.batches[0] || [];
    const text = batch.join(", ");
    if (!text){
      setWarn("Ekkert til að afrita enn.", "bad");
      return;
    }
    try{
      await navigator.clipboard.writeText(text);
      setWarn("Afritað.", "ok");
      setTimeout(() => setWarn(""), 600);
    }catch{
      setWarn("Gat ekki afritað. (iOS getur verið þrjóskur.)", "bad");
    }
  }

  function toggleLists(){
    const hidden = listsBox.hasAttribute("hidden");
    if (hidden) listsBox.removeAttribute("hidden");
    else listsBox.setAttribute("hidden", "");
  }

  function init(){
    const loaded = load();
    if (!loaded) newGame(parseInt(rangeEl.value, 10) || 75);
    else syncUI();

    rangeEl.addEventListener("change", () => {
      const max = parseInt(rangeEl.value, 10) || 75;
      newGame(max);
    });

    drawBtn.addEventListener("click", drawBatch);
    undoBtn.addEventListener("click", undo);
    resetBtn.addEventListener("click", () => newGame(parseInt(rangeEl.value, 10) || 75));
    copyBtn.addEventListener("click", copyLast);
    toggleListBtn.addEventListener("click", toggleLists);

    // Keyboard shortcuts: Enter = draw, Ctrl/Cmd+Z = undo
    document.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.ctrlKey && !e.metaKey){
        e.preventDefault();
        drawBatch();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")){
        e.preventDefault();
        undo();
      }
      if (e.key === "Escape"){
        setWarn("");
        listsBox.setAttribute("hidden", "");
      }
    });
  }

  init();
})();
