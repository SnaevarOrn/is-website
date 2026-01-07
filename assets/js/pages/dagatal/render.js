/*  dagatal/render.js — rendering only (DOM in/out), no event wiring */
(() => {
  const NS = (window.dagatal = window.dagatal || {});
  const D = NS.date;

  const WEEKDAYS = ["mán", "þri", "mið", "fim", "fös", "lau", "sun"];
  const MONTHS_LONG = [
    "janúar","febrúar","mars","apríl","maí","júní",
    "júlí","ágúst","september","október","nóvember","desember"
  ];

  function weekdayShort(date) {
    return WEEKDAYS[D.monIndex(date.getDay())];
  }

  function monthShort(m) {
    return ["jan","feb","mar","apr","maí","jún","júl","ágú","sep","okt","nóv","des"][m];
  }

  function getInfoMap(state) {
    const map = state?.holidayInfoMap || state?.holidayInfo || state?.infoMap;
    return map && typeof map.has === "function" ? map : null;
  }

  function maybeAddInfoButton(state, iso, hostEl) {
    const map = getInfoMap(state);
    if (!map || !map.has(iso)) return;

    const btn = document.createElement("button");
    btn.className = "info-btn";
    btn.type = "button";
    btn.dataset.iso = iso;
    btn.title = "Upplýsingar";
    btn.textContent = "i";
    hostEl.appendChild(btn);
  }

  function makeDayCell(state, date) {
    const iso = D.isoDate(date);

    const cell = document.createElement("div");
    cell.className = "cell";
    cell.dataset.iso = iso;

    const dnum = document.createElement("div");
    dnum.className = "dnum";
    dnum.textContent = date.getDate();
    cell.appendChild(dnum);

    const isHoliday = !!state?.holidayMap?.has?.(iso);
    const isMajor = !!state?.majorHolidayMap?.has?.(iso);
    const isSpecial = !!state?.specialMap?.has?.(iso) && !isHoliday;

    if (state.showHolidays && isHoliday) cell.classList.add("is-holiday");
    if (state.showHolidays && isMajor) cell.classList.add("is-major-holiday");
    if (state.showSpecial && isSpecial) cell.classList.add("is-special");

    if (state.showMoon) {
      const mk = state?.moonMarkers?.get?.(iso);
      if (mk) {
        const moon = document.createElement("div");
        moon.className = "moon";
        moon.textContent = mk === "full" ? "🌕" : "🌑";
        cell.appendChild(moon);
      }
    }

    maybeAddInfoButton(state, iso, cell);

    const today = new Date();
    if (iso === D.isoDate(today) && state.year === today.getFullYear()) {
      cell.classList.add("is-today");
    }

    return cell;
  }

  function renderMonths(state, calendarEl) {
    for (let m = 0; m < 12; m++) {
      const monthBlock = document.createElement("section");
      monthBlock.className = "month";
      monthBlock.dataset.month = String(m);

      const mh = document.createElement("div");
      mh.className = "month-header";
      mh.innerHTML = `
        <div class="month-name">${MONTHS_LONG[m]}</div>
        <div class="month-meta">${state.year} — ${D.daysInMonth(state.year, m)} dagar${m === 1 && D.isLeapYear(state.year) ? " (hlaupár)" : ""}</div>
      `;
      monthBlock.appendChild(mh);

      const grid = document.createElement("div");
      grid.className = "grid";

      const first = new Date(state.year, m, 1);
      const offset = D.monIndex(first.getDay());
      for (let i = 0; i < offset; i++) {
        const empty = document.createElement("div");
        empty.className = "cell is-empty";
        grid.appendChild(empty);
      }

      const dim = D.daysInMonth(state.year, m);
      for (let day = 1; day <= dim; day++) {
        grid.appendChild(makeDayCell(state, new Date(state.year, m, day)));
      }

      monthBlock.appendChild(grid);
      calendarEl.appendChild(monthBlock);
    }
  }

  function renderYear(state, calendarEl) {
    const gridWrap = document.createElement("section");
    gridWrap.className = "yeargrid";

    for (let m = 0; m < 12; m++) {
      const card = document.createElement("div");
      card.className = "mini-month";
      card.dataset.month = String(m);

      const head = document.createElement("div");
      head.className = "mini-head";
      head.innerHTML = `<b>${MONTHS_LONG[m]}</b><small>${state.year}</small>`;
      card.appendChild(head);

      const grid = document.createElement("div");
      grid.className = "mini-grid";

      const first = new Date(state.year, m, 1);
      const offset = D.monIndex(first.getDay());
      for (let i = 0; i < offset; i++) {
        const empty = document.createElement("div");
        empty.className = "cell is-empty";
        grid.appendChild(empty);
      }

      const dim = D.daysInMonth(state.year, m);
      for (let day = 1; day <= dim; day++) {
        grid.appendChild(makeDayCell(state, new Date(state.year, m, day)));
      }

      card.appendChild(grid);
      gridWrap.appendChild(card);
    }

    calendarEl.appendChild(gridWrap);
  }

  function renderWeeks(state, calendarEl) {
    const box = document.createElement("section");
    box.className = "weeks";

    const wh = document.createElement("div");
    wh.className = "weeks-header";
    wh.innerHTML = `
      <div class="weeks-title">Vikur</div>
      <div class="weeks-meta">${state.year}</div>
    `;
    box.appendChild(wh);

    const spacer = document.createElement("div");
    spacer.className = "weeks-dow-spacer";
    spacer.innerHTML = `<div style="height:1px;opacity:.0"></div>`;
    box.appendChild(spacer);

    const jan1 = new Date(state.year, 0, 1);
    const start = new Date(jan1);
    start.setDate(jan1.getDate() - D.monIndex(jan1.getDay()));

    const dec31 = new Date(state.year, 11, 31);
    let weekIndex = 1;
    let d = new Date(start);

    function weekHasAnyDayInYear(monday) {
      for (let i = 0; i < 7; i++) {
        const x = new Date(monday);
        x.setDate(monday.getDate() + i);
        if (x.getFullYear() === state.year) return true;
      }
      return false;
    }

    while (d <= dec31 || weekHasAnyDayInYear(d)) {
      if (!weekHasAnyDayInYear(d)) break;

      const row = document.createElement("div");
      row.className = "week-row";

      const wn = document.createElement("div");
      wn.className = "wn";
      wn.textContent = "V" + weekIndex;
      row.appendChild(wn);

      const wg = document.createElement("div");
      wg.className = "week-grid";

      for (let i = 0; i < 7; i++) {
        const day = new Date(d);
        day.setDate(d.getDate() + i);

        if (day.getFullYear() !== state.year) {
          const empty = document.createElement("div");
          empty.className = "cell is-empty";
          wg.appendChild(empty);
        } else {
          wg.appendChild(makeDayCell(state, day));
        }
      }

      row.appendChild(wg);
      box.appendChild(row);

      d.setDate(d.getDate() + 7);
      weekIndex++;
    }

    calendarEl.appendChild(box);
  }

  function renderHolidayList(state, calendarEl) {
    const box = document.createElement("section");
    box.className = "holidays";

    const showHoliday = state.listShowHoliday !== false;
    const showSpecial = state.listShowSpecial !== false;

    const holidays = showHoliday
      ? Array.from(state.holidayMap.entries()).map(([iso, name]) => ({ iso, name, kind: "holiday" }))
      : [];

    const specials = showSpecial
      ? Array.from(state.specialMap.entries()).map(([iso, name]) => ({ iso, name, kind: "special" }))
      : [];

    const items = [...holidays, ...specials].sort((a, b) => a.iso.localeCompare(b.iso));

    for (const it of items) {
      const [y, mm, dd] = it.iso.split("-").map(Number);
      const date = new Date(y, mm - 1, dd);
      const right = `${dd} ${monthShort(mm - 1)} — ${weekdayShort(date)}`;

      const item = document.createElement("div");
      item.className = "hitem " + (it.kind === "holiday" ? "is-holiday" : "is-special");

      const isMajor = !!state?.majorHolidayMap?.has?.(it.iso);
      if (isMajor) item.classList.add("is-major-holiday");

      const left = document.createElement("div");
      left.className = "hleft";

      if (isMajor && typeof D.formatHalfRedDagur === "function") {
        left.innerHTML = D.formatHalfRedDagur(it.name);
      } else {
        left.textContent = it.name;
      }

      const rightWrap = document.createElement("div");
      rightWrap.className = "hright";

      const meta = document.createElement("span");
      meta.className = "hmeta";
      meta.textContent = right;

      rightWrap.appendChild(meta);
      maybeAddInfoButton(state, it.iso, rightWrap);

      item.appendChild(left);
      item.appendChild(rightWrap);
      box.appendChild(item);
    }

    // --- Year stats (bottom of holiday list) ---
    if (typeof D.computeSwingHolidayStats === "function") {
      const s = D.computeSwingHolidayStats(state.year);

      const panel = document.createElement("div");
      panel.className = "year-score";

      const cycleNote = "Mynstur vikudaga endurtaka sig oft í ~28 ára lotu (næstum alltaf).";

      panel.innerHTML = `
        <div class="ys-title">Árstölfræði sveiflu-frídaga</div>

        <div class="ys-row">
          <b>${s.year}</b>
          <span class="ys-badge">${s.score100}/100</span>
          <span class="ys-verd">${s.verdict}</span>
        </div>

        <div class="ys-meta">
          Virkir dagar: <b>${s.weekdayCount}/${s.total}</b> (${s.weekdayPct}%)
          &nbsp;•&nbsp;
          Helgar: <b>${s.weekendCount}/${s.total}</b> (${s.weekendPct}%)
        </div>

        <div class="ys-dow">
          <span><b>Mán</b> ${s.byDow[0]}</span>
          <span><b>Þri</b> ${s.byDow[1]}</span>
          <span><b>Mið</b> ${s.byDow[2]}</span>
          <span><b>Fim</b> ${s.byDow[3]}</span>
          <span><b>Fös</b> ${s.byDow[4]}</span>
          <span><b>Lau</b> ${s.byDow[5]}</span>
          <span><b>Sun</b> ${s.byDow[6]}</span>
        </div>

        <div class="ys-note">${cycleNote}</div>
      `;
      box.appendChild(panel);
    }

    calendarEl.appendChild(box);
  }

  NS.render = {
    MONTHS_LONG,
    renderMonths,
    renderWeeks,
    renderYear,
    renderHolidayList,
  };
})();
