// /assets/js/pages/aldur.js
(() => {
  "use strict";

  // --- Constants ---
  const MS = 1;
  const SEC = 1000 * MS;
  const MIN = 60 * SEC;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;
  const WEEK = 7 * DAY;

  // Synodic month (new moon to new moon), days:
  const SYNODIC_MONTH_D = 29.530588;

  // Mean tropical year in days (Earth):
  const TROPICAL_YEAR_D = 365.242189;

  // Planet orbital periods in Earth days (approx):
  const PLANETS = [
    { name: "Merkúríus", days: 87.9691 },
    { name: "Venus",     days: 224.701 },
    { name: "Jörð",      days: 365.256363004 },
    { name: "Mars",      days: 686.980 },
    { name: "Júpíter",   days: 4332.589 },
    { name: "Satúrnus",  days: 10759.22 },
    { name: "Úranus",    days: 30688.5 },
    { name: "Neptúnus",  days: 60182 }
  ];

  // --- Helpers ---
  const fmt = (x, dp = 3) =>
    Number.isFinite(x)
      ? x.toLocaleString("is-IS", { maximumFractionDigits: dp, minimumFractionDigits: dp })
      : "—";

  // Create a Date that represents local wall-clock time in a given IANA TZ.
  function zonedDateFromParts({ y, m, d, hh, mm, ss, tz }) {
    const utcGuess = new Date(Date.UTC(y, m - 1, d, hh, mm, ss));

    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    })
      .formatToParts(utcGuess)
      .reduce((acc, p) => (acc[p.type] = p.value, acc), {});

    const asIfLocalUTC = Date.UTC(
      +parts.year, +parts.month - 1, +parts.day,
      +parts.hour, +parts.minute, +parts.second
    );

    const offsetMs = asIfLocalUTC - utcGuess.getTime();
    return new Date(utcGuess.getTime() - offsetMs);
  }

  function diffCalendarMonths(d1, d2, tz) {
    const toYMD = (dt) => {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit"
      }).formatToParts(dt).reduce((a, p) => (a[p.type] = p.value, a), {});
      return { y: +parts.year, m: +parts.month, d: +parts.day };
    };

    const a = toYMD(d1);
    const b = toYMD(d2);

    let months = (b.y - a.y) * 12 + (b.m - a.m);
    if (b.d < a.d) months -= 1;

    const years = Math.floor(months / 12);
    const remMonths = months % 12;

    return { monthsTotal: months, years, months: remMonths };
  }

  function isPrime(n) {
    if (n < 2 || (n | 0) !== n) return false;
    if (n === 2) return true;
    if (n % 2 === 0) return false;
    const r = Math.floor(Math.sqrt(n));
    for (let i = 3; i <= r; i += 2) if (n % i === 0) return false;
    return true;
  }

  function nextPrime(n) {
    let k = Math.max(2, Math.floor(n));
    while (!isPrime(k)) k++;
    return k;
  }

  function isFib(n) {
    if (n < 0 || (n | 0) !== n) return false;
    const t1 = 5 * n * n + 4;
    const t2 = 5 * n * n - 4;

    const isSquare = (x) => {
      const s = Math.floor(Math.sqrt(x));
      return s * s === x;
    };

    return isSquare(t1) || isSquare(t2);
  }

  function nextFib(n) {
    let k = Math.max(0, Math.floor(n));
    while (!isFib(k)) k++;
    return k;
  }

  function yearsFloatFromMs(ms) {
    return ms / (TROPICAL_YEAR_D * DAY);
  }

  // --- Close button ---
  function closePage() {
    if (history.length > 1) history.back();
    else location.href = "/";
  }

  document.getElementById("btnClose")?.addEventListener("click", closePage);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePage();
  });

  // --- Main ---
  function calculate() {
    const dobEl = document.getElementById("dob");
    const tobEl = document.getElementById("tob");
    const tzEl  = document.getElementById("tz");
    const outEl = document.getElementById("out");

    const dob = dobEl.value;
    if (!dob) { outEl.textContent = "Veldu fæðingardag."; return; }

    const [Y, M, D] = dob.split("-").map(Number);
    const [hh, mm, ss] = (tobEl.value || "00:00:00").split(":").map(x => Number(x || 0));
    const tz = (tzEl.value || "Atlantic/Reykjavik").trim();

    let birth;
    try {
      birth = zonedDateFromParts({ y: Y, m: M, d: D, hh: hh || 0, mm: mm || 0, ss: ss || 0, tz });
    } catch {
      outEl.textContent = "Ógilt tímabelti. Prófaðu t.d. Atlantic/Reykjavik.";
      return;
    }

    const now = new Date();
    const ageMs = now.getTime() - birth.getTime();
    if (ageMs < 0) { outEl.textContent = "Þú ert ekki fædd(ur) enn. (Samkvæmt þessu.)"; return; }

    const ageSec  = ageMs / 1000;
    const ageMin  = ageMs / MIN;
    const ageHour = ageMs / HOUR;
    const ageDay  = ageMs / DAY;
    const ageWeek = ageMs / WEEK;

    const AVG_MONTH_D = 365.2425 / 12; // ~30.436875
    const ageMonthApprox = ageDay / AVG_MONTH_D;

    const cal = diffCalendarMonths(birth, now, tz);

    const ageYearsFloat = yearsFloatFromMs(ageMs);
    const ageYearsInt = Math.floor(ageYearsFloat);

    const lunarCycles = ageDay / SYNODIC_MONTH_D;

    // Planet info + ages:
    const planetInfo = PLANETS.map(p => {
      const earthYearsForOneOrbit = p.days / TROPICAL_YEAR_D;
      return `- ${p.name}: ${fmt(p.days, 4)} dagar á ári (≈ ${fmt(earthYearsForOneOrbit, 6)} jarðarár)`;
    }).join("\n");

    const planetAges = PLANETS.map(p => {
      const py = ageDay / p.days;
      return `- ${p.name}: ${fmt(py, 6)} “ár”`;
    }).join("\n");

    const nextPrimeAge = nextPrime(ageYearsInt + 1);
    const nextFibAge   = nextFib(ageYearsInt + 1);

    const doublingsFrom1Day = Math.log2(Math.max(1, ageDay));

    const milestonesDays = [1000, 5000, 10000, 20000, 30000, 40000].filter(x => x > ageDay);
    const nextDayMs = (targetDays) => birth.getTime() + targetDays * DAY;

    const nextMilestoneText = milestonesDays.length
      ? milestonesDays.slice(0, 3).map(d => {
          const dt = new Date(nextDayMs(d));
          const iso = dt.toISOString().slice(0, 10);
          return `- ${d.toLocaleString("is-IS")} dagar: ${iso}`;
        }).join("\n")
      : "- (engin næstu “kringlóttu” dagar í þessum lista)";

    outEl.textContent =
`Fæðing: ${birth.toISOString().replace("T"," ").replace("Z"," UTC")}
Núna:   ${now.toISOString().replace("T"," ").replace("Z"," UTC")}

Grunn-aldur
- Sekúndur:   ${fmt(ageSec, 0)}
- Mínútur:    ${fmt(ageMin, 0)}
- Klukkust.:  ${fmt(ageHour, 0)}
- Dagar:      ${fmt(ageDay, 3)}
- Vikur:      ${fmt(ageWeek, 3)}

Mánuðir
- Approx (dagar/30.436875): ${fmt(ageMonthApprox, 3)} mán
- Calendar (heilumánuðir):  ${cal.monthsTotal.toLocaleString("is-IS")} mán  (${cal.years} ár + ${cal.months} mán)

Ár
- Jarðarár (tropical): ${fmt(ageYearsFloat, 6)} ár
- Heilu ár:           ${ageYearsInt.toLocaleString("is-IS")} ár

Tungl
- Tunglhringir (≈29.530588 d): ${fmt(lunarCycles, 6)} hringir

Plánetur — sporbrautartími (til upplýsinga)
${planetInfo}

Plánetur — aldur í “árum” þeirra
${planetAges}

Tölur
- Næsta prímtölu-afmæli (ár):  ${nextPrimeAge} (eftir ${(nextPrimeAge - ageYearsInt).toLocaleString("is-IS")} ár)
- Næsta Fibonacci-afmæli (ár): ${nextFibAge} (eftir ${(nextFibAge - ageYearsInt).toLocaleString("is-IS")} ár)

Log / tvöföldun
- log2(aldur í dögum) frá 1 degi: ${fmt(doublingsFrom1Day, 6)}
  (þú hefur “tvöfaldað” dagafjölda ca. ${fmt(doublingsFrom1Day, 2)} sinnum)

Næstu “kringlóttu” dagar (úr lista)
${nextMilestoneText}
`;
  }

  document.getElementById("calc")?.addEventListener("click", calculate);

  // Quick default for testing
  const dobEl = document.getElementById("dob");
  if (dobEl && !dobEl.value) dobEl.value = "2000-01-01";
})();

