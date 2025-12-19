export async function onRequestPost({ request, env }) {
  const PAYPAL_ENV = (env.PAYPAL_ENV || "sandbox").toLowerCase();
  const CLIENT_ID = env.PAYPAL_CLIENT_ID;
  const SECRET = env.PAYPAL_SECRET;

  if (!CLIENT_ID || !SECRET) {
    return json({ error: "Missing PAYPAL_CLIENT_ID or PAYPAL_SECRET" }, 500);
  }

  const apiBase = PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

  let body = {};
  try { body = await request.json(); } catch {}
  const orderId = body.orderId;

  if (!orderId) return json({ error: "Missing orderId" }, 400);

  const accessToken = await getAccessToken({ apiBase, CLIENT_ID, SECRET });

  const capRes = await fetch(`${apiBase}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    }
  });

  const cap = await capRes.json();
  if (!capRes.ok) {
    return json({ error: "PayPal capture failed", details: cap }, 500);
  }

  // “Skila sér” — hér geturðu loggað / vistað / sent email.
  console.log("✅ PayPal captured:", {
    id: cap.id,
    status: cap.status,
    payer: cap.payer?.email_address || null
  });

  return json({ ok: true, status: cap.status, id: cap.id });
}

async function getAccessToken({ apiBase, CLIENT_ID, SECRET }) {
  const basic = btoa(`${CLIENT_ID}:${SECRET}`);
  const res = await fetch(`${apiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });
  const data = await res.json();
  if (!res.ok) throw new Error("PayPal OAuth failed");
  return data.access_token;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}