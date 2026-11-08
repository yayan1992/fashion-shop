import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import type { TestProject } from "vitest/node";

// Starts a throwaway Postgres 17, loads the Supabase stand-in and the real
// STILLFORM setup script (migrations + seed), and hands its URL to the tests.

declare module "vitest" {
  export interface ProvidedContext {
    dbUrl: string;
  }
}

export default async function setup(project: TestProject) {
  const dir = mkdtempSync(join(tmpdir(), "stillform-db-"));
  const port = 55000 + Math.floor(Math.random() * 2000);
  const pg = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "postgres", port, persistent: false, onLog: () => {}, onError: () => {} });
  await pg.initialise();
  await pg.start();
  const client = pg.getPgClient();
  await client.connect();
  await client.query(readFileSync("tests/db/supabase-shim.sql", "utf8"));
  await client.query(readFileSync("supabase/setup.sql", "utf8"));
  await client.end();
  project.provide("dbUrl", `postgres://postgres:postgres@localhost:${port}/postgres`);
  return async () => {
    await pg.stop();
    rmSync(dir, { recursive: true, force: true });
  };
}
