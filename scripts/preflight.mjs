// Launch gate: run before every public deployment. Exits non-zero if the
// store would go live with anything less than real protection.
//
//   npm run preflight                          a real store: checks .env.production.local, or .env.local
//   npm run preflight -- --env <file>          a real store, from another environment file
//   npm run preflight -- --demo                the read-only showroom (npm run build:demo)
//
// Read-only, apart from one deliberately invalid checkout attempt, which proves
// Cloudflare is checking tokens for real. It counts toward this connection's
// limit of 5 per 10 minutes and never creates an order.

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

if (process.argv.includes("--demo")) await demo();

/**
 * The showroom has no backend, so there is nothing to protect: what matters is
 * that the build really is backend-free, Studio-free and complete.
 */
async function demo() {
  let failed = 0;
  const check = (label, ok, fix = "") => {
    if (!ok) failed++;
    console.log(`  ${ok ? "✓" : "✗"} ${label}${!ok && fix ? `\n      → ${fix}` : ""}`);
  };
  console.log("\nPreflight for the showroom (npm run build:demo)");
  const out = mkdtempSync(join(tmpdir(), "stillform-demo-"));
  try {
    execFileSync("npx", ["vite", "build", "--mode", "demo", "--outDir", out, "--emptyOutDir"], { stdio: ["ignore", "ignore", "pipe"] });
    check("the demo build succeeds", existsSync(join(out, "index.html")));
    const js = readdirSync(join(out, "assets")).filter((f) => f.endsWith(".js")).map((f) => readFileSync(join(out, "assets", f), "utf8")).join("\n");
    check("no Supabase project, key or token in the build", !/[a-z0-9]{20}\.supabase\.co|sb_(publishable|secret)_|eyJ[A-Za-z0-9_-]{15,}\.eyJ/.test(js), "Build with npm run build:demo, which ignores backend settings.");
    check("no Turnstile key in the build", !/0x4AAAA|[0-9]x0{20}[A-F]{2}/.test(js));
    // The showroom carries the simulated Demo Studio (/demo/admin), never the real sign-in.
    check("the real Studio's sign-in is left out", !js.includes("That email and password don’t match an account") && !js.includes("an administrator"), "The showroom must not include the real /admin.");
    check("the Demo Studio runs on browser-local data", js.includes("stillform:demo-studio"));
    const media = [...new Set(js.match(/\/media\/[A-Za-z0-9/_.-]+\.(webp|png|jpe?g|avif)/g) ?? [])];
    const missing = media.filter((m) => !existsSync(join(out, m)));
    check(`all ${media.length} images the collection uses are in the build`, media.length > 0 && missing.length === 0, missing.slice(0, 3).join(", "));
    check("single-page routing is configured for the host", existsSync(join(out, "_redirects")) || existsSync("vercel.json"), "Keep public/_redirects (Netlify, Cloudflare Pages) or vercel.json (Vercel).");
    console.log("  · Supabase, sign-in, the checkout function and Turnstile: not used by the showroom");
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
  console.log(failed ? `\n✗ Not ready: ${failed} check(s) failed.` : "\n✓ The showroom is ready to deploy with build command npm run build:demo.");
  process.exit(failed ? 1 : 0);
}

const arg = process.argv.indexOf("--env");
const file = arg > 0 ? process.argv[arg + 1] : existsSync(".env.production.local") ? ".env.production.local" : ".env.local";
if (!file || !existsSync(file)) throw new Error(`No environment file: ${file}`);
const env = Object.fromEntries(readFileSync(file, "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const { VITE_SUPABASE_URL: url = "", VITE_SUPABASE_ANON_KEY: key = "", VITE_TURNSTILE_SITE_KEY: siteKey = "", VITE_STUDIO_ENABLED: studio = "" } = env;
const isTestKey = (k) => /^[0-9]x0+[A-F]{2}$/.test(k);

let failed = 0;
const check = (label, ok, fix = "") => {
  if (!ok) failed++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${!ok && fix ? `\n      → ${fix}` : ""}`);
};

console.log(`\nPreflight for ${file}`);
check("Supabase URL and publishable key are set", Boolean(url && key), "Run npm run setup, or fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
if (!url || !key) process.exit(1);
check("Turnstile site key is set", Boolean(siteKey), "Add VITE_TURNSTILE_SITE_KEY from your Cloudflare Turnstile widget.");
check("Turnstile site key is a production key, not one of Cloudflare's test keys", Boolean(siteKey) && !isTestKey(siteKey), "Test keys let every visitor through. Use your own widget's site key.");
console.log(`  · Studio dashboard: ${studio === "false" ? "left out of this build (demo)" : "included at /admin"}`);

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: catalog, error } = await db.rpc("storefront_catalog");
check("the store's collection loads", !error && (catalog?.products?.length ?? 0) > 0, error?.message ?? "No published products yet.");
const settings = await (await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })).json();
check("public sign-ups are off", settings.disable_signup === true, "Supabase → Authentication → Sign In / Providers → turn off “Allow new users to sign up”.");
const direct = await db.rpc("place_order", { p_order: {} });
check("orders can't skip the checkout function", /permission denied/i.test(direct.error?.message ?? ""), "Apply the migrations: npx supabase db push --linked.");

const fn = `${url}/functions/v1/place-order`;
const post = async (body) => {
  const response = await fetch(fn, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: response.status, message: (await response.json().catch(() => ({}))).message };
};
const noToken = await post({ order: { items: [] } });
check("the checkout function is deployed and configured", noToken.status === 400 && noToken.message === "verification_required",
  noToken.status === 404 ? "Deploy it: npx supabase functions deploy place-order --no-verify-jwt" : noToken.message === "checkout_protection_not_configured" ? "Set a production secret: npx supabase secrets set TURNSTILE_SECRET_KEY=… (and unset TURNSTILE_ALLOW_TEST_KEYS)" : `HTTP ${noToken.status} ${noToken.message ?? ""}`);
const fake = await post({ token: "preflight-invalid-token", order: { items: [] } });
check("Cloudflare rejects a fake token (production secret in use)", fake.status === 403 && fake.message === "verification_failed",
  fake.status === 429 ? "This connection hit the checkout limit; wait 10 minutes and run again." : "The function accepted a fake token: it is using Cloudflare's test secret. Set your widget's secret and unset TURNSTILE_ALLOW_TEST_KEYS.");

// The test-key opt-in must be gone. Needs the Supabase CLI linked to this project.
const ref = new URL(url).host.split(".")[0];
let secrets = null;
try {
  const listed = JSON.parse(execFileSync("npx", ["supabase", "secrets", "list", "--project-ref", ref, "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  secrets = (Array.isArray(listed) ? listed : listed.secrets ?? []).map((s) => s.name);
} catch {
  console.log("  · Couldn't list the project's secrets (sign in with npx supabase login to include this check).");
}
if (secrets) check("TURNSTILE_ALLOW_TEST_KEYS is not set", !secrets.includes("TURNSTILE_ALLOW_TEST_KEYS"), `npx supabase secrets unset TURNSTILE_ALLOW_TEST_KEYS --project-ref ${ref}`);

console.log(failed ? `\n✗ Not ready: ${failed} check(s) failed. Don't deploy publicly yet.` : "\n✓ Ready to deploy. Use the same values in your host's environment variables.");
process.exit(failed ? 1 : 0);
