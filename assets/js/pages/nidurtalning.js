/* /assets/js/pages/nidurtalning.js */

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // ---------------------------
  // Storage (prefs.js first, fallback localStorage)
  // ---------------------------
  const STORE_KEY = "countdown.state.v1";

  function hasPrefs(){
    return !!(window.prefs && typeof prefs.get === "function" && typeof prefs.set === "function");
  }

  function storeGet(fallback = null){
    try{
      if (hasPrefs()) return prefs.get(STORE_KEY, fallback);
    }catch(_){}
    try{
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : fallback;
    }catch(_){
      return fallback;
    }
  }

  function storeSet(val){
    try{
      if (hasPrefs()) { prefs.set(STORE_KEY, val); return; }
    }catch(_){}
    try{
      localStorage.setItem(STORE_KEY, JSON.stringify(val));
    }catch(_){}
  }

  // ---------------------------
  // Elements
  // ---------------------------

  // Display
  const timeEl  = $("time");
  const stateEl = $("state");

  // Buttons
  const goBtn    = $("go");
  const resetBtn = $("reset");

  // Header/buttons
  const settingsBtn = $("settingsBtn");
  const closeSettings = $("closeSettings");
  const themeBtn = $("themeBtn");
  const settingsOverlay = $("settings");

  // Picker lists
  const listH = $("listH");
  const listM = $("listM");
  const listS = $("listS");

  // Settings inputs
  const hoursEl = $("hours");
  const minsEl  = $("minutes");
  const secsEl  = $("seconds");

  const usePrepEl = $("usePrep");
  const prepEl = $("prep");
  const showMsEl = $("showMs");
  const applyBtn = $("apply");

  // Hints
  const hintPrep = $("hintPrep");
  const hintMs = $("hintMs");

  const ITEM_H = 52;      // must match CSS li height
  const PAD_ITEMS = 2;    // visual context for "dim" styling

  // ---------------------------
  // State
  // ---------------------------
  const status = {
    mode: "ready", // ready | prep | run | paused | done

    // configured duration
    totalMs: 5 * 60 * 1000,

    // runtime
    remainingMs: 5 * 60 * 1000,

    prepEnabled: false,
    prepSeconds: 5,
    prepRemainingMs: 0,

    showMs: false,

    // "wall clock truth" for run state persistence
    endAt: null,        // ms since epoch when run ends
    prepEndAt: null,    // ms since epoch when prep ends
    pausedPhase: null,  // 'prep' | 'run' | null

    rafId: 0
  };

  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const pad2 = (n) => String(n).padStart(2, "0");

  function msToParts(ms){
    ms = Math.max(0, Math.floor(ms));
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const milli = ms % 1000;
    const cs = Math.floor(milli / 10); // centiseconds 0..99
    return { h, m, s, cs };
  }

  function partsToMs(h, m, s){
    return ((h * 3600) + (m * 60) + s) * 1000;
  }

  function fmtTime(ms){
    const { h, m, s, cs } = msToParts(ms);
    if (!status.showMs) {
      if (h > 0) return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
      return `${pad2(m)}:${pad2(s)}`;
    }
    // 2 digits only:
    if (h > 0) return `${pad2(h)}:${pad2(m)}:${pad2(s)}.${pad2(cs)}`;
    return `${pad2(m)}:${pad2(s)}.${pad2(cs)}`;
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

  function isActive(){
    // active means: user can't edit picker/settings normally
    return status.mode === "prep" || status.mode === "run" || status.mode === "paused";
  }

  function updateActiveUI(){
    document.body.setAttribute("data-active", isActive() ? "1" : "0");
  }

  function canReset(){
    // greyed-out when already reset (ready and remaining==total)
    if (status.mode === "ready" && Math.abs(status.remainingMs - status.totalMs) < 20) return false;
    // allow reset in paused/run/prep/done (acts like "cancel to configured value")
    return true;
  }

  function setButtons(){
    const running = (status.mode === "prep" || status.mode === "run");
    const paused  = (status.mode === "paused");

    resetBtn.disabled = !canReset();

    if (running) {
      goBtn.textContent = "⏸︎ Pása";
    } else if (paused) {
      goBtn.textContent = "▶︎ Halda áfram";
    } else {
      goBtn.textContent = "▶︎ Start";
    }

    goBtn.disabled = false;
  }

  function renderHints(){
    hintPrep.textContent = `Start countdown: ${status.prepEnabled ? "á" : "af"}`;
    hintMs.textContent = `Millisec: ${status.showMs ? "á" : "af"}`;
  }

  // ---------------------------
  // Persistence
  // ---------------------------
  function readConfigMs(){
    const h = clamp(Number(hoursEl.value || 0), 0, 23);
    const m = clamp(Number(minsEl.value || 0), 0, 59);
    const s = clamp(Number(secsEl.value || 0), 0, 59);
    return partsToMs(h, m, s);
  }

  function snapshot(){
    // Only store what we need to recover UI + run state
    return {
      v: 1,

      // config
      totalMs: Math.max(0, Math.floor(status.totalMs)),
      prepEnabled: !!status.prepEnabled,
      prepSeconds: clamp(Number(status.prepSeconds || 0), 0, 60),
      showMs: !!status.showMs,

      // run state
      mode: status.mode,
      endAt: (typeof status.endAt === "number") ? status.endAt : null,
      prepEndAt: (typeof status.prepEndAt === "number") ? status.prepEndAt : null,
      pausedPhase: status.pausedPhase || null,

      // paused values (so we can resume exactly)
      remainingMs: Math.max(0, Math.floor(status.remainingMs)),
      prepRemainingMs: Math.max(0, Math.floor(status.prepRemainingMs)),

      updatedAt: Date.now()
    };
  }

  function persist(){
    storeSet(snapshot());
  }

  // ---------------------------
  // Render + loop (wall-clock accurate)
  // ---------------------------
  function stopLoop(){
    if (status.rafId) cancelAnimationFrame(status.rafId);
    status.rafId = 0;
  }

  function finish(){
    stopLoop();
    status.mode = "done";
    status.endAt = null;
    status.prepEndAt = null;
    status.pausedPhase = null;
    status.remainingMs = 0;
    status.prepRemainingMs = 0;
    persist();
    render();
  }

  function render(){
    updateActiveUI();

    if (status.mode === "prep") {
      const secLeft = Math.ceil(status.prepRemainingMs / 1000);
      timeEl.textContent = String(Math.max(0, secLeft));
    } else {
      timeEl.textContent = fmtTime(status.remainingMs);
    }

    setStateLabel();
    setButtons();
  }

  function tickFromWallClock(){
    const now = Date.now();

    if (status.mode === "prep") {
      if (typeof status.prepEndAt !== "number") {
        // fallback safety
        status.prepEndAt = now + status.prepRemainingMs;
      }
      status.prepRemainingMs = Math.max(0, status.prepEndAt - now);

      if (status.prepRemainingMs <= 0) {
        // transition to RUN
        status.prepRemainingMs = 0;
        status.prepEndAt = null;

        status.mode = "run";
        status.endAt = now + status.remainingMs; // remainingMs should be configured total here
        persist();
      }
    }

    if (status.mode === "run") {
      if (typeof status.endAt !== "number") {
        status.endAt = now + status.remainingMs;
      }
      status.remainingMs = Math.max(0, status.endAt - now);

      if (status.remainingMs <= 0) {
        status.remainingMs = 0;
        render();
        finish();
        return;
      }
    }

    render();
  }

  function loop(){
    tickFromWallClock();
    status.rafId = requestAnimationFrame(loop);
  }

  function ensureLoopRunning(){
    if (!status.rafId && (status.mode === "prep" || status.mode === "run")) {
      status.rafId = requestAnimationFrame(loop);
    }
  }

  // ---------------------------
  // Actions
  // ---------------------------
  function applyConfigToReady(){
    const ms = readConfigMs();

    status.totalMs = ms;
    status.remainingMs = ms;

    status.prepEnabled = !!usePrepEl.checked;
    status.prepSeconds = clamp(Number(prepEl.value || 0), 0, 60);

    status.showMs = !!showMsEl.checked;

    status.mode = "ready";
    status.endAt = null;
    status.prepEndAt = null;
    status.pausedPhase = null;
    status.prepRemainingMs = 0;

    renderHints();

    // keep picker aligned to config
    setPickerFromParts(msToParts(ms));

    persist();
    render();
  }

  function start(){
    if (status.mode === "prep" || status.mode === "run") return;

    const now = Date.now();

    // If done -> restart from configured value
    if (status.mode === "done") {
      status.remainingMs = status.totalMs;
    }

    // If ready (or paused resumed elsewhere) ensure remainingMs is sane
    if (status.mode === "ready") {
      status.remainingMs = status.totalMs;
    }

    if (status.prepEnabled && status.prepSeconds > 0) {
      status.mode = "prep";
      status.prepRemainingMs = status.prepSeconds * 1000;
      status.prepEndAt = now + status.prepRemainingMs;
      status.endAt = null;
    } else {
      status.mode = "run";
      status.endAt = now + status.remainingMs;
      status.prepEndAt = null;
      status.prepRemainingMs = 0;
    }

    status.pausedPhase = null;

    persist();
    render();
    stopLoop();
    status.rafId = requestAnimationFrame(loop);
  }

  function pause(){
    if (!(status.mode === "prep" || status.mode === "run")) return;

    // freeze current remaining using wall-clock fields
    tickFromWallClock();

    status.pausedPhase = (status.mode === "prep") ? "prep" : "run";
    status.mode = "paused";

    status.endAt = null;
    status.prepEndAt = null;

    stopLoop();
    persist();
    render();
  }

  function resume(){
    if (status.mode !== "paused") return;

    const now = Date.now();

    // resume from pausedPhase, default to run if unknown
    if (status.pausedPhase === "prep" && status.prepRemainingMs > 0) {
      status.mode = "prep";
      status.prepEndAt = now + status.prepRemainingMs;
      status.endAt = null;
    } else {
      status.mode = "run";
      status.endAt = now + status.remainingMs;
      status.prepEndAt = null;
      status.prepRemainingMs = 0;
    }

    status.pausedPhase = null;

    persist();
    render();
    stopLoop();
    status.rafId = requestAnimationFrame(loop);
  }

  function reset(){
    // Reset always returns to configured value and ready state
    stopLoop();
    applyConfigToReady();
  }

  function goAction(){
    if (status.mode === "prep" || status.mode === "run") pause();
    else if (status.mode === "paused") resume();
    else start(); // ready or done
  }

  // ---------------------------
  // iOS-like scroll picker
  // ---------------------------
  function buildList(el, max){
    const frag = document.createDocumentFragment();
    for (let i = 0; i <= max; i++) {
      const li = document.createElement("li");
      li.textContent = pad2(i);
      li.dataset.value = String(i);
      frag.appendChild(li);
    }
    el.innerHTML = "";
    el.appendChild(frag);
  }

  function getCenteredValue(listEl){
    const idx = Math.round(listEl.scrollTop / ITEM_H);
    return clamp(idx, 0, listEl.children.length - 1);
  }

  function scrollToIndex(listEl, idx, smooth = true){
    const top = idx * ITEM_H;
    listEl.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
  }

  function dimAround(listEl){
    const idx = getCenteredValue(listEl);
    [...listEl.children].forEach((li, i) => {
      const dist = Math.abs(i - idx);
      li.classList.toggle("dim", dist >= PAD_ITEMS);
    });
  }

  function setPickerFromParts({ h, m, s }){
    scrollToIndex(listH, clamp(h, 0, 23), false);
    scrollToIndex(listM, clamp(m, 0, 59), false);
    scrollToIndex(listS, clamp(s, 0, 59), false);
    dimAround(listH);
    dimAround(listM);
    dimAround(listS);
  }

  function syncInputsFromPicker(){
    const h = getCenteredValue(listH);
    const m = getCenteredValue(listM);
    const s = getCenteredValue(listS);
    hoursEl.value = String(h);
    minsEl.value  = String(m);
    secsEl.value  = String(s);
  }

  function commitPickerToReady(){
    if (isActive()) return; // locked while active
    syncInputsFromPicker();
    applyConfigToReady();   // persists
  }

  function attachPicker(listEl){
    let t = 0;

    const onScroll = () => {
      dimAround(listEl);
      clearTimeout(t);
      t = setTimeout(() => {
        const idx = getCenteredValue(listEl);
        scrollToIndex(listEl, idx, true);
        commitPickerToReady();
      }, 80);
    };

    listEl.addEventListener("scroll", onScroll, { passive: true });

    listEl.addEventListener("click", (e) => {
      if (isActive()) return;
      const li = e.target.closest("li");
      if (!li) return;
      const idx = Number(li.dataset.value || 0);
      scrollToIndex(listEl, idx, true);
      setTimeout(() => commitPickerToReady(), 120);
    });
  }

  // ---------------------------
  // Modal
  // ---------------------------
  function openSettings(){
    if (isActive()) return;
    settingsOverlay.classList.add("open");
    settingsOverlay.setAttribute("aria-hidden", "false");
  }

  function closeSettingsFn(){
    settingsOverlay.classList.remove("open");
    settingsOverlay.setAttribute("aria-hidden", "true");
  }

  // ---------------------------
  // Events
  // ---------------------------
  goBtn.addEventListener("click", goAction);
  resetBtn.addEventListener("click", reset);

  applyBtn.addEventListener("click", () => {
    hoursEl.value = String(clamp(Number(hoursEl.value || 0), 0, 23));
    minsEl.value  = String(clamp(Number(minsEl.value || 0), 0, 59));
    secsEl.value  = String(clamp(Number(secsEl.value || 0), 0, 59));
    prepEl.value  = String(clamp(Number(prepEl.value || 0), 0, 60));

    setPickerFromParts({
      h: Number(hoursEl.value),
      m: Number(minsEl.value),
      s: Number(secsEl.value)
    });

    applyConfigToReady(); // persists
    closeSettingsFn();
  });

  // immediate feedback while typing (only when not active)
  [hoursEl, minsEl, secsEl].forEach((el) => {
    el.addEventListener("input", () => {
      if (isActive()) return;
      status.totalMs = readConfigMs();
      status.remainingMs = status.totalMs;
      status.mode = "ready";
      status.endAt = null;
      status.prepEndAt = null;
      status.pausedPhase = null;
      status.prepRemainingMs = 0;

      setPickerFromParts(msToParts(status.totalMs));
      renderHints();
      persist();
      render();
    });
  });

  usePrepEl.addEventListener("change", () => {
    status.prepEnabled = !!usePrepEl.checked;
    renderHints();
    persist();
  });

  showMsEl.addEventListener("change", () => {
    status.showMs = !!showMsEl.checked;
    renderHints();
    persist();
    render();
  });

  prepEl.addEventListener("input", () => {
    status.prepSeconds = clamp(Number(prepEl.value || 0), 0, 60);
    persist();
  });

  settingsBtn.addEventListener("click", openSettings);
  closeSettings.addEventListener("click", closeSettingsFn);
  settingsOverlay.addEventListener("click", (e) => {
    if (e.target === settingsOverlay) closeSettingsFn();
  });

  themeBtn.addEventListener("click", () => {
    if (window.prefs && typeof prefs.toggleTheme === "function") prefs.toggleTheme();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && settingsOverlay.classList.contains("open")) {
      closeSettingsFn();
      return;
    }

    // Space toggles Start/Pause/Resume, but NOT while typing or in open settings
    if (e.code === "Space" || e.key === " ") {
      if (settingsOverlay.classList.contains("open")) return;

      const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
      const typing =
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        e.target?.isContentEditable;

      if (typing) return;

      e.preventDefault();
      goAction();
    }
  });

  // Flush state on navigation/backgrounding
  window.addEventListener("pagehide", () => persist());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") persist();
  });

  // ---------------------------
  // Init (restore from store)
  // ---------------------------
  function restoreFromStore(){
    const saved = storeGet(null);
    if (!saved || typeof saved !== "object") return false;

    // config
    const totalMs = Math.max(0, Number(saved.totalMs || 0));
    status.totalMs = Number.isFinite(totalMs) ? totalMs : 0;

    status.prepEnabled = !!saved.prepEnabled;
    status.prepSeconds = clamp(Number(saved.prepSeconds || 0), 0, 60);
    status.showMs = !!saved.showMs;

    // apply to form controls
    const parts = msToParts(status.totalMs);
    hoursEl.value = String(clamp(parts.h, 0, 23));
    minsEl.value  = String(clamp(parts.m, 0, 59));
    secsEl.value  = String(clamp(parts.s, 0, 59));
    usePrepEl.checked = status.prepEnabled;
    prepEl.value = String(status.prepSeconds);
    showMsEl.checked = status.showMs;

    // runtime restore
    const now = Date.now();
    const mode = String(saved.mode || "ready");

    status.remainingMs = Math.max(0, Number(saved.remainingMs ?? status.totalMs));
    status.prepRemainingMs = Math.max(0, Number(saved.prepRemainingMs ?? 0));
    status.endAt = (typeof saved.endAt === "number") ? saved.endAt : null;
    status.prepEndAt = (typeof saved.prepEndAt === "number") ? saved.prepEndAt : null;
    status.pausedPhase = (saved.pausedPhase === "prep" || saved.pausedPhase === "run") ? saved.pausedPhase : null;

    if (mode === "run" && typeof status.endAt === "number") {
      status.mode = "run";
      status.remainingMs = Math.max(0, status.endAt - now);
      if (status.remainingMs <= 0) {
        finish();
        return true;
      }
      renderHints();
      setPickerFromParts(parts);
      render();
      stopLoop();
      status.rafId = requestAnimationFrame(loop);
      return true;
    }

    if (mode === "prep" && typeof status.prepEndAt === "number") {
      status.mode = "prep";
      status.prepRemainingMs = Math.max(0, status.prepEndAt - now);
      if (status.prepRemainingMs <= 0) {
        // If prep already elapsed while away, jump into run
        status.prepRemainingMs = 0;
        status.prepEndAt = null;
        status.mode = "run";
        status.endAt = now + status.totalMs;
        status.remainingMs = status.totalMs;
        persist();
      }
      renderHints();
      setPickerFromParts(parts);
      render();
      stopLoop();
      status.rafId = requestAnimationFrame(loop);
      return true;
    }

    if (mode === "paused") {
      status.mode = "paused";
      // keep remainingMs/prepRemainingMs as stored
      renderHints();
      setPickerFromParts(parts);
      render();
      persist(); // normalize
      return true;
    }

    if (mode === "done") {
      status.mode = "done";
      status.remainingMs = 0;
      status.prepRemainingMs = 0;
      status.endAt = null;
      status.prepEndAt = null;
      renderHints();
      setPickerFromParts(parts);
      render();
      return true;
    }

    // default: ready
    status.mode = "ready";
    status.remainingMs = status.totalMs;
    status.prepRemainingMs = 0;
    status.endAt = null;
    status.prepEndAt = null;
    status.pausedPhase = null;

    renderHints();
    setPickerFromParts(parts);
    render();
    persist();
    return true;
  }

  function init(){
    // build lists
    buildList(listH, 23);
    buildList(listM, 59);
    buildList(listS, 59);

    attachPicker(listH);
    attachPicker(listM);
    attachPicker(listS);

    // Try restore first
    const restored = restoreFromStore();
    if (!restored) {
      // defaults (first visit)
      hoursEl.value = "0";
      minsEl.value = "5";
      secsEl.value = "0";

      usePrepEl.checked = false;
      prepEl.value = "5";
      showMsEl.checked = false;

      status.prepEnabled = false;
      status.prepSeconds = 5;
      status.showMs = false;

      applyConfigToReady(); // persists
    }

    // Ensure loop if needed
    ensureLoopRunning();
  }

  init();
})();
