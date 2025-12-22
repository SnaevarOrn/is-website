document.addEventListener('DOMContentLoaded', () => {
  // ---------------------------
  // Keys
  // ---------------------------
  const UI_KEY_SETUP_OPEN  = 'clock.ui.setupOpen';
  const UI_KEY_ANALOG_OPEN = 'clock.ui.analogOpen';
  const UI_KEY_DIGI_OPEN   = 'clock.ui.digitalOpen';

  // ---------------------------
  // Elements
  // ---------------------------
  const hdrDateTop = document.getElementById('hdrDateTop');
  const hdrWeekday = document.getElementById('hdrWeekday');

  const menuBtn = document.getElementById('menuBtn');
  const dropdown = document.getElementById('dropdown');

  const tzSelect = document.getElementById('tzSelect');
  const fsBtn = document.getElementById('fsBtn');

  const themeToggle = document.getElementById('themeToggle');
  const setupBtn = document.getElementById('setupBtn');
  const setupPanel = document.getElementById('setupPanel');
  const setupChevron = document.getElementById('setupChevron');

  const timeFormat = document.getElementById('timeFormat');
  const showAnalog = document.getElementById('showAnalog');
  const showDigital = document.getElementById('showDigital');

  const analogBtn = document.getElementById('analogBtn');
  const analogPanel = document.getElementById('analogPanel');
  const analogChevron = document.getElementById('analogChevron');
  const handMode = document.getElementById('handMode');
  const showHourNums = document.getElementById('showHourNums');
  const showMinNums = document.getElementById('showMinNums');

  const digitalBtn = document.getElementById('digitalBtn');
  const digitalPanel = document.getElementById('digitalPanel');
  const digitalChevron = document.getElementById('digitalChevron');
  const sevenSeg = document.getElementById('sevenSeg');
  const digitColor = document.getElementById('digitColor');

  const analogWrap = document.getElementById('analogWrap');
  const digitalWrap = document.getElementById('digitalWrap');
  const digitalTimeEl = document.getElementById('digitalTime');

  const analogClock = document.getElementById('analogClock');
  const numbersEl = document.getElementById('numbers');

  const hHand = document.getElementById('hHand');
  const mHand = document.getElementById('mHand');
  const sHand = document.getElementById('sHand');

  const syncDot  = document.getElementById('syncDot');
  const syncText = document.getElementById('syncText');
  const syncSpin = document.getElementById('syncSpin');

  const infoBtn = document.getElementById('infoBtn');
  const nerdBox = document.getElementById('nerdBox');
  const nTz   = document.getElementById('nTz');
  const nAge  = document.getElementById('nAge');
  const nRtt  = document.getElementById('nRtt');
  const nOffT = document.getElementById('nOffT');
  const nOff  = document.getElementById('nOff');
  const nPpm  = document.getElementById('nPpm');
  const nScale= document.getElementById('nScale');
  const nSrc  = document.getElementById('nSrc');

  // ---------------------------
  // TZ list
  // ---------------------------
  const TZ_PRESETS = [
    { tz: 'Atlantic/Reykjavik', label: 'Reykjavík' },
    { tz: 'UTC', label: 'UTC' },
    { tz: 'Europe/London', label: 'London' },
    { tz: 'Europe/Paris', label: 'Paris' },
    { tz: 'Europe/Berlin', label: 'Berlin' },
    { tz: 'America/New_York', label: 'New York' },
    { tz: 'America/Los_Angeles', label: 'Los Angeles' },
    { tz: 'Asia/Dubai', label: 'Dubai' },
    { tz: 'Asia/Singapore', label: 'Singapore' },
    { tz: 'Asia/Tokyo', label: 'Tokyo' },
    { tz: 'Australia/Sydney', label: 'Sydney' },
  ];

  function tzLabel(tz){
    const found = TZ_PRESETS.find(x => x.tz === tz);
    return found ? found.label : tz;
  }

  let currentTz = localStorage.getItem('tz') || 'Atlantic/Reykjavik';
  if(!TZ_PRESETS.some(x => x.tz === currentTz)) currentTz = 'Atlantic/Reykjavik';

  tzSelect.innerHTML = '';
  for(const item of TZ_PRESETS){
    const opt = document.createElement('option');
    opt.value = item.tz;
    opt.textContent = item.label;
    tzSelect.appendChild(opt);
  }
  tzSelect.value = currentTz;

  // ---------------------------
  // Helpers
  // ---------------------------
  function closeDropdown(){ dropdown.classList.remove('open'); }
  function setPanel(panel, chev, isOpen){
    panel.classList.toggle('open', isOpen);
    if(chev) chev.textContent = isOpen ? '▴' : '▾';
  }
  function togglePanel(panel, chev, storageKey){
    const open = !panel.classList.contains('open');
    setPanel(panel, chev, open);
    localStorage.setItem(storageKey, open ? '1' : '0');
  }

  function setTheme(t){
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('theme', t);
    themeToggle.checked = (t === 'light');
  }

  // Theme sync (tabs/pages)
  window.addEventListener('storage', (e) => {
    if(e.key !== 'theme') return;
    const t = (e.newValue === 'light' || e.newValue === 'dark') ? e.newValue : 'dark';
    document.documentElement.setAttribute('data-theme', t);
    if(themeToggle) themeToggle.checked = (t === 'light');
  });

  function hexToRgba(hex, a){
    const h = (hex || '').replace('#','').trim();
    if(h.length !== 6) return `rgba(255,255,255,${a})`;
    const r = parseInt(h.slice(0,2),16);
    const g = parseInt(h.slice(2,4),16);
    const b = parseInt(h.slice(4,6),16);
    return `rgba(${r},${g},${b},${a})`;
  }

  function applyDigitalLook(){
    digitalTimeEl.classList.toggle('seven', sevenSeg.checked);
    document.documentElement.style.setProperty('--digitColor', hexToRgba(digitColor.value, 0.95));
    document.documentElement.style.setProperty('--digitGlow', hexToRgba(digitColor.value, 0.22));
    localStorage.setItem('sevenSeg', sevenSeg.checked ? 'true' : 'false');
    localStorage.setItem('digitColor', digitColor.value);
  }

  function applyVisibility(){
    analogWrap.style.display = showAnalog.checked ? 'flex' : 'none';
    digitalWrap.style.display = showDigital.checked ? 'flex' : 'none';
    if(!showAnalog.checked && !showDigital.checked){
      showDigital.checked = true;
      digitalWrap.style.display = 'flex';
      localStorage.setItem('showDigital', 'true');
    }
    rebuildNumbers();
  }

  // ---------------------------
  // Build ticks once
  // ---------------------------
  (function buildTicks(){
    const ticks = document.getElementById('ticks');
    ticks.innerHTML = '';
    for(let i=0;i<60;i++){
      const t = document.createElement('div');
      t.className = 'clock-tick' + (i%5===0 ? ' big' : '');
      t.style.transform = `translate(-50%,-120px) rotate(${i*6}deg)`;
      ticks.appendChild(t);
    }
  })();

  // ---------------------------
  // Numbers (responsive)
  // ---------------------------
  function polarToXY(angleDeg, r){
    const a = (angleDeg - 90) * Math.PI/180;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  }

  function buildHourRings(){
    const outer = [];
    for(let h=1; h<=12; h++){
      const angleDeg = (h % 12) * 30; // 12 at top
      outer.push({ label: String(h), angleDeg });
    }

    const inner = [];
    if(timeFormat.value === '24'){
      for(let h=13; h<=23; h++){
        const angleDeg = (h - 12) * 30;
        inner.push({ label: String(h), angleDeg });
      }
      inner.push({ label: '0', angleDeg: 0 });
    }
    return { outer, inner };
  }

  function rebuildNumbers(){
    numbersEl.innerHTML = '';
    if(!showAnalog.checked) return;

    const rect = analogClock.getBoundingClientRect();
    const size = Math.min(rect.width, rect.height);
    const half = size / 2;

    const padOuter = Math.max(18, Math.round(size * 0.085));

    const hourOuterFont = Math.max(13, Math.round(size * 0.060));
    const hourInnerFont = Math.max(11, Math.round(size * 0.048));
    const minFont      = Math.max(8,  Math.round(size * 0.032));

    const rMin   = half - padOuter - minFont - 2;
    const rOuter = half - padOuter - hourOuterFont - 10;
    const rInner = half - padOuter - hourOuterFont - hourInnerFont - 22;

    const { outer, inner } = buildHourRings();

    function addLabel(cls, fontPx, angleDeg, r, text){
      const div = document.createElement('div');
      div.className = 'clock-num ' + cls;
      div.style.fontSize = fontPx + 'px';
      const {x,y} = polarToXY(angleDeg, r);
      div.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
      div.textContent = text;
      numbersEl.appendChild(div);
    }

    if(showHourNums.checked){
      for(const it of outer) addLabel('hourOuter', hourOuterFont, it.angleDeg, rOuter, it.label);
      for(const it of inner) addLabel('hourInner', hourInnerFont, it.angleDeg, rInner, it.label);
    }

    if(showMinNums.checked){
  for(let m=5; m<60; m+=5){
    if(m === 15 || m === 30 || m === 45) continue;
    addLabel('minNum', minFont, m*6, rMin, String(m).padStart(2,'0'));
      }
    }
  }

  let resizeTimer = null;
  function scheduleRebuild(){
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(rebuildNumbers, 80);
  }
  window.addEventListener('resize', scheduleRebuild, { passive:true });
  window.addEventListener('orientationchange', scheduleRebuild, { passive:true });

  // ---------------------------
  // Formatters
  // ---------------------------
  let partsFmt = null;
  function makePartsFormatter(tz, hour12){
    return new Intl.DateTimeFormat('is-IS', {
      timeZone: tz,
      hour: '2-digit',
      minute:'2-digit',
      second:'2-digit',
      hour12,
      weekday:'long',
      year:'numeric',
      month:'long',
      day:'numeric'
    });
  }
  function buildFormatters(){
    const hour12 = (timeFormat.value === '12');
    partsFmt = makePartsFormatter(currentTz, hour12);
  }
  function getTimeParts(ms){
    const d = new Date(ms);
    const parts = partsFmt.formatToParts(d);
    const map = Object.create(null);
    for(const p of parts){
      if(p.type !== 'literal') map[p.type] = p.value;
    }
    return {
      hour: map.hour,
      minute: map.minute,
      second: map.second,
      dayPeriod: map.dayPeriod || '',
      weekday: map.weekday,
      dateTop: `${map.day}. ${map.month} ${map.year}`
    };
  }

  // ---------------------------
  // Status + net sync model
  // ---------------------------
  function setStatus(kind, txt){
    syncDot.classList.remove('ok','warn','bad');
    syncDot.classList.add(kind);
    syncText.textContent = txt;
    syncSpin.classList.toggle('on', kind !== 'ok');
  }
  function isFiniteNum(x){ return Number.isFinite(x) && !Number.isNaN(x); }

  let basePerf = performance.now();
  let baseNet  = Date.now();
  let scale    = 1.0;
  let targetScale = 1.0;
  let offsetMs = 0;
  let targetOffsetMs = 0;

  let lastGoodSyncPerf = null;
  let lastGoodOffset = null;
  let lastRttMs = null;
  let consecutiveFails = 0;

  const MAX_OFFSET_SLEW_MS_PER_S = 8;
  const SCALE_SLEW_PER_S = 2e-6;

  function correctedNowMs(){
    const p = performance.now();
    const elapsed = p - basePerf;
    return baseNet + elapsed * scale + offsetMs;
  }
  function tickSlews(dtSeconds){
    const maxStep = MAX_OFFSET_SLEW_MS_PER_S * dtSeconds;
    const diff = targetOffsetMs - offsetMs;
    offsetMs += Math.max(-maxStep, Math.min(maxStep, diff));

    const maxScaleStep = SCALE_SLEW_PER_S * dtSeconds;
    const sd = targetScale - scale;
    scale += Math.max(-maxScaleStep, Math.min(maxScaleStep, sd));
  }

  function worldTimeUrlForTz(tz){
    if(tz === 'UTC') return 'https://worldtimeapi.org/api/timezone/Etc/UTC';
    return 'https://worldtimeapi.org/api/timezone/' + encodeURIComponent(tz);
  }

  async function sampleNetTime(){
    const url = worldTimeUrlForTz(currentTz);
    const t0p = performance.now();
    const t0w = Date.now();

    const res = await fetch(url, { cache: 'no-store' });

    const t1p = performance.now();
    const t1w = Date.now();

    if(!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    const serverMs = new Date(data.datetime).getTime();
    if(!isFiniteNum(serverMs)) throw new Error('bad datetime');

    const midWall = (t0w + t1w) / 2;
    const rtt = (t1p - t0p);
    const offsetSample = serverMs - midWall;

    return { offsetSample, rtt, tMidPerf: (t0p + t1p)/2 };
  }

  function applySync(offsetSample, rtt, tMidPerf){
    lastRttMs = rtt;

    const rttClamped = Math.min(Math.max(rtt, 20), 2000);
    const w = 1 / (1 + (rttClamped / 200));

    if(lastGoodSyncPerf !== null && lastGoodOffset !== null){
      const dt = (tMidPerf - lastGoodSyncPerf) / 1000;
      if(dt > 0.5){
        const dOffset = (offsetSample - lastGoodOffset);
        const drift = (dOffset / (dt * 1000));
        const newTargetScale = 1 + drift;
        if(isFiniteNum(newTargetScale)){
          targetScale = targetScale + (newTargetScale - targetScale) * (0.25 * w);
        }
      }
    }

    targetOffsetMs = targetOffsetMs + (offsetSample - targetOffsetMs) * (0.6 * w);

    const midWallNowApprox = Date.now() + (tMidPerf - performance.now());
    const serverAtMid = midWallNowApprox + offsetSample;

    basePerf = tMidPerf;
    baseNet  = serverAtMid;

    lastGoodSyncPerf = tMidPerf;
    lastGoodOffset = offsetSample;
    consecutiveFails = 0;
  }

  async function syncLoop(){
    try{
      const { offsetSample, rtt, tMidPerf } = await sampleNetTime();
      applySync(offsetSample, rtt, tMidPerf);
      setStatus('ok', `Tími: net (${tzLabel(currentTz)})`);
    }catch(_){
      consecutiveFails++;
      if(lastGoodSyncPerf !== null){
        setStatus('warn', `Tími: net (${tzLabel(currentTz)}) — óstöðugt net`);
      }else{
        setStatus('bad', `Tími: tæki (net náðist ekki)`);
      }
    }finally{
      const base = (consecutiveFails === 0) ? 60_000 : 10_000;
      const jitter = Math.random() * 8000;
      setTimeout(syncLoop, base + jitter);
    }
  }

  function hardResetSyncModel(){
    basePerf = performance.now();
    baseNet  = Date.now();
    targetOffsetMs = offsetMs;
    targetScale = scale;
    lastGoodSyncPerf = null;
    lastGoodOffset = null;
    lastRttMs = null;
    consecutiveFails = 0;
  }

  // ---------------------------
  // Menu interactions
  // ---------------------------
  function toggleDropdown(){ dropdown.classList.toggle('open'); }
  menuBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleDropdown(); });
  dropdown.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', () => closeDropdown());
  document.addEventListener('keydown', (e) => { if(e.key === 'Escape') closeDropdown(); });

  // ---------------------------
  // Fullscreen
  // ---------------------------
  async function enterFullscreen(){
    const el = document.documentElement;
    try{
      if(el.requestFullscreen) await el.requestFullscreen();
      else if(el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    }catch(_){}
  }
  async function exitFullscreen(){
    try{
      if(document.exitFullscreen) await document.exitFullscreen();
      else if(document.webkitExitFullscreen) await document.webkitExitFullscreen();
    }catch(_){}
  }
  function inFullscreen(){ return !!(document.fullscreenElement || document.webkitFullscreenElement); }

  fsBtn.addEventListener('click', async () => {
    closeDropdown();
    if(inFullscreen()) await exitFullscreen();
    else await enterFullscreen();
  });

  document.addEventListener('pointerdown', async () => {
    if(inFullscreen()) await exitFullscreen();
  }, { passive: true });

  // ---------------------------
  // Panels with memory
  // ---------------------------
  setupBtn.addEventListener('click', () => togglePanel(setupPanel, setupChevron, UI_KEY_SETUP_OPEN));
  analogBtn.addEventListener('click', () => togglePanel(analogPanel, analogChevron, UI_KEY_ANALOG_OPEN));
  digitalBtn.addEventListener('click', () => togglePanel(digitalPanel, digitalChevron, UI_KEY_DIGI_OPEN));

  // ---------------------------
  // Nerd info
  // ---------------------------
  infoBtn.addEventListener('click', () => nerdBox.classList.toggle('open'));

  // ---------------------------
  // Init UI values from storage
  // ---------------------------
  (function initUI(){
    const savedTheme = localStorage.getItem('theme');
    setTheme(savedTheme === 'light' ? 'light' : 'dark');

    timeFormat.value = localStorage.getItem('timeFormat') || '24';

    showAnalog.checked  = (localStorage.getItem('showAnalog') !== 'false');
    showDigital.checked = (localStorage.getItem('showDigital') !== 'false');

    handMode.value = localStorage.getItem('handMode') || 'smooth';
    showHourNums.checked = (localStorage.getItem('showHourNums') !== 'false');
    showMinNums.checked  = (localStorage.getItem('showMinNums') === 'true');

    sevenSeg.checked = (localStorage.getItem('sevenSeg') === 'true');
    digitColor.value = localStorage.getItem('digitColor')
      || (document.documentElement.getAttribute('data-theme') === 'light' ? '#111111' : '#eaf6ff');

    const setupOpen  = localStorage.getItem(UI_KEY_SETUP_OPEN) === '1';
    const analogOpen = localStorage.getItem(UI_KEY_ANALOG_OPEN) === '1';
    const digiOpen   = localStorage.getItem(UI_KEY_DIGI_OPEN) === '1';
    setPanel(setupPanel, setupChevron, setupOpen);
    setPanel(analogPanel, analogChevron, analogOpen);
    setPanel(digitalPanel, digitalChevron, digiOpen);

    buildFormatters();
    applyVisibility();
    applyDigitalLook();
    rebuildNumbers();
  })();

  themeToggle.addEventListener('change', () => setTheme(themeToggle.checked ? 'light' : 'dark'));
  sevenSeg.addEventListener('change', applyDigitalLook);
  digitColor.addEventListener('input', applyDigitalLook);

  showAnalog.addEventListener('change', () => {
    localStorage.setItem('showAnalog', showAnalog.checked ? 'true' : 'false');
    applyVisibility();
  });
  showDigital.addEventListener('change', () => {
    localStorage.setItem('showDigital', showDigital.checked ? 'true' : 'false');
    applyVisibility();
  });

  timeFormat.addEventListener('change', () => {
    localStorage.setItem('timeFormat', timeFormat.value);
    buildFormatters();
    rebuildNumbers();
  });

  handMode.addEventListener('change', () => localStorage.setItem('handMode', handMode.value));
  showHourNums.addEventListener('change', () => { localStorage.setItem('showHourNums', showHourNums.checked ? 'true' : 'false'); rebuildNumbers(); });
  showMinNums.addEventListener('change', () => { localStorage.setItem('showMinNums', showMinNums.checked ? 'true' : 'false'); rebuildNumbers(); });

  // ---------------------------
  // TZ change
  // ---------------------------
  tzSelect.addEventListener('change', () => {
    currentTz = tzSelect.value;
    localStorage.setItem('tz', currentTz);
    buildFormatters();
    hardResetSyncModel();
    rebuildNumbers();
    closeDropdown();
    setStatus('warn', `Tími: net (${tzLabel(currentTz)}) — samstilli...`);
    syncLoop();
  });

  // ---------------------------
  // Render loop (with fallback safety)
  // ---------------------------
  let lastPerf = performance.now();

  function renderFrame(){
    try{
      const nowPerf = performance.now();
      const dt = (nowPerf - lastPerf) / 1000;
      lastPerf = nowPerf;
      if(dt > 0 && dt < 0.5) tickSlews(dt);

      const ms = correctedNowMs();
      const tp = getTimeParts(ms);

      hdrDateTop.textContent = tp.dateTop || '—';
      hdrWeekday.textContent = tp.weekday || '—';

      const dp = (timeFormat.value === '12' && tp.dayPeriod)
        ? ` <span class="clock-ampm">${tp.dayPeriod}</span>`
        : '';
      digitalTimeEl.innerHTML = `${tp.hour || '--'}:${tp.minute || '--'}:${tp.second || '--'}${dp}`;

      const H = parseInt(tp.hour, 10);
      const M = parseInt(tp.minute, 10);
      const S = parseInt(tp.second, 10);

      const mode = handMode.value;
      const frac = (mode === 'smooth') ? ((ms % 1000) / 1000) : 0;

      const sec = (Number.isFinite(S) ? (S + frac) : 0);
      const min = (Number.isFinite(M) ? (mode === 'smooth' ? (M + sec/60) : M) : 0);
      const hr  = (Number.isFinite(H) ? ((H % 12) + min/60) : 0);

      sHand.style.transform = `translate(-50%,-100%) rotate(${sec*6}deg)`;
      mHand.style.transform = `translate(-50%,-100%) rotate(${min*6}deg)`;
      hHand.style.transform = `translate(-50%,-100%) rotate(${hr*30}deg)`;

      nTz.textContent = `${tzLabel(currentTz)} (${currentTz})`;
      nAge.textContent = (lastGoodSyncPerf !== null) ? `${Math.round((performance.now()-lastGoodSyncPerf)/1000)}s` : '—';
      nRtt.textContent = (lastRttMs != null) ? `${Math.round(lastRttMs)} ms` : '—';
      nOffT.textContent = `${targetOffsetMs.toFixed(1)} ms`;
      nOff.textContent  = `${offsetMs.toFixed(1)} ms`;
      nPpm.textContent  = `${((scale-1)*1e6).toFixed(2)} ppm`;
      nScale.textContent = scale.toFixed(9);
      nSrc.textContent = 'worldtimeapi.org';
    }catch(_){
      const d = new Date();
      const h = String(d.getHours()).padStart(2,'0');
      const m = String(d.getMinutes()).padStart(2,'0');
      const s = String(d.getSeconds()).padStart(2,'0');
      digitalTimeEl.textContent = `${h}:${m}:${s}`;
    }

    requestAnimationFrame(renderFrame);
  }

  // Start
  setStatus('warn', `Tími: net (${tzLabel(currentTz)}) — samstilli...`);
  syncLoop();
  requestAnimationFrame(renderFrame);
});
