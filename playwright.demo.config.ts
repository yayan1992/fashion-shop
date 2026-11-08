import { defineConfig, devices } from "@playwright/test";

// The Demo Studio as it ships: the production demo build, served statically
// with single-page routing, on desktop and a phone. Built with stray backend
// values on purpose, to prove the demo ignores them.
//
//   npm run test:demo
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;
const BASE = "http://localhost:4351";

export default defineConfig({
  testDir: "e2e",
  testMatch: /demo-dashboard\.spec\.ts$/,
  timeout: 60_000,
  reporter: "list",
  use: { baseURL: BASE, launchOptions: { executablePath } },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run build:demo -- --outDir dist-demo --emptyOutDir && npx vite preview --outDir dist-demo --port 4351 --strictPort",
    url: BASE,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { VITE_SUPABASE_URL: "https://stray-project.supabase.example", VITE_SUPABASE_ANON_KEY: "stray-key", VITE_STUDIO_ENABLED: "true" },
  },
});
