export async function onRequestPost({ request, env }) {
  const SITE_URL = (env.SITE_URL || "https://ís.is").replace(/\/$/, "");
  const PAYPAL_ENV = (env.PAYPAL_ENV || "sandbox").toLowerCase(); // sandbox | live
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

  // Upphæð — PayPal styður ekki endilega ISK í öllum flæðum.
  // Ég mæli með EUR. Þú getur breytt með env PAYPAL_CURRENCY.
  const currency = (env.PAYPAL_CURRENCY || "EUR").toUpperCase();
  const amount = normalizeAmount(body.amount ?? "10.00"); // default 10.00 EUR

  const accessToken = await getAccessToken({ apiBase, CLIENT_ID, SECRET });

  const orderRes = await fetch(`${apiBase}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [{
        description: "Styrkur til ís.is",
        amount: { currency_code: currency, value: amount }
      }],
      application_context: {
        brand_name: "ís.is",
        landing_page: "BILLING",
        user_action: "PAY_NOW",
        return_url: `${SITE_URL}/?donation=paypal_return`,
        cancel_url: `${SITE_URL}/?donation=paypal_cancel`
      }
    })
  });

  const order = await orderRes.json();
  if (!orderRes.ok) {
    return json({ error: "PayPal create order failed", details: order }, 500);
  }

  const approve = (order.links || []).find(l => l.rel === "approve")?.href;
  return json({ id: order.id, approveUrl: approve });
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

function normalizeAmount(v) {
  const s = String(v ?? "").replace(",", ".").trim();
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return "10.00";
  return n.toFixed(2);
}