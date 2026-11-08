// Guided setup: connects this store to your Supabase project.
//
//   npm run setup              walks through every step, asking before each change
//   npm run setup -- --check   reports what is done and what isn't; changes nothing
//
// Uses the Supabase CLI with your own Supabase login. Safe to run again: each
// step checks first and skips what's already done. Secrets you type (the
// Turnstile secret key, your password) are hidden, never printed, and never
// written into this project. The project's secret API key is used only to
// create your owner account, held in memory and discarded.

import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { createClient } from "@supabase/supabase-js";

const CHECK = process.argv.includes("--check");
const ENV = ".env.local";
const TEST_SITE_KEY = "1x00000000000000000000AA";
const TEST_SECRET = "1x0000000000000000000000000000000AA";
const isTestKey = (key) => /^[0-9]x0+[A-F]{2}$/.test(key);

// --- small helpers -----------------------------------------------------------

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const ok = (s) => console.log(`  ✓ ${s}`);
const todo = (s) => console.log(`  • ${s}`);
const step = (n, title) => console.log(`\n${bold(`${n}. ${title}`)}`);

function supabase(args, { json = false, inherit = false } = {}) {
  if (inherit) {
    const result = spawnSync("npx", ["supabase", ...args], { stdio: "inherit" });
    if (result.status !== 0) throw new Error(`npx supabase ${args[0]} ${args[1] ?? ""} failed.`);
    return null;
  }
  const out = execFileSync("npx", ["supabase", ...args, ...(json ? ["-o", "json"] : [])], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return json ? JSON.parse(out.slice(out.search(/[[{]/))) : out;
}
const trySupabase = (args, options) => {
  try {
    return supabase(args, options);
  } catch {
    return null;
  }
};

const rl = process.stdin.isTTY ? createInterface({ input: process.stdin, output: process.stdout, terminal: true }) : null;
function ask(question, { hidden = false } = {}) {
  if (!rl) throw new Error("Run setup in an interactive terminal (or use --check).");
  return new Promise((resolve) => {
    if (hidden) {
      const write = rl._writeToOutput;
      rl._writeToOutput = (text) => (text.includes(question) ? write.call(rl, text) : write.call(rl, ""));
      rl.question(question, (answer) => {
        rl._writeToOutput = write;
        process.stdout.write("\n");
        resolve(answer.trim());
      });
    } else rl.question(question, (answer) => resolve(answer.trim()));
  });
}
const confirm = async (question) => !CHECK && /^(y|yes|)$/i.test(await ask(`  ${question} [Y/n] `));

function readEnv() {
  if (!existsSync(ENV)) return {};
  return Object.fromEntries(readFileSync(ENV, "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
}
/** Sets values in .env.local, keeping every other line, readable only by you. */
function writeEnv(values) {
  const lines = existsSync(ENV) ? readFileSync(ENV, "utf8").split("\n") : readFileSync(".env.example", "utf8").split("\n");
  for (const [key, value] of Object.entries(values)) {
    const i = lines.findIndex((l) => l.startsWith(`${key}=`));
    if (i >= 0) lines[i] = `${key}=${value}`;
    else lines.push(`${key}=${value}`);
  }
  writeFileSync(ENV, lines.join("\n").replace(/\n*$/, "\n"), { mode: 0o600 });
  chmodSync(ENV, 0o600);
}

// --- steps --------------------------------------------------------------------

async function tools() {
  step(1, "Tools");
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 20) throw new Error(`Node.js 20 or newer is needed; this is ${process.versions.node}.`);
  ok(`Node.js ${process.versions.node}`);
  const version = trySupabase(["--version"]);
  if (!version) throw new Error("The Supabase CLI didn't start. Run `npm install` first.");
  ok(`Supabase CLI ${version.trim()}`);
  let projects = trySupabase(["projects", "list"], { json: true });
  if (!projects) {
    todo("Not signed in to Supabase.");
    if (!(await confirm("Sign in now? A browser window opens."))) return null;
    supabase(["login"], { inherit: true });
    projects = supabase(["projects", "list"], { json: true });
  }
  ok("Signed in to Supabase");
  return projects;
}

async function project(projects) {
  step(2, "Project");
  let ref = existsSync("supabase/.temp/project-ref") ? readFileSync("supabase/.temp/project-ref", "utf8").trim() : "";
  const name = (r) => projects.find((p) => (p.ref ?? p.id) === r)?.name;
  if (ref) {
    ok(`Linked to ${bold(name(ref) ?? "unknown project")} (${ref})`);
    return ref;
  }
  todo("No project linked yet.");
  if (CHECK) return null;
  console.log(dim("  Your projects:"));
  for (const p of projects) console.log(dim(`    ${p.ref ?? p.id}  ${p.name}`));
  ref = await ask("  Project ref to use for this store: ");
  if (!/^[a-z0-9]{20}$/.test(ref) || !name(ref)) throw new Error("That isn't one of your project refs.");
  if (!(await confirm(`Link this folder to ${name(ref)} (${ref})?`))) return null;
  supabase(["link", "--project-ref", ref], { inherit: true });
  ok(`Linked to ${name(ref)}`);
  return ref;
}

async function database() {
  step(3, "Database (tables, security rules, image storage, checkout protection, demo collection)");
  const plan = supabase(["db", "push", "--linked", "--dry-run", "--include-seed", "--output-format", "json"], { json: false });
  const pending = JSON.parse(plan.slice(plan.lastIndexOf("{"))).migrations ?? [];
  if (pending.length === 0) return ok("Up to date");
  todo(`${pending.length} migration(s) to apply: ${pending.join(", ")}`);
  if (!(await confirm("Apply them now? The demo collection is added only if the store has no products yet."))) return;
  supabase(["db", "push", "--linked", "--include-seed", "--yes"], { inherit: true });
  ok("Database ready");
}

async function connection(ref) {
  step(4, "Store connection (.env.local)");
  const env = readEnv();
  const url = `https://${ref}.supabase.co`;
  if (env.VITE_SUPABASE_URL === url && env.VITE_SUPABASE_ANON_KEY) return ok("Project URL and publishable key are set");
  todo(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_URL !== url ? `.env.local points at a different project (${env.VITE_SUPABASE_URL})` : "Not connected yet");
  if (!(await confirm("Write this project's URL and publishable key to .env.local?"))) return;
  const keys = supabase(["projects", "api-keys", "--project-ref", ref], { json: true });
  const key = (keys.find((k) => k.type === "publishable") ?? keys.find((k) => k.name === "anon"))?.api_key;
  if (!key) throw new Error("Couldn't find a publishable key for this project.");
  writeEnv({ VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: key });
  ok("Saved to .env.local (public values; the browser sees them by design)");
}

async function checkoutProtection(ref) {
  step(5, "Checkout protection (Cloudflare Turnstile + the place-order function)");
  const env = readEnv();
  const listed = trySupabase(["secrets", "list", "--project-ref", ref], { json: true }) ?? [];
  const secrets = (Array.isArray(listed) ? listed : listed.secrets ?? []).map((s) => s.name);
  const functions = trySupabase(["functions", "list", "--project-ref", ref], { json: true }) ?? [];
  const deployed = (Array.isArray(functions) ? functions : functions.functions ?? []).some((f) => f.slug === "place-order" || f.name === "place-order");
  const siteKey = env.VITE_TURNSTILE_SITE_KEY ?? "";
  const testMode = secrets.includes("TURNSTILE_ALLOW_TEST_KEYS") || isTestKey(siteKey);

  if (deployed) ok("place-order function deployed");
  else todo("place-order function not deployed");
  if (secrets.includes("TURNSTILE_SECRET_KEY") && siteKey && !testMode) ok("Turnstile production keys set");
  else if (testMode) todo(`${bold("Test keys")} in use: fine for trying the store locally, never for a public site`);
  else todo("Turnstile keys not set: checkout refuses every order until they are");
  if (CHECK) return;

  if (!(secrets.includes("TURNSTILE_SECRET_KEY") && siteKey && !testMode)) {
    console.log(dim("  Production keys come from a free Turnstile widget: Cloudflare dashboard → Turnstile → Add widget,"));
    console.log(dim("  with your domain and localhost as hostnames, Managed mode. See docs/SETUP.md step 4."));
    const choice = await ask("  [1] Enter production keys  [2] Use Cloudflare's test keys (test project only)  [3] Skip for now: ");
    if (choice === "1") {
      const site = await ask("  Turnstile site key: ");
      const secret = await ask("  Turnstile secret key (hidden): ", { hidden: true });
      if (!site || !secret) throw new Error("Both keys are needed.");
      if (isTestKey(site) || isTestKey(secret)) throw new Error("Those are Cloudflare's test keys. Use your own widget's keys, or choose option 2.");
      // The secret goes to Supabase through a temporary file readable only by you, so it never appears in a command line.
      const dir = mkdtempSync(join(tmpdir(), "stillform-"));
      try {
        writeFileSync(join(dir, "secrets.env"), `TURNSTILE_SECRET_KEY=${secret}\n`, { mode: 0o600 });
        supabase(["secrets", "set", "--env-file", join(dir, "secrets.env"), "--project-ref", ref]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
      if (secrets.includes("TURNSTILE_ALLOW_TEST_KEYS")) supabase(["secrets", "unset", "TURNSTILE_ALLOW_TEST_KEYS", "--project-ref", ref, "--yes"]);
      writeEnv({ VITE_TURNSTILE_SITE_KEY: site });
      ok("Production keys set: the secret in Supabase, the site key in .env.local");
    } else if (choice === "2") {
      console.log(`  ${bold("Test keys let every visitor through.")} Use them only on a project with no customers.`);
      console.log("  The function accepts them only with TURNSTILE_ALLOW_TEST_KEYS=true, and production builds refuse them.");
      if (await confirm("This project has no real customers. Use test keys?")) {
        supabase(["secrets", "set", `TURNSTILE_SECRET_KEY=${TEST_SECRET}`, "TURNSTILE_ALLOW_TEST_KEYS=true", "--project-ref", ref]);
        writeEnv({ VITE_TURNSTILE_SITE_KEY: TEST_SITE_KEY });
        ok("Test keys set");
      }
    }
  }
  if (await confirm(deployed ? "Redeploy the place-order function with the current code?" : "Deploy the place-order function now?")) {
    supabase(["functions", "deploy", "place-order", "--no-verify-jwt", "--use-api", "--project-ref", ref], { inherit: true });
    ok("place-order deployed");
  }
}

async function owner(ref) {
  step(6, "Your owner account");
  const rows = supabase(["db", "query", "--linked", "select count(*)::int as admins from public.admins"], { json: true }).rows ?? [];
  if (rows[0]?.admins > 0) return ok(`${rows[0].admins} administrator(s) set up`);
  todo("No administrator yet");
  if (CHECK) return;
  const email = (await ask("  Your email for signing in to the dashboard: ")).toLowerCase();
  if (!/^[^@\s']+@[^@\s']+\.[^@\s']+$/.test(email)) throw new Error("That doesn't look like an email address.");
  const exists = supabase(["db", "query", "--linked", `select count(*)::int as n from auth.users where lower(email) = '${email}'`], { json: true }).rows?.[0]?.n > 0;
  if (!exists) {
    if (!(await confirm(`Create the account ${email} now, with a password you choose?`))) return;
    const password = await ask("  Password, at least 12 characters (hidden): ", { hidden: true });
    if (password.length < 12) throw new Error("Use at least 12 characters.");
    if ((await ask("  Same password again (hidden): ", { hidden: true })) !== password) throw new Error("The passwords didn't match.");
    const keys = supabase(["projects", "api-keys", "--project-ref", ref, "--reveal"], { json: true });
    const secret = keys.find((k) => k.type === "secret")?.api_key ?? keys.find((k) => k.name === "service_role")?.api_key;
    if (!secret) throw new Error("Couldn't read the project's secret key through the Supabase CLI.");
    const { error } = await createClient(`https://${ref}.supabase.co`, secret, { auth: { persistSession: false, autoRefreshToken: false } }).auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(`Creating the account failed: ${error.message}`);
    ok("Account created, email confirmed");
  }
  execFileSync("node", ["scripts/grant-admin.mjs", email], { stdio: "inherit" });
}

async function signups(ref) {
  step(7, "Public sign-ups");
  const { VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: key } = readEnv();
  if (!url || !key) return todo("Connect the store first (step 4)");
  const disabled = async () => (await (await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })).json()).disable_signup === true;
  if (await disabled()) return ok("Off: nobody can create an account on your store");
  todo("On: anyone could create an account (they still couldn't manage the store)");
  if (CHECK) return;
  console.log(`  Turn off "Allow new users to sign up" here, then save:\n  https://supabase.com/dashboard/project/${ref}/auth/providers`);
  for (let i = 0; i < 3; i++) {
    await ask("  Press Enter when done. ");
    if (await disabled()) return ok("Off");
    todo("Still on. It can take a few seconds to apply.");
  }
}

// --- run ----------------------------------------------------------------------

console.log(bold(CHECK ? "STILLFORM setup check (changes nothing)" : "STILLFORM setup"));
try {
  const projects = await tools();
  const ref = projects && (await project(projects));
  if (ref) {
    await database();
    await connection(ref);
    await checkoutProtection(ref);
    await owner(ref);
    await signups(ref);
    console.log(`\n${bold("Next")}: npm run dev, then sign in at http://localhost:5173/admin. Open checkout in Settings when you're ready.`);
    console.log("Before going public, run npm run preflight (docs/DEPLOY.md).");
  }
} catch (error) {
  console.error(`\n✗ ${error.message}`);
  process.exitCode = 1;
} finally {
  rl?.close();
}
