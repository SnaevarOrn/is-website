export async function onRequestPost(context) {
  const { env, request } = context;

  const SITE_URL = (env.SITE_URL || "https://ís.is").replace(/\/$/, "");
  const STRIPE_SECRET_KEY = env.STRIPE_SECRET_KEY;

  if (!STRIPE_SECRET_KEY) {
    return json({ error: "Missing STRIPE_SECRET_KEY" }, 500);
  }

  let body = {};
  try { body = await request.json(); } catch {}

  // Valfrjálst: upphæð í ISK frá frontend (t.d. 500/1000/2000)
  // Ef ekkert kemur, default 1000 kr.
  const amountISK = clampInt(body.amountISK ?? 1000, 100, 200000); // 100–200.000 kr

  // Stripe vill "amount_total" í minnstu einingu. ISK hefur enga aukastafi í reynd → notum bara heilar kr.
  // Stripe API tekur "unit_amount" sem integer.
  const params = new URLSearchParams();

  // “Donation” sem line item án þess að búa til Product/Price í Stripe
  params.set("mode", "payment");
  params.set("success_url", `${SITE_URL}/?donation=success`);
  params.set("cancel_url", `${SITE_URL}/?donation=cancel`);

  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", "isk");
  params.set("line_items[0][price_data][product_data][name]", "Styrkur til ís.is");
  params.set("line_items[0][price_data][unit_amount]", String(amountISK));

  // Smá metadata (nytsamlegt í webhook)
  params.set("metadata[source]", String(body.source || "about_modal"));
  params.set("metadata[amountISK]", String(amountISK));

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params
  });

  const data = await res.json();

  if (!res.ok) {
    return json({ error: "Stripe error", details: data }, 500);
  }

  return json({ url: data.url });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

function clampInt(v, min, max) {
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}