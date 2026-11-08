// The checkout's front door. Web-standard APIs only, so the same code runs in
// Supabase Edge Functions (index.ts) and in the local tests.
//
//   POST { order, token }   order: the place_order() payload
//                           token: the Cloudflare Turnstile response
//
// 1. Throttle: public.checkout_allow() records the attempt against a keyed
//    hash of the caller's IP address (5 per 10 minutes, 20 per day).
// 2. Verify the Turnstile token with Cloudflare (single use, server side).
// 3. Call public.place_order(), which only the server role may execute.
//
// Errors use PostgREST's shape ({ message, code, details, hint }), so the
// store reads them exactly as it reads database errors.

export interface CheckoutConfig {
  supabaseUrl: string;
  /** The project's secret (or legacy service_role) key. Never sent to the browser. */
  serverKey: string;
  /** Cloudflare Turnstile secret key. Without it, checkout stays closed. */
  turnstileSecret?: string;
  /** Accept Cloudflare's published test secrets, which pass any token. Test projects only. */
  allowTestKeys?: boolean;
  fetch?: typeof fetch;
}

// Cloudflare's published test secrets (always pass, always fail, already spent).
// They verify nothing, so they never count as protection unless a test
// project opts in with TURNSTILE_ALLOW_TEST_KEYS=true.
export const isTurnstileTestSecret = (secret: string) => /^[0-9]x0+AA$/.test(secret);

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const MAX_BODY = 32_000;
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
};

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
const refuse = (status: number, message: string) => reply(status, { message, code: "STILLFORM", details: null, hint: null });

/** The visitor's address as Supabase's edge network reports it. */
function clientAddress(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

async function keyedHash(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function createCheckoutHandler(config: CheckoutConfig) {
  const http = config.fetch ?? fetch;
  const rpc = (fn: string, args: unknown) =>
    http(`${config.supabaseUrl}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: config.serverKey,
        // Legacy service_role keys are JWTs; newer sb_secret_ keys go in apikey alone.
        ...(config.serverKey.startsWith("eyJ") ? { authorization: `Bearer ${config.serverKey}` } : {}),
      },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(15_000),
    });

  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (request.method !== "POST") return refuse(405, "method_not_allowed");
    if (!config.turnstileSecret || !config.serverKey) return refuse(503, "checkout_protection_not_configured");
    if (isTurnstileTestSecret(config.turnstileSecret) && !config.allowTestKeys) return refuse(503, "checkout_protection_not_configured");

    const raw = await request.text();
    if (raw.length > MAX_BODY) return refuse(413, "invalid_items");
    let body: { order?: unknown; token?: unknown };
    try {
      body = JSON.parse(raw);
    } catch {
      return refuse(400, "invalid_request");
    }
    if (typeof body.token !== "string" || body.token.length === 0 || body.token.length > 2048) return refuse(400, "verification_required");
    if (!body.order || typeof body.order !== "object" || Array.isArray(body.order)) return refuse(400, "invalid_request");

    try {
      const address = clientAddress(request);
      const allowed = await rpc("checkout_allow", { p_client: await keyedHash(config.turnstileSecret, address) });
      if (!allowed.ok) return refuse(503, "checkout_unavailable");
      if ((await allowed.json()) !== true) return refuse(429, "too_many_attempts");

      const form = new URLSearchParams({ secret: config.turnstileSecret, response: body.token });
      if (address !== "unknown") form.set("remoteip", address);
      const verdict = await http(SITEVERIFY, { method: "POST", body: form, signal: AbortSignal.timeout(10_000) });
      const outcome = (await verdict.json().catch(() => ({}))) as { success?: boolean; action?: string };
      if (!outcome.success || (outcome.action && outcome.action !== "checkout")) return refuse(403, "verification_failed");

      const placed = await rpc("place_order", { p_order: body.order });
      const result = await placed.text();
      return new Response(result, { status: placed.ok ? 200 : placed.status >= 500 ? 502 : 400, headers: { ...CORS, "content-type": "application/json" } });
    } catch {
      return refuse(502, "checkout_unavailable");
    }
  };
}
