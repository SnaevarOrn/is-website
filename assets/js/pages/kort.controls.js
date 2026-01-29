// assets/js/pages/kort.controls.js
// Kort — custom controls (menu + search + crosshair + measure + satellite + home + location)
// Fail-safe: one error must not kill the whole stack.

"use strict";

(() => {
  const map = window.kortMap;
  if (!map) return;

  function setStatus(text) {
    const el = document.getElementById("kortState");
    if (el) el.textContent = text;
  }

  function el(tag, className) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    return n;
  }

  function makeBtn(html, title, onClick) {
    const b = el("button", "kort-ctrl-btn");
    b.type = "button";
    b.innerHTML = html;
    b.title = title;
    b.setAttribute("aria-label", title);
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      try { onClick && onClick(b); } catch (err) { console.warn(err); }
    });
    return b;
  }

  function CustomStack(buttons) {
    this._buttons = buttons || [];
  }

  CustomStack.prototype.onAdd = function () {
    const wrap = el("div", "kort-ctrl-stack maplibregl-ctrl maplibregl-ctrl-group");
    for (let i = 0; i < this._buttons.length; i++) wrap.appendChild(this._buttons[i]);
    this._wrap = wrap;
    return wrap;
  };

  CustomStack.prototype.onRemove = function () {
    if (this._wrap && this._wrap.parentNode) this._wrap.parentNode.removeChild(this._wrap);
    this._wrap = null;
  };

  /* =========================
     Styles: Street <-> Satellite
     ========================= */

  // Persist across modules in the same page load
  const KORT_STYLE = window.KORT_STYLE || (window.KORT_STYLE = { key: "street" });

  // Default demo style (works without keys)
  const STYLE_STREET = "https://demotiles.maplibre.org/style.json";

  // Simple raster satellite (no key required; check provider terms/attribution)
  const STYLE_SATELLITE = {
    version: 8,
    name: "Satellite",
    sources: {
      esri: {
        type: "raster",
        tiles: [
          "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        ],
        tileSize: 256,
        attribution: "© Esri"
      }
    },
    layers: [{ id: "sat", type: "raster", source: "esri" }]
  };

  async function applyStyle(style) {
    // setStyle nukes layers/sources; we must re-add after load
    map.setStyle(style);
    await new Promise((r) => map.once("load", r));

    // Re-apply current mode (wrecks/quiz/etc.)
    try {
      const id = window.kortModes?.getCurrent?.() || "default";
      window.kortModes?.setMode?.(id);
    } catch (e) { console.warn(e); }

    // Optional refresh hooks (safe if undefined)
    try { window.kortRoute?.refresh?.(); } catch {}
    try { window.kortMeasure?.refresh?.(); } catch {}
    try { window.kortCrosshair?.refresh?.(); } catch {}
  }

  /* =========================
     Buttons
     ========================= */

  // Menu (hamburger)
  const btnMenu = makeBtn("≡", "Valmynd", () => {
    if (window.kortMenu && typeof window.kortMenu.toggle === "function") {
      window.kortMenu.toggle();
    } else {
      setStatus("Valmynd: kortMenu vantar.");
    }
  });

  // Search overlay
  const btnSearch = makeBtn("🔍", "Leita", () => {
    if (window.kortSearchOverlay && typeof window.kortSearchOverlay.open === "function") {
      window.kortSearchOverlay.open();
    } else {
      setStatus("Leit: overlay vantar.");
    }
  });

  // Crosshair toggle
  const btnCross = makeBtn("⌖", "Crosshair", (b) => {
    if (window.kortCrosshair && typeof window.kortCrosshair.toggle === "function") {
      window.kortCrosshair.toggle();
      const on = (window.kortCrosshair.get && window.kortCrosshair.get()) ? true : false;
      b.classList.toggle("kort-ctrl-active", on);
    } else {
      setStatus("Crosshair: kortCrosshair vantar.");
    }
  });

  // Measure toggle
  const btnMeasure = makeBtn("📏", "Mæla", (b) => {
    if (window.kortMeasure && typeof window.kortMeasure.toggle === "function") {
      const on = window.kortMeasure.toggle();
      b.classList.toggle("kort-ctrl-active", !!on);
    } else {
      setStatus("Mæling: kortMeasure vantar.");
    }
  });

  // Satellite toggle (Street <-> Satellite)
  const btnSat = makeBtn("🛰️", "Satellite", async (b) => {
    try {
      const next = (KORT_STYLE.key === "sat") ? "street" : "sat";
      KORT_STYLE.key = next;

      await applyStyle(next === "sat" ? STYLE_SATELLITE : STYLE_STREET);
      b.classList.toggle("kort-ctrl-active", next === "sat");
      setStatus(next === "sat" ? "Kort-útlit: Satellite" : "Kort-útlit: Street");
    } catch (e) {
      console.warn(e);
      setStatus("Gat ekki skipt um kort-útlit.");
    }
  });

  // Iceland "Home" button (fit to bounds)
  const btnHome = makeBtn("IS", "Ísland", () => {
    const b = window.KORT_ICELAND_BOUNDS;
    if (b && b.length === 2) {
      map.fitBounds(b, { padding: 40, duration: 900, essential: true });
      setStatus("Ísland ✓");
      return;
    }
    // Fallback: fly to roughly centered
    map.flyTo({ center: [-19.0, 64.9], zoom: 5.6, essential: true });
    setStatus("Ísland ✓");
  });

  // Location
  const btnLoc = makeBtn("📍", "Staðsetning", () => {
    if (!("geolocation" in navigator)) {
      setStatus("Staðsetning: ekki studd í vafra.");
      return;
    }
    setStatus("Sæki staðsetningu…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lng = pos.coords.longitude;
        const lat = pos.coords.latitude;
        map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 14), essential: true });
        setStatus("Staðsetning ✓");
      },
      () => setStatus("Staðsetning hafnað eða mistókst."),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 2000 }
    );
  });

  /* =========================
     Mount
     ========================= */

  try {
    map.addControl(new CustomStack([btnMenu, btnSearch, btnCross, btnMeasure, btnSat, btnHome, btnLoc]), "top-left");
  } catch (e) {
    console.warn("kort.controls failed:", e);
  }
})();
