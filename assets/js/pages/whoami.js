"use strict";

(() => {
  const $ = (sel) => document.querySelector(sel);

  const els = {
    status: $("#whoamiStatus"),
    grid: $("#whoamiGrid"),
    details: $("#whoamiDetails"),
    pre: $("#whoamiJson"),
    btnRefresh: $("#whoamiRefresh"),
    btnCopy: $("#whoamiCopy"),
  };

  let lastJsonText = "";

  function esc(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function fmt(v) {
    if (v === null || v === undefined) return "—";
    if (typeof v === "string" && v.trim() === "") return "—";
    return String(v);
  }

  function kv(label, value, small = false) {
    const cls = small ? "whoami-kv whoami-kv--small" : "whoami-kv";
    return `
      <div class="${cls}">
        <div class="whoami-k">${esc(label)}</div>
        <div class="whoami-v">${esc(fmt(value))}</div>
      </div>
    `;
  }

  function render(data) {
    const req = (data && data.request) || {};
    const now = data && data.now;

    const rows = [];
    rows.push(kv("Tími (server)", now || "—", true));
    rows.push(kv("IP (maskað)", req.ipMasked, true));

    rows.push(kv("Land", req.country));
    rows.push(kv("Borg", req.city));
    rows.push(kv("Svæði", req.region));
    rows.push(kv("Póstnúmer", req.postalCode));
    rows.push(kv("Tímabelti", req.timezone));

    // lat/lon can exist (IP-based) — show but keep it clearly not GPS
    rows.push(kv("Breiddargráða (IP-áætlun)", req.latitude));
    rows.push(kv("Lengdargráða (IP-áætlun)", req.longitude));

    rows.push(kv("ASN", req.asn));
    rows.push(kv("ISP", req.isp));

    rows.push(kv("Tungumál (Accept-Language)", req.acceptLanguage));
    rows.push(kv("User-Agent", req.userAgent));
    rows.push(kv("Referrer", req.referer));

    els.grid.innerHTML = rows.join("");
  }

  async function load() {
    els.btnCopy.disabled = true;
    els.grid.hidden = true;
    els.details.hidden = true;

    els.status.textContent = "Sæki upplýsingar…";

    try {
      const res = await fetch("/api/whoami", {
        method: "GET",
        cache: "no-store",
        headers: { "accept": "application/json" },
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      lastJsonText = JSON.stringify(data, null, 2);

      render(data);

      els.pre.textContent = lastJsonText;
      els.status.textContent = "Uppfært.";
      els.grid.hidden = false;
      els.details.hidden = false;
      els.btnCopy.disabled = false;
    } catch (e) {
      els.status.textContent =
        "Gat ekki sótt /api/whoami. Athugaðu að API endpointið sé til og að Cloudflare Functions séu að keyra.";
      lastJsonText = "";
    }
  }

  async function copyJson() {
    if (!lastJsonText) return;
    try {
      await navigator.clipboard.writeText(lastJsonText);
      const old = els.btnCopy.textContent;
      els.btnCopy.textContent = "Afritað ✓";
      setTimeout(() => (els.btnCopy.textContent = old), 900);
    } catch {
      // fallback: select text in <pre>
      const range = document.createRange();
      range.selectNodeContents(els.pre);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  els.btnRefresh?.addEventListener("click", load);
  els.btnCopy?.addEventListener("click", copyJson);

  load();
})();
