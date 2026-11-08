// Makes an existing Supabase user a store administrator.
//
//   npm run admin:grant -- you@example.com
//
// Runs one statement on the project linked with `npx supabase link`, through
// the Supabase CLI (which uses your Supabase login, not an API key). The user
// must already exist: create them in Authentication → Users first. Nothing is
// written to the migrations, so no personal id ends up in reusable code.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!/^[^@\s']+@[^@\s']+\.[^@\s']+$/.test(email)) {
  console.error("Usage: npm run admin:grant -- you@example.com");
  process.exit(1);
}

let ref;
try {
  ref = readFileSync("supabase/.temp/project-ref", "utf8").trim();
} catch {
  console.error("No linked project. Run: npx supabase link --project-ref <your-project-ref>");
  process.exit(1);
}

const sql = `with target as (select id from auth.users where lower(email) = '${email}'),
granted as (insert into public.admins (user_id, note) select id, 'granted with scripts/grant-admin.mjs' from target on conflict (user_id) do nothing returning user_id)
select (select count(*) from target) as found, (select count(*) from granted) as added`;

const output = execFileSync("npx", ["supabase", "db", "query", "--linked", "-o", "json", sql], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const parsed = JSON.parse(output);
const row = (parsed.rows ?? parsed.result ?? parsed)[0] ?? {};
const masked = email.replace(/^(.).*(@.*)$/, "$1…$2");

if (Number(row.found) === 0) {
  console.error(`No user ${masked} in project ${ref}. Create them in Authentication → Users, then run this again.`);
  process.exit(1);
}
console.log(Number(row.added) === 1 ? `${masked} is now an administrator of project ${ref}.` : `${masked} was already an administrator of project ${ref}.`);
