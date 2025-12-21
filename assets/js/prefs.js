/* =========================================================
   ís.is — Shared Preferences
   Single source of truth for user settings
   ========================================================= */

(function (global) {
  const KEY_PREFIX = 'is.pref.';

  /* ---------- Core helpers ---------- */
  function k(key) {
    return KEY_PREFIX + key;
  }

  function get(key, fallback = null) {
    const raw = localStorage.getItem(k(key));
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  function set(key, value) {
    localStorage.setItem(k(key), JSON.stringify(value));
  }

  function remove(key) {
    localStorage.removeItem(k(key));
  }

  /* ---------- Defaults ---------- */
  const defaults = {
    theme: 'light',      // 'light' | 'dark'
    lang: 'is',          // 'is' | 'en'
    soundEnabled: true,
    soundVolume: 40,     // 0–100
    reduceMotion: false,
    lastWodMode: null    // 'emom' | 'amrap' | ...
  };

  function getWithDefault(key) {
    const val = get(key);
    return val === null ? defaults[key] : val;
  }

  /* ---------- Theme ---------- */
  function applyTheme(theme) {
    const t = (theme === 'dark') ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
    set('theme', t);

    const meta = document.getElementById('metaThemeColor');
    if (meta) {
      meta.setAttribute(
        'content',
        t === 'dark' ? '#000000' : '#ffffff'
      );
    }
  }

  function applyThemeFromStorage() {
    const saved = getWithDefault('theme');
    applyTheme(saved);
  }

  function toggleTheme() {
    const cur = getWithDefault('theme');
    applyTheme(cur === 'dark' ? 'light' : 'dark');
  }

  /* ---------- Language / i18n ---------- */
  function applyLang(I18N) {
    if (!I18N) return;

    const lang = getWithDefault('lang');
    document.documentElement.setAttribute('lang', lang);

    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const val = I18N?.[lang]?.[key];
      if (typeof val === 'string') el.textContent = val;
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      const val = I18N?.[lang]?.[key];
      if (typeof val === 'string') el.setAttribute('placeholder', val);
    });
  }

  function setLang(lang) {
    const L = (lang === 'en') ? 'en' : 'is';
    set('lang', L);
    document.documentElement.setAttribute('lang', L);
  }

  function toggleLang() {
    const cur = getWithDefault('lang');
    setLang(cur === 'is' ? 'en' : 'is');
  }

  /* ---------- Storage sync (tabs/pages) ---------- */
  window.addEventListener('storage', (e) => {
    if (!e.key || !e.key.startsWith(KEY_PREFIX)) return;

    const key = e.key.replace(KEY_PREFIX, '');
    const val = get(key);

    if (key === 'theme') applyTheme(val);
    if (key === 'lang') document.documentElement.setAttribute('lang', val);
  });

  /* ---------- Public API ---------- */
  global.prefs = {
    get,
    set,
    remove,

    defaults,

    // theme
    applyTheme,
    applyThemeFromStorage,
    toggleTheme,

    // language
    applyLang,
    setLang,
    toggleLang
  };

})(window);