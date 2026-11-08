import { defineConfig, devices } from "@playwright/test";

// Browser walkthrough against the real Supabase project in .env.local.
//
//   npx playwright test --config playwright.remote.config.ts
//
// Needs the test accounts from tests/remote/create-test-users.mjs and a
// project linked with `npx supabase link`. It writes to that project: one
// test product (left unpublished and off the rail), its photos, and test
// orders (cancelled, stock returned). Never point it at a store with customers.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;
const BASE = "http://localhost:4330";
// One name per run, shared by every worker, so a rerun never collides.
process.env.STILLFORM_REMOTE_RUN ??= Date.now().toString(36).slice(-5);

export default defineConfig({
  testDir: "tests/remote",
  testMatch: /\.spec\.ts$/,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: "list",
  use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, baseURL: BASE, launchOptions: { executablePath } },
  // Vite reads VITE_SUPABASE_URL and the publishable key from .env.local.
  // The Turnstile site key must pair with the TURNSTILE_SECRET_KEY set on the
  // project. Cloudflare's always-pass test key is the default here; it only
  // works while the project uses Cloudflare's test secret.
  webServer: {
    command: "npx vite --port 4330 --strictPort",
    url: BASE,
    reuseExistingServer: false,
    env: { VITE_CACHE_DIR: "node_modules/.vite-remote", VITE_TURNSTILE_SITE_KEY: process.env.STILLFORM_REMOTE_TURNSTILE_SITE_KEY ?? "1x00000000000000000000AA" },
  },
});
