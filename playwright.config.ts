import { defineConfig, devices } from "@playwright/test";

// Run `npx playwright install chromium` once before `npm run test:e2e`.
// PW_CHROMIUM_PATH can point at an existing Chromium build instead.
//
// Projects:
//   desktop, mobile  the storefront in demo mode (no backend)
//   live             the storefront and dashboard against the local test
//                    backend (tests/harness): real Postgres with the real
//                    migrations; Auth and Storage HTTP emulated.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;
const LIVE = "http://localhost:4320";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: true,
  // The rail's physics runs on animation frames; too many parallel browsers starve them.
  workers: 3,
  reporter: "list",
  use: { launchOptions: { executablePath } },
  webServer: [
    { command: "npm run dev -- --port 4317 --strictPort", url: "http://localhost:4317", reuseExistingServer: true },
    // A fresh database for every run.
    { command: "node tests/harness/server.mjs", url: "http://localhost:54321/__harness/health", reuseExistingServer: false, timeout: 120_000 },
    {
      command: "npx vite --port 4320 --strictPort",
      url: LIVE,
      reuseExistingServer: false,
      // Cloudflare's published Turnstile test site key: always passes.
      env: { VITE_SUPABASE_URL: "http://localhost:54321", VITE_SUPABASE_ANON_KEY: "harness-anon-key", VITE_TURNSTILE_SITE_KEY: "1x00000000000000000000AA", VITE_CACHE_DIR: "node_modules/.vite-live" },
    },
  ],
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, baseURL: "http://localhost:4317" }, testIgnore: [/mobile/, /live\//, /showroom/, /demo-dashboard/] },
    { name: "mobile", use: { ...devices["Pixel 7"], baseURL: "http://localhost:4317" }, testMatch: /mobile\.spec/ },
    { name: "live", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, baseURL: LIVE }, testMatch: /live\/.*\.spec/, fullyParallel: false },
  ],
});
