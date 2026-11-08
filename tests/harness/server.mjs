// Local backend for the end-to-end tests. Not for production.
//
// Runs a real Postgres 17 with the real STILLFORM migrations and seed, behind
// a small HTTP server that speaks the parts of the Supabase API this app uses:
//
//   /rest/v1/rpc/<fn>     PostgREST's RPC convention: the request's role (anon
//                         or authenticated) and JWT claims are set on the
//                         connection, then the function is called. Row level
//                         security and the functions' own checks decide.
//   /auth/v1/token        password and refresh-token sign-in (Supabase Auth
//   /auth/v1/user         shapes), with HS256 JWTs.
//   /functions/v1/place-order
//                         the real Edge Function handler (supabase/functions/
//                         place-order/handler.ts), calling this server's RPC
//                         with the server key and Cloudflare's Turnstile test
//                         secret, which Cloudflare verifies for real.
//   /storage/v1/object    uploads and deletes are recorded in storage.objects
//                         as the caller, so the bucket's real RLS policies,
//                         size and type limits apply; files live in a temp dir.
//   /__harness/sql        test-only: run SQL as the database owner.
//
// Everything is emulated except the database: these tests prove the SQL and
// the app, not Supabase's own services.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { createCheckoutHandler } from "../../supabase/functions/place-order/handler.ts";

const PORT = Number(process.env.HARNESS_PORT ?? 54321);
const DB_PORT = Number(process.env.HARNESS_DB_PORT ?? 54329);
export const ANON_KEY = "harness-anon-key";
const SERVER_KEY = "harness-server-key";
// Cloudflare's published test secret: every token from a test site key passes.
const TURNSTILE_SECRET = process.env.HARNESS_TURNSTILE_SECRET ?? "1x0000000000000000000000000000000AA";
const SECRET = "harness-jwt-secret-not-for-production";
const USERS = [
  { email: "admin@stillform.test", password: "studio-pass-1", admin: true },
  { email: "shopper@stillform.test", password: "shopper-pass-1", admin: false },
];

const root = mkdtempSync(join(tmpdir(), "stillform-harness-"));
const files = join(root, "storage");
const postgres = new EmbeddedPostgres({ databaseDir: join(root, "db"), user: "postgres", password: "postgres", port: DB_PORT, persistent: false, onLog: () => {}, onError: () => {} });
await postgres.initialise();
await postgres.start();
const pool = new pg.Pool({ connectionString: `postgres://postgres:postgres@localhost:${DB_PORT}/postgres`, max: 20 });
await pool.query(readFileSync("tests/db/supabase-shim.sql", "utf8"));
await pool.query(readFileSync("supabase/setup.sql", "utf8"));
for (const user of USERS) {
  const { rows } = await pool.query("insert into auth.users (email, encrypted_password) values ($1, extensions.crypt($2, extensions.gen_salt('bf'))) returning id", [user.email, user.password]);
  if (user.admin) await pool.query("insert into public.admins (user_id) values ($1)", [rows[0].id]);
}

// --- JWT ---------------------------------------------------------------------

const b64 = (value) => Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
const sign = (claims) => {
  const body = `${b64({ alg: "HS256", typ: "JWT" })}.${b64(claims)}`;
  return `${body}.${createHmac("sha256", SECRET).update(body).digest("base64url")}`;
};
const verify = (token) => {
  const [head, payload, signature] = token.split(".");
  if (!signature) return null;
  const expected = createHmac("sha256", SECRET).update(`${head}.${payload}`).digest();
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
  return claims.exp * 1000 > Date.now() ? claims : null;
};

function caller(req) {
  if (req.headers.apikey === SERVER_KEY) return { role: "service_role", claims: { role: "service_role" } };
  const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  if (!token || token === ANON_KEY) return { role: "anon", claims: { role: "anon" } };
  const claims = verify(token);
  return claims ? { role: "authenticated", claims } : null;
}

async function asCaller(who, fn) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`set local role ${who.role}`);
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(who.claims)]);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// --- Auth --------------------------------------------------------------------

const refreshTokens = new Map();
function session(user) {
  const now = Math.floor(Date.now() / 1000);
  const access = sign({ sub: user.id, email: user.email, role: "authenticated", aud: "authenticated", iat: now, exp: now + 3600 });
  const refresh = randomBytes(24).toString("hex");
  refreshTokens.set(refresh, user.id);
  return { access_token: access, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: refresh, user: userJson(user) };
}
const userJson = (user) => ({ id: user.id, aud: "authenticated", role: "authenticated", email: user.email, email_confirmed_at: user.created_at, app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {}, identities: [], created_at: user.created_at, updated_at: user.created_at });

// --- HTTP --------------------------------------------------------------------

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(body === undefined ? "" : JSON.stringify(body));
};
const read = (req) => new Promise((resolve) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => resolve(Buffer.concat(chunks)));
});

const returnTypes = new Map();
async function returnType(fn) {
  if (!returnTypes.has(fn)) {
    const { rows } = await pool.query("select prorettype::regtype::text as t from pg_proc where proname = $1 and pronamespace = 'public'::regnamespace limit 1", [fn]);
    returnTypes.set(fn, rows[0]?.t ?? null);
  }
  return returnTypes.get(fn);
}

function pgError(res, error, role) {
  const status = error.code === "42501" ? (role === "anon" ? 401 : 403) : error.code === "42883" ? 404 : error.code?.startsWith("P0") || error.code?.startsWith("22") || error.code?.startsWith("23") ? 400 : 500;
  send(res, status, { code: error.code, message: error.message, details: error.detail ?? null, hint: error.hint ?? null });
}

const checkout = createCheckoutHandler({ supabaseUrl: `http://localhost:${PORT}`, serverKey: SERVER_KEY, turnstileSecret: TURNSTILE_SECRET, allowTestKeys: true });

const server = createServer(async (req, res) => {
  res.setHeader("access-control-allow-origin", req.headers.origin ?? "*");
  res.setHeader("access-control-allow-headers", "authorization, apikey, content-type, x-client-info, x-upsert, cache-control, prefer, accept-profile, content-profile, x-supabase-api-version");
  res.setHeader("access-control-allow-methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("access-control-expose-headers", "content-range");
  if (req.method === "OPTIONS") return send(res, 204);
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = decodeURIComponent(url.pathname);

  try {
    // PostgREST RPC
    const rpc = path.match(/^\/rest\/v1\/rpc\/([a-z_][a-z0-9_]*)$/);
    if (rpc && req.method === "POST") {
      const who = caller(req);
      if (!who) return send(res, 401, { code: "PGRST301", message: "JWT expired or invalid" });
      const fn = rpc[1];
      const type = await returnType(fn);
      if (!type) return send(res, 404, { code: "PGRST202", message: `Could not find the function public.${fn}` });
      const raw = (await read(req)).toString();
      const args = raw ? JSON.parse(raw) : {};
      const names = Object.keys(args).filter((n) => /^[a-z_][a-z0-9_]*$/.test(n));
      const values = names.map((n) => (args[n] !== null && typeof args[n] === "object" ? JSON.stringify(args[n]) : args[n]));
      const call = `public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(", ")})`;
      try {
        const value = await asCaller(who, async (client) => {
          if (type === "void") {
            await client.query(`select ${call}`, values);
            return null;
          }
          return (await client.query(`select to_jsonb(${call}) as v`, values)).rows[0].v;
        });
        return value === null ? send(res, 204) : send(res, 200, value);
      } catch (error) {
        return pgError(res, error, who.role);
      }
    }

    // Edge Function
    if (path === "/functions/v1/place-order") {
      const body = req.method === "POST" ? await read(req) : undefined;
      const request = new Request(`http://localhost:${PORT}${req.url}`, { method: req.method, headers: { "content-type": "application/json", "x-forwarded-for": req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "unknown" }, body });
      const response = await checkout(request);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      return res.end(Buffer.from(await response.arrayBuffer()));
    }

    // Auth
    if (path === "/auth/v1/token" && req.method === "POST") {
      const body = JSON.parse((await read(req)).toString() || "{}");
      if (url.searchParams.get("grant_type") === "password") {
        const { rows } = await pool.query("select id, email, created_at from auth.users where email = lower($1) and encrypted_password = extensions.crypt($2, encrypted_password)", [body.email ?? "", body.password ?? ""]);
        if (!rows[0]) return send(res, 400, { code: "invalid_credentials", error: "invalid_grant", error_description: "Invalid login credentials", msg: "Invalid login credentials" });
        return send(res, 200, session(rows[0]));
      }
      if (url.searchParams.get("grant_type") === "refresh_token") {
        const id = refreshTokens.get(body.refresh_token);
        if (!id) return send(res, 400, { code: "refresh_token_not_found", error: "invalid_grant", error_description: "Invalid Refresh Token", msg: "Invalid Refresh Token" });
        refreshTokens.delete(body.refresh_token);
        const { rows } = await pool.query("select id, email, created_at from auth.users where id = $1", [id]);
        return send(res, 200, session(rows[0]));
      }
      return send(res, 400, { error: "unsupported_grant_type" });
    }
    if (path === "/auth/v1/user" && req.method === "GET") {
      const who = caller(req);
      if (!who || who.role !== "authenticated") return send(res, 401, { code: "bad_jwt", msg: "invalid JWT" });
      const { rows } = await pool.query("select id, email, created_at from auth.users where id = $1", [who.claims.sub]);
      return send(res, 200, userJson(rows[0]));
    }
    if (path === "/auth/v1/logout" && req.method === "POST") return send(res, 204);

    // Storage: public files
    const pub = path.match(/^\/storage\/v1\/object\/public\/([a-z0-9-]+)\/(.+)$/);
    if (pub && req.method === "GET") {
      const { rows } = await pool.query("select o.metadata from storage.objects o join storage.buckets b on b.id = o.bucket_id where b.public and o.bucket_id = $1 and o.name = $2", [pub[1], pub[2]]);
      const file = join(files, pub[1], pub[2]);
      if (!rows[0] || !existsSync(file)) return send(res, 404, { statusCode: "404", error: "not_found", message: "Object not found" });
      res.writeHead(200, { "content-type": rows[0].metadata?.mimetype ?? "application/octet-stream", "cache-control": rows[0].metadata?.cacheControl ?? "no-cache" });
      return res.end(readFileSync(file));
    }

    // Storage: upload
    const obj = path.match(/^\/storage\/v1\/object\/([a-z0-9-]+)\/(.+)$/);
    if (obj && (req.method === "POST" || req.method === "PUT")) {
      const who = caller(req);
      if (!who) return send(res, 401, { statusCode: "401", error: "Unauthorized", message: "Invalid JWT" });
      const [, bucket, name] = obj;
      const body = await read(req);
      const type = (req.headers["content-type"] ?? "").split(";")[0];
      const { rows: [b] } = await pool.query("select * from storage.buckets where id = $1", [bucket]);
      if (!b) return send(res, 404, { statusCode: "404", error: "Bucket not found", message: "Bucket not found" });
      if (b.file_size_limit && body.length > Number(b.file_size_limit)) return send(res, 413, { statusCode: "413", error: "Payload too large", message: "The object exceeded the maximum allowed size" });
      if (b.allowed_mime_types && !b.allowed_mime_types.includes(type)) return send(res, 415, { statusCode: "415", error: "invalid_mime_type", message: `mime type ${type} is not supported` });
      const upsert = req.headers["x-upsert"] === "true" || req.method === "PUT";
      try {
        const metadata = { mimetype: type, size: body.length, cacheControl: req.headers["cache-control"] ?? null };
        const id = await asCaller(who, async (client) => {
          const sql = upsert
            ? "insert into storage.objects (bucket_id, name, owner, metadata) values ($1, $2, auth.uid(), $3) on conflict (bucket_id, name) do update set metadata = excluded.metadata, updated_at = now() returning id"
            : "insert into storage.objects (bucket_id, name, owner, metadata) values ($1, $2, auth.uid(), $3) returning id";
          return (await client.query(sql, [bucket, name, metadata])).rows[0].id;
        });
        const file = join(files, bucket, name);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, body);
        return send(res, 200, { Id: id, Key: `${bucket}/${name}` });
      } catch (error) {
        if (error.code === "42501") return send(res, 403, { statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" });
        if (error.code === "23505") return send(res, 409, { statusCode: "409", error: "Duplicate", message: "The resource already exists" });
        return send(res, 400, { statusCode: "400", error: "error", message: error.message });
      }
    }

    // Storage: delete
    const del = path.match(/^\/storage\/v1\/object\/([a-z0-9-]+)$/);
    if (del && req.method === "DELETE") {
      const who = caller(req);
      if (!who) return send(res, 401, { statusCode: "401", error: "Unauthorized", message: "Invalid JWT" });
      const { prefixes = [] } = JSON.parse((await read(req)).toString() || "{}");
      const removed = await asCaller(who, async (client) => (await client.query("delete from storage.objects where bucket_id = $1 and name = any($2) returning name, id", [del[1], prefixes])).rows);
      for (const row of removed) rmSync(join(files, del[1], row.name), { force: true });
      return send(res, 200, removed.map((row) => ({ name: row.name, id: row.id, bucket_id: del[1] })));
    }

    // Test control
    if (path === "/__harness/sql" && req.method === "POST") {
      const { sql, params = [] } = JSON.parse((await read(req)).toString());
      try {
        return send(res, 200, (await pool.query(sql, params)).rows);
      } catch (error) {
        return send(res, 400, { message: error.message, detail: error.detail });
      }
    }
    if (path === "/__harness/health") return send(res, 200, { ok: true });

    send(res, 404, { message: `No route for ${req.method} ${path}` });
  } catch (error) {
    send(res, 500, { message: error.message });
  }
});

server.listen(PORT, () => console.log(`STILLFORM test backend on http://localhost:${PORT} (Postgres ${DB_PORT}); users: ${USERS.map((u) => u.email).join(", ")}`));

async function shutdown() {
  server.close();
  await pool.end().catch(() => {});
  await postgres.stop().catch(() => {});
  rmSync(root, { recursive: true, force: true });
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
