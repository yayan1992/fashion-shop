import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { loadEnv, type Plugin } from "vite";
import { defineConfig } from "vitest/config";

// Cloudflare's published Turnstile test site keys pass every visitor.
const TURNSTILE_TEST_SITE_KEY = /^[0-9]x0{20}[A-F]{2}$/;

/** Stops a production build that would take orders behind test protection. */
function launchGuard(): Plugin {
  return {
    name: "stillform-launch-guard",
    apply: "build",
    configResolved({ mode, envDir, logger }) {
      if (mode === "demo") return;
      const env = loadEnv(mode, envDir || process.cwd(), "VITE_");
      const siteKey = env.VITE_TURNSTILE_SITE_KEY ?? "";
      if (TURNSTILE_TEST_SITE_KEY.test(siteKey)) {
        throw new Error("VITE_TURNSTILE_SITE_KEY is one of Cloudflare's test keys, which let anyone through. Use your own widget's site key for a production build (docs/DEPLOY.md).");
      }
      if (env.VITE_SUPABASE_URL && !siteKey) {
        logger.warn("\nVITE_TURNSTILE_SITE_KEY is not set: this build can show the store, but checkout will refuse orders.\n");
      }
    },
  };
}

// `vite build --mode demo` (npm run build:demo) is the public showroom: the
// built-in demo collection, the bag, no checkout and no Studio. It reads no
// .env files and blanks every backend setting, so stray Supabase or Turnstile
// values on a host or in .env.local can never connect it to a database.
const SHOWROOM = {
  "import.meta.env.VITE_SUPABASE_URL": '""',
  "import.meta.env.VITE_SUPABASE_ANON_KEY": '""',
  "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": '""',
  "import.meta.env.VITE_TURNSTILE_SITE_KEY": '""',
  "import.meta.env.VITE_STUDIO_ENABLED": '"false"',
  // The simulated Studio at /demo/admin exists only in this build.
  __DEMO_DASHBOARD__: "true",
};

// Every other build and the dev server fold the demo away: the flag is
// replaced by a literal, so the demo's code is dead and never bundled.
const NO_DEMO = { __DEMO_DASHBOARD__: "false" };

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), launchGuard()],
  envDir: mode === "demo" ? false : undefined,
  define: mode === "demo" ? SHOWROOM : NO_DEMO,
  // Lets two dev servers (demo and live-backend tests) run side by side.
  cacheDir: process.env.VITE_CACHE_DIR ?? "node_modules/.vite",
  test: { include: ["src/**/*.test.ts"] },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
}));
