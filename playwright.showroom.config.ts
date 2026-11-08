import { defineConfig, devices } from "@playwright/test";

// The public showroom as it ships: the production demo build (npm run
// build:demo), served statically with single-page routing like the hosts.
// Built with stray backend values on purpose, to prove the demo ignores them.
//
//   npm run test:showroom
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;
const BASE = "http://localhost:4350";

export default defineConfig({
  testDir: "e2e",
  testMatch: /showroom\.spec\.ts$/,
  timeout: 60_000,
  reporter: "list",
  use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, baseURL: BASE, launchOptions: { executablePath } },
  webServer: {
    command: "npm run build:demo -- --outDir dist-demo --emptyOutDir && npx vite preview --outDir dist-demo --port 4350 --strictPort",
    url: BASE,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { VITE_SUPABASE_URL: "https://stray-project.supabase.example", VITE_SUPABASE_ANON_KEY: "stray-key", VITE_STUDIO_ENABLED: "true" },
  },
});
