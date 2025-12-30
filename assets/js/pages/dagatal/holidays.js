/* dagatal/holidays.js — loads holidays.is.json and builds info map per year (no DOM) */
(() => {
  const NS = (window.dagatal = window.dagatal || {});
  const D = NS.date || {};

  const DATA_URL = "/assets/data/holidays.is.json";
  let _data = null;
  let _loading = null;

  const pad2 = (n) => String(n).padStart(2, "0");
  const isoFromYMD = (year, month1to12, day) => `${year}-${pad2(month1to12)}-${pad2(day)}`;

  // Local fallback: Nth weekday of month (weekday: 0=Sun..6=Sat), nth: 1..5
  function nthWeekdayOfMonthLocal(year, month1to12, weekday0Sun, nth) {
    const monthIdx = month1to12 - 1;
    const first = new Date(year, monthIdx, 1);
    const delta = (weekday0Sun - first.getDay() + 7) % 7;
    const day = 1 + delta + (nth - 1) * 7;
    return new Date(year, monthIdx, day);
  }

  function computeFeastDate(year, feast) {
    // Pentecost = Easter + 49
    if (feast === "pentecost") {
      if (typeof D.easterSunday !== "function" || typeof D.addDays !== "function") return null;
      return D.addDays(D.easterSunday(year), 49);
    }
    return null;
  }

  function applyExceptions(date, year, exceptions) {
    let d = new Date(date);

    for (const ex of exceptions || []) {
      if (ex.type === "avoidMoveableFeast" && ex.feast && ex.action?.type === "addDays") {
        const feastDate = computeFeastDate(year, ex.feast);
        if (!feastDate) continue;

        const iso = typeof D.isoDate === "function"
          ? D.isoDate(d)
          : `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

        const isoFeast = typeof D.isoDate === "function"
          ? D.isoDate(feastDate)
          : `${feastDate.getFullYear()}-${pad2(feastDate.getMonth() + 1)}-${pad2(feastDate.getDate())}`;

        if (iso === isoFeast) {
          const days = Number(ex.action.days || 0);
          d = typeof D.addDays === "function" ? D.addDays(d, days) : new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
        }
      }
    }
    return d;
  }

  function computeRuleDate(year, rule, exceptions) {
    if (!rule || !rule.type) return null;

    if (rule.type === "nthWeekdayOfMonth") {
      const fn = (typeof D.nthWeekdayOfMonth === "function") ? D.nthWeekdayOfMonth : nthWeekdayOfMonthLocal;
      const base = fn(year, Number(rule.month), Number(rule.weekday), Number(rule.nth));
      return applyExceptions(base, year, exceptions);
    }
    return null;
  }

  async function load() {
    if (_data) return _data;
    if (_loading) return _loading;

    _loading = (async () => {
      try {
        const res = await fetch(DATA_URL, { cache: "force-cache" });
        if (!res.ok) throw new Error(`Failed to load ${DATA_URL}: ${res.status}`);
        _data = await res.json();
        return _data;
      } catch (err) {
        console.warn("[dagatal] holidays info load failed:", err);
        _data = { version: 0, fixed: {}, rules: [] };
        return _data;
      } finally {
        _loading = null;
      }
    })();

    return _loading;
  }

  function buildInfoMapForYear(year, data) {
    const map = new Map();
    const fixed = data?.fixed || {};
    const rules = data?.rules || [];

    for (const mmdd of Object.keys(fixed)) {
      const info = fixed[mmdd];
      if (!info) continue;
      const [mm, dd] = mmdd.split("-").map((x) => parseInt(x, 10));
      const iso = isoFromYMD(year, mm, dd);
      map.set(iso, { ...info, _kind: "fixed", _key: mmdd });
    }

    for (const item of rules) {
      const dt = computeRuleDate(year, item.rule, item.exceptions);
      if (!dt) continue;

      const iso = (typeof D.isoDate === "function")
        ? D.isoDate(dt)
        : `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;

      map.set(iso, { ...item, _kind: "rule", _key: item.id });
    }

    return map;
  }

  NS.holidays = {
    load,
    buildInfoMapForYear,
    mmddFromIso: (iso) => iso.split("-").slice(1).join("-"),
  };
})();
