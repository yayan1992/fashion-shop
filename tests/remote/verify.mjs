// Focused checks against a real hosted Supabase project.
//
//   node tests/remote/verify.mjs            visitor checks (no accounts needed)
//   node tests/remote/verify.mjs --users    also shopper and administrator checks
//
// Reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from .env.local and test
// accounts from .env.test.local (STILLFORM_TEST_ADMIN_EMAIL, …_PASSWORD,
// STILLFORM_TEST_SHOPPER_EMAIL, …_PASSWORD). Never prints keys or passwords.
// Read-only apart from one storage upload attempt per role, which must be
// refused for visitors and shoppers; the administrator's test file is removed.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = (file) => {
  try {
    return Object.fromEntries(readFileSync(file, "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
  } catch {
    return {};
  }
};
const { VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: key } = env(".env.local");
const accounts = env(".env.test.local");
if (!url || !key) throw new Error(".env.local needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY");

let failed = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failed++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${!ok && detail ? ` — ${detail}` : ""}`);
};
const client = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const denied = (error) => Boolean(error) && /permission denied|row-level security|not_authorized|unauthori[sz]ed|403|42501/i.test(`${error.message} ${error.code ?? ""} ${error.statusCode ?? ""}`);
const tinyWebp = Buffer.from("UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=", "base64");

async function visitorChecks(db) {
  const { data: catalog, error } = await db.rpc("storefront_catalog");
  check("storefront_catalog loads the published catalogue", !error && catalog?.products?.length >= 8, error?.message);
  if (catalog) {
    check("8 demo products, 8 rail hangers, 5 lookbook spreads, 36 images", catalog.products.length === 8 && catalog.settings.rail.placements.length === 8 && catalog.lookbooks[0]?.spreads.length === 5 && Object.keys(catalog.media).length === 36,
      `${catalog.products.length} products, ${catalog.settings.rail.placements.length} hangers`);
    check("only live products are visible", catalog.products.every((p) => p.status === "active"));
    check("no dashboard-only fields leak", !JSON.stringify(catalog).includes('"privateSettings"') && catalog.products.every((p) => !("featured" in p)));
  }
  const asAdmin = await db.rpc("catalog_json", { p_admin: true });
  check("catalog_json(true) gives a visitor the public view", !asAdmin.error && !("privateSettings" in (asAdmin.data ?? {})) && (asAdmin.data?.products ?? []).every((p) => !("featured" in p)), asAdmin.error?.message);
  for (const table of ["orders", "order_items", "order_events", "store_private_settings", "admins"]) {
    const { data, error: e } = await db.from(table).select("*").limit(1);
    check(`${table} is closed to visitors`, Boolean(e) || (data ?? []).length === 0, e ? "" : `returned ${data.length} rows`);
  }
  const write = await db.from("products").update({ price: 1 }).eq("id", "henley").select();
  check("visitors cannot change prices", Boolean(write.error) || (write.data ?? []).length === 0);
  for (const fn of ["admin_catalog", "admin_overview", "admin_orders"]) {
    const { error: e } = await db.rpc(fn);
    check(`${fn} refused for visitors`, denied(e), e?.message ?? "call succeeded");
  }
  const upload = await db.storage.from("media").upload(`rail/visitor-${Date.now()}.webp`, tinyWebp, { contentType: "image/webp" });
  check("storage upload refused for visitors", Boolean(upload.error), "upload succeeded");
  const direct = await db.rpc("place_order", { p_order: {} });
  check("place_order cannot be called directly (only through the checkout function)", denied(direct.error), direct.error?.message ?? "call succeeded");
  const throttle = await db.rpc("checkout_allow", { p_client: "x" });
  check("the checkout throttle cannot be called directly", denied(throttle.error), throttle.error?.message ?? "call succeeded");
  const fn = await fetch(`${url}/functions/v1/place-order`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ order: { items: [] } }) });
  const fnBody = await fn.json().catch(() => ({}));
  check("the checkout function refuses an order without a Turnstile token", fn.status === 400 && fnBody.message === "verification_required", `HTTP ${fn.status} ${fnBody.message ?? ""}`);
  const { data: admin } = await db.rpc("is_admin");
  check("is_admin() is false for visitors", admin === false);
  // Read from the public auth settings, so checking never creates an account.
  const settings = await (await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })).json();
  check("public sign-ups are disabled", settings.disable_signup === true, "Authentication → Sign In / Providers → turn off “Allow new users to sign up”");
}

console.log(`\nVisitor (publishable key) → ${new URL(url).host}`);
await visitorChecks(client());

if (process.argv.includes("--users")) {
  const { STILLFORM_TEST_ADMIN_EMAIL: adminEmail, STILLFORM_TEST_ADMIN_PASSWORD: adminPassword, STILLFORM_TEST_SHOPPER_EMAIL: shopperEmail, STILLFORM_TEST_SHOPPER_PASSWORD: shopperPassword } = accounts;
  if (!adminEmail || !adminPassword || !shopperEmail || !shopperPassword) throw new Error(".env.test.local needs the four STILLFORM_TEST_* values");

  console.log("\nSigned-in shopper (not an administrator)");
  const shopper = client();
  const s = await shopper.auth.signInWithPassword({ email: shopperEmail, password: shopperPassword });
  check("shopper signs in", !s.error, s.error?.message);
  check("is_admin() is false for the shopper", (await shopper.rpc("is_admin")).data === false);
  for (const fn of ["admin_catalog", "admin_overview"]) {
    const { error } = await shopper.rpc(fn);
    check(`${fn} refused for the shopper`, denied(error), error?.message ?? "call succeeded");
  }
  const { error: settingsError } = await shopper.rpc("admin_save_settings", { p_public: {}, p_private: {} });
  check("admin_save_settings refused for the shopper", denied(settingsError), settingsError?.message ?? "call succeeded");
  const orders = await shopper.from("orders").select("*").limit(1);
  check("shopper sees no orders", (orders.data ?? []).length === 0);
  const privateSettings = await shopper.from("store_private_settings").select("*");
  check("shopper sees no private settings", (privateSettings.data ?? []).length === 0);
  const stock = await shopper.from("variants").update({ stock: 999 }).eq("sku", "HENLEY-RUST-M").select();
  check("shopper cannot change stock directly", (stock.data ?? []).length === 0);
  const selfAdmin = await shopper.from("admins").insert({ user_id: s.data.user?.id });
  check("shopper cannot make themselves an administrator", Boolean(selfAdmin.error));
  const shopperOrder = await shopper.rpc("place_order", { p_order: {} });
  check("place_order cannot be called directly by the shopper", denied(shopperOrder.error), shopperOrder.error?.message ?? "call succeeded");
  const shopperUpload = await shopper.storage.from("media").upload(`rail/shopper-${Date.now()}.webp`, tinyWebp, { contentType: "image/webp" });
  check("storage upload refused for the shopper", Boolean(shopperUpload.error), "upload succeeded");
  await shopper.auth.signOut();

  console.log("\nAdministrator");
  const admin = client();
  const a = await admin.auth.signInWithPassword({ email: adminEmail, password: adminPassword });
  check("admin signs in", !a.error, a.error?.message);
  check("is_admin() is true for the admin", (await admin.rpc("is_admin")).data === true);
  const full = await admin.rpc("admin_catalog");
  check("admin_catalog returns drafts and private settings", !full.error && "privateSettings" in (full.data ?? {}), full.error?.message);
  const overview = await admin.rpc("admin_overview");
  check("admin_overview", !overview.error, overview.error?.message);
  const path = `rail/verify-${Date.now()}.webp`;
  const up = await admin.storage.from("media").upload(path, tinyWebp, { contentType: "image/webp", cacheControl: "31536000" });
  check("admin uploads to the media bucket", !up.error, up.error?.message);
  const publicUrl = admin.storage.from("media").getPublicUrl(path).data.publicUrl;
  const served = await fetch(publicUrl);
  check("uploaded file is served publicly by URL", served.ok && (served.headers.get("content-type") ?? "").includes("image/webp"), `HTTP ${served.status}`);
  const replace = await admin.storage.from("media").update(path, tinyWebp, { contentType: "image/webp" });
  check("admin replaces the file", !replace.error, replace.error?.message);
  const wrongType = await admin.storage.from("media").upload(`rail/verify-${Date.now()}.svg`, "<svg/>", { contentType: "image/svg+xml" });
  check("bucket refuses non-image types", Boolean(wrongType.error), "SVG upload succeeded");
  const removed = await admin.storage.from("media").remove([path]);
  check("admin removes the test file", !removed.error && removed.data?.length === 1, removed.error?.message);
  const refreshed = await admin.auth.refreshSession();
  check("session refresh issues a new access token", !refreshed.error && refreshed.data.session?.access_token !== a.data.session?.access_token, refreshed.error?.message);
  check("admin calls still work after refresh", (await admin.rpc("is_admin")).data === true);
  await admin.auth.signOut();
  const after = await admin.rpc("admin_catalog");
  check("after sign-out, admin functions are refused", denied(after.error), after.error?.message ?? "call succeeded");
}

console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed.");
process.exit(failed ? 1 : 0);
