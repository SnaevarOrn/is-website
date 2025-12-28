/* =========================================================
   ís.is — i18n.js
   Lightweight i18n + language switcher (IS/EN only)
   Depends on prefs.js if present (optional).
   ========================================================= */

(function () {
  "use strict";

  const SUPPORTED = [
    { code: "is", pill: "IS", flag: "🇮🇸" },
    { code: "en", pill: "EN", flag: "🇬🇧" }
  ];

  const DICT = {
    is: {
      "menu.settings": "Stillingar",
      "menu.about": "Um vefinn",
      "menu.contact": "Hafa samband",

      "iceland.title": "Ísland",
      "tools.title": "Verkfæri",

      "btn.glaciers": "Jöklar 🧊",
      "btn.towns": "Bæir 🏘️",
      "btn.calendar": "Dagatal",
      "btn.clock": "Klukka 🕒",
      "btn.random": "Slembiúrtak 🎲",
      "btn.timer": "Tímatalning",
      "btn.news": "Fréttir",

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
      "btn.calendar": "Calendar",
      "btn.clock": "Clock 🕒",
      "btn.random": "Random pick 🎲",
      "btn.timer": "Timer",
      "btn.news": "News",

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
      "about.p1": "Created in 2025 as an independent personal project — no ads, no tracking.",
      "about.p2": "The goal is to share knowledge about Iceland in a simple, interactive and accessible way.",
      "about.p3": "Free and open to use.",
      "about.p4": "Feedback or a voluntary contribution helps further development and maintenance.",
      "about.p5": "No ads. No cookies. Just Iceland."
    }
  };

  const KEY = "is.pref.lang";

  const $ = (sel, root = document) => root.querySelector(sel);

  function normalize(code) {
    const c = (code || "is").toLowerCase();
    return (c === "en") ? "en" : "is";
  }

  function getLang() {
    if (window.prefs && typeof prefs.get === "function") {
      return normalize(prefs.get("lang", "is"));
    }
    try {
      const raw = localStorage.getItem(KEY);
      return normalize(raw ? JSON.parse(raw) : "is");
    } catch {
      return "is";
    }
  }

  function setLang(code) {
    const c = normalize(code);

    if (window.prefs) {
      if (typeof prefs.setLang === "function") prefs.setLang(c);
      else if (typeof prefs.set === "function") prefs.set("lang", c);
      else localStorage.setItem(KEY, JSON.stringify(c));
    } else {
      localStorage.setItem(KEY, JSON.stringify(c));
    }

    applyToUI(c);
    window.dispatchEvent(new CustomEvent("is:langchange", { detail: { lang: c } }));
  }

  function nextLang(cur) {
    return (normalize(cur) === "is") ? "en" : "is";
  }

  function applyText(root, code) {
    const dict = DICT[code] || DICT.is;

    root.querySelectorAll("[data-i18n]").forEach((el) => {
      const k = el.getAttribute("data-i18n");
      const v = dict[k] ?? DICT.is[k];
      if (typeof v === "string") el.textContent = v;
    });

    root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const k = el.getAttribute("data-i18n-placeholder");
      const v = dict[k] ?? DICT.is[k];
      if (typeof v === "string") el.setAttribute("placeholder", v);
    });
  }

  function applyToUI(code) {
    const c = normalize(code);
    document.documentElement.lang = c;

    applyText(document, c);

    const flagEl = $("#langFlag");
    const pillEl = $("#langPill");
    const info = SUPPORTED.find(x => x.code === c) || SUPPORTED[0];
    if (flagEl) flagEl.textContent = info.flag;
    if (pillEl) pillEl.textContent = info.pill;
  }

  function init() {
    // default Icelandic if nothing set
    const cur = getLang();
    applyToUI(cur);

    const btn = $("#langBtn");
    if (btn) {
      // iOS/Safari: prevent double-fire
      let last = 0;

      const flip = (e) => {
        const now = Date.now();
        if (now - last < 350) return;
        last = now;

        e.preventDefault();
        e.stopPropagation();
        setLang(nextLang(getLang()));
      };

      btn.addEventListener("pointerup", flip, { passive: false });
      btn.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") flip(e);
      });
    }

    // sync across tabs
    window.addEventListener("storage", (e) => {
      if (!e.key) return;
      if (e.key === KEY || e.key === "is.pref.lang") applyToUI(getLang());
    });
  }

  document.addEventListener("DOMContentLoaded", init);

  // minimal API
  window.i18n = window.i18n || {};
  window.i18n.getLang = getLang;
  window.i18n.setLang = setLang;

})();