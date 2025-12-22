/* ís.is — pages/slemb-urdrattur.js */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // ---- Theme button (same behavior everywhere) ----
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
    console.warn("slemb-urdrattur.js: prefs.js not loaded");
  }

  // ---- RNG helpers ----
  function secureRandomInt(min, max){
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

  function makeSeed(){
    const u32 = new Uint32Array(2);
    crypto.getRandomValues(u32);
    return `${Date.now().toString(36)}-${u32[0].toString(36)}${u32[1].toString(36)}`;
  }

  function clampInt(v, fallback){
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.trunc(n);
  }

  // ---- UI helpers ----
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

  function renderNumbers(nums){
    const box = $("numbers");
    if (!box) return;
    box.innerHTML = "";
    nums.forEach(n => {
      const span = document.createElement("span");
      span.className = "su-pill";
      span.textContent = String(n);
      box.appendChild(span);
    });
  }

  function renderMeta({min, max, count, allowRepeat, order, seed}){
    const parts = [
      `Bil: ${min}–${max}`,
      `N: ${count}`,
      allowRepeat ? "með endurtekningu" : "án endurtekningar",
      order === "none" ? "ó-röðað" : (order === "asc" ? "stigvaxandi" : "stiglækkandi")
    ];
    if (seed) parts.push(`seed: ${seed}`);
    const el = $("meta");
    if (el) el.textContent = parts.join(" • ");
  }

  const HISTORY_KEY = "slemb_utdrattur_history_v1";

  function pushHistory(item){
    const hist = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    hist.unshift(item);
    hist.splice(10);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(hist));
    renderHistory();
  }

  function renderHistory(){
    const hist = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    const empty = $("historyEmpty");
    const box = $("history");
    if (!box || !empty) return;

    if (!hist.length){
      empty.style.display = "block";
      box.innerHTML = "";
      return;
    }

    empty.style.display = "none";
    box.innerHTML = "";

    hist.forEach(h => {
      const div = document.createElement("div");
      div.className = "su-hint";
      div.style.display = "grid";
      div.style.gap = "6px";

      const top = document.createElement("div");
      top.style.fontWeight = "900";
      top.textContent = h.nums.join(", ");

      const meta = document.createElement("div");
      meta.style.fontSize = "12px";
      meta.style.opacity = ".9";
      meta.textContent = `${h.when} • ${h.min}–${h.max} • N=${h.count} • ${h.allowRepeat ? "með endurtekningu" : "án endurtekningar"}`;

      div.appendChild(top);
      div.appendChild(meta);
      box.appendChild(div);
    });
  }

  function formatWhen(){
    const d = new Date();
    return d.toLocaleString("is-IS", {
      year:"numeric", month:"2-digit", day:"2-digit",
      hour:"2-digit", minute:"2-digit", second:"2-digit"
    });
  }

  // ---- Core actions ----
  function draw(){
    setWarn("");

    let min = clampInt($("min")?.value, 1);
    let max = clampInt($("max")?.value, 100);
    let count = clampInt($("count")?.value, 1);

    const allowRepeat = !!$("allowRepeat")?.checked;
    const order = $("order")?.value || "none";
    const showSeed = !!$("showSeed")?.checked;

    if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(count)){
      setWarn("Vantar löglegar tölur í reitina.");
      return;
    }

    if (count < 1) count = 1;

    if (min > max){
      const t = min; min = max; max = t;
    }

    const range = max - min + 1;

    if (!allowRepeat && count > range){
      setWarn(`Ekki hægt: N=${count} er stærra en fjöldi talna í bilinu (${range}) þegar endurtekning er óleyfð.`);
      return;
    }

    if (range > 5_000_000){
      setWarn("Þetta bil er rosalega stórt. Ég get, en síminn þinn gæti bölvað mér. Minnkaðu bilið aðeins.");
    }

    const seed = showSeed ? makeSeed() : "";

    const nums = [];
    if (allowRepeat){
      for (let i = 0; i < count; i++){
        nums.push(secureRandomInt(min, max));
      }
    } else {
      const seen = new Set();
      while (nums.length < count){
        const n = secureRandomInt(min, max);
        if (!seen.has(n)){
          seen.add(n);
          nums.push(n);
        }
      }
    }

    if (order === "asc") nums.sort((a,b)=>a-b);
    if (order === "desc") nums.sort((a,b)=>b-a);

    renderNumbers(nums);
    renderMeta({min, max, count, allowRepeat, order, seed});

    pushHistory({ nums, min, max, count, allowRepeat, when: formatWhen() });
  }

  function resetAll(){
    setWarn("");
    if ($("min")) $("min").value = 1;
    if ($("max")) $("max").value = 100;
    if ($("count")) $("count").value = 1;
    if ($("allowRepeat")) $("allowRepeat").checked = true;
    if ($("order")) $("order").value = "none";
    if ($("showSeed")) $("showSeed").checked = false;
    if ($("numbers")) $("numbers").innerHTML = "";
    if ($("meta")) $("meta").textContent = "";
  }

  async function copyResult(){
    const pills = Array.from(document.querySelectorAll("#numbers .su-pill"));
    const nums = pills.map(p => p.textContent.trim()).filter(Boolean);
    const text = nums.length ? nums.join(", ") : "";

    if (!text){
      setWarn("Ekkert til að afrita ennþá. Ýttu á “Draga” fyrst.");
      return;
    }
    try{
      await navigator.clipboard.writeText(text);
      setWarn(""); // silent success
    } catch {
      setWarn("Gat ekki afritað (iOS getur verið þrjóskur). Prófaðu að velja og afrita handvirkt.");
    }
  }

  // ---- Wire events ----
  $("drawBtn")?.addEventListener("click", draw);
  $("resetBtn")?.addEventListener("click", resetAll);
  $("copyBtn")?.addEventListener("click", copyResult);

  ["min","max","count"].forEach(id => {
    $(id)?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") draw();
    });
  });

  // Init
  renderHistory();
})();
