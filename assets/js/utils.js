/* =========================================================
   ís.is — utils.js
   Build-safe shared helpers (no assumptions)
   ========================================================= */
;(function () {
  "use strict";

  // DOM
  function $(sel, root) {
    if (!root) root = document;
    return root.querySelector(sel);
  }

  function $$(sel, root) {
    if (!root) root = document;
    return Array.prototype.slice.call(root.querySelectorAll(sel));
  }

  function on(el, evt, fn, opts) {
    if (!el) return;
    el.addEventListener(evt, fn, opts);
  }

  function off(el, evt, fn, opts) {
    if (!el) return;
    el.removeEventListener(evt, fn, opts);
  }

  // Event delegation: delegate(document,'click','.btn',function(e,target){})
  function delegate(root, evt, selector, handler, opts) {
    on(root, evt, function (e) {
      var t = e.target && e.target.closest ? e.target.closest(selector) : null;
      if (t && root.contains(t)) handler(e, t);
    }, opts);
  }

  // Timing
  function debounce(fn, ms) {
    if (ms == null) ms = 250;
    var t;
    return function () {
      var args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(null, args); }, ms);
    };
  }

  function throttle(fn, ms) {
    if (ms == null) ms = 250;
    var last = 0;
    var t;
    return function () {
      var args = arguments;
      var now = Date.now();
      var remaining = ms - (now - last);

      if (remaining <= 0) {
        last = now;
        fn.apply(null, args);
      } else {
        clearTimeout(t);
        t = setTimeout(function () {
          last = Date.now();
          fn.apply(null, args);
        }, remaining);
      }
    };
  }

  // Misc
  function clamp(n, a, b) {
    return Math.min(b, Math.max(a, n));
  }

  // Safe JSON
  function safeJSONParse(str, fallback) {
    try { return JSON.parse(str); } catch (e) { return fallback; }
  }

  function storeGet(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw == null ? fallback : safeJSONParse(raw, fallback);
    } catch (e) {
      return fallback;
    }
  }

  function storeSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  // Fetch helper (JSON-ish)
  function fetchJSON(url, opts) {
    if (!opts) opts = {};
    return fetch(url, opts).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) {}

        if (!res.ok) {
          var msg = (data && data.error) || text || "Request failed";
          var err = new Error(msg);
          err.status = res.status;
          err.data = data;
          throw err;
        }
        return data;
      });
    });
  }

  window.utils = {
    $: $,
    $$: $$,
    on: on,
    off: off,
    delegate: delegate,
    debounce: debounce,
    throttle: throttle,
    clamp: clamp,
    safeJSONParse: safeJSONParse,
    storeGet: storeGet,
    storeSet: storeSet,
    fetchJSON: fetchJSON
  };
})();