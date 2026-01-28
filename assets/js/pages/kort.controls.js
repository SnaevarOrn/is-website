// assets/js/pages/kort.controls.js
// Kort — Custom MapLibre controls (native look): Menu · Home · Satellite · Location

"use strict";

(() => {
  const map = window.kortMap;
  if (!map) return;

  /* =========================
     Satellite style (demo)
     ========================= */
  if (!window.KORT_STYLE_SATELLITE) {
    window.KORT_STYLE_SATELLITE = {
      version: 8,
      sources: {
        satellite: {
          type: "raster",
          tiles: [
            "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          ],
          tileSize: 256,
          attribution: "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics"
        }
      },
      layers: [{ id: "satellite", type: "raster", source: "satellite" }]
    };
  }

  /* =========================
     Helpers
     ========================= */
  function makeGroupControl(buttons) {
    return {
      onAdd(_map) {
        this._map = _map;
        const container = document.createElement("div");
        container.className = "maplibregl-ctrl maplibregl-ctrl-group";
        buttons.forEach((btn) => container.appendChild(btn));
        this._container = container;
        return container;
      },
      onRemove() {
        this._container?.remove();
        this._map = null;
      }
    };
  }

  function makeButton(label, title, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("aria-label", title);
    btn.setAttribute("title", title);
    btn.innerHTML = label;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      onClick?.();
    });
    return btn;
  }

  /* =========================
     Menu button (opens panel)
     ========================= */
  const btnMenu = makeButton("☰", "Valmynd", () => {
    window.kortMenu?.toggle?.();
  });

  // Put menu as its own single-button group (looks like built-in)
  map.addControl(makeGroupControl([btnMenu]), "top-left");

  /* =========================
     Home / Satellite / Location group
     ========================= */

  let isSatellite = false;
  const btnSat = makeButton("🛰️", "Satellite", () => {
    const center = map.getCenter();
    const zoom = map.getZoom();
    const bearing = map.getBearing();
    const pitch = map.getPitch();

    isSatellite = !isSatellite;
    map.setStyle(isSatellite ? window.KORT_STYLE_SATELLITE : window.KORT_STYLE_MAP);

    map.once("styledata", () => {
      map.jumpTo({ center, zoom, bearing, pitch });
    });

    // tiny visual hint: toggle pressed state
    btnSat.classList.toggle("kort-ctrl-active", isSatellite);
  });

  const btnHome = makeButton("🇮🇸", "Sýna allt Ísland", () => {
    const bounds = window.KORT_ICELAND_BOUNDS;
    if (!bounds) return;
    map.fitBounds(bounds, { padding: 40, duration: 900, essential: true });
  });

  const btnLoc = makeButton("📍", "Nota staðsetningu", () => {
    if (!("geolocation" in navigator)) {
      alert("Vafrinn styður ekki staðsetningu.");
      return;
    }

    btnLoc.disabled = true;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        map.flyTo({
          center: [lng, lat],
          zoom: Math.max(map.getZoom(), 12),
          speed: 1.2,
          curve: 1.3,
          essential: true
        });

        if (!window.__kortLocationMarker) {
          window.__kortLocationMarker = new maplibregl.Marker({ color: "#ff3b3b" })
            .setLngLat([lng, lat])
            .addTo(map);
        } else {
          window.__kortLocationMarker.setLngLat([lng, lat]);
        }

        btnLoc.disabled = false;
      },
      (err) => {
        const msg =
          err.code === 1 ? "Aðgangi hafnað." :
          err.code === 2 ? "Staðsetning óaðgengileg." :
          err.code === 3 ? "Tími rann út." :
          "Villa kom upp.";

        alert(`Staðsetning: ${msg}`);
        btnLoc.disabled = false;
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  });

  // Add as a group directly under menu (top-left)
  map.addControl(makeGroupControl([btnHome, btnSat, btnLoc]), "top-left");

})();
