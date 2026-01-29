// assets/js/pages/kort.search.js
// Kort — Search (geocoding via /api/geocode)
// Supports header search + overlay search
// Route prompt is a popup next to destination marker (OPT-IN)
//
// Upgrade:
// - If multiple results are "far apart": zoom out to show them all + clickable map markers.
// - If multiple results are close: keep dropdown chooser (as before).

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

  // "Choose on map" mode
  let chooseMarkers = [];
  let chooseActiveInput = null;

  // Heuristics: if results spread more than this, we prefer map chooser over dropdown
  const MULTI_SPREAD_KM = 20;     // Lundey variants are far apart -> this triggers
  const MULTI_MIN_RESULTS = 2;

  function setStatus(text) {
    const el = document.getElementById("kortState");
    if (el) el.textContent = text;
  }

  function ensureDropdown(forInput) {
    // one dropdown at a time (good enough)
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

  function clearChooseOnMap() {
    if (chooseMarkers && chooseMarkers.length) {
      for (const m of chooseMarkers) {
        try { m.remove(); } catch {}
      }
    }
    chooseMarkers = [];
    chooseActiveInput = null;
  }

  function openRoutePrompt(lng, lat, label) {
    closeRoutePopup();

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
    clearChooseOnMap();

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

  function renderResultsDropdown(results, activeInput) {
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

  function shouldUseMapChooser(results) {
    if (!results || results.length < MULTI_MIN_RESULTS) return false;

    const spreadKm = computeSpreadKm(results);
    return spreadKm >= MULTI_SPREAD_KM;
  }

  function computeSpreadKm(results) {
    // Use bounding box diagonal as a cheap "spread" estimator
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    for (const r of results) {
      minLat = Math.min(minLat, r.lat);
      maxLat = Math.max(maxLat, r.lat);
      minLng = Math.min(minLng, r.lng);
      maxLng = Math.max(maxLng, r.lng);
    }
    if (!isFinite(minLat) || !isFinite(minLng) || !isFinite(maxLat) || !isFinite(maxLng)) return 0;
    const d = haversineKm(minLat, minLng, maxLat, maxLng);
    return d;
  }

  function fitToResults(results) {
    try {
      const b = new maplibregl.LngLatBounds();
      for (const r of results) b.extend([r.lng, r.lat]);
      map.fitBounds(b, { padding: 60, duration: 900, essential: true });
      return;
    } catch {}
    // Fallback: fly to average
    let lat = 0, lng = 0;
    for (const r of results) { lat += r.lat; lng += r.lng; }
    lat /= results.length; lng /= results.length;
    map.flyTo({ center: [lng, lat], zoom: 6, essential: true });
  }

  function showChooseOnMap(results, activeInput) {
    clearChooseOnMap();
    hideDropdown();
    closeRoutePopup();

    chooseActiveInput = activeInput || null;

    // If overlay is open and blocks map clicks, close it (best-effort)
    try { window.kortSearchOverlay?.close?.(); } catch {}

    setStatus("Fann fleiri en eina staðsetningu — veldu punkt á kortinu.");

    fitToResults(results);

    // Add temporary clickable markers
    for (const r of results) {
      const m = new maplibregl.Marker({ color: "#111" })
        .setLngLat([r.lng, r.lat])
        .addTo(map);

      // Make marker clickable: MapLibre marker element is DOM
      const el = m.getElement();
      el.style.cursor = "pointer";
      el.setAttribute("aria-label", r.label || "Velja stað");
      el.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        flyToResult(r, chooseActiveInput);
      });

      // Optional: small tooltip on hover (desktop)
      el.title = r.label || "";

      chooseMarkers.push(m);
    }

    // Escape cancels choose-on-map
    const onKey = (e) => {
      if (e.key === "Escape") {
        document.removeEventListener("keydown", onKey);
        clearChooseOnMap();
        setStatus("Hætt við.");
      }
    };
    document.addEventListener("keydown", onKey);
  }

  async function handleSearch(activeInput) {
    const q = (activeInput.value || "").trim();
    if (!q) return;

    setStatus("Leita…");
    hideDropdown();
    closeRoutePopup();
    clearChooseOnMap();

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

      // Single result -> go
      if (results.length === 1) {
        flyToResult(results[0], activeInput);
        return;
      }

      // Many results:
      // - If far apart: zoom out + clickable points on map
      // - Else: dropdown chooser
      if (shouldUseMapChooser(results)) {
        showChooseOnMap(results, activeInput);
        return;
      }

      setStatus("Fann " + results.length + " niðurstöður — veldu rétta.");
      renderResultsDropdown(results, activeInput);
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
        clearChooseOnMap();
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

  function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const toRad = (d) => (d * Math.PI) / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  wireInput(inputA, formA);
  wireInput(inputB, formB);
})();