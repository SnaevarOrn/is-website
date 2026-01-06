/* assets/js/dagar.js — list view for holidays/special days (no calendar grid) */
(() => {
  const NS = (window.dagatal = window.dagatal || {});
  const D = NS.date;
  const H = NS.holidays;

  const $ = (sel) => document.querySelector(sel);

  const listEl = $("#list");
  const yearLabel = $("#yearLabel");

  const backBtn = $("#backBtn");
  const prevYear = $("#prevYear");
  const nextYear = $("#nextYear");
  const todayChip = $("#todayChip");

  const filterHoliday = $("#filterHoliday");
  const filterSpecial = $("#filterSpecial");
  const filterOnlyMajor = $("#filterOnlyMajor");

  // Info modal bits
  const iOverlay = $("#iOverlay");
  const iCloseBtn = $("#iCloseBtn");
  const iTitle = $("#iTitle");
  const iSummary = $("#iSummary");
  const iText = $("#iText");
  const iSources = $("#iSources");
  const iSourcesWrap = $("#iSourcesWrap");
  const iMeta = $("#iMeta");

  const holidayInfoBtn = $("#holidayInfoBtn");

  const state = {
    year: new Date().getFullYear(),
    holidayMap: new Map(),
    majorHolidayMap: new Map(),
    specialMap: new Map(),
    holidayInfoMap: new Map(),

    showHoliday: true,
    showSpecial: true,
    onlyMajor: false,
  };

  const MONTHS_SHORT = ["jan","feb","mar","apr","maí","jún","júl","ágú","sep","okt","nóv","des"];
  const WEEKDAYS = ["mán","þri","mið","fim","fös","lau","sun"];

  function fmtMetaFromIso(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    const wd = WEEKDAYS[D.monIndex(dt.getDay())];
    return `${d} ${MONTHS_SHORT[m - 1]} — ${wd}`;
  }

  async function rebuildInfoMap() {
    try {
      if (!H || typeof H.load !== "function" || typeof H.buildInfoMapForYear !== "function") {
        state.holidayInfoMap = new Map();
        return;
      }
      const data = await H.load();
      state.holidayInfoMap = H.buildInfoMapForYear(state.year, data) || new Map();
    } catch (e) {
      console.warn("[dagar] holiday info map failed", e);
      state.holidayInfoMap = new Map();
    }
  }

  function openInfoModalForIso(iso) {
    if (!iOverlay) return;
    const info = state.holidayInfoMap?.get?.(iso);
    if (!info) return;

    if (iTitle) iTitle.textContent = info.title || info.name || "Upplýsingar";
    if (iSummary) iSummary.textContent = info.summary || "";
    if (iText) iText.textContent = info.text || "";

    if (iMeta) iMeta.textContent = fmtMetaFromIso(iso);

    // sources
    const srcs = Array.isArray(info.sources) ? info.sources : [];
    if (iSources) iSources.innerHTML = "";
    if (iSourcesWrap) iSourcesWrap.style.display = srcs.length ? "" : "none";

    for (const s of srcs) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = s.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = s.label || s.url;
      li.appendChild(a);
      iSources.appendChild(li);
    }

    iOverlay.classList.add("open");
  }

  function closeInfoModal() {
    iOverlay?.classList.remove("open");
  }

  function renderList() {
    if (!listEl) return;

    const items = [];

    if (state.showHoliday) {
      for (const [iso, name] of state.holidayMap.entries()) {
        const isMajor = state.majorHolidayMap.has(iso);
        if (state.onlyMajor && !isMajor) continue;
        items.push({ iso, name, kind: "holiday", isMajor });
      }
    }

    if (state.showSpecial && !state.onlyMajor) {
      for (const [iso, name] of state.specialMap.entries()) {
        // specials are never "major holidays"
        items.push({ iso, name, kind: "special", isMajor: false });
      }
    }

    items.sort((a, b) => a.iso.localeCompare(b.iso));

    listEl.innerHTML = "";

    for (const it of items) {
      const row = document.createElement("div");
      row.className = "hitem " + (it.kind === "holiday" ? "is-holiday" : "is-special");
      if (it.isMajor) row.classList.add("is-major-holiday");

      const left = document.createElement("div");
      left.className = "hleft";

      // half-red suffix for Aðfangadagur / Gamlársdagur if you want:
      if (it.isMajor && typeof D.formatHalfRedDagur === "function") {
        left.innerHTML = D.formatHalfRedDagur(it.name);
      } else {
        left.textContent = it.name;
      }

      const right = document.createElement("div");
      right.className = "hright";

      const meta = document.createElement("span");
      meta.className = "hmeta";
      meta.textContent = fmtMetaFromIso(it.iso);

      right.appendChild(meta);

      // info button only if we have info for that iso
      if (state.holidayInfoMap?.has?.(it.iso)) {
        const btn = document.createElement("button");
        btn.className = "info-btn";
        btn.type = "button";
        btn.dataset.iso = it.iso;
        btn.title = "Upplýsingar";
        btn.textContent = "i";
        right.appendChild(btn);
      }

      row.appendChild(left);
      row.appendChild(right);
      listEl.appendChild(row);
    }
  }

  async function build() {
    if (yearLabel) yearLabel.textContent = String(state.year);

    state.holidayMap = D.getIcelandHolidayMap(state.year);
    state.majorHolidayMap = D.getIcelandMajorHolidayMap(state.year);
    state.specialMap = D.getIcelandSpecialDays(state.year);

    await rebuildInfoMap();
    renderList();
  }

  function setYear(y) {
    if (!Number.isFinite(y)) return;
    state.year = y;
    build();
  }

  function bumpYear(delta) {
    setYear(state.year + delta);
  }

  function jumpToToday() {
    const now = new Date();
    setYear(now.getFullYear());
  }

  // Wiring
  backBtn?.addEventListener("click", () => history.back());
  prevYear?.addEventListener("click", () => bumpYear(-1));
  nextYear?.addEventListener("click", () => bumpYear(1));
  todayChip?.addEventListener("click", () => jumpToToday());

  filterHoliday?.addEventListener("change", (e) => {
    state.showHoliday = !!e.target.checked;
    renderList();
  });
  filterSpecial?.addEventListener("change", (e) => {
    state.showSpecial = !!e.target.checked;
    renderList();
  });
  filterOnlyMajor?.addEventListener("change", (e) => {
    state.onlyMajor = !!e.target.checked;
    renderList();
  });

  document.addEventListener("click", (e) => {
    const btn = e.target.closest?.(".info-btn");
    if (!btn) return;
    const iso = btn.dataset.iso;
    if (iso) openInfoModalForIso(iso);
  });

  iCloseBtn?.addEventListener("click", closeInfoModal);
  iOverlay?.addEventListener("click", (e) => { if (e.target === iOverlay) closeInfoModal(); });

  // Header explainer bubble (optional)
  holidayInfoBtn?.addEventListener("click", () => {
    if (!iOverlay) return;
    if (iTitle) iTitle.textContent = "Frídagar og stórhátíðardagar (Ísland)";
    if (iMeta) iMeta.textContent = "";
    if (iSummary) iSummary.textContent = "Stórhátíðardagar eru rauðmerktir. Þetta er almenn samantekt.";
    if (iText) iText.innerHTML = `
      <div class="note"><b>Stórhátíðardagar</b> eru rauðir. Aðrir frídagar glitra (shimmer) ef CSS styður það.</div>
    `;
    if (iSourcesWrap) iSourcesWrap.style.display = "none";
    iOverlay.classList.add("open");
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeInfoModal();
  });

  // Init
  build();
})();