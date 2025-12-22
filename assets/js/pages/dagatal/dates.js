/* dagatal/dates.js — date helpers + holidays + moon (no DOM) */
(() => {
  const NS = (window.dagatal = window.dagatal || {});

  const pad2 = (n) => String(n).padStart(2, "0");
  const isoDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const monIndex = (jsDay) => (jsDay + 6) % 7; // Monday=0
  const isLeapYear = (y) => (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
  const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();

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

  function firstThursdayAfterApril18(year) {
    const start = new Date(year, 3, 19);
    const delta = (3 - monIndex(start.getDay()) + 7) % 7; // Thursday=3
    return addDays(start, delta);
  }

  function firstMondayOfAugust(year) {
    const d = new Date(year, 7, 1);
    const delta = (0 - monIndex(d.getDay()) + 7) % 7; // Monday=0
    return addDays(d, delta);
  }

  function getIcelandHolidayMap(year) {
    const map = new Map(); // iso -> name
    const add = (m, d, name) => map.set(`${year}-${pad2(m)}-${pad2(d)}`, name);

    add(1, 1, "Nýársdagur");
    add(1, 6, "Þrettándinn");
    add(5, 1, "Verkalýðsdagurinn");
    add(6, 17, "Þjóðhátíðardagurinn");
    add(12, 24, "Aðfangadagur");
    add(12, 25, "Jóladagur");
    add(12, 26, "Annar í jólum");
    add(12, 31, "Gamlársdagur");

    const easter = easterSunday(year);
    map.set(isoDate(addDays(easter, -3)), "Skírdagur");
    map.set(isoDate(addDays(easter, -2)), "Föstudagurinn langi");
    map.set(isoDate(easter), "Páskadagur");
    map.set(isoDate(addDays(easter, 1)), "Annar í páskum");
    map.set(isoDate(addDays(easter, 39)), "Uppstigningardagur");
    map.set(isoDate(addDays(easter, 49)), "Hvítasunnudagur");
    map.set(isoDate(addDays(easter, 50)), "Annar í hvítasunnu");

    map.set(isoDate(firstThursdayAfterApril18(year)), "Sumardagurinn fyrsti");
    map.set(isoDate(firstMondayOfAugust(year)), "Frídagur verslunarmanna");

    return map;
  }

  function getIcelandSpecialDays(year) {
    const map = new Map(); // iso -> name
    const add = (m, d, name) => map.set(`${year}-${pad2(m)}-${pad2(d)}`, name);

    add(2, 14, "Valentínusardagur");
    add(12, 23, "Þorláksmessa");
    add(10, 31, "Hrekkjavaka");

    const easter = easterSunday(year);
    map.set(isoDate(addDays(easter, -48)), "Bolludagur");
    map.set(isoDate(addDays(easter, -47)), "Sprengidagur");
    map.set(isoDate(addDays(easter, -46)), "Öskudagur");

    // Sjómannadagurinn: first Sunday in June
    const june1 = new Date(year, 5, 1);
    const delta = (6 - monIndex(june1.getDay()) + 7) % 7; // Sunday=6 in monIndex
    map.set(isoDate(addDays(june1, delta)), "Sjómannadagurinn");

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
    const markers = new Map(); // iso -> "new" | "full"
    const dates = [];
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) dates.push(new Date(d));

    const fullT = SYNODIC / 2;
    const eps = 1.0;

    for (let i = 1; i < dates.length - 1; i++) {
      const d = dates[i],
        prev = dates[i - 1],
        next = dates[i + 1];
      const a = moonAgeDays(d),
        ap = moonAgeDays(prev),
        an = moonAgeDays(next);

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

  // Export
  NS.date = {
    pad2,
    isoDate,
    monIndex,
    isLeapYear,
    daysInMonth,
    addDays,
    easterSunday,
    getIcelandHolidayMap,
    getIcelandSpecialDays,
    computeMoonMarkersForYear,
  };
})();
