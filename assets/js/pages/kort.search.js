// assets/js/pages/kort.search.js
// Kort — Search (geocoding via /api/geocode)
// Supports header search + overlay search
// Route prompt is a popup next to destination marker (OPT-IN)

"use strict";

(() => {
  const map = window.kortMap;
  if (!map) return;

  const inputA = document.getElementById("kortSearch");
  const formA = document.getElementById("kortSearchForm");

  const inputB = document.getElementById("kortSearchOv");
  const formB = document.getElementById("kortSearchFormOv");

  if (!inputA && !inputB) return;

  let searchMarker = null;
  let dropdown = null;
  let routePopup = null;

  function setStatus(text) {
    const el = document.getElementById("kortState");
    if (el) el.textContent = text;
  }

  function ensureDropdown(forInput) {
    if (dropdown) return dropdown;

    const wrap = forInput.closest(".kort-search") || forInput.parentElement;
    dropdown = document.createElement("div");
    dropdown.className = "kort-search-dd";
    dropdown.hidden = true;
    wrap.appendChild(dropdown);

    document.addEventListener("click", (e) => {
      if (!dropdown) return;
      if (e.target === forInput) return;
      if (dropdown.contains(e.target)) return;
      hideDropdown();
    });

    return dropdown;
  }

  function hideDropdown() {
    if (!dropdown) return;
    dropdown.hidden = true;
    dropdown.innerHTML = "";
  }

  function placeMarker(lng, lat) {
    if (!searchMarker) {
      searchMarker = new maplibregl.Marker({ color: "#3bb2d0" })
        .setLngLat([lng, lat])
        .addTo(map);
    } else {
      searchMarker.setLngLat([lng, lat]);
    }
  }

  async function geocode(query) {
    const url = "/api/geocode?q=" + encodeURIComponent(query) + "&limit=5";
    const res = await fetch(url, {
      method: "GET",
      headers: { "accept": "application/json" },
      cache: "no-store"
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  function closeRoutePopup() {
    if (routePopup) {
      routePopup.remove();
      routePopup = null;
    }
  }

  function openRoutePrompt(lng, lat, label) {
    closeRoutePopup();

    // Unique ids for buttons inside popup
    const token = String(Date.now()) + String(Math.floor(Math.random() * 10000));
    const idYes = "kortRouteYes_" + token;
    const idNo  = "kortRouteNo_" + token;

    const html =
      `<div class="kort-popup">` +
        `<div class="kort-popup-title">Teikna leið?</div>` +
        `<div class="kort-popup-sub">${esc(label || "Valin staðsetning")}</div>` +
        `<div class="kort-popup-actions">` +
          `<button id="${idYes}" class="kort-mini-btn" type="button">✓ Já</button>` +
          `<button id="${idNo}" class="kort-mini-btn kort-mini-btn-ghost" type="button">✕ Loka</button>` +
        `</div>` +
      `</div>`;

    routePopup = new maplibregl.Popup({ closeButton: true, closeOnClick: false, maxWidth: "340px" })
      .setLngLat([lng, lat])
      .setHTML(html)
      .addTo(map);

    // Attach handlers once popup is in DOM
    setTimeout(() => {
      const btnYes = document.getElementById(idYes);
      const btnNo = document.getElementById(idNo);

      if (btnYes) {
        btnYes.addEventListener("click", () => {
          closeRoutePopup();
          if (window.kortRouting && typeof window.kortRouting.setDestination === "function") {
            window.kortRouting.setDestination(lng, lat, label || "");
            if (typeof window.kortRouting.startWatch === "function") window.kortRouting.startWatch();
          }
        });
      }

      if (btnNo) {
        btnNo.addEventListener("click", () => closeRoutePopup());
      }
    }, 0);
  }

  function flyToResult(r, activeInput) {
    placeMarker(r.lng, r.lat);

    map.flyTo({
      center: [r.lng, r.lat],
      zoom: Math.max(map.getZoom(), 14),
      speed: 1.2,
      curve: 1.3,
      essential: true
    });

    setStatus(r.label || ("Staðsetning: " + r.lat.toFixed(5) + ", " + r.lng.toFixed(5)));
    hideDropdown();

    if (activeInput) activeInput.blur();

    // OPT-IN routing: show prompt by marker
    if (window.kortRouting && typeof window.kortRouting.setDestination === "function") {
      openRoutePrompt(r.lng, r.lat, r.label || "");
    }
  }

  function renderResults(results, activeInput) {
    const dd = ensureDropdown(activeInput);
    dd.innerHTML = "";

    if (!results || results.length === 0) {
      dd.hidden = true;
      return;
    }

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "kort-search-item";
      btn.textContent = r.label || (r.lat.toFixed(5) + ", " + r.lng.toFixed(5));
      btn.addEventListener("click", () => flyToResult(r, activeInput));
      dd.appendChild(btn);
    }

    dd.hidden = false;
  }

  async function handleSearch(activeInput) {
    const q = (activeInput.value || "").trim();
    if (!q) return;

    setStatus("Leita…");
    hideDropdown();
    closeRoutePopup();

    try {
      const data = await geocode(q);

      if (!data || !data.ok) {
        setStatus("Villa við leit.");
        return;
      }

      const results = data.results || (data.result ? [data.result] : []);
      if (!results.length) {
        setStatus("Engin niðurstaða fannst.");
        return;
      }

      if (results.length === 1) {
        flyToResult(results[0], activeInput);
        return;
      }

      setStatus("Fann " + results.length + " niðurstöður — veldu rétta.");
      renderResults(results, activeInput);
    } catch (err) {
      console.error("Search error:", err);
      setStatus("Villa við leit.");
    }
  }

  function wireInput(input, form) {
    if (!input) return;

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSearch(input);
      }
      if (e.key === "Escape") {
        hideDropdown();
        closeRoutePopup();
      }
    });

    if (form) {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        handleSearch(input);
      });
    }
  }

  function esc(s) {
    const str = String(s);
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  wireInput(inputA, formA);
  wireInput(inputB, formB);
})();
