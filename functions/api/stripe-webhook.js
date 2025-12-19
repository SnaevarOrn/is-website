export async function onRequestPost(context) {
  const { env, request } = context;

  const secret = env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response("Missing STRIPE_WEBHOOK_SECRET", { status: 500 });

  const sig = request.headers.get("stripe-signature");
  if (!sig) return new Response("Missing stripe-signature", { status: 400 });

  const raw = await request.arrayBuffer();

  const ok = await verifyStripeSignature({
    payload: raw,
    header: sig,
    secret
  });

  if (!ok) return new Response("Invalid signature", { status: 400 });

  const event = JSON.parse(new TextDecoder().decode(raw));

  // Við bregðumst við lokinni Checkout greiðslu
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    // Hér “skilar sér” greiðslan: þú getur skráð, sent email, vistað í DB, o.s.frv.
    // MINNSTA: logga í Functions logs
    console.log("✅ Donation completed:", {
      id: session.id,
      amount_total: session.amount_total,
      currency: session.currency,
      metadata: session.metadata
    });

    // Ef þú vilt “hard guarantee”, þá er líka gott að hlusta á "payment_intent.succeeded".
  }

  return new Response("ok", { status: 200 });
}

/**
 * Stripe webhook verification (HMAC-SHA256).
 * Stripe header lítur út eins og: "t=...,v1=...,v0=..."
 * Undirskrift: HMAC(secret, `${t}.${payload}`)
 */
async function verifyStripeSignature({ payload, header, secret }) {
  const parts = Object.fromEntries(
    header.split(",").map(kv => kv.split("=").map(s => s.trim()))
  );

  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;

  const enc = new TextEncoder();
  const signedPayload = concat(enc.encode(`${t}.`), new Uint8Array(payload));

  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const mac = await crypto.subtle.sign("HMAC", key, signedPayload);
  const hex = toHex(new Uint8Array(mac));

  // Stripe sendir v1 sem hex
  return timingSafeEqual(hex, v1);
}

function concat(a, b) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function toHex(buf) {
  return [...buf].map(x => x.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}