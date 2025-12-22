/* =========================================================
   ís.is — hjol.js (slemb / lukkuhjól)
   - Uses prefs/theme.js for global theme
   - Canvas wheel + secure RNG
   ========================================================= */

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const canvas = $("wheel");
  const ctx = canvas.getContext("2d", { alpha: true });

  const itemsTa = $("items");
  const noRepeatEl = $("noRepeat");
  const warnEl = $("warn");

  const spinBtn = $("spinBtn");
  const resetBtn = $("resetBtn");
  const fillDemoBtn = $("fillDemo");
  const copyBtn = $("copyBtn");
  const historyBtn = $("historyBtn");

  const resultEl = $("result");
  const metaEl = $("meta");

  const historyBox = $("history");
  const historyList = $("historyList");

  const HISTORY_KEY = "slemb_hjol_history_v1";

  // Wheel state
  const state = {
    items: [],
    angle: 0,          // radians
    spinning: false,
    lastPick: null,
  };

  // --- Helpers ---
  function setWarn(msg, kind = "") {
    warnEl.classList.remove("is-bad", "is-ok");
    if (kind) warnEl.classList.add(kind === "bad" ? "is-bad" : "is-ok");
    warnEl.textContent = msg || "";
  }

  function parseItems() {
    const lines = itemsTa.value
      .split("\n")
      .map(s => s.trim())
      .filter(Boolean);

    // de-dupe while keeping order
    const out = [];
    const seen = new Set();
    for (const x of lines) {
      const k = x.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(x);
    }
    return out;
  }

  function pad2(n){ return String(n).padStart(2, "0"); }
  function whenStr(){
    const d = new Date();
    return d.toLocaleString("is-IS", {
      year:"numeric", month:"2-digit", day:"2-digit",
      hour:"2-digit", minute:"2-digit", second:"2-digit"
    });
  }

  function secureU32(){
    const u = new Uint32Array(1);
    crypto.getRandomValues(u);
    return u[0];
  }

  function secureFloat01(){
    // 0..1 (inclusive-ish)
    return secureU32() / 0xFFFFFFFF;
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

  function wrapAngle(a){
    const two = Math.PI * 2;
    a = a % two;
    if (a < 0) a += two;
    return a;
  }

  function getCssVar(name){
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function palette(i){
    // Use existing page vibe (ice glow) but keep it simple.
    // We avoid hardcoding theme colors; we derive base from CSS vars.
    const text = getCssVar("--text") || "rgba(255,255,255,.92)";
    const line = getCssVar("--line") || "rgba(255,255,255,.12)";
    const bg = getCssVar("--bg") || "#000";

    // Build gentle alternating fills using color-mix fallback-ish:
    // If color-mix isn't supported by canvas, we just use rgba variants.
    const a = (i % 2 === 0) ? 0.10 : 0.16;
    return {
      fill: `rgba(180,230,255,${a})`,
      stroke: line,
      text: text,
      bg: bg
    };
  }

  // --- Drawing ---
  function resizeCanvasForHiDPI() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    const size = Math.floor(Math.min(rect.width, rect.height));
    canvas.width = Math.floor(size * dpr);
    canvas.height = Math.floor(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawWheel() {
    const items = state.items;
    const n = items.length;

    // Background
    const rect = canvas.getBoundingClientRect();
    const size = Math.min(rect.width, rect.height);
    const cx = size / 2;
    const cy = size / 2;
    const r = (size / 2) - 2;

    ctx.clearRect(0, 0, size, size);

    // Empty state
    if (n === 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = palette(0).stroke;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = palette(0).text;
      ctx.font = "700 14px system-ui, -apple-system, Segoe UI, Roboto, Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.globalAlpha = 0.75;
      ctx.fillText("Bættu við valkostum", cx, cy);
      ctx.globalAlpha = 1;
      return;
    }

    const step = (Math.PI * 2) / n;

    // Wheel rotation: pointer is at top.
    // We'll define 0 rad at "up" (canvas uses 0 at +x), so shift by -90deg.
    const base = state.angle - Math.PI / 2;

    for (let i = 0; i < n; i++) {
      const a0 = base + i * step;
      const a1 = a0 + step;

      const pal = palette(i);

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, a0, a1);
      ctx.closePath();
      ctx.fillStyle = pal.fill;
      ctx.fill();

      ctx.strokeStyle = pal.stroke;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Label
      const mid = (a0 + a1) / 2;
      const labelR = r * 0.70;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(mid);

      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = pal.text;

      // scale font with number of items
      const fontSize = Math.max(11, Math.min(16, Math.floor(220 / n)));
      ctx.font = `800 ${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;

      const txt = items[i];
      const maxChars = Math.max(10, Math.floor(40 - n * 0.6));
      const shown = txt.length > maxChars ? (txt.slice(0, maxChars - 1) + "…") : txt;

      ctx.globalAlpha = 0.92;
      ctx.fillText(shown, r * 0.18, 0);
      ctx.globalAlpha = 1;

      ctx.restore();
    }

    // Outer ring
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = palette(0).stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function pickIndexAtPointer() {
  const n = state.items.length;
  if (!n) return -1;

  const step = (Math.PI * 2) / n;

  // Pointer is at -90deg in canvas space, wheel slices start at "base".
  // base = state.angle - PI/2  => pointer relative angle becomes -state.angle.
  const rel = wrapAngle(-state.angle);

  // +step/2 makes it pick the slice whose CENTER is under the pointer,
  // avoiding fencepost errors at boundaries.
  const idx = Math.floor((rel + step / 2) / step) % n;
  return idx;
}

  // --- Spin animation ---
  function spin() {
    if (state.spinning) return;

    state.items = parseItems();
    if (state.items.length < 2) {
      setWarn("Settu inn amk. 2 valkosti.", "bad");
      drawWheel();
      return;
    }
    setWarn("");

    state.spinning = true;
    spinBtn.disabled = true;

    // Random spin: add several full rotations + random offset.
    const n = state.items.length;
    const baseTurns = 4 + secureInt(0, 3); // 4..7 turns
    const two = Math.PI * 2;
const step = two / n;

// Veljum sigurvegara fyrirfram
const desiredIndex = secureInt(0, n - 1);

// Snúum þannig að Miðja geira lendi undir pílu (kl.12)
const finalAngle = wrapAngle(two - (desiredIndex + 0.5) * step);

const start = state.angle;
const startWrapped = wrapAngle(start);
const delta = wrapAngle(finalAngle - startWrapped);

const target = start + baseTurns * two + delta;

    // Duration: 2.2s .. 3.4s
    const duration = 2200 + secureInt(0, 1200);
    const t0 = performance.now();

    function easeOutCubic(t){ return 1 - Math.pow(1 - t, 3); }

    const tick = (now) => {
      const p = Math.min(1, (now - t0) / duration);
      const e = easeOutCubic(p);
      state.angle = start + (target - start) * e;
      drawWheel();

      if (p < 1) {
        requestAnimationFrame(tick);
      } else {
        // settle
        state.angle = wrapAngle(state.angle);
        state.spinning = false;
        spinBtn.disabled = false;

        const idx = pickIndexAtPointer();
        const picked = state.items[idx];

        state.lastPick = picked;

        resultEl.textContent = picked;
        metaEl.textContent = `Valið ${whenStr()} • ${n} valkostir`;

        pushHistory(picked);

        if (noRepeatEl.checked) {
          removePicked(picked);
        }

        setWarn("Done.", "ok");
        setTimeout(() => setWarn(""), 500);
      }
    };

    requestAnimationFrame(tick);
  }

  function removePicked(picked) {
    // Remove picked from textarea list (case-insensitive)
    const lines = itemsTa.value.split("\n");
    let removed = false;
    const out = [];
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      if (!removed && t.toLowerCase() === picked.toLowerCase()) {
        removed = true;
        continue;
      }
      out.push(t);
    }
    itemsTa.value = out.join("\n") + (out.length ? "\n" : "");
    state.items = parseItems();
    drawWheel();
  }

  function resetAll() {
    if (state.spinning) return;
    itemsTa.value = "";
    noRepeatEl.checked = false;
    state.items = [];
    state.angle = 0;
    state.lastPick = null;
    resultEl.textContent = "—";
    metaEl.textContent = "Settu inn valkosti til að byrja.";
    setWarn("");
    drawWheel();
  }

  async function copyResult() {
    const t = (state.lastPick || "").trim();
    if (!t) {
      setWarn("Ekkert til að afrita ennþá. Snúðu fyrst.", "bad");
      return;
    }
    try {
      await navigator.clipboard.writeText(t);
      setWarn("Afritað.", "ok");
      setTimeout(() => setWarn(""), 600);
    } catch {
      setWarn("Gat ekki afritað. (iOS getur verið þrjóskur.)", "bad");
    }
  }

  function pushHistory(text) {
    const hist = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    hist.unshift({ text, when: whenStr() });
    hist.splice(10);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(hist));
    renderHistory();
  }

  function renderHistory() {
    const hist = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    historyList.innerHTML = "";

    if (!hist.length) {
      const div = document.createElement("div");
      div.className = "history-item";
      div.innerHTML = `<b>—</b><small>Engin saga enn.</small>`;
      historyList.appendChild(div);
      return;
    }

    for (const h of hist) {
      const div = document.createElement("div");
      div.className = "history-item";
      div.innerHTML = `<b>${escapeHtml(h.text)}</b><small>${escapeHtml(h.when)}</small>`;
      historyList.appendChild(div);
    }
  }

  function escapeHtml(s){
    return String(s)
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function toggleHistory() {
    const isHidden = historyBox.hasAttribute("hidden");
    if (isHidden) {
      historyBox.removeAttribute("hidden");
      renderHistory();
    } else {
      historyBox.setAttribute("hidden", "");
    }
  }

  function fillDemo() {
    itemsTa.value =
`Pizza
Borgari
Sushi
Taco
Pasta
Salat
“Ég veit ekki”`;
    state.items = parseItems();
    drawWheel();
    setWarn("");
  }

  // --- Theme sync redraw (canvas uses CSS vars) ---
  function hookThemeChanges() {
    window.addEventListener("storage", (e) => {
      if (e.key === "is.pref.theme") drawWheel();
    });
  }

  // --- Init ---
  function init() {
    // If page opened with content prefilled, render wheel
    state.items = parseItems();
    resizeCanvasForHiDPI();
    drawWheel();
    hookThemeChanges();

    // Events
    spinBtn.addEventListener("click", spin);
    resetBtn.addEventListener("click", resetAll);
    fillDemoBtn.addEventListener("click", fillDemo);
    copyBtn.addEventListener("click", copyResult);
    historyBtn.addEventListener("click", toggleHistory);

    itemsTa.addEventListener("input", () => {
      if (state.spinning) return;
      state.items = parseItems();
      drawWheel();
    });

    window.addEventListener("resize", () => {
      resizeCanvasForHiDPI();
      drawWheel();
    });

    // Keyboard: Ctrl/Cmd+Enter to spin
    document.addEventListener("keydown", (e) => {
      const isEnter = (e.key === "Enter");
      const mod = e.ctrlKey || e.metaKey;
      if (isEnter && mod) {
        e.preventDefault();
        spin();
      }
      if (e.key === "Escape") {
        // close history quickly
        historyBox.setAttribute("hidden", "");
        setWarn("");
      }
    });
  }

  init();

})();
