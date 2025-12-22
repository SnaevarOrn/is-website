/* dagatal.js — page logic (moved from inline script) */
(() => {
  const pad2 = (n) => String(n).padStart(2, "0");
  const isoDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  const WEEKDAYS = ["mán","þri","mið","fim","fös","lau","sun"]; // Monday-first
  const MONTHS_LONG = ["janúar","febrúar","mars","apríl","maí","júní","júlí","ágúst","september","október","nóvember","desember"];
  const monIndex = (jsDay) => (jsDay + 6) % 7;
  const isLeapYear = (y) => (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
  const daysInMonth = (y, m) => new Date(y, m+1, 0).getDate();

  // Easter (Meeus/Jones/Butcher)
  function easterSunday(year){
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19*a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2*e + 2*i - h - k) % 7;
    const m = Math.floor((a + 11*h + 22*l) / 451);
    const month = Math.floor((h + l - 7*m + 114) / 31);
    const day = ((h + l - 7*m + 114) % 31) + 1;
    return new Date(year, month-1, day);
  }
  function addDays(date, n){ const d = new Date(date); d.setDate(d.getDate() + n); return d; }

  function firstThursdayAfterApril18(year){
    const start = new Date(year, 3, 19);
    const delta = (3 - monIndex(start.getDay()) + 7) % 7; // Thursday=3
    return addDays(start, delta);
  }
  function firstMondayOfAugust(year){
    const d = new Date(year, 7, 1);
    const delta = (0 - monIndex(d.getDay()) + 7) % 7; // Monday=0
    return addDays(d, delta);
  }

  function getIcelandHolidayMap(year){
    const map = new Map(); // iso -> name
    const add = (m,d,name) => map.set(`${year}-${pad2(m)}-${pad2(d)}`, name);

    add(1,1,"Nýársdagur");
    add(1,6,"Þrettándinn");
    add(5,1,"Verkalýðsdagurinn");
    add(6,17,"Þjóðhátíðardagurinn");
    add(12,24,"Aðfangadagur");
    add(12,25,"Jóladagur");
    add(12,26,"Annar í jólum");
    add(12,31,"Gamlársdagur");

    const easter = easterSunday(year);
    map.set(isoDate(addDays(easter,-3)), "Skírdagur");
    map.set(isoDate(addDays(easter,-2)), "Föstudagurinn langi");
    map.set(isoDate(easter), "Páskadagur");
    map.set(isoDate(addDays(easter,1)), "Annar í páskum");
    map.set(isoDate(addDays(easter,39)), "Uppstigningardagur");
    map.set(isoDate(addDays(easter,49)), "Hvítasunnudagur");
    map.set(isoDate(addDays(easter,50)), "Annar í hvítasunnu");

    map.set(isoDate(firstThursdayAfterApril18(year)), "Sumardagurinn fyrsti");
    map.set(isoDate(firstMondayOfAugust(year)), "Frídagur verslunarmanna");

    return map;
  }

  function getIcelandSpecialDays(year){
    const map = new Map(); // iso -> name
    const add = (m,d,name) => map.set(`${year}-${pad2(m)}-${pad2(d)}`, name);

    add(2,14,"Valentínusardagur");
    add(12,23,"Þorláksmessa");
    add(10,31,"Hrekkjavaka");

    const easter = easterSunday(year);
    map.set(isoDate(addDays(easter,-48)), "Bolludagur");
    map.set(isoDate(addDays(easter,-47)), "Sprengidagur");
    map.set(isoDate(addDays(easter,-46)), "Öskudagur");

    const june1 = new Date(year,5,1);
    const delta = (6 - monIndex(june1.getDay()) + 7) % 7; // Sunday=6 in monIndex
    map.set(isoDate(addDays(june1, delta)), "Sjómannadagurinn");

    return map;
  }

  // Moon phases
  const SYNODIC = 29.530588853;
  const REF_NEW = Date.UTC(2000,0,6,18,14,0);
  function moonAgeDays(date){
    const t = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0);
    const daysSince = (t - REF_NEW) / 86400000;
    const age = ((daysSince % SYNODIC) + SYNODIC) % SYNODIC;
    return age;
  }
  function phaseDistance(age, target){ return Math.abs(age - target); }
  function computeMoonMarkersForYear(year){
    const markers = new Map(); // iso -> "new" | "full"
    const dates = [];
    const start = new Date(year,0,1);
    const end = new Date(year,11,31);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate()+1)) dates.push(new Date(d));

    const fullT = SYNODIC/2;
    const eps = 1.0;

    for (let i=1; i<dates.length-1; i++){
      const d = dates[i], prev = dates[i-1], next = dates[i+1];
      const a  = moonAgeDays(d), ap = moonAgeDays(prev), an = moonAgeDays(next);

      const dn  = Math.min(a, SYNODIC - a);
      const dnp = Math.min(ap, SYNODIC - ap);
      const dnn = Math.min(an, SYNODIC - an);
      if (dn < dnp && dn < dnn && dn <= eps) markers.set(isoDate(d), "new");

      const df  = phaseDistance(a, fullT);
      const dfp = phaseDistance(ap, fullT);
      const dfn = phaseDistance(an, fullT);
      if (df < dfp && df < dfn && df <= eps) markers.set(isoDate(d), "full");
    }
    return markers;
  }

  const $ = (sel) => document.querySelector(sel);

  const calendarEl = $("#calendar");
  const yearLabel = $("#yearLabel");
  const monthLabel = $("#monthLabel");
  const subMeta = $("#subMeta");
  const dowBar = $("#dowBar");

  const state = {
    year: 2025,
    showHolidays: false,
    showSpecial: true,
    showMoon: false,
    layout: "months",    // "months" | "weeks"
    view: "calendar",    // "calendar" | "holidays"
    holidayMap: new Map(),
    specialMap: new Map(),
    moonMarkers: new Map(),
    monthObserver: null,
  };

  function weekdayShort(date){ return WEEKDAYS[monIndex(date.getDay())]; }
  function monthShort(m){ return ["jan","feb","mar","apr","maí","jún","júl","ágú","sep","okt","nóv","des"][m]; }

  function setHeaderContext(){
    if (state.view === "holidays"){
      monthLabel.textContent = "Frídagar";
      subMeta.textContent = String(state.year);
      dowBar.classList.add("is-hidden");
      return;
    }
    dowBar.classList.remove("is-hidden");

    if (state.layout === "weeks"){
      monthLabel.textContent = "Vikur";
      subMeta.textContent = String(state.year);
      return;
    }
    subMeta.textContent = String(state.year);
  }

  function disconnectMonthObserver(){
    if (state.monthObserver){
      state.monthObserver.disconnect();
      state.monthObserver = null;
    }
  }

  function setupMonthObserver(){
    disconnectMonthObserver();
    if (state.view !== "calendar" || state.layout !== "months") return;

    const monthSections = Array.from(document.querySelectorAll(".month[data-month]"));
    if (!monthSections.length) return;

    const firstM = parseInt(monthSections[0].dataset.month, 10);
    if (Number.isFinite(firstM)) monthLabel.textContent = MONTHS_LONG[firstM];

    const obs = new IntersectionObserver((entries) => {
      const visible = entries.filter(e => e.isIntersecting);
      if (!visible.length) return;
      visible.sort((a,b) => (b.intersectionRatio - a.intersectionRatio));
      const m = parseInt(visible[0].target.dataset.month, 10);
      if (Number.isFinite(m)) monthLabel.textContent = MONTHS_LONG[m];
    }, {
      root: null,
      rootMargin: "-45% 0px -50% 0px",
      threshold: [0.01, 0.1, 0.25, 0.5]
    });

    monthSections.forEach(sec => obs.observe(sec));
    state.monthObserver = obs;
  }

  function build(){
    yearLabel.textContent = state.year;
    $("#yearInput").value = state.year;

    $("#toggleHolidays").checked = state.showHolidays;
    $("#toggleSpecial").checked = state.showSpecial;
    $("#toggleMoon").checked = state.showMoon;

    state.holidayMap = getIcelandHolidayMap(state.year);
    state.specialMap = getIcelandSpecialDays(state.year);
    state.moonMarkers = computeMoonMarkersForYear(state.year);

    calendarEl.innerHTML = "";
    disconnectMonthObserver();
    setHeaderContext();

    if (state.view === "holidays"){
      renderHolidayList();
      return;
    }
    if (state.layout === "weeks"){
      renderWeeks();
      return;
    }
    renderMonths();
    setupMonthObserver();
  }

  function makeDayCell(date){
    const iso = isoDate(date);
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.dataset.iso = iso;

    const dnum = document.createElement("div");
    dnum.className = "dnum";
    dnum.textContent = date.getDate();
    cell.appendChild(dnum);

    const isHoliday = state.holidayMap.has(iso);
    if (state.showHolidays && isHoliday){
      cell.classList.add("is-holiday");
      const ce = document.createElement("div");
      ce.className = "cele";
      ce.textContent = "🎉";
      cell.appendChild(ce);
    }

    if (state.showSpecial && state.specialMap.has(iso) && !isHoliday){
      cell.classList.add("is-special");
    }

    if (state.showMoon){
      const mk = state.moonMarkers.get(iso);
      if (mk){
        const moon = document.createElement("div");
        moon.className = "moon";
        moon.textContent = (mk === "full") ? "🌕" : "🌑";
        cell.appendChild(moon);
      }
    }

    const today = new Date();
    if (iso === isoDate(today) && state.year === today.getFullYear()) cell.classList.add("is-today");

    return cell;
  }

  function renderMonths(){
    for (let m = 0; m < 12; m++){
      const monthBlock = document.createElement("section");
      monthBlock.className = "month";
      monthBlock.dataset.month = String(m);

      const mh = document.createElement("div");
      mh.className = "month-header";
      mh.innerHTML = `
        <div class="month-name">${MONTHS_LONG[m]}</div>
        <div class="month-meta">${state.year} — ${daysInMonth(state.year, m)} dagar${(m===1 && isLeapYear(state.year)) ? " (hlaupár)" : ""}</div>
      `;
      monthBlock.appendChild(mh);

      const grid = document.createElement("div");
      grid.className = "grid";

      const first = new Date(state.year, m, 1);
      const offset = monIndex(first.getDay());
      for (let i=0; i<offset; i++){
        const empty = document.createElement("div");
        empty.className = "cell is-empty";
        grid.appendChild(empty);
      }

      const dim = daysInMonth(state.year, m);
      for (let day=1; day<=dim; day++){
        grid.appendChild(makeDayCell(new Date(state.year, m, day)));
      }

      monthBlock.appendChild(grid);
      calendarEl.appendChild(monthBlock);
    }
  }

  function renderWeeks(){
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
    start.setDate(jan1.getDate() - monIndex(jan1.getDay()));

    const dec31 = new Date(state.year, 11, 31);
    let weekIndex = 1;
    let d = new Date(start);

    function weekHasAnyDayInYear(monday){
      for(let i=0;i<7;i++){
        const x = new Date(monday);
        x.setDate(monday.getDate()+i);
        if(x.getFullYear() === state.year) return true;
      }
      return false;
    }

    while (d <= dec31 || weekHasAnyDayInYear(d)){
      if(!weekHasAnyDayInYear(d)) break;

      const row = document.createElement("div");
      row.className = "week-row";

      const wn = document.createElement("div");
      wn.className = "wn";
      wn.textContent = "V" + weekIndex;
      row.appendChild(wn);

      const wg = document.createElement("div");
      wg.className = "week-grid";

      for (let i=0; i<7; i++){
        const day = new Date(d);
        day.setDate(d.getDate() + i);

        if (day.getFullYear() !== state.year){
          const empty = document.createElement("div");
          empty.className = "cell is-empty";
          wg.appendChild(empty);
        } else {
          wg.appendChild(makeDayCell(day));
        }
      }

      row.appendChild(wg);
      box.appendChild(row);

      d.setDate(d.getDate() + 7);
      weekIndex++;
    }

    calendarEl.appendChild(box);
  }

  function renderHolidayList(){
    const box = document.createElement("section");
    box.className = "holidays";

    const items = Array.from(state.holidayMap.entries())
      .sort((a,b) => a[0].localeCompare(b[0]));

    for (const [iso, name] of items){
      const [y,mm,dd] = iso.split("-").map(Number);
      const date = new Date(y, mm-1, dd);
      const right = `${dd} ${monthShort(mm-1)} — ${weekdayShort(date)}`;

      const item = document.createElement("div");
      item.className = "hitem";
      item.innerHTML = `<div class="hleft">🎉 ${name}</div><div class="hright">${right}</div>`;
      box.appendChild(item);
    }

    calendarEl.appendChild(box);
  }

  function jumpToToday(){
    const now = new Date();
    state.year = now.getFullYear();
    state.view = "calendar";
    build();

    const iso = isoDate(now);
    const el = document.querySelector(`[data-iso="${iso}"]`);
    if (el){
      el.scrollIntoView({ behavior:"smooth", block:"center" });
    }
  }

  /* YEAR DROPDOWN */
  const pop = $("#yearPop");
  const titleWrap = $("#titleWrap");
  function togglePop(force){
    const show = (typeof force === "boolean") ? force : !pop.classList.contains("show");
    pop.classList.toggle("show", show);
    pop.setAttribute("aria-hidden", String(!show));
    if (show) $("#yearInput").focus();
  }
  document.addEventListener("click", (e) => {
    if (!pop.classList.contains("show")) return;
    if (!titleWrap.contains(e.target)) togglePop(false);
  });
  yearLabel.addEventListener("click", () => togglePop());

  function setYear(y){
    if (!Number.isFinite(y)) return;
    state.year = y;
    build();
    togglePop(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  $("#goYearBtn").addEventListener("click", () => setYear(parseInt($("#yearInput").value, 10)));
  $("#yearInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("#goYearBtn").click();
    if (e.key === "Escape") togglePop(false);
  });
  pop.querySelectorAll("[data-jump]").forEach(btn => {
    btn.addEventListener("click", () => {
      const j = parseInt(btn.getAttribute("data-jump"), 10);
      setYear(state.year + j);
    });
  });

  /* SETTINGS SHEET */
  const overlay = $("#overlay");
  const sheet = $("#sheet");
  function openSheet(){
    overlay.classList.add("show");
    sheet.classList.add("show");
  }
  function closeSheet(){
    overlay.classList.remove("show");
    sheet.classList.remove("show");
  }
  $("#closeSheet").addEventListener("click", closeSheet);
  overlay.addEventListener("click", closeSheet);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { togglePop(false); closeSheet(); closeMenu(); closeContact(); }
  });

  $("#layoutSeg").querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      $("#layoutSeg").querySelectorAll("button").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.layout = btn.dataset.layout;
      state.view = "calendar";
      build();
    });
  });

  $("#toggleHolidays").addEventListener("change", (e) => { state.showHolidays = e.target.checked; build(); });
  $("#toggleSpecial").addEventListener("change", (e) => { state.showSpecial = e.target.checked; build(); });
  $("#toggleMoon").addEventListener("change", (e) => { state.showMoon = e.target.checked; build(); });

  $("#showHolidaysBtn").addEventListener("click", () => {
    state.view = "holidays";
    build();
    closeSheet();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  $("#todayBtn").addEventListener("click", () => {
    closeSheet();
    jumpToToday();
  });

  $("#backBtn").addEventListener("click", () => history.back());

  function bumpYear(delta){
    state.year += delta;
    build();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  $("#prevYear").addEventListener("click", () => bumpYear(-1));
  $("#nextYear").addEventListener("click", () => bumpYear(1));

  /* HAMBURGER MENU */
  const menuBtn = $("#menuBtn");
  const menuPop = $("#menuPop");
  function toggleMenu(){ menuPop.classList.toggle("show"); }
  function closeMenu(){ menuPop.classList.remove("show"); }

  menuBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleMenu(); });
  menuPop.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", () => closeMenu());

  $("#menuSettings").addEventListener("click", () => {
    closeMenu();
    openSheet();
  });

  $("#menuContact").addEventListener("click", () => {
    closeMenu();
    openContact();
  });

  /* CONTACT MODAL */
  const cOverlay = $("#cOverlay");
  const cCloseBtn = $("#cCloseBtn");
  const cForm = $("#contactForm");
  const cStatus = $("#cStatus");

  function openContact(){
    cOverlay.classList.add("open");
    cStatus.textContent = "";
    setTimeout(() => $("#cName").focus(), 50);
  }
  function closeContact(){
    cOverlay.classList.remove("open");
  }
  cCloseBtn.addEventListener("click", closeContact);
  cOverlay.addEventListener("click", (e) => { if(e.target === cOverlay) closeContact(); });

  cForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    cStatus.textContent = "Sendi...";

    const payload = {
      name: cForm.name.value.trim(),
      email: cForm.email.value.trim(),
      message: cForm.message.value.trim(),
    };

    try{
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify(payload)
      });

      if(!res.ok){
        const txt = await res.text().catch(() => '');
        throw new Error(txt || 'Villa við sendingu.');
      }

      cStatus.textContent = "Sent. Takk!";
      cForm.reset();
      setTimeout(closeContact, 700);
    }catch(_err){
      cStatus.textContent = "Tókst ekki að senda. Reyndu aftur eftir smá.";
    }
  });

  /* INIT */
  build();
})();
