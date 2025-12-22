// /assets/js/pages/frettir.js
(() => {
  const SOURCES = [
    { id: "ruv",  label: "RÚV",  domain: "ruv.is" },
    { id: "mbl",  label: "mbl.is", domain: "mbl.is" },
    { id: "visir",label: "Vísir", domain: "visir.is" },
    { id: "dv",   label: "DV",   domain: "dv.is" },
  ];

  // Flokkar: þetta er “grunnurinn” – seinna mapparðu þetta við RSS flokka eða merkjakerfi í bakenda.
  const CATEGORIES = [
    { id: "innlent",  label: "Innlent" },
    { id: "erlent",   label: "Erlent" },
    { id: "ithrottir",label: "Íþróttir" },
    { id: "vidskipti",label: "Viðskipti" },
    { id: "menning",  label: "Menning" },
    { id: "skoðun",   label: "Skoðun" },
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
    settingsForm: $("#settingsForm"),
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
    activeChips: $("#activeChips"),

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

      // merge (forwards-compat)
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
    // Prefer your shared prefs/theme helpers if present.
    if (window.prefs && typeof prefs.getTheme === "function") return prefs.getTheme();
    return (localStorage.getItem("theme") || "light");
  }

  function setTheme(next) {
    if (window.prefs && typeof prefs.setTheme === "function") {
      prefs.setTheme(next);
    } else {
      localStorage.setItem("theme", next);
    }
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
    // click outside to close
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

  function humanAgeFromISO(iso) {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return "óþekkt";
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

  function renderChips(prefs) {
    const chosenSources = SOURCES.filter(s => prefs.sources[s.id]).map(s => s.label);
    const chosenCats = CATEGORIES.filter(c => prefs.categories[c.id]).map(c => c.label);

    const chips = [];

    if (chosenSources.length === SOURCES.length) chips.push({ text: "Miðlar: Allt" });
    else chips.push({ text: `Miðlar: ${chosenSources.join(", ") || "Ekkert"}` });

    if (chosenCats.length === CATEGORIES.length) chips.push({ text: "Sía: Allt" });
    else chips.push({ text: `Sía: ${chosenCats.join(", ") || "Ekkert"}` });

    els.activeChips.innerHTML = chips.map(c => `<span class="chip">${escapeHtml(c.text)}</span>`).join("");
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderSettings(prefs) {
    els.sourcesList.innerHTML = SOURCES.map(s => {
      const checked = prefs.sources[s.id] ? "checked" : "";
      return `
        <label class="check">
          <input type="checkbox" data-kind="source" data-id="${s.id}" ${checked} />
          <span><strong>${escapeHtml(s.label)}</strong> <span class="muted">— ${escapeHtml(s.domain)}</span></span>
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
    const next = structuredClone(prefs);

    els.settingsDialog.querySelectorAll('input[type="checkbox"][data-kind="source"]').forEach(cb => {
      const id = cb.getAttribute("data-id");
      next.sources[id] = cb.checked;
    });

    els.settingsDialog.querySelectorAll('input[type="checkbox"][data-kind="cat"]').forEach(cb => {
      const id = cb.getAttribute("data-id");
      next.categories[id] = cb.checked;
    });

    return next;
  }

  function setAll(kind, value) {
    const selector = kind === "source"
      ? 'input[type="checkbox"][data-kind="source"]'
      : 'input[type="checkbox"][data-kind="cat"]';

    els.settingsDialog.querySelectorAll(selector).forEach(cb => cb.checked = value);
  }

  function setStatus(msg) {
    els.statusText.textContent = msg;
  }

  function setLastUpdated() {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    els.lastUpdated.textContent = `Uppfært ${hh}:${mm}`;
  }

  function showEmpty(show) {
    els.emptyState.hidden = !show;
  }

  function showError(show, msg) {
    els.errorState.hidden = !show;
    if (msg) els.errorMsg.textContent = msg;
  }

  function renderNews(items) {
    els.newsList.innerHTML = items.map(it => {
      const sourceBadge = it.sourceLabel ? `<span class="badge">${escapeHtml(it.sourceLabel)}</span>` : "";
      const catBadge = it.category ? `<span class="badge">${escapeHtml(it.category)}</span>` : "";
      const age = it.publishedAt ? humanAgeFromISO(it.publishedAt) : "—";
      return `
        <article class="item">
          <div class="item-top">
            <h3 class="item-title">
              <a href="${escapeHtml(it.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(it.title)}</a>
            </h3>
            <div class="tiny">${escapeHtml(age)}</div>
          </div>
          <div class="item-meta">
            ${sourceBadge}
            ${catBadge}
            ${it.publishedAt ? `<span class="tiny">(${escapeHtml(new Date(it.publishedAt).toLocaleString("is-IS"))})</span>` : ""}
          </div>
        </article>
      `;
    }).join("");
  }

  function selectedIds(mapObj) {
    return Object.entries(mapObj).filter(([,v]) => !!v).map(([k]) => k);
  }

  /**
   * IMPORTANT:
   * Frontend getur EKKI beint “fiskað” dv.is / visir.is / mbl.is með fetch út af CORS.
   * Lausn: Cloudflare Functions/Worker endpoint sem:
   *  - Sækir RSS eða HTML server-side
   *  - Normaliserar í JSON {items:[{title,url,publishedAt,sourceId,category}...]}
   *
   * Hér er aðeins “grunn-kallið”.
   */
  async function fetchNewsFromBackend(prefs) {
    const sources = selectedIds(prefs.sources);
    const cats = selectedIds(prefs.categories);

    // Ef ekkert er valið, skila tómu strax
    if (sources.length === 0 || cats.length === 0) return { items: [] };

    // Þú setur þetta upp síðar:
    // - Cloudflare Pages Functions: /functions/api/news.js => /api/news
    // - eða Worker route: /api/news
    const qs = new URLSearchParams();
    qs.set("sources", sources.join(","));
    qs.set("cats", cats.join(","));
    qs.set("limit", "60");

    const url = `/api/news?${qs.toString()}`;

    const res = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  // Fyrsta útgáfa: sýnum demo-items ef enginn bakendi er til staðar
  function demoItems() {
    const now = Date.now();
    return [
      {
        title: "Demo: Hér birtast fyrirsagnir þegar /api/news er komið",
        url: "https://www.is.is/",
        publishedAt: new Date(now - 12 * 60 * 1000).toISOString(),
        sourceLabel: "ís.is",
        category: "Innlent"
      },
      {
        title: "Demo: Stillingar -> velja miðla og síur",
        url: "https://see.is/",
        publishedAt: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
        sourceLabel: "ís.is",
        category: "Viðskipti"
      },
    ];
  }

  async function refresh() {
    const prefs = loadPrefs();
    renderChips(prefs);

    showError(false);
    showEmpty(false);
    setStatus("Sæki fréttir…");

    try {
      // Prófum bakenda — ef hann er ekki til staðar, dettum í demo.
      let data;
      try {
        data = await fetchNewsFromBackend(prefs);
        if (!data || !Array.isArray(data.items)) throw new Error("Invalid payload");
      } catch (e) {
        // Fallback: demo (grunnur virkar strax í UI)
        data = { items: demoItems() };
      }

      const items = data.items || [];
      renderNews(items);
      setLastUpdated();

      if (items.length === 0) {
        showEmpty(true);
        setStatus("Ekkert fannst með þessum stillingum.");
      } else {
        setStatus(`Sýni ${items.length} fréttir.`);
      }
    } catch (err) {
      showError(true
