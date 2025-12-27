/* =========================================================
   ís.is — site.js
   Shared UI wiring (menu, overlays, ESC, lang/theme toggles)
   Safe on pages that don't have the elements.
   ========================================================= */

(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);

  function on(el, evt, fn, opts) {
    if (!el) return;
    el.addEventListener(evt, fn, opts);
  }

  function setAriaHidden(el, hidden) {
    if (!el) return;
    el.setAttribute("aria-hidden", hidden ? "true" : "false");
  }

  // ---------- MENU (burger dropdown) ----------
  function initMenu() {
    const menuBtn = $("#menuBtn");
    const menuPop = $("#menuPop");
    if (!menuBtn || !menuPop) return null;

    function openMenu() {
      menuPop.classList.add("show");
      setAriaHidden(menuPop, false);
    }
    function closeMenu() {
      menuPop.classList.remove("show");
      setAriaHidden(menuPop, true);
    }
    function toggleMenu() {
      menuPop.classList.contains("show") ? closeMenu() : openMenu();
    }

    on(menuBtn, "click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleMenu();
    });

    on(menuPop, "click", (e) => e.stopPropagation());

    // click-outside closes
    on(document, "click", (e) => {
      if (!menuPop.contains(e.target) && !menuBtn.contains(e.target)) closeMenu();
    });

    return { closeMenu, openMenu, toggleMenu, menuPop, menuBtn };
  }

  // ---------- LOGO DROPDOWN (main navigation) ----------
  function initLogoMenu() {
    const logoBtn = $("#logoBtn");
    const logoPop = $("#logoPop");
    if (!logoBtn || !logoPop) return null;

    function openLogoMenu() {
      logoPop.classList.add("show");
      setAriaHidden(logoPop, false);
    }
    function closeLogoMenu() {
      logoPop.classList.remove("show");
      setAriaHidden(logoPop, true);
    }
    function toggleLogoMenu() {
      logoPop.classList.contains("show") ? closeLogoMenu() : openLogoMenu();
    }

    on(logoBtn, "click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleLogoMenu();
    });

    on(logoPop, "click", (e) => e.stopPropagation());

    // click-outside closes
    on(document, "click", (e) => {
      if (!logoPop.contains(e.target) && !logoBtn.contains(e.target)) closeLogoMenu();
    });

    return { closeLogoMenu, openLogoMenu, toggleLogoMenu, logoPop, logoBtn };
  }

  // ---------- OVERLAYS / MODALS ----------
  function initOverlays(menuApi) {
    const map = [
      { btn: "#menuSettings", overlay: "#settingsOverlay" },
      { btn: "#menuAbout", overlay: "#aboutOverlay" },
      { btn: "#menuContact", overlay: "#contactOverlay" },
    ];

    function openOverlay(overlayEl) {
      if (!overlayEl) return;
      overlayEl.classList.add("open");

      requestAnimationFrame(() => {
        const focusable = overlayEl.querySelector(
          "input, textarea, button, [href], [tabindex]:not([tabindex='-1'])"
        );
        if (focusable) focusable.focus();
      });
    }

    function closeOverlay(overlayEl) {
      if (!overlayEl) return;
      overlayEl.classList.remove("open");
    }

    // Backdrop click closes
    document.querySelectorAll(".overlay").forEach((ov) => {
      on(ov, "click", (e) => {
        if (e.target === ov) closeOverlay(ov);
      });
    });

    // Close buttons (optional)
    ["#contactClose", "#settingsClose", "#aboutClose"].forEach((id) => {
      const btn = $(id);
      on(btn, "click", () => closeOverlay(btn?.closest(".overlay")));
    });

    // Menu items -> overlays
    map.forEach(({ btn, overlay }) => {
      const b = $(btn);
      const ov = $(overlay);
      if (!b || !ov) return;

      on(b, "click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        menuApi?.closeMenu?.();
        requestAnimationFrame(() => openOverlay(ov));
      });
    });

    // Global helpers (optional)
    window.site = window.site || {};
    window.site.openOverlayById = (id) => openOverlay(document.getElementById(id));
    window.site.closeOverlayById = (id) => closeOverlay(document.getElementById(id));
    window.site.closeAllOverlays = () => {
      document.querySelectorAll(".overlay.open").forEach((ov) => closeOverlay(ov));
    };
  }

  // ---------- LANGUAGE toggle ----------
  function initLang(I18N, applyLangToUI) {
    const langBtn = $("#langBtn");
    if (!langBtn) return;

    on(langBtn, "click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!window.prefs) return;
      prefs.toggleLang();
      if (typeof applyLangToUI === "function") applyLangToUI();
      else if (I18N) prefs.applyLang(I18N);
    });
  }

  // ---------- THEME toggle (settings modal) ----------
  function initThemeToggle() {
    const themeToggle = $("#themeToggle");
    if (!themeToggle || !window.prefs) return;

    function sync() {
      const t = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
      themeToggle.checked = (t === "dark");
    }

    sync();

    on(themeToggle, "change", (e) => {
      prefs.applyTheme(e.target.checked ? "dark" : "light");
      sync();
    });

    // keep in sync across tabs/pages
    on(window, "storage", (e) => {
      if (e.key === "is.pref.theme") sync();
    });
  }

  // ---------- ESC closes ----------
  function initEsc(menuApi, logoApi) {
    on(document, "keydown", (e) => {
      if (e.key !== "Escape") return;

      // close overlays
      document.querySelectorAll(".overlay.open").forEach((ov) => ov.classList.remove("open"));

      // close menus
      menuApi?.closeMenu?.();
      logoApi?.closeLogoMenu?.();
    });
  }

  // ---------- INIT ----------
  document.addEventListener("DOMContentLoaded", () => {
    // If prefs.js exists, ensure current stored theme/lang are applied
    try { window.prefs?.applyThemeFromStorage?.(); } catch {}
    try { window.prefs && document.documentElement.setAttribute("lang", prefs.get("lang", "is")); } catch {}

    const menuApi = initMenu();
    const logoApi = initLogoMenu();

    // Make them mutually exclusive (open one -> close the other)
    if (menuApi && logoApi) {
      const origMenuToggle = menuApi.toggleMenu;
      menuApi.toggleMenu = () => {
        logoApi.closeLogoMenu();
        origMenuToggle();
      };

      const origLogoToggle = logoApi.toggleLogoMenu;
      logoApi.toggleLogoMenu = () => {
        menuApi.closeMenu();
        origLogoToggle();
      };

      // Rebind click handlers to use the wrapped toggles (safe)
      on(menuApi.menuBtn, "click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        menuApi.toggleMenu();
      }, { capture: true });

      on(logoApi.logoBtn, "click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        logoApi.toggleLogoMenu();
      }, { capture: true });
    }

    initOverlays(menuApi);
    initThemeToggle();

    // NOTE: language toggle depends on your page providing applyLangToUI (recommended).
    // If page defines window.applyLangToUI, we use it.
    const maybeApplyLang = window.applyLangToUI;
    initLang(window.I18N, maybeApplyLang);

    initEsc(menuApi, logoApi);

    // Keep language UI synced across tabs/pages
    on(window, "storage", (e) => {
      if (e.key === "is.pref.lang" && typeof window.applyLangToUI === "function") {
        window.applyLangToUI();
      }
    });
  });

})();