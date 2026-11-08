// Creates the two throwaway accounts tests/remote/verify.mjs signs in with:
// one future administrator and one ordinary shopper, both with confirmed
// emails and random passwords, written to the gitignored .env.test.local.
//
//   node tests/remote/create-test-users.mjs
//
// Uses Supabase's Auth Admin API. The secret key it needs is fetched through
// the Supabase CLI (your own Supabase login), held in this process's memory
// only, and never printed or written anywhere. Accounts already listed in
// .env.test.local are left alone. Does not make anyone an administrator; run
// `npm run admin:grant` for that.

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const FILE = ".env.test.local";
const read = (file) => {
  try {
    return Object.fromEntries(readFileSync(file, "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
  } catch {
    return {};
  }
};

const { VITE_SUPABASE_URL: url } = read(".env.local");
if (!url) throw new Error(".env.local needs VITE_SUPABASE_URL");
const ref = readFileSync("supabase/.temp/project-ref", "utf8").trim();
if (new URL(url).host !== `${ref}.supabase.co`) throw new Error(`.env.local points at ${new URL(url).host}, but the linked project is ${ref}`);

const accounts = read(FILE);
// The test project is named explicitly, so test accounts never land in a real store.
if (accounts.STILLFORM_TEST_PROJECT_REF !== ref) {
  throw new Error(`Add STILLFORM_TEST_PROJECT_REF=${ref} to ${FILE} if, and only if, ${ref} is a test project with no customers.`);
}
const wanted = [
  { role: "ADMIN", email: accounts.STILLFORM_TEST_ADMIN_EMAIL || "stillform-admin-test@example.com" },
  { role: "SHOPPER", email: accounts.STILLFORM_TEST_SHOPPER_EMAIL || "stillform-shopper-test@example.com" },
].filter(({ role }) => !accounts[`STILLFORM_TEST_${role}_PASSWORD`]);

if (wanted.length === 0) {
  console.log(`${FILE} already lists both test accounts; nothing to do.`);
  process.exit(0);
}

const keys = JSON.parse(execFileSync("npx", ["supabase", "projects", "api-keys", "--project-ref", ref, "--reveal", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
const secret = keys.find((k) => k.type === "secret")?.api_key;
if (!secret?.startsWith("sb_secret_")) throw new Error("Could not read the project's secret key through the Supabase CLI.");
const auth = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } }).auth.admin;

for (const account of wanted) {
  const password = randomBytes(24).toString("base64url");
  const { data, error } = await auth.createUser({ email: account.email, password, email_confirm: true, user_metadata: { purpose: "stillform integration test" } });
  if (error) throw new Error(`Creating the ${account.role.toLowerCase()} test account failed: ${error.message}`);
  accounts[`STILLFORM_TEST_${account.role}_EMAIL`] = account.email;
  accounts[`STILLFORM_TEST_${account.role}_PASSWORD`] = password;
  console.log(`Created the ${account.role.toLowerCase()} test account (${account.email.replace(/^(.).*(@.*)$/, "$1…$2")}, email confirmed, id ${data.user.id.slice(0, 8)}…).`);
}

const body = [
  "# STILLFORM test project and accounts for tests/remote. Gitignored; never commit.",
  "# Throwaway passwords only.",
  `STILLFORM_TEST_PROJECT_REF=${ref}`,
  ...["ADMIN", "SHOPPER"].flatMap((role) => [`STILLFORM_TEST_${role}_EMAIL=${accounts[`STILLFORM_TEST_${role}_EMAIL`] ?? ""}`, `STILLFORM_TEST_${role}_PASSWORD=${accounts[`STILLFORM_TEST_${role}_PASSWORD`] ?? ""}`]),
  "",
].join("\n");
writeFileSync(`${FILE}.tmp`, body, { mode: 0o600 });
chmodSync(`${FILE}.tmp`, 0o600);
renameSync(`${FILE}.tmp`, FILE);
console.log(`Saved to ${FILE} (permissions 600).`);
