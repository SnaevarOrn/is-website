// assets/js/pages/kort.modes.js
// Kort — Mode system (extensible)

"use strict";

(() => {
  const map = window.kortMap;
  if (!map) return;

  const modes = new Map();
  let current = null;

  function register(id, mode) {
    modes.set(id, mode);
  }

  async function setMode(id) {
    if (current?.id === id) return;

    // teardown current
    if (current?.teardown) {
      try { await current.teardown({ map }); } catch {}
    }

    const next = modes.get(id) || modes.get("default");
    current = { id, ...next };

    if (current?.setup) {
      try { await current.setup({ map }); } catch {}
    }

    // UI hint in footer state
    const elState = document.getElementById("kortState");
    if (elState) elState.textContent = `Hamur: ${id}`;
  }

  // Default mode
  register("default", {
    setup() {},
    teardown() {}
  });

  // Placeholder: quiz towns
  register("quiz_towns", {
    setup() {
      alert("Leikjahamur (bæir) — kemur næst. 🙂");
    },
    teardown() {}
  });

  // Placeholder: quiz glaciers
  register("quiz_glaciers", {
    setup() {
      alert("Leikjahamur (jöklar) — kemur næst. ❄️");
    },
    teardown() {}
  });

  // Placeholder: wrecks
  register("wrecks", {
    setup() {
      alert("Skipsflök — næsta skref: GeoJSON layer + click info. ⚓");
    },
    teardown() {}
  });

  window.kortModes = { register, setMode, getCurrent: () => current?.id || "default" };

  // Start in default
  setMode("default");
})();
