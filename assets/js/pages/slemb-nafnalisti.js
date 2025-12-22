/* =========================================================
   ís.is — slemb-nafnalisti.js
   Simple random name list tools (draw 1 or N, history, copy)
   Depends on prefs.js (+ theme.js optional)
   ========================================================= */
(function () {
  "use strict";

  const KEY_STATE = "slemb_nafnalisti_state_v1";
  const KEY_HIST  = "slemb_nafnalisti_history_v1";

  const $ = (id) => document.getElementById(id);

  const els = {
    names: $("names"),
    count: $("count"),
    mode: $("mode"),
    drawBtn: $("drawBtn"),
    shuffleBtn: $("shuffleBtn"),
    clearBtn: $("clearBtn"),
    warn: $("warn"),
    result: $("result"),
    meta: $("meta"),
    copyBtn: $("copyBtn"),
    history: $("history"),
    historyEmpty: $("historyEmpty"),
    themeBtn: $("themeBtn"),
  };

  function setWarn(msg) {
    if (!msg) {
      els.warn.style.display = "none";
      els.warn.textContent = "";
      return;
    }
    els.warn.style.display = "block";
    els.warn.textContent = msg;
  }

  function normalizeLines(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  function clampInt(v, fallback) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(1, Math.trunc(n));
  }

  // crypto-based shuffle (Fisher-Yates)
  function randU32() {
    const u32 = new Uint32Array(1);
    crypto.getRandomValues(u32);
    return u32[0];
  }
  function randInt(maxExclusive) {
    // uniform-ish modulo bias is tiny here, but we can do rejection to be pedantic
    if (maxExclusive <= 1) return 0;
    const maxUint = 0xFFFFFFFF;
    const bucket = Math.floor((maxUint + 1) / maxExclusive) * maxExclusive;
    let x;
    do { x = randU32(); } while (x >= bucket);
    return x % maxExclusive;
  }
  function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function formatWhen() {
    const d = new Date();
    return d.toLocaleString("is-IS", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    });
  }

  function renderResult(names) {
    els.result.innerHTML = "";
    names.forEach((n) => {
      const pill = document.createElement("span");
      pill.className = "slemb-pill";
      pill.textContent = n;
      els.result.appendChild(pill);
    });
  }

  function renderMeta({ total, count, mode }) {
    const parts = [
      `N: ${count}`,
      mode === "unique" ? "án endurtekningar" : "með endurtekningu",
      `í lista: ${total}`
    ];
    els.meta.textContent = parts.join(" • ");
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(KEY_STATE);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function saveState() {
    const state = {
      names: els.names.value,
      count: clampInt(els.count.value, 1),
      mode: els.mode.value === "repeat" ? "repeat" : "unique",
    };
    localStorage.setItem(KEY_STATE, JSON.stringify(state));
  }

  function pushHistory(item) {
    const hist = readHistory();
    hist.unshift(item);
    hist.splice(10);
    localStorage.setItem(KEY_HIST, JSON.stringify(hist));
    renderHistory();
  }

  function readHistory() {
    try {
      return JSON.parse(localStorage.getItem(KEY_HIST) || "[]");
    } catch {
      return [];
    }
  }

  function renderHistory() {
    const hist = readHistory();
    if (!hist.length) {
      els.historyEmpty.style.display = "block";
      els.history.innerHTML = "";
      return;
    }
    els.historyEmpty.style.display = "none";
    els.history.innerHTML = "";

    hist.forEach(h => {
      const item = document.createElement("div");
      item.className = "slemb-hitem";

      const top = document.createElement("div");
      top.className = "slemb-hitem-top";
      top.textContent = (h.pick || []).join(", ");

      const meta = document.createElement("div");
      meta.className = "slemb-hitem-meta";
      meta.textContent = `${h.when} • N=${h.count} • ${h.mode === "unique" ? "án endurtekningar" : "með endurtekningu"} • listi=${h.total}`;

      item.appendChild(top);
      item.appendChild(meta);
      els.history.appendChild(item);
    });
  }

  function draw() {
    setWarn("");

    const list = normalizeLines(els.names.value);
    const total = list.length;

    if (!total) {
      setWarn("Settu inn að minnsta kosti eitt nafn.");
      renderResult([]);
      els.meta.textContent = "";
      return;
    }

    const count = clampInt(els.count.value, 1);
    const mode = els.mode.value === "repeat" ? "repeat" : "unique";

    if (mode === "unique" && count > total) {
      setWarn(`Ekki hægt: N=${count} er stærra en fjöldi nafna (${total}) þegar endurtekning er óleyfð.`);
      return;
    }

    let pick = [];
    if (mode === "repeat") {
      for (let i = 0; i < count; i++) {
        pick.push(list[randInt(total)]);
      }
    } else {
      const tmp = list.slice();
      shuffleInPlace(tmp);
      pick = tmp.slice(0, count);
    }

    renderResult(pick);
    renderMeta({ total, count, mode });

    pushHistory({
      when: formatWhen(),
      pick,
      count,
      mode,
      total
    });

    saveState();
  }

  function shuffleList() {
    setWarn("");
    const list = normalizeLines(els.names.value);
    if (list.length < 2) {
      setWarn("Þarf a.m.k. 2 nöfn til að blanda.");
      return;
    }
    shuffleInPlace(list);
    els.names.value = list.join("\n");
    saveState();
  }

  function clearAll() {
    setWarn("");
    els.names.value = "";
    els.count.value = 1;
    els.mode.value = "unique";
    els.result.innerHTML = "";
    els.meta.textContent = "";
    saveState();
  }

  async function copyResult() {
    setWarn("");
    const pills = Array.from(els.result.querySelectorAll(".slemb-pill"));
    const text = pills.map(p => p.textContent.trim()).filter(Boolean).join(", ");
    if (!text) {
      setWarn("Ekkert til að afrita ennþá. Ýttu á “Draga” fyrst.");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      // silent success
    } catch {
      setWarn("Gat ekki afritað (iOS getur verið þrjóskur). Prófaðu að velja og afrita handvirkt.");
    }
  }

  function wireThemeButton() {
    if (!els.themeBtn) return;

    // Prefer prefs.js
    if (window.prefs && typeof prefs.toggleTheme === "function") {
      els.themeBtn.addEventListener("click", () => {
        prefs.toggleTheme();
        // allow any page toggles to sync
        if (window.theme && typeof window.theme.sync === "function") window.theme.sync();
      });
      return;
    }

    // Fallback
    els.themeBtn.addEventListener("click", () => {
      const cur = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
      const next = cur === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("is.pref.theme", JSON.stringify(next));
      localStorage.setItem("theme", next);
    });
  }

  function init() {
    // restore state
    const st = loadState();
    if (st) {
      if (typeof st.names === "string") els.names.value = st.names;
      if (st.count) els.count.value = clampInt(st.count, 1);
      if (st.mode) els.mode.value = st.mode === "repeat" ? "repeat" : "unique";
    }

    wireThemeButton();

    els.drawBtn.addEventListener("click", draw);
    els.shuffleBtn.addEventListener("click", shuffleList);
    els.clearBtn.addEventListener("click", clearAll);
    els.copyBtn.addEventListener("click", copyResult);

    // Enter to draw (nice on mobile)
    els.count.addEventListener("keydown", (e) => { if (e.key === "Enter") draw(); });
    els.names.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") draw();
    });

    // Save on changes
    ["input", "change"].forEach(evt => {
      els.names.addEventListener(evt, saveState);
      els.count.addEventListener(evt, saveState);
      els.mode.addEventListener(evt, saveState);
    });

    renderHistory();
  }

  init();
})();
