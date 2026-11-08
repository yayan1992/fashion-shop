import { defineConfig } from "vitest/config";

// Database tests: the real migrations, row level security and checkout
// functions, run against a throwaway Postgres 17 (embedded-postgres).
export default defineConfig({
  test: {
    include: ["tests/db/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/db/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
