/* dagatal/ui.js — state + wiring + build/init */
(() => {
  const NS = (window.dagatal = window.dagatal || {});
  const D = NS.date;
  const R = NS.render;

  const $ = (sel) => document.querySelector(sel);

  const calendarEl = $("#calendar");
  const yearLabel = $("#yearLabel");
  const monthLabel = $("#monthLabel"); // now a button in lower header
  const dowBar = $("#dowBar");

  const state = {
    year: 2025,
    showHolidays: false,
    showSpecial: true,
    showMoon: false,
    layout: "months",   // "months" | "weeks"
    view: "calendar",   // "calendar" | "holidays"
    holidayMap: new Map(),
    specialMap: new Map(),
    moonMarkers: new Map(),
    monthObserver: null,
  };

  function syncLayoutSegTop() {
    const seg = $("#layoutSegTop");
    if (!seg) return;
    seg.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
    seg.querySelector(`button[data-layout="${state.layout}"]`)?.classList.add("active");
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
    syncLayoutSegTop();
    syncHolidaysToggleBtn();

    if (state.view === "holidays") {
      setMonthLabelText("Frídagar");
      dowBar.classList.add("is-hidden");
      return;
    }

    dowBar.classList.remove("is-hidden");

    if (state.layout === "weeks") {
      setMonthLabelText("Vikur");
      return;
    }
    // months view: monthLabel updated by observer (current month name)
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
      {
        root: null,
        rootMargin: "-45% 0px -50% 0px",
        threshold: [0.01, 0.1, 0.25, 0.5],
      }
    );

    monthSections.forEach((sec) => obs.observe(sec));
    state.monthObserver = obs;
  }

  function build() {
    yearLabel.textContent = state.year;
    const yi = $("#yearInput");
    if (yi) yi.value = state.year;

    const th = $("#toggleHolidays");
    const ts = $("#toggleSpecial");
    const tm = $("#toggleMoon");
    if (th) th.checked = state.showHolidays;
    if (ts) ts.checked = state.showSpecial;
    if (tm) tm.checked = state.showMoon;

    state.holidayMap = D.getIcelandHolidayMap(state.year);
    state.specialMap = D.getIcelandSpecialDays(state.year);
    state.moonMarkers = D.computeMoonMarkersForYear(state.year);

    calendarEl.innerHTML = "";
    disconnectMonthObserver();
    setHeaderContext();

    if (state.view === "holidays") {
      R.renderHolidayList(state, calendarEl);
      return;
    }
    if (state.layout === "weeks") {
      R.renderWeeks(state, calendarEl);
      return;
    }

    R.renderMonths(state, calendarEl);
    setupMonthObserver();
  }

  function jumpToToday() {
    const now = new Date();
    state.year = now.getFullYear();
    state.view = "calendar";
    build();

    const iso = D.isoDate(now);
    const el = document.querySelector(`[data-iso="${iso}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function toggleLayout() {
    state.layout = state.layout === "months" ? "weeks" : "months";
    state.view = "calendar";
    build();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleHolidaysView() {
    state.view = state.view === "holidays" ? "calendar" : "holidays";
    build();
    window.scrollTo({ top: 0, behavior: "smooth" });
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

  function setYear(y) {
    if (!Number.isFinite(y)) return;
    state.year = y;
    build();
    togglePop(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  document.addEventListener("click", (e) => {
    if (pop && pop.classList.contains("show") && titleWrap && !titleWrap.contains(e.target)) togglePop(false);
  });

  yearLabel.addEventListener("click", () => togglePop());

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
    build();
  });
  $("#toggleSpecial")?.addEventListener("change", (e) => {
    state.showSpecial = e.target.checked;
    build();
  });
  $("#toggleMoon")?.addEventListener("change", (e) => {
    state.showMoon = e.target.checked;
    build();
  });

  /* TOP CENTER CONTROLS */
  $("#layoutSegTop")
    ?.querySelectorAll("button")
    ?.forEach((btn) => {
      btn.addEventListener("click", () => {
        state.layout = btn.dataset.layout;
        state.view = "calendar";
        build();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });

  $("#todayBtnTop")?.addEventListener("click", () => jumpToToday());
  $("#holidaysToggleBtn")?.addEventListener("click", () => toggleHolidaysView());

  // Lower header indicator: toggle months/weeks (as requested)
  monthLabel?.addEventListener("click", () => {
    if (state.view === "holidays") {
      // If you tap "Frídagar" label, take you back to calendar (nice UX)
      state.view = "calendar";
      build();
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    toggleLayout();
  });

  $("#backBtn")?.addEventListener("click", () => history.back());

  function bumpYear(delta) {
    state.year += delta;
    build();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  $("#prevYear")?.addEventListener("click", () => bumpYear(-1));
  $("#nextYear")?.addEventListener("click", () => bumpYear(1));

  /* HAMBURGER MENU */
  const menuBtn = $("#menuBtn");
  const menuPop = $("#menuPop");

  function toggleMenu() {
    menuPop?.classList.toggle("show");
  }
  function closeMenu() {
    menuPop?.classList.remove("show");
  }

  menuBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMenu();
  });
  menuPop?.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", () => closeMenu());

  $("#menuSettings")?.addEventListener("click", () => {
    closeMenu();
    openSheet();
  });

  /* CONTACT MODAL */
  const cOverlay = $("#cOverlay");
  const cCloseBtn = $("#cCloseBtn");
  const cForm = $("#contactForm");
  const cStatus = $("#cStatus");

  function openContact() {
    cOverlay?.classList.add("open");
    if (cStatus) cStatus.textContent = "";
    setTimeout(() => $("#cName")?.focus(), 50);
  }
  function closeContact() {
    cOverlay?.classList.remove("open");
  }

  $("#menuContact")?.addEventListener("click", () => {
    closeMenu();
    openContact();
  });

  cCloseBtn?.addEventListener("click", closeContact);
  cOverlay?.addEventListener("click", (e) => {
    if (e.target === cOverlay) closeContact();
  });

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

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      togglePop(false);
      closeSheet();
      closeMenu();
      closeContact();
    }
  });

  /* INIT */
  (() => {
    const now = new Date();
    state.year = now.getFullYear();
    build();

    requestAnimationFrame(() => {
      const iso = D.isoDate(now);
      const el = document.querySelector(`[data-iso="${iso}"]`);
      if (el) el.scrollIntoView({ block: "center" });
    });
  })();

  // Optional tiny debug handle (safe)
  NS._state = state;
})();