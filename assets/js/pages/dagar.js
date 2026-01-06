/* /assets/js/pages/dagar.js — Holidays/Special days page (DOM + wiring) */
(() => {
  const NS = (window.dagatal = window.dagatal || {});
  const D = NS.date;
  const H = NS.holidays;

  const $ = (sel) => document.querySelector(sel);

  const listEl = $("#list");
  const yearLabel = $("#yearLabel");

  const filterHoliday = $("#filterHoliday");
  const filterSpecial = $("#filterSpecial");
  const filterOnlyMajor = $("#filterOnlyMajor");

  const iOverlay = $("#iOverlay");
  const iCloseBtn = $("#iCloseBtn");
  const iTitle = $("#iTitle");
  const iMeta = $("#iMeta");
  const iSummary = $("#iSummary");
  const iText = $("#iText");
  const iSources = $("#iSources");
  const iSourcesWrap = $("#iSourcesWrap");

  const state = {
    year: new Date().getFullYear(),
    showHoliday: true,
    showSpecial: true,
    onlyMajor: false,

    holidayMap: new Map(),
    majorHolidayMap: new Map(),
    specialMap: new Map(),
    infoMap: new Map(),
  };

  const MONTHS_SHORT = ["jan","feb","mar","apr","maí","jún","júl","ágú","sep","okt","nóv","des"];
  const WEEKDAYS = ["mán","þri","mið","fim","fös","lau","sun"];

  function weekdayShort(date) {
    return WEEKDAYS[D.monIndex(date.getDay())];
  }

  function syncYearLabel() {
    if (