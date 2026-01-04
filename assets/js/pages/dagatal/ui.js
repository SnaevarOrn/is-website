/* dagatal/ui.js — state + wiring + build/init */
(() => {
  const NS = (window.dagatal = window.dagatal || {});
  const D = NS.date;
  const R = NS.render;
  const H = NS.holidays;

  const $ = (sel) => document.querySelector(sel);

  const calendarEl = $("#calendar");
  const yearLabel = $("#yearLabel");
  const monthLabel = $("#monthLabel");
  const dowBar = $("#dowBar");
  const headerEl = document.querySelector("header.topbar");

  // Info modal bits
  const iOverlay = $("#iOverlay");
  const iCloseBtn = $("#iCloseBtn");
  const iTitle = $("#iTitle");
  const iSummary = $("#iSummary");
  const iText = $("#iText");
  const iSources = $("#iSources");
  const iMeta = $("#iMeta");

  const state = {
    year: 2025,
    showHolidays: false,
    showSpecial: true,
    showMoon: false,

    layout: "months",   // "months" | "weeks" | "year"
    view: "calendar",   // "calendar" | "holidays"

    // holiday list filters (header checkboxes when view=holidays)
    listShowHoliday: true,
    listShowSpecial: true,

    holidayMap: new Map(),
    specialMap: new Map(),
    moonMarkers: new Map(),
    holidayInfoMap: new Map(),  // iso -> info obj
    monthObserver: null,
  };

  /* ============ header height (fix overlap) ============ */
  function syncHeaderHeightVar() {
    if (!headerEl) return;
    const h = Math.ceil(headerEl.getBoundingClientRect().height);
    document.documentElement.style.setProperty("--headerH", `${h}px`);
  }
  window.addEventListener("resize", () => syncHeaderHeightVar());

  /* ============ “anchor” for scroll persistence ============ */
  function getAnchorIso() {
    // find a day cell near the visual center
    const x = Math.floor(window.innerWidth * 0.5);
    const y = Math.floor(window.innerHeight * 0.45);
    const el = document.elementFromPoint(x, y);
    const cell = el?.closest?.("[data-iso]");
    return cell?.getAttribute?.("data-iso") || null;
  }

  function mmddFromIso(iso) {
    if (!iso || typeof iso !== "string") return null;
    const parts = iso.split("-");
    if (parts.length !== 3) return null;
    return parts.slice(1).join("-");
  }

  function isoFromYearAndMmdd(year, mmdd) {
    if (!mmdd) return null;
    return `${year}-${mmdd}`;
  }

  function scrollToIso(iso, behavior = "auto") {
    if (!iso) return;
    const el = document.querySelector(`[data-iso="${iso}"]`);
    if (el) el.scrollIntoView({ block: "center", behavior });
  }

  /* ============ UI sync ============ */
  function syncViewSelect() {
    const sel = $("#viewSelect");
    if (!sel) return;
    sel.value = state.layout;
  }

  function syncHolidaysToggleBtn() {
    const btn = $("#holidaysToggleBtn");
    if (!btn) return;
    btn.textContent = state.view === "holidays" ? "Skoða dagatal" : "Skoða frídaga";
    btn.title = btn.textContent;
  }

  function setMonthLabelText(txt) {
    if (!monthLabel) return;
    monthLabel.textContent = txt;
  }

  function setHeaderContext() {
    syncHolidaysToggleBtn();
    syncViewSelect();

    const filters = $("#holiFilters");
    if (filters) filters.style.display = state.view === "holidays" ? "" : "none";

    if (state.view === "holidays") {
      setMonthLabelText("Frídagar");
      dowBar?.classList.add("is-hidden");
      return;
    }

    dowBar?.classList.remove("is-hidden");

    if (state.layout === "weeks") {
      setMonthLabelText("Vikur");
      return;
    }
    if (state.layout === "year") {
      setMonthLabelText("Ár");
      return;
    }
    // months view: monthLabel updated by observer
  }

  function disconnectMonthObserver() {
    if (state.monthObserver) {
      state.monthObserver.disconnect();
      state.monthObserver = null;
    }
  }

  function setupMonthObserver() {
    disconnectMonthObserver();
    if (state.view !== "calendar" || state.layout !== "months") return;

    const monthSections = Array.from(document.querySelectorAll(".month[data-month]"));
    if (!monthSections.length) return;

    const firstM = parseInt(monthSections[0].dataset.month, 10);
    if (Number.isFinite(firstM)) setMonthLabelText(R.MONTHS_LONG[firstM]);

    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (!visible.length) return;
        visible.sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const m = parseInt(visible[0].target.dataset.month, 10);
        if (Number.isFinite(m)) setMonthLabelText(R.MONTHS_LONG[m]);
      },
      { root: null, rootMargin: "-45% 0px -50% 0px", threshold: [0.01, 0.1, 0.25, 0.5] }
    );

    monthSections.forEach((sec) => obs.observe(sec));
    state.monthObserver = obs;
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
      console.warn("holiday info map failed", e);
      state.holidayInfoMap = new Map();
    }
  }

  async function build(opts = {}) {
    const { preserveScrollIso = null } = opts;

    yearLabel.textContent = state.year;
    const yi = $("#yearInput");
    if (yi) yi.value = state.year;

    const th = $("#toggleHolidays");
    const ts = $("#toggleSpecial");
    const tm = $("#toggleMoon");
    if (th) th.checked = state.showHolidays;
    if (ts) ts.checked = state.showSpecial;
    if (tm) tm.checked = state.showMoon;

    const fh = $("#filterHoliday");
    const fo = $("#filterOther");
    if (fh) fh.checked = state.listShowHoliday !== false;
    if (fo) fo.checked = state.listShowSpecial !== false;

    state.holidayMap = D.getIcelandHolidayMap(state.year);
    state.specialMap = D.getIcelandSpecialDays(state.year);
    state.moonMarkers = D.computeMoonMarkersForYear(state.year);

    await rebuildInfoMap();

    calendarEl.innerHTML = "";
    disconnectMonthObserver();
    setHeaderContext();

    if (state.view === "holidays") {
      R.renderHolidayList(state, calendarEl);
    } else if (state.layout === "weeks") {
      R.renderWeeks(state, calendarEl);
    } else if (state.layout === "year") {
      R.renderYear(state, calendarEl);
    } else {
      R.renderMonths(state, calendarEl);
      setupMonthObserver();
    }

    // after DOM paint: sync header height + restore anchor scroll if requested
    requestAnimationFrame(() => {
      syncHeaderHeightVar();
      if (preserveScrollIso) scrollToIso(preserveScrollIso, "auto");
    });
  }

  function jumpToToday() {
    const now = new Date();
    state.year = now.getFullYear();
    state.view = "calendar";
    state.layout = "months";
    build().then(() => {
      scrollToIso(D.isoDate(now), "smooth");
    });
  }

  function toggleHolidaysView() {
    // preserve current scroll anchor (so coming back to calendar stays sane too)
    const anchor = getAnchorIso();
    state.view = state.view === "holidays" ? "calendar" : "holidays";
    build({ preserveScrollIso: anchor });
  }

  function setLayout(newLayout) {
    // if in holiday view, keep it in holiday view (but header label still updates)
    state.layout = newLayout;
    if (state.view !== "holidays") state.view = "calendar";
    build({ preserveScrollIso: getAnchorIso() });
  }

  /* YEAR DROPDOWN */
  const pop = $("#yearPop");
  const titleWrap = $("#titleWrap");

  function togglePop(force) {
    if (!pop) return;
    const show = typeof force === "boolean" ? force : !pop.classList.contains("show");
    pop.classList.toggle("show", show);
    pop.setAttribute("aria-hidden", String(!show));
    if (show) $("#yearInput")?.focus();
  }

  // keep same MM-DD when changing year (best effort)
  function setYear(y, opts = {}) {
    if (!Number.isFinite(y)) return;

    const anchor = opts.anchorIso || getAnchorIso();
    const mmdd = mmddFromIso(anchor);
    state.year = y;

    const targetIso = mmdd ? isoFromYearAndMmdd(state.year, mmdd) : null;
    build({ preserveScrollIso: targetIso });
    togglePop(false);
  }

  document.addEventListener("click", (e) => {
    if (pop && pop.classList.contains("show") && titleWrap && !titleWrap.contains(e.target)) togglePop(false);
  });
  yearLabel?.addEventListener("click", () => togglePop());

  $("#goYearBtn")?.addEventListener("click", () => setYear(parseInt($("#yearInput")?.value, 10)));
  $("#yearInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("#goYearBtn")?.click();
    if (e.key === "Escape") togglePop(false);
  });

  pop?.querySelectorAll("[data-jump]")?.forEach((btn) => {
    btn.addEventListener("click", () => {
      const j = parseInt(btn.getAttribute("data-jump"), 10);
      setYear(state.year + j);
    });
  });

  /* SETTINGS SHEET */
  const overlay = $("#overlay");
  const sheet = $("#sheet");

  function openSheet() {
    overlay?.classList.add("show");
    sheet?.classList.add("show");
  }
  function closeSheet() {
    overlay?.classList.remove("show");
    sheet?.classList.remove("show");
  }

  $("#closeSheet")?.addEventListener("click", closeSheet);
  overlay?.addEventListener("click", closeSheet);

  $("#toggleHolidays")?.addEventListener("change", (e) => {
    state.showHolidays = e.target.checked;
    build({ preserveScrollIso: getAnchorIso() });
  });
  $("#toggleSpecial")?.addEventListener("change", (e) => {
    state.showSpecial = e.target.checked;
    build({ preserveScrollIso: getAnchorIso() });
  });
  $("#toggleMoon")?.addEventListener("change", (e) => {
    state.showMoon = e.target.checked;
    build({ preserveScrollIso: getAnchorIso() });
  });

  $("#filterHoliday")?.addEventListener("change", (e) => {
    state.listShowHoliday = e.target.checked;
    if (state.view === "holidays") build();
  });
  $("#filterOther")?.addEventListener("change", (e) => {
    state.listShowSpecial = e.target.checked;
    if (state.view === "holidays") build();
  });

  /* HEADER BUTTONS */
  $("#holidaysToggleBtn")?.addEventListener("click", () => toggleHolidaysView());
  $("#todayChip")?.addEventListener("click", () => jumpToToday());

  $("#viewSelect")?.addEventListener("change", (e) => {
    const v = e.target.value;
    if (v === "weeks" || v === "months" || v === "year") setLayout(v);
  });

  monthLabel?.addEventListener("click", () => {
    // clicking month label toggles between months/weeks (kept as your old shortcut)
    if (state.view === "holidays") {
      state.view = "calendar";
      build({ preserveScrollIso: getAnchorIso() });
      return;
    }
    state.layout = state.layout === "months" ? "weeks" : "months";
    build({ preserveScrollIso: getAnchorIso() });
  });

  $("#backBtn")?.addEventListener("click", () => history.back());

  function bumpYear(delta) {
    const anchor = getAnchorIso();
    const mmdd = mmddFromIso(anchor);
    state.year += delta;
    const targetIso = mmdd ? isoFromYearAndMmdd(state.year, mmdd) : null;
    build({ preserveScrollIso: targetIso });
  }
  $("#prevYear")?.addEventListener("click", () => bumpYear(-1));
  $("#nextYear")?.addEventListener("click", () => bumpYear(1));

  /* HAMBURGER MENU */
  const menuBtn = $("#menuBtn");
  const menuPop = $("#menuPop");

  function toggleMenu() { menuPop?.classList.toggle("show"); }
  function closeMenu() { menuPop?.classList.remove("show"); }

  menuBtn?.addEventListener("click", (e) => { e.stopPropagation(); toggleMenu(); });
  menuPop?.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", () => closeMenu());

  $("#menuSettings")?.addEventListener("click", () => { closeMenu(); openSheet(); });

  /* CONTACT MODAL (unchanged) */
  const cOverlay = $("#cOverlay");
  const cCloseBtn = $("#cCloseBtn");
  const cForm = $("#contactForm");
  const cStatus = $("#cStatus");

  function openContact() {
    cOverlay?.classList.add("open");
    if (cStatus) cStatus.textContent = "";
    setTimeout(() => $("#cName")?.focus(), 50);
  }
  function closeContact() { cOverlay?.classList.remove("open"); }

  $("#menuContact")?.addEventListener("click", () => { closeMenu(); openContact(); });
  cCloseBtn?.addEventListener("click", closeContact);
  cOverlay?.addEventListener("click", (e) => { if (e.target === cOverlay) closeContact(); });

  cForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (cStatus) cStatus.textContent = "Sendi...";

    const payload = {
      name: cForm.name.value.trim(),
      email: cForm.email.value.trim(),
      message: cForm.message.value.trim(),
    };

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "Villa við sendingu.");
      }

      if (cStatus) cStatus.textContent = "Sent. Takk!";
      cForm.reset();
      setTimeout(closeContact, 700);
    } catch (_err) {
      if (cStatus) cStatus.textContent = "Tókst ekki að senda. Reyndu aftur eftir smá.";
    }
  });

  /* ⓘ INFO MODAL */
  function openInfoModal(iso) {
    if (!iOverlay) return;
    const info = state.holidayInfoMap?.get(iso);
    if (!info) return;

    if (iTitle) iTitle.textContent = info.title || info.name || "Upplýsingar";
    if (iSummary) iSummary.textContent = info.summary || "";
    if (iText) iText.textContent = info.text || "";

    if (iMeta) {
      const [y, m, d] = iso.split("-").map(Number);
      const dt = new Date(y, m - 1, d);
      iMeta.textContent = `${d} ${["jan","feb","mar","apr","maí","jún","júl","ágú","sep","okt","nóv","des"][m-1]} — ${["mán","þri","mið","fim","fös","lau","sun"][D.monIndex(dt.getDay())]}`;
    }

    if (iSources) {
      iSources.innerHTML = "";
      const srcs = Array.isArray(info.sources) ? info.sources : [];
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
      iSources.style.display = srcs.length ? "" : "none";
    }

    iOverlay.classList.add("open");
  }

  function closeInfoModal() {
    iOverlay?.classList.remove("open");
  }

  iCloseBtn?.addEventListener("click", closeInfoModal);
  iOverlay?.addEventListener("click", (e) => { if (e.target === iOverlay) closeInfoModal(); });

  document.addEventListener("click", (e) => {
    const btn = e.target.closest?.(".info-btn");
    if (!btn) return;
    const iso = btn.dataset.iso;
    if (iso) openInfoModal(iso);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      togglePop(false);
      closeSheet();
      closeMenu();
      closeContact();
      closeInfoModal();
    }
  });

  /* INIT */
  (() => {
    const now = new Date();
    state.year = now.getFullYear();

    // defaults for view select
    state.layout = "months";
    state.view = "calendar";

    // first sync header var (prevents overlap flashes)
    syncHeaderHeightVar();

    build().then(() => {
      requestAnimationFrame(() => {
        syncHeaderHeightVar();
        scrollToIso(D.isoDate(now), "auto");
      });
    });
  })();

  NS._state = state;
})();