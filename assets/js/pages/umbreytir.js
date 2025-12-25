/* /assets/js/pages/umbreytir.js
   ís.is — Umbreytir
   - No network
   - Minimal UI
   - LocalStorage remembers last selection
   - Decimals stepper (Aukastafir) via dpDec/dpInc + dpVal
   - Added Volume (Rúmmál)
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
  const chipsEl = $("chips");
  const explainEl = $("explain");
  const statusHintEl = $("statusHint");

  // NEW: decimals stepper
  const dpDecEl = $("dpDec");
  const dpIncEl = $("dpInc");
  const dpValEl = $("dpVal");

  const KEY = "is_umbreytir_v1";

  let dp = 2;                 // 0–6
  const DP_MIN = 0;
  const DP_MAX = 6;

  // Helpers
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

  function parseNumber(s) {
    if (s == null) return NaN;
    const t = String(s).trim().replace(/\s+/g, "").replace(",", ".");
    if (t === "") return NaN;
    const n = Number(t);
    return Number.isFinite(n) ? n : NaN;
  }

  function formatNumberFixed(n, dpCount) {
    if (!Number.isFinite(n)) return "";
    const s = n.toFixed(clamp(dpCount, 0, 10));
    return s.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
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
  // NOTE: For volume base is m³.
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
      id: "volume",
      label: "Rúmmál",
      units: [
        { id: "ml",  label: "mL", factor: 1e-6 },          // 1 mL = 1e-6 m³
        { id: "l",   label: "L",  factor: 1e-3 },          // 1 L  = 1e-3 m³
        { id: "m3",  label: "m³", factor: 1 },             // base
        { id: "tsp", label: "teskeið (tsp)", factor: 4.92892159375e-6 },
        { id: "tbsp",label: "matskeið (tbsp)", factor: 14.78676478125e-6 },
        { id: "cup", label: "boll(i) (cup)", factor: 236.5882365e-6 },
        { id: "pt",  label: "pint (US pt)", factor: 0.473176473e-3 },
        { id: "gal", label: "gallon (US gal)", factor: 3.785411784e-3 },
      ],
      explain: "Rúmmál er umbreytt miðað við m³ (rúmmetra)."
    },
    {
      id: "temperature",
      label: "Hitastig",
      units: [
        { id: "C", label: "°C", toBase: (c) => c, fromBase: (c) => c },
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
    { cat: "volume", from: "l", to: "gal", label: "L → gal" },
    { cat: "volume", from: "gal", to: "l", label: "gal → L" },
  ];

  function getCat(id) {
    return CATEGORIES.find(c => c.id === id) || CATEGORIES[0];
  }

  function getUnit(cat, unitId) {
    return cat.units.find(u => u.id === unitId) || cat.units[0];
  }

  function isTempCat(cat) {
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
      dp,
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
    toValEl.value = formatNumberFixed(out, dp);

    explainEl.textContent = explainText(catEl.value, fromUnitEl.value, toUnitEl.value);

    // Little status line with units (labels)
    const fromLabel = fromUnitEl.options[fromUnitEl.selectedIndex]?.textContent || "";
    const toLabel = toUnitEl.options[toUnitEl.selectedIndex]?.textContent || "";
    setStatus(`${fromLabel} → ${toLabel}`);

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
      setTimeout(() => {
        const fromLabel = fromUnitEl.options[fromUnitEl.selectedIndex]?.textContent || "";
        const toLabel = toUnitEl.options[toUnitEl.selectedIndex]?.textContent || "";
        setStatus(`${fromLabel} → ${toLabel}`);
      }, 700);
    } catch {
      // Fallback
      toValEl.focus();
      toValEl.select();
      document.execCommand("copy");
      setStatus("Afritað.");
      setTimeout(() => {
        const fromLabel = fromUnitEl.options[fromUnitEl.selectedIndex]?.textContent || "";
        const toLabel = toUnitEl.options[toUnitEl.selectedIndex]?.textContent || "";
        setStatus(`${fromLabel} → ${toLabel}`);
      }, 700);
    }
  }

  function clearAll() {
    fromValEl.value = "";
    toValEl.value = "";
    setStatus("Hreinsað.");
    saveState();
    fromValEl.focus();
  }

  function setDp(next) {
    dp = clamp(next, DP_MIN, DP_MAX);
    if (dpValEl) dpValEl.textContent = String(dp);
    recompute();
  }

  // Init
  (function init() {
    // Categories
    setOptions(catEl, CATEGORIES.map(c => ({ id: c.id, label: c.label })));

    // Restore state
    const st = loadState();
    if (st?.cat && CATEGORIES.some(c => c.id === st.cat)) catEl.value = st.cat;

    if (Number.isInteger(st?.dp)) dp = clamp(st.dp, DP_MIN, DP_MAX);
    if (dpValEl) dpValEl.textContent = String(dp);

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

    swapBtn.addEventListener("click", swapUnits);
    copyBtn.addEventListener("click", copyResult);
    clearBtn.addEventListener("click", clearAll);

    if (dpDecEl) dpDecEl.addEventListener("click", () => setDp(dp - 1));
    if (dpIncEl) dpIncEl.addEventListener("click", () => setDp(dp + 1));

    // Enter = swap (quick flow)
    fromValEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        swapUnits();
      }
    });
  })();

})();