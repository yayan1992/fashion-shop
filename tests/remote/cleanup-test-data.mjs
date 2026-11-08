// Removes what the remote tests created in the linked test project, and
// nothing else:
//
//   products      web address test-tee-<run> (with their colours, sizes, stock
//                 and rail places)
//   images        uploads whose alt text starts with "Test Tee" and that no
//                 other product, look or setting uses, plus their stored files
//   orders        cancelled orders from the tests' fictional addresses
//                 (ada.test@example.com, api.test@example.com)
//   accounts      the two test accounts in .env.test.local, if they are the
//                 generated stillform-…-test@example.com ones
//
//   node tests/remote/cleanup-test-data.mjs            preview only (default)
//   node tests/remote/cleanup-test-data.mjs --apply    delete
//
// Uses your Supabase login through the CLI. The secret key needed to delete
// files and accounts is held in memory only, never printed or saved.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const TEST_EMAILS = ["ada.test@example.com", "api.test@example.com"];
const apply = process.argv.includes("--apply");

const read = (file) => {
  try {
    return Object.fromEntries(readFileSync(file, "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
  } catch {
    return {};
  }
};
const { VITE_SUPABASE_URL: url } = read(".env.local");
const accounts = read(".env.test.local");
// The test project, named explicitly in .env.test.local so this never runs against a real store.
const PROJECT = accounts.STILLFORM_TEST_PROJECT_REF ?? "";
const ref = readFileSync("supabase/.temp/project-ref", "utf8").trim();
if (!/^[a-z0-9]{20}$/.test(PROJECT)) throw new Error("Set STILLFORM_TEST_PROJECT_REF in .env.test.local to your test project's ref.");
if (ref !== PROJECT || new URL(url).host !== `${PROJECT}.supabase.co`) throw new Error(`This cleanup only runs against ${PROJECT}; linked: ${ref}, .env.local: ${url}`);

const sql = (query) => JSON.parse(execFileSync("npx", ["supabase", "db", "query", "--linked", "-o", "json", query], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })).rows;
const list = (values) => values.map((v) => `'${v.replace(/'/g, "''")}'`).join(", ") || "null";

const testUsers = [accounts.STILLFORM_TEST_ADMIN_EMAIL, accounts.STILLFORM_TEST_SHOPPER_EMAIL].filter((e) => /^stillform-(admin|shopper)-test@example\.com$/.test(e ?? ""));

const products = sql("select id, name, status from public.products where slug ~ '^test-tee-[a-z0-9]+$' order by id");
const productIds = products.map((p) => p.id);
const media = sql(`
  select m.id, m.storage_path from public.media m
   where m.id like 'upload-%' and m.alt like 'Test Tee %' and m.storage_path is not null
     and not exists (select 1 from public.colorway_media cm where cm.media_id = m.id and cm.product_id not in (${list(productIds)}))
     and not exists (select 1 from public.looks l where l.media_id = m.id)
     and not exists (select 1 from public.store_settings s where s.home #>> '{statement,mediaId}' = m.id)`);
const orders = sql(`select reference, status from public.orders where email in (${list(TEST_EMAILS)}) and status = 'cancelled' order by reference`);
const users = testUsers.length ? sql(`select id, email from auth.users where email in (${list(testUsers)})`) : [];

console.log(`Project ${PROJECT}${apply ? "" : " (preview: nothing will be changed)"}`);
console.log(`  products  ${products.map((p) => `${p.id} (${p.status})`).join(", ") || "none"}`);
console.log(`  images    ${media.map((m) => m.storage_path).join(", ") || "none"}`);
console.log(`  orders    ${orders.map((o) => o.reference).join(", ") || "none"}`);
console.log(`  accounts  ${users.map((u) => u.email).join(", ") || "none"}`);
if (!apply) {
  console.log("\nRun again with --apply to delete exactly these.");
  process.exit(0);
}

const keys = JSON.parse(execFileSync("npx", ["supabase", "projects", "api-keys", "--project-ref", PROJECT, "--reveal", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
const secret = keys.find((k) => k.type === "secret")?.api_key;
if (!secret?.startsWith("sb_secret_")) throw new Error("Could not read the project's secret key through the Supabase CLI.");
const server = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

// Rows first, in one transaction, so nothing ever points at a missing file.
if (products.length || media.length || orders.length) {
  sql(`do $$ begin
    delete from public.orders where reference in (${list(orders.map((o) => o.reference))}) and status = 'cancelled';
    delete from public.products where id in (${list(productIds)});
    delete from public.media where id in (${list(media.map((m) => m.id))});
  end $$`);
}
if (media.length) {
  const { error } = await server.storage.from("media").remove(media.map((m) => m.storage_path));
  if (error) throw new Error(`Rows deleted, but removing the files failed: ${error.message}`);
}
for (const user of users) {
  const { error } = await server.auth.admin.deleteUser(user.id);
  if (error) throw new Error(`Deleting ${user.email} failed: ${error.message}`);
}
if (users.length) {
  writeFileSync(".env.test.local", `# STILLFORM test project and accounts for tests/remote. Gitignored; never commit.\n# Throwaway passwords only.\nSTILLFORM_TEST_PROJECT_REF=${PROJECT}\nSTILLFORM_TEST_ADMIN_EMAIL=\nSTILLFORM_TEST_ADMIN_PASSWORD=\nSTILLFORM_TEST_SHOPPER_EMAIL=\nSTILLFORM_TEST_SHOPPER_PASSWORD=\n`, { mode: 0o600 });
}
console.log("\nDeleted. The store's own catalogue, settings and other orders were not touched.");
