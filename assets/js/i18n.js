/* =========================================================
   ís.is — i18n.js
   Language handling + UI translation + flag/pill update
   Depends on: prefs.js (window.prefs)
   Safe on pages without i18n elements.
   ========================================================= */

(function () {
  "use strict";

  if (!window.prefs) return;

  // --- Add languages here (fallback: en -> is) ---
  // NOTE: You can start with partial translations; it falls back safely.
  const I18N = {
    is: {
      "menu.settings": "Stillingar",
      "menu.about": "Um vefinn",
      "menu.contact": "Hafa samband",

      "iceland.title": "Ísland",
      "tools.title": "Verkfæri",

      "btn.glaciers": "Jöklar 🧊",
      "btn.towns": "Bæir 🏘️",
      "btn.calendar": "Dagatal 🗓️",
      "btn.clock": "Klukka 🕒",
      "btn.random": "Slembiúrtak 🎲",
      "btn.timer": "Tímatalning ⏱️",
      "btn.news": "Fréttir 📰",

      "footer.pill": "Vefur stofnaður 2025. Engar vafrakökur – bara ís.",

      "contact.title": "Hafa samband",
      "contact.nameLabel": "Nafn",
      "contact.emailLabel": "Tölvupóstur",
      "contact.msgLabel": "Erindi",
      "contact.send": "Senda",
      "contact.namePh": "Nafn",
      "contact.emailPh": "nafn@dæmi.is",
      "contact.msgPh": "Skrifaðu erindið hér...",

      "settings.title": "Stillingar",
      "settings.themeTitle": "Þema",
      "settings.themeHint": "Light / Dark",

      "about.title": "Um vefinn",
      "about.p1": "Vefur stofnaður 2025 og er sjálfstætt verkefni unnið af einstaklingi, án auglýsinga, rekstrarfélaga eða gagnasöfnunar.",
      "about.p2": "Markmið vefsins er að miðla þekkingu um Ísland á einfaldan, gagnvirkan og aðgengilegan hátt – í þágu almennings.",
      "about.p3": "Vefurinn er opinn og ókeypis.",
      "about.p4": "Þeir sem vilja geta stutt við áframhaldandi þróun með frjálsu framlagi eða endurgjöf. Slíkur stuðningur nýtist beint í uppbyggingu og viðhald.",
      "about.p5": "Engar auglýsingar. Engar vafrakökur. Bara Ísland."
    },

    en: {
      "menu.settings": "Settings",
      "menu.about": "About",
      "menu.contact": "Contact",

      "iceland.title": "Iceland",
      "tools.title": "Tools",

      "btn.glaciers": "Glaciers 🧊",
      "btn.towns": "Towns 🏘️",
      "btn.calendar": "Calendar 🗓️",
      "btn.clock": "Clock 🕒",
      "btn.random": "Random pick 🎲",
      "btn.timer": "Timer ⏱️",
      "btn.news": "News 📰",

      "footer.pill": "Site created 2025. No cookies — just ice.",

      "contact.title": "Contact",
      "contact.nameLabel": "Name",
      "contact.emailLabel": "Email",
      "contact.msgLabel": "Message",
      "contact.send": "Send",
      "contact.namePh": "Name",
      "contact.emailPh": "name@example.com",
      "contact.msgPh": "Write your message here...",

      "settings.title": "Settings",
      "settings.themeTitle": "Theme",
      "settings.themeHint": "Light / Dark",

      "about.title": "About",
      "about.p1": "Created in 2025 as an independent, personal project — with no ads, no companies behind it, and no tracking.",
      "about.p2": "The goal is to share knowledge about Iceland in a simple, interactive, and accessible way — for the public.",
      "about.p3": "Free and open to use.",
      "about.p4": "If you want to support further development, feedback or a voluntary contribution helps keep the site improving.",
      "about.p5": "No ads. No cookies. Just Iceland."
    },

    // --- New languages: start with English fallback strings (you can translate later) ---
    de: {},  // German
    da: {},  // Danish
    fr: {},  // French
    es: {},  // Spanish
    it: {},  // Italian
    sv: {},  // Swedish
    fi: {}   // Finnish
  };

  const LANGS = [
    { code: "is", pill: "IS", flag: "🇮🇸" },
    { code: "en", pill: "EN", flag: "🇬🇧" },
    { code: "de", pill: "DE", flag: "🇩🇪" },
    { code: "da", pill: "DK", flag: "🇩🇰" },
    { code: "fr", pill: "FR", flag: "🇫🇷" },
    { code: "es", pill: "ES", flag: "🇪🇸" },
    { code: "it", pill: "IT", flag: "🇮🇹" },
    { code: "sv", pill: "SE", flag: "🇸🇪" },
    { code: "fi", pill: "FI", flag: "🇫🇮" }
  ];

  const $ = (id) => document.getElementById(id);

  function normalizeLang(l) {
    const code = (typeof l === "string" ? l : "").toLowerCase();
    return LANGS.some(x => x.code === code) ? code : "is";
  }

  function getDict(lang) {
    // fallbacks: requested -> en -> is -> {}
    return I18N[lang] || I18N.en || I18N.is || {};
  }

  function t(lang, key) {
    const dict = getDict(lang);
    if (dict && typeof dict[key] === "string") return dict[key];

    // fallback to English then Icelandic
    if (I18N.en && typeof I18N.en[key] === "string") return I18N.en[key];
    if (I18N.is && typeof I18N.is[key] === "string") return I18N.is[key];

    return null;
  }

  function applyLangToDom(lang) {
    const L = normalizeLang(lang);

    document.documentElement.setAttribute("lang", L);
    window.prefs.setLang(L);

    // text nodes
    document.querySelectorAll("[data-i18n]").forEach(el => {
      const key = el.getAttribute("data-i18n");
      const val = t(L, key);
      if (typeof val === "string") el.textContent = val;
    });

    // placeholders
    document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
      const key = el.getAttribute("data-i18n-placeholder");
      const val = t(L, key);
      if (typeof val === "string") el.setAttribute("placeholder", val);
    });

    // flag + pill
    const meta = LANGS.find(x => x.code === L) || LANGS[0];
    const flagEl = $("langFlag");
    const pillEl = $("langPill");
    if (flagEl) flagEl.textContent = meta.flag;
    if (pillEl) pillEl.textContent = meta.pill;
  }

  function cycleLang() {
    const cur = normalizeLang(window.prefs.get("lang", "is"));
    const idx = LANGS.findIndex(x => x.code === cur);
    const next = LANGS[(idx + 1 + LANGS.length) % LANGS.length].code;
    applyLangToDom(next);
  }

  function init() {
    // default if missing
    if (!window.prefs.get("lang", null)) window.prefs.setLang("is");

    // apply current on load
    applyLangToDom(window.prefs.get("lang", "is"));

    // button click
    const btn = $("langBtn");
    if (btn) {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation(); // IMPORTANT: prevents click-outside handlers killing it
        cycleLang();
      });
    }

    // keep in sync across tabs
    window.addEventListener("storage", (e) => {
      if (e.key === "is.pref.lang") applyLangToDom(window.prefs.get("lang", "is"));
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();