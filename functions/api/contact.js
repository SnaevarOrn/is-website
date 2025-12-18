export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    // 1) Only JSON
    const ct = request.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      return new Response("Unsupported content-type", { status: 415 });
    }

    // 2) Parse + validate
    const body = await request.json();
    const name = (body.name || "").trim();
    const email = (body.email || "").trim();
    const message = (body.message || "").trim();

    if (!name || !email || !message) {
      return new Response("Missing fields", { status: 400 });
    }
    if (name.length > 120 || email.length > 200 || message.length > 5000) {
      return new Response("Too long", { status: 400 });
    }

    // 3) Minimal email sanity check
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) return new Response("Invalid email", { status: 400 });

    // 4) Send email via Resend
    if (!env.RESEND_API_KEY) return new Response("Server not configured", { status: 500 });

    const to = env.CONTACT_TO || "rokogstormur@gmail.com";
    const from = env.CONTACT_FROM || "onboarding@resend.dev"; // settu þitt þegar lénið er staðfest

    const subject = `ís.is — Hafa samband: ${name}`;
    const text =
`Nafn: ${name}
Netfang: ${email}

Erindi:
${message}
`;

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        text,
        reply_to: email,
      }),
    });

    if (!r.ok) {
      const errTxt = await r.text().catch(() => "");
      return new Response(`Email provider error: ${errTxt}`, { status: 502 });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (e) {
    return new Response("Server error", { status: 500 });
  }
}