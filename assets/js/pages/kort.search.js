// assets/js/pages/kort.search.js
// Kort — Search (geocoding via /api/geocode)
// Mobile-friendly (form submit) + multiple results dropdown
// Routing is OPT-IN via confirm box

"use strict";

(() => {
  const map = window.kortMap;
  if (!map) return;

  const input = document.getElementById("kortSearch");
  const form = document.getElementById("kortSearchForm");
  if (!input) return;

  let searchMarker = null;
  let dropdown = null;
  let confirmBox = null;

  function setStatus(text) {
    const el = document.getElementById("kortState");
    if (el) el.textContent = text;
  }

  /* =========================
     Dropdown helpers
     ========================= */

  function ensureDropdown() {
    if (dropdown) return dropdown;

    const wrap = input.closest(".kort-search") || input.parentElement;
    dropdown = document.createElement("div");
    dropdown.className = "kort-search-dd";
    dropdown.hidden = true;
    wrap.appendChild(dropdown);

    // click outside closes
    document.addEventListener("click", (e) => {
      if (!dropdown) return;
      if (e.target === input) return;
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

  /* =========================
     Marker helpers
     ========================= */

  function placeMarker(lng, lat) {
    if (!searchMarker) {
      searchMarker = new maplibregl.Marker({ color: "#3bb2d0" })
        .setLngLat([lng, lat])
        .addTo(map);
    } else {
      searchMarker.setLngLat([lng, lat]);
    }
  }

  /* =========================
     Geocode
     ========================= */

  async function geocode(query) {
    const url = `/api/geocode?q=${encodeURIComponent(query)}&limit=5`;
    const res = await fetch(url, {
      method: "GET",
      headers: { "accept": "application/json" },
      cache: "no-store"
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  /* =========================
     Routing confirmation UI
     ========================= */

  function removeConfirm() {
    if (confirmBox) {
      confirmBox.remove();
      confirmBox = null;
    }
  }

  function askRouteConfirm(label, onYes, onNo) {
    removeConfirm();

    confirmBox = document.createElement("div");
    confirmBox.className = "kort-route-confirm";
    confirmBox.innerHTML = `
      <div class="kort-route-confirm-title">Teikna leið?</div>
      <div class="kort-route-confirm-sub">${label || "Valin staðsetning"}</div>
      <div class="kort-route-confirm-actions">
        <button type="button" class="kort-btn">✓ Teikna leið</button>
        <button type="button" class="kort-btn kort-btn-ghost">✕ Hafna</button>
      </div>
    `;

    document.body.appendChild(confirmBox);

    const btnYes = confirmBox.querySelectorAll("button")[0];
    const btnNo  = confirmBox.querySelectorAll("button")[1];

    btnYes.addEventListener("click", () => {
      removeConfirm();
      if (onYes) onYes();
    });

    btnNo.addEventListener("click", () => {
      removeConfirm();
      if (onNo) onNo();
    });
  }

  /* =========================
     Result handling
     ========================= */

  function flyToResult(r) {
    placeMarker(r.lng, r.lat);

    map.flyTo({
      center: [r.lng, r.lat],
      zoom: Math.max(map.getZoom(), 14),
      speed: 1.2,
      curve: 1.3,
      essential: true
    });

    setStatus(r.label || `Staðsetning: ${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}`);
    hideDropdown();
    input.blur();

    // OPT-IN routing
    if (window.kortRouting && typeof window.kortRouting.setDestination === "function") {
      askRouteConfirm(
        r.label,
        () => {
          window.kortRouting.setDestination(r.lng, r.lat, r.label || "");
          if (typeof window.kortRouting.startWatch === "function") {
            window.kortRouting.startWatch();
          }
        },
        () => {
          // hafnað – ekkert routing
        }
      );
    }
  }

  function renderResults(results) {
    const dd = ensureDropdown();
    dd.innerHTML = "";

    if (!results || results.length === 0) {
      dd.hidden = true;
      return;
    }

    results.forEach((r) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "kort-search-item";
      btn.textContent = r.label || `${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}`;
      btn.addEventListener("click", () => flyToResult(r));
      dd.appendChild(btn);
    });

    dd.hidden = false;
  }

  /* =========================
     Search flow
     ========================= */

  async function handleSearch() {
    const q = input.value.trim();
    if (!q) return;

    setStatus("Leita…");
    hideDropdown();
    removeConfirm();

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

      // If exactly one, go directly. If multiple, show chooser.
      if (results.length === 1) {
        flyToResult(results[0]);
        return;
      }

      setStatus(`Fann ${results.length} niðurstöður — veldu rétta.`);
      renderResults(results);
    } catch (err) {
      console.error("Search error:", err);
      setStatus("Villa við leit.");
    }
  }

  /* =========================
     Events
     ========================= */

  // Desktop fallback
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch();
    }
    if (e.key === "Escape") {
      hideDropdown();
      removeConfirm();
    }
  });

  // Mobile / robust
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      handleSearch();
    });
  }

})();
