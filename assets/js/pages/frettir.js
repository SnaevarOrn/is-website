// /assets/js/pages/frettir.js
(() => {
  const SOURCES = [
    { id: "ruv",       label: "RÚV",             domain: "ruv.is" },
    { id: "mbl",       label: "mbl.is",          domain: "mbl.is" },
    { id: "visir",     label: "Vísir",           domain: "visir.is" },
    { id: "dv",        label: "DV",              domain: "dv.is" },
    { id: "stundin",   label: "Heimildin",       domain: "heimildin.is" },
    { id: "grapevine", label: "Grapevine",       domain: "grapevine.is" },
    { id: "frettin",   label: "Fréttin",         domain: "frettin.is" },
    { id: "vb",        label: "Viðskiptablaðið", domain: "vb.is" },
  ];

  const CATEGORIES = [
    { id: "innlent",   label: "Innlent" },
    { id: "erlent",    label: "Erlent" },
    { id: "ithrottir", label: "Íþróttir" },
    { id: "vidskipti", label: "Viðskipti" },
    { id: "menning",   label: "Menning" },
    { id: "skodun",    label: "Skoðun" },
    { id: "oflokkad",  label: "Óflokkað" }, // <- mikilvægt til að missa ekki allt í síu
  ];

  const STORAGE_KEY = "is_news_prefs_v1";
  const $ = (sel) => document.querySelector(sel);

  const els = {
    btnBack: $("#btnBack"),
    btnMenu: $("#btnMenu"),
    menuPanel: $("#menuPanel"),
    btnThemeToggle: $("#btnThemeToggle"),
    btnOpenSettings: $("#btnOpenSettings"),
    btnRefresh: $("#btnRefresh"),

    settingsDialog: $("#settingsDialog"),
    sourcesList: $("#sourcesList"),
    catsList: $("#catsList"),
    btnSourcesAll: $("#btnSourcesAll"),
    btnSourcesNone: $("#btnSourcesNone"),
    btnCatsAll: $("#btnCatsAll"),
    btnCatsNone: $("#btnCatsNone"),
    btnSaveSettings: $("#btnSaveSettings"),
    btnResetSettings: $("#btnResetSettings"),

    newsList: $("#newsList"),
    statusText: $("#statusText"),
    lastUpdated: $("#lastUpdated"),

    emptyState: $("#emptyState"),
    btnEmptyOpenSettings: $("#btnEmptyOpenSettings"),

    errorState: $("#errorState"),
    errorMsg: $("#errorMsg"),
    btnRetry: $("#btnRetry"),
  };

  const defaultPrefs = () => ({
    sources: Object.fromEntries(SOURCES.map(s => [s.id, true])),
    categories: Object.fromEntries(CATEGORIES.map(c => [c.id, true])),
  });

  function loadPrefs() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultPrefs();
      const parsed = JSON.parse(raw);
      const d = defaultPrefs();
      return {
        sources: { ...d.sources, ...(parsed.sources || {}) },
        categories: { ...d.categories, ...(parsed.categories || {}) },
      };
    } catch {
      return defaultPrefs();
    }
  }

  function savePrefs(p) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  }

  function getTheme() {
    if (window.prefs && typeof prefs.getTheme === "function") return prefs.getTheme();
    return (localStorage.getItem("theme") || "light");
  }

  function setTheme(next) {
    if (window.prefs && typeof prefs.setTheme === "function") prefs.setTheme(next);
    else localStorage.setItem("theme", next);

    document.documentElement.setAttribute("data-theme", next === "dark" ? "dark" : "light");
    const meta = document.getElementById("metaThemeColor");
    if (meta) meta.setAttribute("content", next === "dark" ? "#0b0f14" : "#ffffff");
  }

  function toggleTheme() {
    const t = getTheme();
    setTheme(t === "dark" ? "light" : "dark");
  }

  function openMenu() {
    els.menuPanel.classList.add("open");
    els.menuPanel.setAttribute("aria-hidden", "false");
    setTimeout(() => window.addEventListener("pointerdown", onOutsideMenu, { once: true }), 0);
  }

  function closeMenu() {
    els.menuPanel.classList.remove("open");
    els.menuPanel.setAttribute("aria-hidden", "true");
  }

  function onOutsideMenu(e) {
    if (!els.menuPanel.contains(e.target) && e.target !== els.btnMenu) closeMenu();
    else setTimeout(() => window.addEventListener("pointerdown", onOutsideMenu, { once: true }), 0);
  }

  function openSettings() {
    closeMenu();
    if (typeof els.settingsDialog.showModal === "function") els.settingsDialog.showModal();
    else els.settingsDialog.setAttribute("open", "");
  }

  function closeSettings() {
    if (typeof els.settingsDialog.close === "function") els.settingsDialog.close();
    else els.settingsDialog.removeAttribute("open");
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function humanAgeFromISO(iso) {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return "—";
    const diffMs = Date.now() - t;
    const sec = Math.max(0, Math.floor(diffMs / 1000));
    const min = Math.floor(sec / 60);
    const hr = Math.floor(min / 60);
    const day = Math.floor(hr / 24);
    if (sec < 60) return `${sec}s`;
    if (min < 60) return `${min} mín`;
    if (hr < 24) return `${hr} klst`;
    return `${day} d`;
  }

  function renderSettings(prefs) {
    els.sourcesList.innerHTML = SOURCES.map(s => {
      const checked = prefs.sources[s.id] ? "checked" : "";
      return `
        <label class="check">
          <input type="checkbox" data-kind="source" data-id="${s.id}" ${checked} />
          <span><strong>${escapeHtml(s.label)}</strong> <span class="muted">${escapeHtml(s.domain)}</span></span>
        </label>
      `;
    }).join("");

    els.catsList.innerHTML = CATEGORIES.map(c => {
      const checked = prefs.categories[c.id] ? "checked" : "";
      return `
        <label class="check">
          <input type="checkbox" data-kind="cat" data-id="${c.id}" ${checked} />
          <span><strong>${escapeHtml(c.label)}</strong></span>
        </label>
      `;
    }).join("");
  }

  function readSettingsIntoPrefs(prefs) {
    const next = JSON.parse(JSON.stringify(prefs));

    els.settingsDialog.querySelectorAll('input[type="checkbox"][data-kind="source"]').forEach(cb => {
      next.sources[cb.getAttribute("data-id")] = cb.checked;
    });
    els.settingsDialog.querySelectorAll('input[type="checkbox"][data-kind="cat"]').forEach(cb => {
      next.categories[cb.getAttribute("data-id")] = cb.checked;
    });

    return next;
  }

  function setAll(kind, value) {
    const selector = kind === "source"
      ? 'input[type="checkbox"][data-kind="source"]'
      : 'input[type="checkbox"][data-kind="cat"]';
    els.settingsDialog.querySelectorAll(selector).forEach(cb => cb.checked = value);
  }

  function setStatus(msg) { els.statusText.textContent = msg; }

  function setLastUpdated() {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    els.lastUpdated.textContent = `Uppfært ${hh}:${mm}`;
  }

  function showEmpty(show) { els.emptyState.hidden = !show; }

  function showError(show, msg) {
    els.errorState.hidden = !show;
    if (msg) els.errorMsg.textContent = msg;
  }

  /* -----------------------
     Icon proxy: stable per source (host-based) + micro-cache
     ----------------------- */
  const _iconMemo = new Map(); // domain -> /api/icon?host=domain

  function normalizeHost(h) {
    return String(h || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  }

  function domainForItem(it) {
    // Prefer explicit domain/host from backend
    let domain = it?.domain || it?.host || "";

    // Or map from source id
    if (!domain) {
      const sid = it?.sourceId || it?.source || "";
      const s = SOURCES.find(x => x.id === sid);
      if (s?.domain) domain = s.domain;
    }

    // Last resort: parse it.url
    if (!domain && it?.url) {
      try { domain = new URL(it.url).hostname; } catch { /* ignore */ }
    }

    domain = normalizeHost(domain);
    return domain || "";
  }

  function iconUrlForItem(it) {
    // If backend already gave our stable host-proxy, accept it.
    if (it?.iconUrl && String(it.iconUrl).startsWith("/api/icon?host=")) {
      return it.iconUrl;
    }

    const domain = domainForItem(it);
    if (!domain) return "";

    if (_iconMemo.has(domain)) return _iconMemo.get(domain);

    const out = `/api/icon?host=${encodeURIComponent(domain)}`;
    _iconMemo.set(domain, out);
    return out;
  }

  function renderNews(items) {
  els.newsList.innerHTML = items.map(it => {
    const iconUrl = iconUrlForItem(it);
    const icon = iconUrl
      ? `<img class="src-ico"
          src="${escapeHtml(iconUrl)}"
          alt=""
          loading="lazy"
          decoding="async"
          referrerpolicy="no-referrer"
          onerror="this.style.display='none'">`
      : "";

    const sourceBadge = it.sourceLabel
      ? `<span class="badge">${escapeHtml(it.sourceLabel)}</span>`
      : "";

    const cats = Array.isArray(it.categoryLabels) && it.categoryLabels.length
      ? it.categoryLabels
      : (it.category ? [it.category] : []);

    const catBadges = cats
      .slice(0, 2)
      .map(c => `<span class="badge">${escapeHtml(c)}</span>`)
      .join("");

    const age = it.publishedAt ? humanAgeFromISO(it.publishedAt) : "—";
    const ageLine = age !== "—" ? `${age} síðan` : "";

    return `
      <article class="item">
        <div class="item-top">
          <h3 class="item-title">
            <a href="${escapeHtml(it.url)}" target="_blank" rel="noopener noreferrer">
              ${escapeHtml(it.title)}
            </a>
          </h3>
        </div>

        ${ageLine ? `<div class="item-age tiny">${escapeHtml(ageLine)}</div>` : ""}

        <div class="item-meta">
          <span class="src-chip">
            ${icon}
            ${sourceBadge}
          </span>
          ${catBadges}
        </div>
      </article>
    `;
  }).join("");
}

  function selectedIds(mapObj) {
    return Object.entries(mapObj).filter(([, v]) => !!v).map(([k]) => k);
  }

  async function fetchNewsFromBackend(prefs) {
    const sources = selectedIds(prefs.sources);
    const cats = selectedIds(prefs.categories);
    if (sources.length === 0 || cats.length === 0) return { items: [] };

    const qs = new URLSearchParams();
    qs.set("sources", sources.join(","));
    qs.set("cats", cats.join(","));
    qs.set("limit", "60");

    const res = await fetch(`/api/news?${qs.toString()}`, { headers: { "Accept": "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  let isRefreshing = false;
  async function refresh() {
    if (isRefreshing) return;
    isRefreshing = true;

    const prefs = loadPrefs();
    showError(false);
    showEmpty(false);
    setStatus("Sæki fréttir…");

    try {
      const data = await fetchNewsFromBackend(prefs);
      const items = Array.isArray(data?.items) ? data.items : [];
      renderNews(items);
      setLastUpdated();

      if (items.length === 0) {
        showEmpty(true);
        setStatus("Ekkert fannst með þessum stillingum.");
      } else {
        setStatus(`Sýni ${items.length} fréttir.`);
      }
    } catch (err) {
      console.error("[frettir] refresh error", err);
      showError(true, "Gat ekki sótt fréttir.");
      setStatus("Villa.");
    } finally {
      isRefreshing = false;
      ptrDone();
    }
  }

  /* -----------------------
     Pull-to-refresh (native-ish)
     ----------------------- */
  let ptrEl = null;
  let ptrStartY = 0;
  let ptrPull = 0;
  let ptrArmed = false;
  const PTR_MAX = 90;
  const PTR_ARM = 62;

  function ensurePtr() {
    if (ptrEl) return;
    ptrEl = document.createElement("div");
    ptrEl.id = "ptr";
    ptrEl.style.position = "fixed";
    ptrEl.style.left = "50%";
    ptrEl.style.top = "10px";
    ptrEl.style.transform = "translate(-50%, -120px)";
    ptrEl.style.transition = "transform 180ms ease";
    ptrEl.style.zIndex = "99999";
    ptrEl.style.pointerEvents = "none";
    ptrEl.innerHTML = `
      <div style="
        padding:8px 12px;
        border-radius:999px;
        border:1px solid rgba(15,23,42,.16);
        background: rgba(255,255,255,.92);
        color:#0b1220;
        font-size:12px;
        box-shadow: 0 10px 30px rgba(2,6,23,.12);
        backdrop-filter: blur(8px);
      ">
        <span id="ptrTxt">Dragðu niður til að endurhlaða</span>
      </div>
    `;
    const setPtrTheme = () => {
      const dark = document.documentElement.getAttribute("data-theme") === "dark";
      const box = ptrEl.firstElementChild;
      if (!box) return;
      box.style.borderColor = dark ? "rgba(255,255,255,.16)" : "rgba(15,23,42,.16)";
      box.style.background = dark ? "rgba(15,23,32,.86)" : "rgba(255,255,255,.92)";
      box.style.color = dark ? "#eaf4ff" : "#0b1220";
      box.style.boxShadow = dark ? "0 10px 30px rgba(0,0,0,.45)" : "0 10px 30px rgba(2,6,23,.12)";
    };
    setPtrTheme();
    const obs = new MutationObserver(setPtrTheme);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    document.body.appendChild(ptrEl);
  }

  function ptrSetText(s) {
    const t = document.getElementById("ptrTxt");
    if (t) t.textContent = s;
  }

  function ptrShow(y) {
    ensurePtr();
    const t = Math.min(PTR_MAX, Math.max(0, y));
    ptrEl.style.transform = `translate(-50%, ${-120 + t}px)`;
  }

  function ptrHide() {
    if (!ptrEl) return;
    ptrEl.style.transform = "translate(-50%, -120px)";
  }

  function ptrDone() {
    ptrArmed = false;
    ptrPull = 0;
    ptrHide();
  }

  function onPtrStart(e) {
    if (isRefreshing) return;
    if (els.settingsDialog?.open) return;
    if (els.menuPanel?.classList.contains("open")) return;
    if (window.scrollY > 0) return;

    const p = e.touches ? e.touches[0] : e;
    ptrStartY = p.clientY;
    ptrPull = 0;
    ptrArmed = false;

    if (ptrStartY < 120) {
      ensurePtr();
      ptrSetText("Dragðu niður til að endurhlaða");
    }
  }

  function onPtrMove(e) {
    if (isRefreshing) return;
    if (els.settingsDialog?.open) return;
    if (els.menuPanel?.classList.contains("open")) return;
    if (window.scrollY > 0) return;

    const p = e.touches ? e.touches[0] : e;
    const dy = p.clientY - ptrStartY;
    if (dy <= 0) return;

    if (dy > 6) {
      ptrPull = dy;
      ptrShow(dy);

      if (dy >= PTR_ARM && !ptrArmed) {
        ptrArmed = true;
        ptrSetText("Slepptu til að endurhlaða");
        if (navigator.vibrate) navigator.vibrate(10);
      } else if (dy < PTR_ARM && ptrArmed) {
        ptrArmed = false;
        ptrSetText("Dragðu niður til að endurhlaða");
      }

      if (e.cancelable) e.preventDefault();
    }
  }

  function onPtrEnd() {
    if (!ptrEl) return;
    if (ptrArmed) {
      ptrSetText("Endurhleð…");
      refresh();
    } else {
      ptrDone();
    }
  }

  function wirePullToRefresh() {
    window.addEventListener("touchstart", onPtrStart, { passive: true });
    window.addEventListener("touchmove", onPtrMove, { passive: false });
    window.addEventListener("touchend", onPtrEnd, { passive: true });
    window.addEventListener("touchcancel", onPtrEnd, { passive: true });
  }

  function wire() {
    els.btnBack?.addEventListener("click", () => {
      if (history.length > 1) history.back();
      else window.location.href = "/";
    });

    els.btnMenu?.addEventListener("click", () => {
      if (els.menuPanel.classList.contains("open")) closeMenu();
      else openMenu();
    });

    els.btnThemeToggle?.addEventListener("click", () => { toggleTheme(); closeMenu(); });
    els.btnOpenSettings?.addEventListener("click", openSettings);
    els.btnRefresh?.addEventListener("click", () => { closeMenu(); refresh(); });

    els.btnEmptyOpenSettings?.addEventListener("click", openSettings);
    els.btnRetry?.addEventListener("click", refresh);

    els.btnSourcesAll?.addEventListener("click", () => setAll("source", true));
    els.btnSourcesNone?.addEventListener("click", () => setAll("source", false));
    els.btnCatsAll?.addEventListener("click", () => setAll("cat", true));
    els.btnCatsNone?.addEventListener("click", () => setAll("cat", false));

    els.btnResetSettings?.addEventListener("click", () => {
      const d = defaultPrefs();
      savePrefs(d);
      renderSettings(d);
    });

    els.btnSaveSettings?.addEventListener("click", () => {
      const current = loadPrefs();
      const next = readSettingsIntoPrefs(current);
      savePrefs(next);
      closeSettings();
      refresh();
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMenu();
    });
  }

  function init() {
    setTheme(getTheme());
    const prefs = loadPrefs();
    renderSettings(prefs);
    wire();
    wirePullToRefresh();
    refresh();
  }

  init();
})();
