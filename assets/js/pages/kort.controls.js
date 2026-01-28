// assets/js/pages/kort.controls.js
// Kort — Controls: Home · Satellite · Location
// Depends on: kort.js (window.kortMap, styles, bounds)

"use strict";

(() => {
  const map = window.kortMap;
  if (!map) return;

  const btnHome = document.getElementById("btnHome");
  const btnSatellite = document.getElementById("btnSatellite");
  const btnLocation = document.getElementById("btnLocation");
  const btnFullscreen = document.getElementById("btnFullscreen");

  /* =========================
     HOME — fit Iceland bounds
     ========================= */

  function goHome() {
    const bounds = window.KORT_ICELAND_BOUNDS;
    if (!bounds) return;

    map.fitBounds(bounds, {
      padding: 40,
      duration: 900,
      essential: true
    });
  }

  btnHome?.addEventListener("click", goHome);

  /* =========================
     SATELLITE — style toggle
     ========================= */

  // Demo satellite style (replace provider later if needed)
  // NOTE: Attribution must remain visible
  if (!window.KORT_STYLE_SATELLITE) {
    window.KORT_STYLE_SATELLITE = {
      version: 8,
      sources: {
        satellite: {
          type: "raster",
          tiles: [
            // Esri World Imagery (commonly used for demos)
            "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          ],
          tileSize: 256,
          attribution:
            "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics"
        }
      },
      layers: [
        { id: "satellite", type: "raster", source: "satellite" }
      ]
    };
  }

  let isSatellite = false;

  function toggleSatellite() {
    const center = map.getCenter();
    const zoom = map.getZoom();
    const bearing = map.getBearing();
    const pitch = map.getPitch();

    isSatellite = !isSatellite;

    map.setStyle(isSatellite ? window.KORT_STYLE_SATELLITE : window.KORT_STYLE_MAP);

    // Restore camera after style swap
    map.once("styledata", () => {
      map.jumpTo({
        center,
        zoom,
        bearing,
        pitch
      });
    });

    // Visual hint (optional, CSS-free)
    btnSatellite?.classList.toggle("is-active", isSatellite);
  }

  btnSatellite?.addEventListener("click", toggleSatellite);

  /* =========================
     LOCATION — browser GPS
     ========================= */

  function requestLocation() {
    if (!("geolocation" in navigator)) {
      alert("Vafrinn styður ekki staðsetningu.");
      return;
    }

    btnLocation?.setAttribute("disabled", "true");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const acc = pos.coords.accuracy; // meters

        map.flyTo({
          center: [lng, lat],
          zoom: Math.max(map.getZoom(), 12),
          speed: 1.2,
          curve: 1.3,
          essential: true
        });

        // Optional marker (single-use, not persisted)
        if (!window.__kortLocationMarker) {
          window.__kortLocationMarker = new maplibregl.Marker({ color: "#ff3b3b" })
            .setLngLat([lng, lat])
            .addTo(map);
        } else {
          window.__kortLocationMarker.setLngLat([lng, lat]);
        }

        // Small, honest feedback in console (no UI spam)
        console.info(
          `GPS staðsetning: ${lat.toFixed(5)}, ${lng.toFixed(5)} (±${Math.round(acc)} m)`
        );

        btnLocation?.removeAttribute("disabled");
      },
      (err) => {
        const msg =
          err.code === 1 ? "Aðgangi hafnað." :
          err.code === 2 ? "Staðsetning óaðgengileg." :
          err.code === 3 ? "Tími rann út." :
          "Villa kom upp.";

        alert(`Staðsetning: ${msg}`);
        btnLocation?.removeAttribute("disabled");
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 0
      }
    );
  }

  btnLocation?.addEventListener("click", requestLocation);

})();
/* =========================
   FULLSCREEN — toggle
   ========================= */

function toggleFullscreen() {
  const el = document.getElementById("kort-map");
  if (!el) return;

  // If already fullscreen -> exit
  if (document.fullscreenElement) {
    document.exitFullscreen?.();
    return;
  }

  // Request fullscreen on the map container
  el.requestFullscreen?.();
}

btnFullscreen?.addEventListener("click", toggleFullscreen);
