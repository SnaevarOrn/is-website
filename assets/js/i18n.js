/* =========================================================
   ís.is — i18n.js
   Shared i18n + language toggle (depends on prefs.js)
   - Exposes: window.I18N, window.i18n.apply(), window.i18n.toggle()
   ========================================================= */

(function () {
  "use strict";

  if (!window.prefs) {
    console.warn("i18n.js: prefs.js not loaded");
    return;
  }

  // ---------- Dictionary ----------
  const I18N = {
    is: {
      "menu.settings": "Stillingar",
      "menu.about": "Um vefinn",
      "menu.contact": "Hafa samband",

      "iceland.title": "Ísland",
      "btn.glaciers": "Jöklar 🧊",
      "btn.towns": "Bæir 🏘️",
      "btn.random": "Slembiúrtak 🎲",

      "tools.title": "Verkfæri",
      "btn.calendar": "Dagatal 🗓️",
      "btn.clock": "Klukka 🕒",
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
      "btn.glaciers": "Glaciers 🧊",
      "btn.towns": "Towns 🏘️",
      "btn.random": "Random pick 🎲",

      "tools.title": "Tools",
      "btn.calendar": "Calendar 🗓️",
      "btn.clock": "Clock 🕒",
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
    }
  };

  function normLang(lang) {
    return (lang === "en") ? "en" : "is";
  }

  function applyToUI() {
    // Ensure default exists
    if (prefs.get("lang", null) == null) prefs.setLang("is");

    // Apply translations via prefs.js helper
    prefs.applyLang(I18N);

    // Update flag/pill if present
    const L = normLang(prefs.get("lang", "is"));
    const flag = document.getElementById("langFlag");
    const pill = document.getElementById("langPill");

    if (flag && pill) {
      if (L === "is") { flag.textContent = "🇮🇸"; pill.textContent = "IS"; }
      else { flag.textContent = "🇬🇧"; pill.textContent = "EN"; }
    }
  }

  function bindToggleButton() {
    const btn = document.getElementById("langBtn");
    if (!btn) return;

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      prefs.toggleLang();
      applyToUI();
    });
  }

  // Sync across tabs (storage event)
  window.addEventListener("storage", (e) => {
    if (!e.key) return;
    if (e.key === "is.pref.lang") applyToUI();
  });

  // Public API
  window.I18N = I18N;
  window.i18n = {
    apply: applyToUI,
    toggle: () => { prefs.toggleLang(); applyToUI(); }
  };

  document.addEventListener("DOMContentLoaded", () => {
    applyToUI();
    bindToggleButton();
  });

})();