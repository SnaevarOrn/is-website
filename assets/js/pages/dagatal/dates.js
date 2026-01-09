/*  dagatal/dates.js — date helpers + holidays + moon (no DOM) */
(() => {
  const NS = (window.dagatal = window.dagatal || {});

  const pad2 = (n) => String(n).padStart(2, "0");
  const isoDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const monIndex = (jsDay) => (jsDay + 6) % 7; // Monday=0
  const isLeapYear = (y) => (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
  const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();

  /* =========================
     📜 Lögbundið frídagakerfi: 1972 breyting
     - Sumardagurinn fyrsti
     - Verkalýðsdagurinn (1. maí)
     - 17. júní
     - Frídagur verslunarmanna
     Teljast aðeins með sem "lögbundnir frídagar" frá og með 1972.
     ========================= */
  const HOLIDAY_REFORM_YEAR = 1972;
  const includePost1972FixedHolidays = (year) => year >= HOLIDAY_REFORM_YEAR;

  // Easter (Meeus/Jones/Butcher)
  function easterSunday(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  }

  function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }

  // Nth weekday of month (weekday: 0=Sun .. 6=Sat), nth: 1..5
  function nthWeekdayOfMonth(year, month1to12, weekday0Sun, nth) {
    const monthIdx = month1to12 - 1;
    const first = new Date(year, monthIdx, 1);
    const delta = (weekday0Sun - first.getDay() + 7) % 7;
    const day = 1 + delta + (nth - 1) * 7;
    return new Date(year, monthIdx, day);
  }

  // First given weekday on/after a specific date
  function weekdayOnOrAfter(year, month1to12, dayOfMonth, weekday0Sun) {
    const d = new Date(year, month1to12 - 1, dayOfMonth);
    const delta = (weekday0Sun - d.getDay() + 7) % 7;
    return addDays(d, delta);
  }

  // Sumardagurinn fyrsti = first Thursday after April 18 (i.e. on/after Apr 19)
  function firstThursdayAfterApril18(year) {
    const start = new Date(year, 3, 19);
    const delta = (3 - monIndex(start.getDay()) + 7) % 7; // Thursday=3 in monIndex
    return addDays(start, delta);
  }

  // Frídagur verslunarmanna = first Monday in August
  function firstMondayOfAugust(year) {
    const d = new Date(year, 7, 1);
    const delta = (0 - monIndex(d.getDay()) + 7) % 7; // Monday=0
    return addDays(d, delta);
  }

  /* =========================
     🇮🇸 LÖGBUNDNIR FRÍDAGAR
     ========================= */
  function getIcelandHolidayMap(year) {
    const map = new Map(); // iso -> name
    const add = (m, d, name) => map.set(`${year}-${pad2(m)}-${pad2(d)}`, name);

    const easter = easterSunday(year);

    // Fastir
    add(1, 1, "Nýársdagur");

    // Þessir urðu lögbundnir almennir frídagar 1972 (og síðar)
    if (includePost1972FixedHolidays(year)) {
      add(5, 1, "Alþjóðlegur frídagur verkafólks");
      add(6, 17, "Þjóðhátíðardagur Íslendinga");
    }

    add(12, 24, "Aðfangadagur");
    add(12, 25, "Jóladagur");
    add(12, 26, "Annar í jólum");
    add(12, 31, "Gamlársdagur");

    // Páskar / hreyfanlegir frídagar (alltaf sömu vikudagar)
    map.set(isoDate(addDays(easter, -3)), "Skírdagur");
    map.set(isoDate(addDays(easter, -2)), "Föstudagurinn langi");
    map.set(isoDate(easter), "Páskadagur");
    map.set(isoDate(addDays(easter, 1)), "Annar í páskum");

    // Aðrir hreyfanlegir frídagar
    // Sumardagurinn fyrsti + Frídagur verslunarmanna: aðeins frá 1972
    if (includePost1972FixedHolidays(year)) {
      map.set(isoDate(firstThursdayAfterApril18(year)), "Sumardagurinn fyrsti");
      map.set(isoDate(firstMondayOfAugust(year)), "Frídagur verslunarmanna");
    }

    map.set(isoDate(addDays(easter, 39)), "Uppstigningardagur");
    map.set(isoDate(addDays(easter, 49)), "Hvítasunnudagur");
    map.set(isoDate(addDays(easter, 50)), "Annar í Hvítasunnu");

    return map;
  }

  /* =========================
     🔴 STÓRHÁTÍÐARDAGAR (subset)
     ========================= */
  function getIcelandMajorHolidayMap(year) {
    const map = new Map(); // iso -> label
    const easter = easterSunday(year);
    const add = (m, d, label) => map.set(`${year}-${pad2(m)}-${pad2(d)}`, label);

    add(1, 1, "Nýársdagur");
    map.set(isoDate(addDays(easter, -2)), "Föstudagurinn langi");
    map.set(isoDate(easter), "Páskadagur");
    map.set(isoDate(addDays(easter, 49)), "Hvítasunnudagur");

    // 17. júní: aðeins frá 1972
    if (includePost1972FixedHolidays(year)) {
      add(6, 17, "Þjóðhátíðardagur Íslendinga");
    }

    add(12, 24, "Aðfangadagur (eftir kl. 12:00)");
    add(12, 25, "Jóladagur");
    add(12, 31, "Gamlársdagur (eftir kl. 12:00)");

    return map;
  }

  function formatHalfRedDagur(name) {
    if (name === "Gamlársdagur") return 'Gamlárs<span class="red-suffix">dagur</span>';
    if (name === "Aðfangadagur") return 'Aðfanga<span class="red-suffix">dagur</span>';
    return name;
  }

  /* =========================
     ℹ️ MERKISDAGAR
     ========================= */
  function getIcelandSpecialDays(year) {
    const map = new Map();
    const add = (m, d, name) => map.set(`${year}-${pad2(m)}-${pad2(d)}`, name);

    add(1, 6, "Þrettándinn");
    add(2, 14, "Valentínusardagurinn");
    add(6, 24, "Jónsmessa");
    add(10, 11, "Fæðingardagur forseta (HT)");
    add(11, 16, "Dagur íslenskrar tungu");
    add(12, 1, "Fullveldisdagurinn");
    add(12, 21, "Vetrarsólstöður");
    add(10, 31, "Hrekkjavaka");
    add(12, 23, "Þorláksmessa");

    map.set(isoDate(weekdayOnOrAfter(year, 1, 19, 5)), "Bóndadagur, upphaf Þorra");
    map.set(isoDate(weekdayOnOrAfter(year, 2, 18, 0)), "Konudagur, upphaf Góu");
    map.set(isoDate(nthWeekdayOfMonth(year, 5, 0, 2)), "Mæðradagurinn");
    map.set(isoDate(nthWeekdayOfMonth(year, 11, 0, 2)), "Feðradagurinn");
    map.set(isoDate(weekdayOnOrAfter(year, 10, 21, 6)), "Fyrsti vetrardagur");
    map.set(isoDate(nthWeekdayOfMonth(year, 6, 0, 1)), "Sjómannadagurinn");
    map.set(isoDate(nthWeekdayOfMonth(year, 8, 6, 4)), "Menningarnótt í Reykjavík");

    const easter = easterSunday(year);
    map.set(isoDate(addDays(easter, -7)), "Pálmasunnudagur");
    map.set(isoDate(addDays(easter, -48)), "Bolludagur");
    map.set(isoDate(addDays(easter, -47)), "Sprengidagur");
    map.set(isoDate(addDays(easter, -46)), "Öskudagur");

    return map;
  }

  // Moon phases (simple markers new/full)
  const SYNODIC = 29.530588853;
  const REF_NEW = Date.UTC(2000, 0, 6, 18, 14, 0);

  function moonAgeDays(date) {
    const t = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0);
    const daysSince = (t - REF_NEW) / 86400000;
    const age = ((daysSince % SYNODIC) + SYNODIC) % SYNODIC;
    return age;
  }

  function phaseDistance(age, target) {
    return Math.abs(age - target);
  }

  function computeMoonMarkersForYear(year) {
    const markers = new Map();
    const dates = [];
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) dates.push(new Date(d));

    const fullT = SYNODIC / 2;
    const eps = 1.0;

    for (let i = 1; i < dates.length - 1; i++) {
      const d = dates[i], prev = dates[i - 1], next = dates[i + 1];
      const a = moonAgeDays(d), ap = moonAgeDays(prev), an = moonAgeDays(next);

      const dn = Math.min(a, SYNODIC - a);
      const dnp = Math.min(ap, SYNODIC - ap);
      const dnn = Math.min(an, SYNODIC - an);
      if (dn < dnp && dn < dnn && dn <= eps) markers.set(isoDate(d), "new");

      const df = phaseDistance(a, fullT);
      const dfp = phaseDistance(ap, fullT);
      const dfn = phaseDistance(an, fullT);
      if (df < dfp && df < dfn && df <= eps) markers.set(isoDate(d), "full");
    }
    return markers;
  }

  /* =========================
     📊 Swing-holiday stats (8 dagar sem “sveiflast” milli vikudaga)
     Ath: Verslunarmannadagur er VILJANDI ekki inni hér til að halda þessu í 8.
     Og 3 af þessum 8 gilda bara frá 1972 (Sumardagur, 1. maí, 17. júní).
     ========================= */
  function getSwingHolidayIsos(year) {
    const isos = [
      `${year}-01-01`, // Nýársdagur
      `${year}-12-24`, // Aðfangadagur
      `${year}-12-25`, // Jóladagur
      `${year}-12-26`, // Annar í jólum
      `${year}-12-31`, // Gamlársdagur
    ];

    if (includePost1972FixedHolidays(year)) {
      isos.push(isoDate(firstThursdayAfterApril18(year))); // Sumardagurinn fyrsti
      isos.push(`${year}-05-01`); // 1. maí
      isos.push(`${year}-06-17`); // 17. júní
    }

    return isos;
  }

  function computeSwingHolidayStats(year) {
    const holidayMap = getIcelandHolidayMap(year);
    const isos = getSwingHolidayIsos(year);

    const items = isos.map((iso) => {
      const name = holidayMap.get(iso) || iso;
      const [y, m, d] = iso.split("-").map(Number);
      const dt = new Date(y, m - 1, d);
      const wd = dt.getDay(); // 0 Sun .. 6 Sat
      const weekend = (wd === 0 || wd === 6);
      return { iso, name, weekend, monIndex: monIndex(wd) };
    });

    const total = items.length;
    const weekendCount = items.filter(x => x.weekend).length;
    const weekdayCount = total - weekendCount;

    const weekdayPct = total ? Math.round((weekdayCount / total) * 100) : 0;
    const weekendPct = 100 - weekdayPct;

    const byDow = Array(7).fill(0); // Mon..Sun
    for (const it of items) byDow[it.monIndex]++;

    const balance = total ? (weekdayCount - weekendCount) / total : 0;
    const score100 = Math.round((balance + 1) * 50); // 0..100

    let verdict = "Jafnvægi ☯︎";
    if (score100 >= 60) verdict = "Starfsmannavænt ✅";
    else if (score100 <= 40) verdict = "Yfirmannavænt 😈";

    return {
      year, total,
      weekdayCount, weekendCount,
      weekdayPct, weekendPct,
      score100, verdict,
      byDow,
      items,
    };
  }

  // Export
  NS.date = {
    pad2,
    isoDate,
    monIndex,
    isLeapYear,
    daysInMonth,
    addDays,
    easterSunday,
    nthWeekdayOfMonth,
    weekdayOnOrAfter,
    firstThursdayAfterApril18,
    firstMondayOfAugust,
    getIcelandHolidayMap,
    getIcelandMajorHolidayMap,
    formatHalfRedDagur,
    getIcelandSpecialDays,
    computeMoonMarkersForYear,
    getSwingHolidayIsos,
    computeSwingHolidayStats,
  };
})();
