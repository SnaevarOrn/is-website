/* dagatal/holidays.js — loads holidays.is.json and builds info map per year (no DOM) */
(() => {
  const NS = (window.dagatal = window.dagatal || {});
  const D = NS.date;

  const DATA_URL = "/assets/data/holidays.is.json";
  let _data = null;
  let _loading = null;

  const pad2 = (n) => String(n).padStart(2, "0");
  const isoFromYMD = (year, month1to12, day) => `${year}-${pad2(month1to12)}-${pad2(day)}`;
  const isoFromDate = (dt) =>
    typeof D?.isoDate === "function"
      ? D.isoDate(dt)
      : `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;

  function mmddFromIso(iso) {
    return iso.split("-").slice(1).join("-");
  }

  function computeFeastDate(year, feast) {
    // only what we currently need
    if (feast === "pentecost") {
      if (typeof D?.easterSunday !== "function" || typeof D?.addDays !== "function") return null;
      return D.addDays(D.easterSunday(year), 49); // Pentecost Sunday
    }
    return null;
  }

  function applyExceptions(date, year, exceptions) {
    let out = new Date(date);
    for (const ex of exceptions || []) {
      if (ex.type === "avoidMoveableFeast" && ex.feast && ex.action?.type === "addDays") {
        const feastDate = computeFeastDate(year, ex.feast);
        if (!feastDate) continue;

        if (isoFromDate(out) === isoFromDate(feastDate)) {
          const days = Number(ex.action.days || 0);
          out = typeof D?.addDays === "function"
            ? D.addDays(out, days)
            : new Date(out.getFullYear(), out.getMonth(), out.getDate() + days);
        }
      }
    }
    return out;
  }

  function computeRuleDate(year, item) {
    const rule = item?.rule;
    if (!rule || !rule.type) return null;

    let base = null;

    switch (rule.type) {
      case "easterOffset": {
        if (typeof D?.easterSunday !== "function" || typeof D?.addDays !== "function") return null;
        base = D.addDays(D.easterSunday(year), Number(rule.days || 0));
        break;
      }

      case "firstThursdayAfterApril18": {
        if (typeof D?.firstThursdayAfterApril18 !== "function") return null;
        base = D.firstThursdayAfterApril18(year);
        break;
      }

      case "firstMondayOfAugust": {
        if (typeof D?.firstMondayOfAugust !== "function") return null;
        base = D.firstMondayOfAugust(year);
        break;
      }

      case "nthWeekdayOfMonth": {
        if (typeof D?.nthWeekdayOfMonth !== "function") return null;
        base = D.nthWeekdayOfMonth(year, Number(rule.month), Number(rule.weekday), Number(rule.nth));
        break;
      }

      case "weekdayOnOrAfter": {
        if (typeof D?.weekdayOnOrAfter !== "function") return null;
        base = D.weekdayOnOrAfter(year, Number(rule.month), Number(rule.day), Number(rule.weekday));
        break;
      }

      default:
        return null;
    }

    return applyExceptions(base, year, item.exceptions);
  }

  async function load() {
    if (_data) return _data;
    if (_loading) return _loading;

    _loading = (async () => {
      try {
        // cache-bust + no-store (þú ert í þróun; annars festist gamalt json)
        const url = `${DATA_URL}?v=${Date.now()}`;
        const res = await fetch(url, { cache: "no-store" });
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
    const rules = Array.isArray(data?.rules) ? data.rules : [];

    // 1) Fixed: setja inn öll MM-DD fyrir þetta ár
    for (const mmdd of Object.keys(fixed)) {
      const info = fixed[mmdd];
      if (!info) continue;

      // ef þú vilt EKKI Pride í info:
      if (info.id === "reykjavik-pride") continue;

      const [mm, dd] = mmdd.split("-").map((x) => parseInt(x, 10));
      const iso = isoFromYMD(year, mm, dd);
      map.set(iso, { ...info, _kind: "fixed", _key: mmdd });
    }

    // 2) Rules: reikna raun-dagsetningu fyrir árið
    for (const item of rules) {
      if (!item) continue;

      // ef þú vilt EKKI Pride í info:
      if (item.id === "reykjavik-pride") continue;

      const dt = computeRuleDate(year, item);
      if (!dt) continue;

      const iso = isoFromDate(dt);
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