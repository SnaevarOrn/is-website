/* =========================================================
   ís.is — contact.js
   Contact form submit handler (depends on prefs.js)
   Safe on pages without the form.
   ========================================================= */

(function () {
  "use strict";

  const form = document.getElementById("contactForm");
  if (!form) return; // safe on other pages

  const statusEl = document.getElementById("status");

  function lang() {
    if (!window.prefs) return "is";
    return (prefs.get("lang", "is") === "en") ? "en" : "is";
  }

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg;
  }

  function closeOverlaySoon() {
    setTimeout(() => {
      // prefer site.js helper if available
      if (window.site?.closeOverlayById) window.site.closeOverlayById("contactOverlay");
      else document.getElementById("contactOverlay")?.classList.remove("open");
    }, 700);
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const L = lang();
    setStatus(L === "en" ? "Sending..." : "Sendi...");

    const payload = {
      name: (form.name?.value || "").trim(),
      email: (form.email?.value || "").trim(),
      message: (form.message?.value || "").trim()
    };

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "Request failed");
      }

      setStatus(L === "en" ? "Sent. Thanks!" : "Sent. Takk!");
      form.reset();
      closeOverlaySoon();

    } catch (err) {
      setStatus(L === "en")
        ? "Failed to send. Try again shortly."
        : "Tókst ekki að senda. Reyndu aftur eftir smá.";
    }
  });

})();