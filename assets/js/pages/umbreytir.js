/* /assets/js/pages/umbreytir.js
   ís.is — Umbreytir
   - No network
   - Minimal UI
   - LocalStorage remembers last selection
*/
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const catEl = $("cat");
  const fromUnitEl = $("fromUnit");
  const toUnitEl = $("toUnit");
  const fromValEl = $("fromVal");
  const toValEl = $("toVal");
  const swapBtn = $("swapBtn");
  const copyBtn = $("copyBtn");
  const clearBtn = $("clearBtn");
  const roundEl = $("round");
  const chipsEl = $("chips");
  const explainEl = $("explain");
  const statusHintEl = $("statusHint");

  const KEY = "is_umbreytir_v1";

  // Helpers
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

  function parseNumber(s) {
    if (s == null) return NaN;
    const t = String(s).trim().replace(/\s+/g, "").replace(",", ".");
    if (t === "") return NaN;
    const n = Number(t);
    return Number.isFinite(n) ? n : NaN;
  }

  function formatNumber(n, roundMode) {
    if (!Number.isFinite(n)) return "";
    if (roundMode === "auto") {
      // Auto: keep sensible precision without scientific spam
      const abs = Math.abs(n);
      if (abs === 0) return "0";
      if (abs >= 1000) return String(Math.round(n));
      if (abs >= 100) return String(roundTo(n, 1));
      if (abs >= 10) return String(roundTo(n, 2));
      return String(roundTo(n, 4));
    }
    const dp = clamp(Number(roundMode), 0, 10);
    return n.toFixed(dp).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  }

  function roundTo(n, dp) {
    const p = 10 ** dp;
    return Math.round(n * p) / p;
  }

  function setOptions(selectEl, options, selectedId) {
    selectEl.innerHTML = "";
    for (const opt of options) {
      const o = document.createElement("option");
      o.value = opt.id;
      o.textContent = opt.label;
      selectEl.appendChild(o);
    }
    if (selectedId && options.some(o => o.id === selectedId)) {
      selectEl.value = selectedId;
    }
  }

  // Conversion model:
  // For linear units: base = value * factorToBase
  // For temperature: toBase/fromBase functions.
  const CATEGORIES = [
    {
      id: "length",
      label: "Lengd",
      units: [
        { id: "mm", label: "mm", factor: 0.001 },
        { id: "cm", label: "cm", factor: 0.01 },
        { id: "m",  label: "m",  factor: 1 },
        { id: "km", label: "km", factor: 1000 },
        { id: "in", label: "tomma (in)", factor: 0.0254 },
        { id: "ft", label: "fet (ft)", factor: 0.3048 },
        { id: "yd", label: "yard (yd)", factor: 0.9144 },
        { id: "mi", label: "mílur (mi)", factor: 1609.344 },
      ],
      explain: "Lengd er umbreytt með föstum stuðlum (allt miðað við metra)."
    },
    {
      id: "mass",
      label: "Massi",
      units: [
        { id: "g",  label: "g",  factor: 0.001 },
        { id: "kg", label: "kg", factor: 1 },
        { id: "t",  label: "tonn (t)", factor: 1000 },
        { id: "oz", label: "únsa (oz)", factor: 0.028349523125 },
        { id: "lb", label: "pund (lb)", factor: 0.45359237 },
      ],
      explain: "Massi er umbreytt miðað við kílógrömm."
    },
    {
      id: "temperature",
      label: "Hitastig",
      units: [
        {
          id: "C", label: "°C",
          toBase: (c) => c, fromBase: (c) => c
        },
        {
          id: "F", label: "°F",
          toBase: (f) => (f - 32) * (5/9),
          fromBase: (c) => c * (9/5) + 32
        },
        {
          id: "K", label: "K",
          toBase: (k) => k - 273.15,
          fromBase: (c) => c + 273.15
        }
      ],
      explain: "Hitastig er ekki línulegt með 0-punkti eins og lengd/massi. Umbreyting notar formúlur."
    },
    {
      id: "pressure",
      label: "Þrýstingur",
      units: [
        { id: "Pa",  label: "Pa",  factor: 1 },
        { id: "kPa", label: "kPa", factor: 1000 },
        { id: "bar", label: "bar", factor: 100000 },
        { id: "psi", label: "psi", factor: 6894.757293168 },
        { id: "atm", label: "atm", factor: 101325 },
      ],
      explain: "Þrýstingur er umbreytt miðað við Pascal."
    },
    {
      id: "speed",
      label: "Hraði",
      units: [
        { id: "mps", label: "m/s", factor: 1 },
        { id: "kmh", label: "km/klst", factor: 0.2777777777778 },
        { id: "mph", label: "mph", factor: 0.44704 },
        { id: "knot", label: "hnútar (kn)", factor: 0.5144444444444 },
      ],
      explain: "Hraði er umbreytt miðað við m/s."
    },
    {
      id: "energy",
      label: "Orka",
      units: [
        { id: "J",   label: "J", factor: 1 },
        { id: "kJ",  label: "kJ", factor: 1000 },
        { id: "Wh",  label: "Wh", factor: 3600 },
        { id: "kWh", label: "kWh", factor: 3600000 },
        { id: "cal", label: "cal", factor: 4.184 },
        { id: "kcal",label: "kcal", factor: 4184 },
      ],
      explain: "Orka er umbreytt miðað við Joule."
    }
  ];

  const QUICK = [
    { cat: "temperature", from: "C", to: "F", label: "°C → °F" },
    { cat: "temperature", from: "F", to: "C", label: "°F → °C" },
    { cat: "pressure", from: "psi", to: "bar", label: "psi → bar" },
    { cat: "pressure", from: "bar", to: "psi", label: "bar → psi" },
    { cat: "speed", from: "kmh", to: "mps", label: "km/klst → m/s" },
    { cat: "speed", from: "mps", to: "kmh", label: "m/s → km/klst" },
    { cat: "length", from: "km", to: "mi", label: "km → mílur" },
    { cat: "mass", from: "kg", to: "lb", label: "kg → lb" },
  ];

  function getCat(id) {
    return CATEGORIES.find(c => c.id === id) || CATEGORIES[0];
  }

  function getUnit(cat, unitId) {
    return cat.units.find(u => u.id === unitId) || cat.units[0];
  }

  function isTempCat(cat) {
    // temp units have toBase/fromBase
    return typeof cat.units[0].toBase === "function";
  }

  function convertValue(catId, fromUnitId, toUnitId, value) {
    const cat = getCat(catId);
    if (!Number.isFinite(value)) return NaN;

    if (isTempCat(cat)) {
      const fromU = getUnit(cat, fromUnitId);
      const toU = getUnit(cat, toUnitId);
      const baseC = fromU.toBase(value);
      return toU.fromBase(baseC);
    } else {
      const fromU = getUnit(cat, fromUnitId);
      const toU = getUnit(cat, toUnitId);
      const base = value * fromU.factor;
      return base / toU.factor;
    }
  }

  function explainText(catId, fromUnitId, toUnitId) {
    const cat = getCat(catId);
    if (catId === "temperature") {
      if (fromUnitId === "C" && toUnitId === "F") return "Formúla: °F = °C × 9/5 + 32";
      if (fromUnitId === "F" && toUnitId === "C") return "Formúla: °C = (°F − 32) × 5/9";
      if (fromUnitId === "C" && toUnitId === "K") return "Formúla: K = °C + 273,15";
      if (fromUnitId === "K" && toUnitId === "C") return "Formúla: °C = K − 273,15";
      return cat.explain;
    }
    return cat.explain;
  }

  function renderChips() {
    chipsEl.innerHTML = "";
    for (const q of QUICK) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.textContent = q.label;
      b.addEventListener("click", () => {
        catEl.value = q.cat;
        onCatChange(true);
        fromUnitEl.value = q.from;
        toUnitEl.value = q.to;
        recompute();
        fromValEl.focus();
      });
      chipsEl.appendChild(b);
    }
  }

  function saveState() {
    const st = {
      cat: catEl.value,
      fromUnit: fromUnitEl.value,
      toUnit: toUnitEl.value,
      fromVal: fromValEl.value,
      round: roundEl.value,
    };
    try { localStorage.setItem(KEY, JSON.stringify(st)); } catch {}
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function onCatChange(keepUnitsIfPossible = false) {
    const cat = getCat(catEl.value);

    const prevFrom = fromUnitEl.value;
    const prevTo = toUnitEl.value;

    setOptions(fromUnitEl, cat.units, keepUnitsIfPossible ? prevFrom : null);
    setOptions(toUnitEl, cat.units, keepUnitsIfPossible ? prevTo : null);

    // Avoid same unit -> prefer next
    if (fromUnitEl.value === toUnitEl.value && cat.units.length > 1) {
      const i = cat.units.findIndex(u => u.id === toUnitEl.value);
      toUnitEl.value = cat.units[(i + 1) % cat.units.length].id;
    }

    explainEl.textContent = explainText(catEl.value, fromUnitEl.value, toUnitEl.value);
    recompute();
  }

  function setStatus(msg) {
    statusHintEl.textContent = msg || "—";
  }

  function recompute() {
    const v = parseNumber(fromValEl.value);
    if (!Number.isFinite(v)) {
      toValEl.value = "";
      setStatus("Sláðu inn tölu.");
      saveState();
      return;
    }

    const out = convertValue(catEl.value, fromUnitEl.value, toUnitEl.value, v);
    const rounded = formatNumber(out, roundEl.value);

    toValEl.value = rounded;
    explainEl.textContent = explainText(catEl.value, fromUnitEl.value, toUnitEl.value);

    // Little status line with units
    const fromLabel = fromUnitEl.options[fromUnitEl.selectedIndex]?.textContent || "";
    const toLabel = toUnitEl.options[toUnitEl.selectedIndex]?.textContent || "";
    setStatus(${fromLabel} → ${toLabel});

    saveState();
  }

  function swapUnits() {
    const a = fromUnitEl.value;
    fromUnitEl.value = toUnitEl.value;
    toUnitEl.value = a;
    recompute();
  }

  async function copyResult() {
    const txt = toValEl.value?.trim();
    if (!txt) return;
    try {
      await navigator.clipboard.writeText(txt);
      setStatus("Afritað.");
      setTimeout(() => setStatus(${fromUnitEl.value} → ${toUnitEl.value}), 700);
    } catch {
      // Fallback: select text
      toValEl.focus();
      toValEl.select();
      document.execCommand("copy");
      setStatus("Afritað.");
      setTimeout(() => setStatus(${fromUnitEl.value} → ${toUnitEl.value}), 700);
    }
  }

  function clearAll() {
    fromValEl.value = "";
    toValEl.value = "";
    setStatus("Hreinsað.");
    saveState();
    fromValEl.focus();
  }

  // Init
  (function init() {
    // Categories
    setOptions(catEl, CATEGORIES.map(c => ({ id: c.id, label: c.label })));

    // Restore state
    const st = loadState();
    if (st?.cat && CATEGORIES.some(c => c.id === st.cat)) catEl.value = st.cat;
    if (st?.round) roundEl.value = st.round;

    onCatChange(false);

    if (st?.fromUnit) fromUnitEl.value = st.fromUnit;
    if (st?.toUnit) toUnitEl.value = st.toUnit;
    if (fromUnitEl.value === toUnitEl.value) onCatChange(true);

    if (typeof st?.fromVal === "string") fromValEl.value = st.fromVal;

    renderChips();
    recompute();

    // Events
    catEl.addEventListener("change", () => onCatChange(true));
    fromUnitEl.addEventListener("change", recompute);
    toUnitEl.addEventListener("change", recompute);
    fromValEl.addEventListener("input", recompute);
    roundEl.addEventListener("change", recompute);

    swapBtn.addEventListener("click", swapUnits);
    copyBtn.addEventListener("click", copyResult);
    clearBtn.addEventListener("click", clearAll);

    // Enter = swap (nice quick flow), Shift+Enter does nothing special
    fromValEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        swapUnits();
      }
    });
  })();

})();