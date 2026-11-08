// Checks what a public repository of this folder would contain, before you
// push it. Follows .gitignore, then scans every included file for keys,
// project references, personal emails and paths, local configuration and
// oversized files.
//
//   npm run check:public

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const MAX_BYTES = 5 * 1024 * 1024;

// A small .gitignore reader: enough for this project's patterns.
const rules = readFileSync(".gitignore", "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).map((line) => {
  const negate = line.startsWith("!");
  let pattern = negate ? line.slice(1) : line;
  const anchored = pattern.includes("/") && !pattern.endsWith("/") ? true : pattern.slice(0, -1).includes("/");
  pattern = pattern.replace(/\/$/, "");
  const glob = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*");
  return { negate, re: new RegExp(anchored ? `^${glob}(/|$)` : `(^|/)${glob}(/|$)`) };
});
const ignored = (path) => rules.reduce((state, rule) => (rule.re.test(path) ? !rule.negate : state), false);

const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = relative(".", join(dir, entry.name));
    if (path === ".git" || ignored(path)) continue;
    if (entry.isDirectory()) walk(path);
    else files.push(path);
  }
})(".");

const TEXT = /\.(m?[jt]sx?|json|md|sql|toml|css|html|svg|txt|ya?ml|example|gitignore)$|^\.env/;
// Reserved example domains (RFC 2606), plus two placeholders: the Supabase CLI's default in config.toml and a validation test string.
const ALLOWED_EMAIL = /@(([a-z0-9-]+\.)*(example|test|invalid)|example\.(com|org|net))$|^(admin@email\.com|a@b\.co)$/i;
const findings = [];
const flag = (file, what) => findings.push(`${file}: ${what}`);

for (const file of files) {
  const size = statSync(file).size;
  if (size > MAX_BYTES) flag(file, `large file (${(size / 1048576).toFixed(1)} MB)`);
  if (/(^|\/)\.env(?!\.example$)/.test(file)) flag(file, "environment file (only .env.example belongs in the repository)");
  if (!TEXT.test(file) || file === "package-lock.json") continue;
  const text = readFileSync(file, "utf8");
  const scan = (re, what) => {
    for (const match of text.matchAll(re)) flag(file, `${what}: ${match[0].slice(0, 24)}…`);
  };
  scan(/sb_(secret|publishable)_[A-Za-z0-9_-]{10,}/g, "Supabase API key");
  scan(/eyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}/g, "JWT (possibly a legacy anon or service_role key)");
  scan(/0x4AAAA[A-Za-z0-9_-]{6,}/g, "Cloudflare Turnstile key");
  scan(/-----BEGIN [A-Z ]*PRIVATE KEY-----/g, "private key");
  scan(/\b[a-z0-9]{20}\.supabase\.co\b/g, "a specific Supabase project");
  scan(/(\/Users\/|\/home\/)[A-Za-z0-9._-]+\/|C:\\Users\\/g, "personal file path");
  for (const match of text.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) {
    if (!ALLOWED_EMAIL.test(match[0]) && !/@(types|vitejs|tailwindcss|supabase|eslint|playwright|fontsource-variable|fontsource)\b/.test(match[0])) flag(file, `email address: ${match[0]}`);
  }
}

const total = files.reduce((sum, f) => sum + statSync(f).size, 0);
console.log(`${files.length} files, ${(total / 1048576).toFixed(1)} MB would be published.`);
if (findings.length) {
  console.log(`\n✗ ${findings.length} finding(s):`);
  for (const f of findings) console.log(`  ${f}`);
  process.exit(1);
}
console.log("✓ No keys, project references, personal emails or paths, local configuration or oversized files found.");
