/* /assets/js/pages/nidurtalning.js
   - Countdown with optional prep countdown + optional milliseconds display
   - Sync between front-page wheels and settings inputs
*/

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // Display
  const timeEl  = $("time");
  const stateEl = $("state");

  // Buttons
  const startBtn = $("start");
  const pauseBtn = $("pause");
  const resetBtn = $("reset");

  // Header buttons
  const settingsBtn = $("settingsBtn");
  const closeSettings = $("closeSettings");
  const themeBtn = $("themeBtn");
  const settingsOverlay = $("settings");

  // Wheels
  const wH = $("wH");
  const wM = $("wM");
  const wS = $("wS");

  // Settings inputs
  const hoursEl = $("hours");
  const minsEl  = $("minutes");
  const secsEl  = $("seconds");

  const usePrepEl = $("usePrep");
  const prepEl = $("prep");
  const showMsEl = $("showMs");
  const applyBtn = $("apply");

  // Small hints under wheels
  const hintPrep = $("hintPrep");
  const hintMs = $("hintMs");

  // ---------- State ----------
  const status = {
    mode: "ready", // ready | prep | run | done | paused
    running: false,
    paused: false,

    totalMs: 5 * 60 * 1000,
    remainingMs: 5 * 60 * 1000,

    prepEnabled: false,
    prepSeconds: 5,
    prepRemainingMs: 0,

    showMs: false,

    // timing
    rafId: 0,
    lastTs: 0
  };

  // ---------- Helpers ----------
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

  const pad2 = (n) => String(n).padStart(2, "0");
  const pad3 = (n) => String(n).padStart(3, "0");

  function msToParts(ms){
    ms = Math.max(0, Math.floor(ms));
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const milli = ms % 1000;
    return { h, m, s, milli };
  }

  function partsToMs(h, m, s){
    return ((h * 3600) + (m * 60) + s) * 1000;
  }

  function fmtTime(ms){
    const { h, m, s, milli } = msToParts(ms);

    // If hours is 0, keep the cleaner look like before (MM:SS)
    if (!status.showMs) {
      if (h > 0) return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
      return `${pad2(m)}:${pad2(s)}`;
    }

    // With ms: show .mmm
    if (h > 0) return `${pad2(h)}:${pad2(m)}:${pad2(s)}.${pad3(milli)}`;
    return `${pad2(m)}:${pad2(s)}.${pad3(milli)}`;
  }

  function setStateLabel(){
    const map = {
      ready: "Tilbúið",
      prep: "Byrjar…",
      run: "Í gangi",
      paused: "Pása",
      done: "Lokið"
    };
    stateEl.textContent = map[status.mode] || "Tilbúið";
  }

  function setButtons(){
    const isActive = status.mode === "prep" || status.mode === "run";
    startBtn.disabled = isActive;
    pauseBtn.disabled = !isActive;
  }

  function render(){
    // During prep, show prep time (seconds) in the big display
    if (status.mode === "prep") {
      const secLeft = Math.ceil(status.prepRemainingMs / 1000);
      timeEl.textContent = String(secLeft);
      setStateLabel();
      setButtons();
      return;
    }

    timeEl.textContent = fmtTime(status.remainingMs);
    setStateLabel();
    setButtons();
  }

  function renderHints(){
    hintPrep.textContent = `Start countdown: ${status.prepEnabled ? "á" : "af"}`;
    hintMs.textContent = `Millisec: ${status.showMs ? "á" : "af"}`;
  }

  function syncWheelsFromMs(ms){
    const { h, m, s } = msToParts(ms);
    wH.textContent = pad2(clamp(h, 0, 23));
    wM.textContent = pad2(clamp(m, 0, 59));
    wS.textContent = pad2(clamp(s, 0, 59));
  }

  function syncInputsFromMs(ms){
    const { h, m, s } = msToParts(ms);
    hoursEl.value = String(clamp(h, 0, 23));
    minsEl.value  = String(clamp(m, 0, 59));
    secsEl.value  = String(clamp(s, 0, 59));
  }

  function currentConfiguredMs(){
    const h = clamp(Number(hoursEl.value || 0), 0, 23);
    const m = clamp(Number(minsEl.value || 0), 0, 59);
    const s = clamp(Number(secsEl.value || 0), 0, 59);
    return partsToMs(h, m, s);
  }

  function applyConfigToReadyState(){
    const ms = currentConfiguredMs();
    status.totalMs = ms;
    status.remainingMs = ms;

    status.prepEnabled = !!usePrepEl.checked;
    status.prepSeconds = clamp(Number(prepEl.value || 0), 0, 60);

    status.showMs = !!showMsEl.checked;

    // keep UI consistent
    syncWheelsFromMs(ms);
    renderHints();

    // If time is 0, force a sane ready label, but keep it allowed.
    status.mode = "ready";
    render();
  }

  // ---------- Engine ----------
  function stopLoop(){
    if (status.rafId) cancelAnimationFrame(status.rafId);
    status.rafId = 0;
    status.lastTs = 0;
  }

  function finish(){
    stopLoop();
    status.mode = "done";
    render();
  }

  function loop(ts){
    if (!status.lastTs) status.lastTs = ts;
    const dt = ts - status.lastTs;
    status.lastTs = ts;

    if (status.mode === "prep") {
      status.prepRemainingMs -= dt;

      if (status.prepRemainingMs <= 0) {
        // transition to run
        status.mode = "run";
        status.prepRemainingMs = 0;
        status.lastTs = ts; // reset dt baseline
        render();
      } else {
        render();
      }
    } else if (status.mode === "run") {
      status.remainingMs -= dt;

      if (status.remainingMs <= 0) {
        status.remainingMs = 0;
        render();
        finish();
        return;
      }
      render();
    }

    // Render frequency:
    // - If ms is off, no need to render at 60fps; but simplest is still RAF.
    //   Overhead is tiny here, and correctness beats micro-optimization.
    status.rafId = requestAnimationFrame(loop);
  }

  function start(){
    if (status.mode === "prep" || status.mode === "run") return;

    // If we're in done, start from configured value again
    if (status.mode === "done") {
      status.remainingMs = status.totalMs;
    }

    // If remaining is 0, still allow start -> it will instantly finish.
    if (status.prepEnabled && status.prepSeconds > 0) {
      status.mode = "prep";
      status.prepRemainingMs = status.prepSeconds * 1000;
    } else {
      status.mode = "run";
    }

    setButtons();
    render();
    stopLoop();
    status.rafId = requestAnimationFrame(loop);
  }

  function pause(){
    if (!(status.mode === "prep" || status.mode === "run")) return;
    stopLoop();
    status.mode = "paused";
    render();
  }

  function resume(){
    if (status.mode !== "paused") return;

    // Decide what to resume: if prepRemainingMs > 0 resume prep, else run
    if (status.prepEnabled && status.prepRemainingMs > 0) status.mode = "prep";
    else status.mode = "run";

    render();
    stopLoop();
    status.rafId = requestAnimationFrame(loop);
  }

  function reset(){
    stopLoop();
    applyConfigToReadyState();
  }

  // ---------- Wheel handling ----------
  function wheelGet(unit){
    const h = Number(wH.textContent || 0);
    const m = Number(wM.textContent || 0);
    const s = Number(wS.textContent || 0);
    return { h, m, s, unit };
  }

  function wheelSet(h, m, s){
    h = clamp(h, 0, 23);
    m = clamp(m, 0, 59);
    s = clamp(s, 0, 59);
    wH.textContent = pad2(h);
    wM.textContent = pad2(m);
    wS.textContent = pad2(s);

    // push into settings inputs too
    hoursEl.value = String(h);
    minsEl.value  = String(m);
    secsEl.value  = String(s);
  }

  function wheelNudge(unit, dir){
    const { h, m, s } = wheelGet();
    let nh = h, nm = m, ns = s;

    const d = dir === "up" ? 1 : -1;

    if (unit === "h") nh = clamp(h + d, 0, 23);
    if (unit === "m") nm = clamp(m + d, 0, 59);
    if (unit === "s") ns = clamp(s + d, 0, 59);

    wheelSet(nh, nm, ns);

    // If we’re not actively running, update the ready countdown immediately
    if (status.mode !== "prep" && status.mode !== "run") {
      applyConfigToReadyState();
    }
  }

  // ---------- Modal ----------
  function openSettings(){
    settingsOverlay.classList.add("open");
    settingsOverlay.setAttribute("aria-hidden", "false");
  }

  function closeSettingsFn(){
    settingsOverlay.classList.remove("open");
    settingsOverlay.setAttribute("aria-hidden", "true");
  }

  // ---------- Events ----------
  startBtn.addEventListener("click", () => {
    if (status.mode === "paused") resume();
    else start();
  });

  pauseBtn.addEventListener("click", () => pause());
  resetBtn.addEventListener("click", () => reset());

  // Wheels: delegation
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".spin");
    if (!btn) return;

    const wheel = btn.closest(".wheel");
    if (!wheel) return;

    const unit = wheel.getAttribute("data-unit");
    const action = btn.getAttribute("data-action");

    if (status.mode === "prep" || status.mode === "run") return; // don’t change while running

    wheelNudge(unit, action);
  });

  // Settings apply
  applyBtn.addEventListener("click", () => {
    // normalize inputs
    hoursEl.value = String(clamp(Number(hoursEl.value || 0), 0, 23));
    minsEl.value  = String(clamp(Number(minsEl.value || 0), 0, 59));
    secsEl.value  = String(clamp(Number(secsEl.value || 0), 0, 59));
    prepEl.value  = String(clamp(Number(prepEl.value || 0), 0, 60));

    // sync wheels and apply
    const ms = currentConfiguredMs();
    syncWheelsFromMs(ms);

    applyConfigToReadyState();
    closeSettingsFn();
  });

  // Keep wheels in sync while typing (but don’t auto-close)
  [hoursEl, minsEl, secsEl].forEach((el) => {
    el.addEventListener("input", () => {
      const ms = currentConfiguredMs();
      syncWheelsFromMs(ms);

      if (status.mode !== "prep" && status.mode !== "run") {
        status.totalMs = ms;
        status.remainingMs = ms;
        status.mode = "ready";
        render();
      }
    });
  });

  // Toggles update hints immediately
  usePrepEl.addEventListener("change", () => {
    status.prepEnabled = !!usePrepEl.checked;
    renderHints();
  });
  showMsEl.addEventListener("change", () => {
    status.showMs = !!showMsEl.checked;
    renderHints();
    render();
  });
  prepEl.addEventListener("input", () => {
    status.prepSeconds = clamp(Number(prepEl.value || 0), 0, 60);
  });

  // Modal open/close
  settingsBtn.addEventListener("click", openSettings);
  closeSettings.addEventListener("click", closeSettingsFn);
  settingsOverlay.addEventListener("click", (e) => {
    if (e.target === settingsOverlay) closeSettingsFn();
  });

  // Theme
  themeBtn.addEventListener("click", () => {
    if (window.prefs && typeof prefs.toggleTheme === "function") prefs.toggleTheme();
  });

  // Keyboard: close on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && settingsOverlay.classList.contains("open")) closeSettingsFn();
  });

  // ---------- Init ----------
  function initDefaults(){
    // defaults
    hoursEl.value = "0";
    minsEl.value = "5";
    secsEl.value = "0";

    usePrepEl.checked = false; // default OFF
    prepEl.value = "5";

    showMsEl.checked = false; // default OFF

    const ms = partsToMs(0, 5, 0);
    status.totalMs = ms;
    status.remainingMs = ms;

    status.prepEnabled = false;
    status.prepSeconds = 5;
    status.showMs = false;

    syncWheelsFromMs(ms);
    renderHints();

    status.mode = "ready";
    render();
    setButtons();
  }

  initDefaults();
})();