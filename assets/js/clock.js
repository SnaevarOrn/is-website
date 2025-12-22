/* =========================================================
   Clock page logic — page-scoped
   ========================================================= */
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

  // sync theme across tabs
  window.addEventListener('storage', (e) => {
    if(e.key !== 'theme') return;
    const t = (e.newValue === 'light' || e.newValue === 'dark') ? e.newValue : 'dark';
    document.documentElement.setAttribute('data-theme', t);
    themeToggle.checked = (t === 'light');
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
  // Numbers
  // ---------------------------
  function polarToXY(angleDeg, r){
    const a = (angleDeg - 90) * Math.PI/180;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  }

  function buildHourRings(){
    const outer = [];
    for(let h=1; h<=12; h++){
      const angleDeg = (h % 12) * 30;
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
      for(let m=0; m<60; m+=5){
        if(m % 15 === 0) continue;
        addLabel('minNum', minFont, m*6, rMin, String(m));
      }
    }
  }

  // ---------------------------
  // Init UI
  // ---------------------------
  (function initUI(){
    setTheme(localStorage.getItem('theme') === 'light' ? 'light' : 'dark');

    timeFormat.value = localStorage.getItem('timeFormat') || '24';
    showAnalog.checked  = (localStorage.getItem('showAnalog') !== 'false');
    showDigital.checked = (localStorage.getItem('showDigital') !== 'false');

    handMode.value = localStorage.getItem('handMode') || 'smooth';
    showHourNums.checked = (localStorage.getItem('showHourNums') !== 'false');
    showMinNums.checked  = (localStorage.getItem('showMinNums') === 'true');

    sevenSeg.checked = (localStorage.getItem('sevenSeg') === 'true');
    digitColor.value = localStorage.getItem('digitColor') || '#eaf6ff';

    setPanel(setupPanel, setupChevron, localStorage.getItem(UI_KEY_SETUP_OPEN) === '1');
    setPanel(analogPanel, analogChevron, localStorage.getItem(UI_KEY_ANALOG_OPEN) === '1');
    setPanel(digitalPanel, digitalChevron, localStorage.getItem(UI_KEY_DIGI_OPEN) === '1');

    applyVisibility();
    applyDigitalLook();
    rebuildNumbers();
  })();

  // listeners
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
    rebuildNumbers();
  });

  setupBtn.addEventListener('click', () => togglePanel(setupPanel, setupChevron, UI_KEY_SETUP_OPEN));
  analogBtn.addEventListener('click', () => togglePanel(analogPanel, analogChevron, UI_KEY_ANALOG_OPEN));
  digitalBtn.addEventListener('click', () => togglePanel(digitalPanel, digitalChevron, UI_KEY_DIGI_OPEN));

  infoBtn.addEventListener('click', () => nerdBox.classList.toggle('open'));

  menuBtn.addEventListener('click', (e) => { e.stopPropagation(); dropdown.classList.toggle('open'); });
  document.addEventListener('click', () => dropdown.classList.remove('open'));
});
