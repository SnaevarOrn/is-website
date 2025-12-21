/* =========================================================
   ís.is — site.js
   Shared UI wiring (menu, overlays, ESC, click-outside)
   Safe on pages that don't have the elements.
   ========================================================= */

(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);

  function on(el, evt, fn, opts) {
    if (!el) return;
    el.addEventListener(evt, fn, opts);
  }

  // ---------- MENU (burger dropdown) ----------
  function initMenu() {
    const menuBtn = $("#menuBtn");
    const menuPop = $("#menuPop");
    if (!menuBtn || !menuPop) return;

    function openMenu() {
      menuPop.classList.add("show");
      menuPop.setAttribute("aria-hidden", "false");
    }
    function closeMenu() {
      menuPop.classList.remove("show");
      menuPop.setAttribute("aria-hidden", "true");
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

    // expose for others
    return { closeMenu };
  }

  // ---------- OVERLAYS / MODALS ----------
  function initOverlays(menuApi) {
    // Map menu items -> overlays (only if present)
    const map = [
      { btn: "#menuSettings", overlay: "#settingsOverlay" },
      { btn: "#menuAbout", overlay: "#aboutOverlay" },
      { btn: "#menuContact", overlay: "#contactOverlay" },
    ];

    function openOverlay(overlayEl) {
      if (!overlayEl) return;
      overlayEl.classList.add("open");

      // focus first focusable thing (nice on mobile/keyboard)
      requestAnimationFrame(() => {
        const focusable =
          overlayEl.querySelector("input, textarea, button, [href], [tabindex]:not([tabindex='-1'])");
        if (focusable) focusable.focus();
      });
    }

    function closeOverlay(overlayEl) {
      if (!overlayEl) return;
      overlayEl.classList.remove("open");
    }

    // Generic: click on backdrop closes
    document.querySelectorAll(".overlay").forEach((ov) => {
      on(ov, "click", (e) => {
        if (e.target === ov) closeOverlay(ov);
      });
    });

    // Known close buttons (optional on each overlay)
    const closeIds = ["#contactClose", "#settingsClose", "#aboutClose"];
    closeIds.forEach((id) => on($(id), "click", () => {
      const ov = $(id)?.closest(".overlay");
      closeOverlay(ov);
    }));

    // Menu actions open overlays
    map.forEach(({ btn, overlay }) => {
      const b = $(btn);
      const ov = $(overlay);
      if (!b || !ov) return;

      on(b, "click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (menuApi?.closeMenu) menuApi.closeMenu();
        requestAnimationFrame(() => openOverlay(ov));
      });
    });

    // Expose helpers globally (optional use from pages)
    window.site = window.site || {};
    window.site.openOverlayById = (id) => openOverlay(document.getElementById(id));
    window.site.closeOverlayById = (id) => closeOverlay(document.getElementById(id));
    window.site.closeAllOverlays = () => {
      document.querySelectorAll(".overlay.open").forEach((ov) => closeOverlay(ov));
    };
  }

  // ---------- LOGO BUTTON (scroll to top) ----------
  function initLogoButton() {
    const logoBtn = $("#logoBtn");
    if (!logoBtn) return;

    on(logoBtn, "click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  // ---------- ESC closes ----------
  function initEsc() {
    on(document, "keydown", (e) => {
      if (e.key !== "Escape") return;

      // close overlays
      document.querySelectorAll(".overlay.open").forEach((ov) => ov.classList.remove("open"));

      // close menu if open
      const menuPop = $("#menuPop");
      if (menuPop?.classList.contains("show")) {
        menuPop.classList.remove("show");
        menuPop.setAttribute("aria-hidden", "true");
      }
    });
  }

  // ---------- INIT ----------
  document.addEventListener("DOMContentLoaded", () => {
    const menuApi = initMenu();
    initOverlays(menuApi);
    initLogoButton();
    initEsc();
  });

})();