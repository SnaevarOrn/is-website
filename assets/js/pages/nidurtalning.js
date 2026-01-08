/* /assets/js/pages/nidurtalning.js */

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

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

  const ITEM_H = 52; // must match CSS li height
  const PAD_ITEMS = 2; // visual context for "dim" styling

  const status = {
    mode: "ready", // ready | prep | run | paused | done
    totalMs: 5 * 60 * 1000,
    remainingMs: 5 * 60 * 1000,

    prepEnabled: false,
    prepSeconds: 5,
    prepRemainingMs: 0,

    showMs: false,

    rafId: 0,
    lastTs: 0
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

    // go button label follows state
    if (running) {
      goBtn.textContent = "⏸︎ Pása";
    } else if (paused) {
      goBtn.textContent = "▶︎ Halda áfram";
    } else {
      goBtn.textContent = "▶︎ Start";
    }

    // go is always usable (ready/done/start, running->pause, paused->resume)
    goBtn.disabled = false;
  }

  function renderHints(){
    hintPrep.textContent = `Start countdown: ${status.prepEnabled ? "á" : "af"}`;
    hintMs.textContent = `Millisec: ${status.showMs ? "á" : "af"}`;
  }

  function render(){
    updateActiveUI();

    if (status.mode === "prep") {
      const secLeft = Math.ceil(status.prepRemainingMs / 1000);
      timeEl.textContent = String(secLeft);
    } else {
      timeEl.textContent = fmtTime(status.remainingMs);
    }

    setStateLabel();
    setButtons();
  }

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
        status.prepRemainingMs = 0;
        status.mode = "run";
        status.lastTs = ts;
      }
      render();
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

    status.rafId = requestAnimationFrame(loop);
  }

  function start(){
    if (status.mode === "prep" || status.mode === "run") return;

    if (status.mode === "done") {
      status.remainingMs = status.totalMs;
    }

    if (status.prepEnabled && status.prepSeconds > 0) {
      status.mode = "prep";
      status.prepRemainingMs = status.prepSeconds * 1000;
    } else {
      status.mode = "run";
    }

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
    if (status.prepEnabled && status.prepRemainingMs > 0) status.mode = "prep";
    else status.mode = "run";
    render();
    stopLoop();
    status.rafId = requestAnimationFrame(loop);
  }

  function goAction(){
    if (status.mode === "prep" || status.mode === "run") pause();
    else if (status.mode === "paused") resume();
    else start(); // ready or done
  }

  function readConfigMs(){
    const h = clamp(Number(hoursEl.value || 0), 0, 23);
    const m = clamp(Number(minsEl.value || 0), 0, 59);
    const s = clamp(Number(secsEl.value || 0), 0, 59);
    return partsToMs(h, m, s);
  }

  function applyConfigToReady(){
    const ms = readConfigMs();
    status.totalMs = ms;
    status.remainingMs = ms;

    status.prepEnabled = !!usePrepEl.checked;
    status.prepSeconds = clamp(Number(prepEl.value || 0), 0, 60);

    status.showMs = !!showMsEl.checked;

    status.mode = "ready";
    renderHints();

    // keep picker aligned to config
    setPickerFromParts(msToParts(ms));
    render();
  }

  function reset(){
    // Reset always returns to configured value and ready state
    stopLoop();
    applyConfigToReady();
  }

  // ---------- iOS-like scroll picker ----------
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
    // listEl has padding top/bottom; compute "nearest" by scrollTop
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
    minsEl.value = String(m);
    secsEl.value = String(s);
  }

  function commitPickerToReady(){
    if (isActive()) return; // locked while active
    syncInputsFromPicker();
    applyConfigToReady();
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

    // also support "tap to jump"
    listEl.addEventListener("click", (e) => {
      if (isActive()) return;
      const li = e.target.closest("li");
      if (!li) return;
      const idx = Number(li.dataset.value || 0);
      scrollToIndex(listEl, idx, true);
      setTimeout(() => {
        commitPickerToReady();
      }, 120);
    });
  }

  // ---------- Modal ----------
  function openSettings(){
    if (isActive()) return; // hidden anyway, but just in case
    settingsOverlay.classList.add("open");
    settingsOverlay.setAttribute("aria-hidden", "false");
  }

  function closeSettingsFn(){
    settingsOverlay.classList.remove("open");
    settingsOverlay.setAttribute("aria-hidden", "true");
  }

  // ---------- Events ----------
  goBtn.addEventListener("click", goAction);
  resetBtn.addEventListener("click", reset);

  applyBtn.addEventListener("click", () => {
    hoursEl.value = String(clamp(Number(hoursEl.value || 0), 0, 23));
    minsEl.value  = String(clamp(Number(minsEl.value || 0), 0, 59));
    secsEl.value  = String(clamp(Number(secsEl.value || 0), 0, 59));
    prepEl.value  = String(clamp(Number(prepEl.value || 0), 0, 60));

    // sync picker to typed values
    setPickerFromParts({
      h: Number(hoursEl.value),
      m: Number(minsEl.value),
      s: Number(secsEl.value)
    });

    applyConfigToReady();
    closeSettingsFn();
  });

  // immediate feedback while typing (only when not active)
  [hoursEl, minsEl, secsEl].forEach((el) => {
    el.addEventListener("input", () => {
      if (isActive()) return;
      const ms = readConfigMs();
      status.totalMs = ms;
      status.remainingMs = ms;
      status.mode = "ready";
      setPickerFromParts(msToParts(ms));
      render();
    });
  });

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

  settingsBtn.addEventListener("click", openSettings);
  closeSettings.addEventListener("click", closeSettingsFn);
  settingsOverlay.addEventListener("click", (e) => {
    if (e.target === settingsOverlay) closeSettingsFn();
  });

  themeBtn.addEventListener("click", () => {
    if (window.prefs && typeof prefs.toggleTheme === "function") prefs.toggleTheme();
  });

  document.addEventListener("keydown", (e) => {
    // Escape closes settings
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

  // ---------- Init ----------
  function init(){
    // build lists
    buildList(listH, 23);
    buildList(listM, 59);
    buildList(listS, 59);

    attachPicker(listH);
    attachPicker(listM);
    attachPicker(listS);

    // defaults
    hoursEl.value = "0";
    minsEl.value = "5";
    secsEl.value = "0";

    usePrepEl.checked = false;
    prepEl.value = "5";

    showMsEl.checked = false;

    status.prepEnabled = false;
    status.prepSeconds = 5;
    status.showMs = false;

    applyConfigToReady(); // sets picker + renders + disables reset if already reset
  }

  init();
})();
