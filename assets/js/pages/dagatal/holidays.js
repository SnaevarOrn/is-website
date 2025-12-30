/* dagatal/holidays.js — loads holidays.is.json and builds info map per year (no DOM) */
(() => {
  const NS = (window.dagatal = window.dagatal || {});
  const D = NS.date;

  const DATA_URL = "/assets/data/holidays.is.json";
  let _data = null;
  let _loading = null;

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function mmddFromIso(iso) {
    const parts = iso.split("-");
    return `${parts[1]}-${parts[2]}`;
  }

  function isoFromYMD(year, month1to12, day) {
    return `${year}-${pad2(month1to12)}-${pad2(day)}`;
  }

  function computeFeastDate(year, feast) {
    // expand when needed
    if (feast === "pentecost") {
      const easter = D.easterSunday(year);
      return D.addDays(easter, 49); // Pentecost Sunday
    }
    return null;
  }

  function applyExceptions(date, year, exceptions) {
    let d = new Date(date);

    for (const ex of exceptions || []) {
      if (ex.type === "avoidMoveableFeast" && ex.feast && ex.action?.type === "addDays") {
        const feastDate = computeFeastDate(year, ex.feast);
        if (feastDate && D.isoDate(feastDate) === D.isoDate(d)) {
          d = D.addDays(d, Number(ex.action.days || 0));
        }
      }
    }
    return d;
  }

  function computeRuleDate(year, rule, exceptions) {
    if (!rule || !rule.type) return null;

    if (rule.type === "nthWeekdayOfMonth") {
      // rule.weekday: 0=Sunday..6=Saturday (JS day)
      const base = D.nthWeekdayOfMonth(year, Number(rule.month), Number(rule.weekday), Number(rule.nth));
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
        const json = await res.json();
        _data = json;
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

  // Builds Map: iso -> infoObj (title/summary/body/sources + id + computedFrom)
  function buildInfoMapForYear(year, data) {
    const map = new Map();
    const fixed = data?.fixed || {};
    const rules = data?.rules || [];

    // fixed: key = "MM-DD"
    for (const mmdd of Object.keys(fixed)) {
      const info = fixed[mmdd];
      if (!info) continue;
      const [mm, dd] = mmdd.split("-").map((x) => parseInt(x, 10));
      const iso = isoFromYMD(year, mm, dd);
      map.set(iso, { ...info, _kind: "fixed", _key: mmdd });
    }

    // rules
    for (const item of rules) {
      const dt = computeRuleDate(year, item.rule, item.exceptions);
      if (!dt) continue;
      const iso = D.isoDate(dt);
      map.set(iso, { ...item, _kind: "rule", _key: item.id });
    }

    return map;
  }

  NS.holidays = {
    load,
    buildInfoMapForYear,
    mmddFromIso,
  };
})();
