// Supabase Edge Function: protected checkout. See handler.ts.
//
// Deploy:   npx supabase functions deploy place-order --no-verify-jwt
// Secret:   npx supabase secrets set TURNSTILE_SECRET_KEY=…
//
// SUPABASE_URL and the server key are provided by Supabase automatically.
// Cloudflare's test secrets are refused unless TURNSTILE_ALLOW_TEST_KEYS=true
// is also set, which belongs on test projects only.

import { createCheckoutHandler } from "./handler.ts";

declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (request: Request) => Response | Promise<Response>): void };

function serverKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, string>;
    if (keys.default) return keys.default;
  } catch {
    // Fall through to the legacy key.
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

Deno.serve(
  createCheckoutHandler({
    supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
    serverKey: serverKey(),
    turnstileSecret: Deno.env.get("TURNSTILE_SECRET_KEY"),
    allowTestKeys: Deno.env.get("TURNSTILE_ALLOW_TEST_KEYS") === "true",
  }),
);
