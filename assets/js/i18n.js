/* =========================================================
   ís.is — i18n.js
   Lightweight i18n + language switcher (depends on prefs.js if present)
   Supports: IS/EN/DE/DA/FR/ES/IT/SV/FI
   ========================================================= */

(function () {
  "use strict";

  const SUPPORTED = [
    { code: "is", pill: "IS", flag: "🇮🇸" },
    { code: "en", pill: "EN", flag: "🇬🇧" },
    { code: "de", pill: "DE", flag: "🇩🇪" },
    { code: "da", pill: "DA", flag: "🇩🇰" },
    { code: "fr", pill: "FR", flag: "🇫🇷" },
    { code: "es", pill: "ES", flag: "🇪🇸" },
    { code: "it", pill: "IT", flag: "🇮🇹" },
    { code: "sv", pill: "SV", flag: "🇸🇪" },
    { code: "fi", pill: "FI", flag: "🇫🇮" },
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
      "about.p1": "Created in 2025 as an independent personal project — no ads, no tracking.",
      "about.p2": "The goal is to share knowledge about Iceland in a simple, interactive and accessible way.",
      "about.p3": "Free and open to use.",
      "about.p4": "Feedback or a voluntary contribution helps further development and maintenance.",
      "about.p5": "No ads. No cookies. Just Iceland."
    },

    // Minimal-but-useful translations for the extra languages
    de: {
      "menu.settings": "Einstellungen",
      "menu.about": "Über",
      "menu.contact": "Kontakt",
      "iceland.title": "Island",
      "tools.title": "Werkzeuge",
      "btn.glaciers": "Gletscher 🧊",
      "btn.towns": "Orte 🏘️",
      "btn.calendar": "Kalender 🗓️",
      "btn.clock": "Uhr 🕒",
      "btn.random": "Zufall 🎲",
      "btn.timer": "Timer ⏱️",
      "btn.news": "Nachrichten 📰",
      "footer.pill": "Seite erstellt 2025. Keine Cookies — nur Eis.",
      "contact.title": "Kontakt",
      "contact.nameLabel": "Name",
      "contact.emailLabel": "E-Mail",
      "contact.msgLabel": "Nachricht",
      "contact.send": "Senden",
      "contact.namePh": "Name",
      "contact.emailPh": "name@beispiel.de",
      "contact.msgPh": "Schreibe hier…",
      "settings.title": "Einstellungen",
      "settings.themeTitle": "Design",
      "settings.themeHint": "Hell / Dunkel",
      "about.title": "Über"
    },
    da: {
      "menu.settings": "Indstillinger",
      "menu.about": "Om",
      "menu.contact": "Kontakt",
      "iceland.title": "Island",
      "tools.title": "Værktøjer",
      "btn.glaciers": "Gletsjere 🧊",
      "btn.towns": "Byer 🏘️",
      "btn.calendar": "Kalender 🗓️",
      "btn.clock": "Ur 🕒",
      "btn.random": "Tilfældig 🎲",
      "btn.timer": "Timer ⏱️",
      "btn.news": "Nyheder 📰",
      "footer.pill": "Siden oprettet 2025. Ingen cookies — bare is.",
      "contact.title": "Kontakt",
      "contact.nameLabel": "Navn",
      "contact.emailLabel": "Email",
      "contact.msgLabel": "Besked",
      "contact.send": "Send",
      "settings.title": "Indstillinger",
      "settings.themeTitle": "Tema",
      "settings.themeHint": "Lys / Mørk",
      "about.title": "Om"
    },
    fr: {
      "menu.settings": "Paramètres",
      "menu.about": "À propos",
      "menu.contact": "Contact",
      "iceland.title": "Islande",
      "tools.title": "Outils",
      "btn.glaciers": "Glaciers 🧊",
      "btn.towns": "Villes 🏘️",
      "btn.calendar": "Calendrier 🗓️",
      "btn.clock": "Horloge 🕒",
      "btn.random": "Aléatoire 🎲",
      "btn.timer": "Minuterie ⏱️",
      "btn.news": "Actualités 📰",
      "footer.pill": "Site créé en 2025. Pas de cookies — juste de la glace.",
      "contact.title": "Contact",
      "contact.nameLabel": "Nom",
      "contact.emailLabel": "Email",
      "contact.msgLabel": "Message",
      "contact.send": "Envoyer",
      "settings.title": "Paramètres",
      "settings.themeTitle": "Thème",
      "settings.themeHint": "Clair / Sombre",
      "about.title": "À propos"
    },
    es: {
      "menu.settings": "Ajustes",
      "menu.about": "Acerca de",
      "menu.contact": "Contacto",
      "iceland.title": "Islandia",
      "tools.title": "Herramientas",
      "btn.glaciers": "Glaciares 🧊",
      "btn.towns": "Pueblos 🏘️",
      "btn.calendar": "Calendario 🗓️",
      "btn.clock": "Reloj 🕒",
      "btn.random": "Aleatorio 🎲",
      "btn.timer": "Temporizador ⏱️",
      "btn.news": "Noticias 📰",
      "footer.pill": "Sitio creado en 2025. Sin cookies — solo hielo.",
      "contact.title": "Contacto",
      "contact.nameLabel": "Nombre",
      "contact.emailLabel": "Email",
      "contact.msgLabel": "Mensaje",
      "contact.send": "Enviar",
      "settings.title": "Ajustes",
      "settings.themeTitle": "Tema",
      "settings.themeHint": "Claro / Oscuro",
      "about.title": "Acerca de"
    },
    it: {
      "menu.settings": "Impostazioni",
      "menu.about": "Info",
      "menu.contact": "Contatto",
      "iceland.title": "Islanda",
      "tools.title": "Strumenti",
      "btn.glaciers": "Ghiacciai 🧊",
      "btn.towns": "Città 🏘️",
      "btn.calendar": "Calendario 🗓️",
      "btn.clock": "Orologio 🕒",
      "btn.random": "Casuale 🎲",
      "btn.timer": "Timer ⏱️",
      "btn.news": "Notizie 📰",
      "footer.pill": "Sito creato nel 2025. Niente cookie — solo ghiaccio.",
      "contact.title": "Contatto",
      "contact.nameLabel": "Nome",
      "contact.emailLabel": "Email",
      "contact.msgLabel": "Messaggio",
      "contact.send": "Invia",
      "settings.title": "Impostazioni",
      "settings.themeTitle": "Tema",
      "settings.themeHint": "Chiaro / Scuro",
      "about.title": "Info"
    },
    sv: {
      "menu.settings": "Inställningar",
      "menu.about": "Om",
      "menu.contact": "Kontakt",
      "iceland.title": "Island",
      "tools.title": "Verktyg",
      "btn.glaciers": "Glaciärer 🧊",
      "btn.towns": "Städer 🏘️",
      "btn.calendar": "Kalender 🗓️",
      "btn.clock": "Klocka 🕒",
      "btn.random": "Slump 🎲",
      "btn.timer": "Timer ⏱️",
      "btn.news": "Nyheter 📰",
      "footer.pill": "Sajt skapad 2025. Inga cookies — bara is.",
      "contact.title": "Kontakt",
      "contact.nameLabel": "Namn",
      "contact.emailLabel": "E-post",
      "contact.msgLabel": "Meddelande",
      "contact.send": "Skicka",
      "settings.title": "Inställningar",
      "settings.themeTitle": "Tema",
      "settings.themeHint": "Ljust / Mörkt",
      "about.title": "Om"
    },
    fi: {
      "menu.settings": "Asetukset",
      "menu.about": "Tietoa",
      "menu.contact": "Yhteys",
      "iceland.title": "Islanti",
      "tools.title": "Työkalut",
      "btn.glaciers": "Jäätiköt 🧊",
      "btn.towns": "Kaupungit 🏘️",
      "btn.calendar": "Kalenteri 🗓️",
      "btn.clock": "Kello 🕒",
      "btn.random": "Satunnainen 🎲",
      "btn.timer": "Ajastin ⏱️",
      "btn.news": "Uutiset 📰",
      "footer.pill": "Sivusto luotu 2025. Ei evästeitä — vain jäätä.",
      "contact.title": "Yhteys",
      "contact.nameLabel": "Nimi",
      "contact.emailLabel": "Sähköposti",
      "contact.msgLabel": "Viesti",
      "contact.send": "Lähetä",
      "settings.title": "Asetukset",
      "settings.themeTitle": "Teema",
      "settings.themeHint": "Vaalea / Tumma",
      "about.title": "Tietoa"
    }
  };

  const KEY = "is.pref.lang";

  function getLang() {
    // prefs.js path
    if (window.prefs && typeof prefs.get === "function") {
      const v = prefs.get("lang", "is");
      return normalize(v);
    }
    // fallback
    try {
      const raw = localStorage.getItem(KEY);
      const v = raw ? JSON.parse(raw) : "is";
      return normalize(v);
    } catch {
      return "is";
    }
  }

  function setLang(code) {
    code = normalize(code);
    if (window.prefs) {
      // support either setLang or set('lang', ...)
      if (typeof prefs.setLang === "function") prefs.setLang(code);
      else if (typeof prefs.set === "function") prefs.set("lang", code);
      else localStorage.setItem(KEY, JSON.stringify(code));
    } else {
      localStorage.setItem(KEY, JSON.stringify(code));
    }
    applyToUI(code);
    // let other scripts react
    window.dispatchEvent(new CustomEvent("is:langchange", { detail: { lang: code } }));
  }

  function normalize(code) {
    const c = (code || "is").toLowerCase();
    return SUPPORTED.some(x => x.code === c) ? c : "is";
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
    document.documentElement.lang = code;

    applyText(document, code);

    const meta = document.getElementById("metaThemeColor");
    if (meta) {
      // leave theme.js to manage this if you want – harmless default:
      meta.setAttribute("content", document.documentElement.getAttribute("data-theme") === "dark" ? "#000000" : "#ffffff");
    }

    const flagEl = document.getElementById("langFlag");
    const pillEl = document.getElementById("langPill");
    const info = SUPPORTED.find(x => x.code === code) || SUPPORTED[0];
    if (flagEl) flagEl.textContent = info.flag;
    if (pillEl) pillEl.textContent = info.pill;
  }

  function nextLang(cur) {
    const i = SUPPORTED.findIndex(x => x.code === cur);
    return SUPPORTED[(i + 1 + SUPPORTED.length) % SUPPORTED.length].code;
  }

  function init() {
    // Ensure default exists
    const cur = getLang();
    applyToUI(cur);

    const btn = document.getElementById("langBtn");
    if (btn) {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        setLang(nextLang(getLang()));
      });
    }

    // Sync across tabs + from prefs changes
    window.addEventListener("storage", (e) => {
      if (!e.key) return;
      if (e.key === KEY || e.key === "is.pref.lang") applyToUI(getLang());
    });
  }

  document.addEventListener("DOMContentLoaded", init);

  // expose minimal API
  window.i18n = window.i18n || {};
  window.i18n.getLang = getLang;
  window.i18n.setLang = setLang;

})();