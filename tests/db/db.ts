import { randomUUID } from "node:crypto";
import pg from "pg";
import { inject } from "vitest";

// Runs SQL the way PostgREST does for an API request: inside a transaction,
// as the anon, authenticated or service_role role, with the caller's JWT
// claims set. service_role is the place-order Edge Function.

export const pool = new pg.Pool({ connectionString: inject("dbUrl"), max: 20 });

export type Caller = { role: "anon" } | { role: "service_role" } | { role: "authenticated"; sub: string };
export const anon: Caller = { role: "anon" };
/** The place-order Edge Function, the only caller allowed to place orders. */
export const server: Caller = { role: "service_role" };

export async function as<T = Record<string, unknown>>(caller: Caller, sql: string, params: unknown[] = []): Promise<T[]> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`set local role ${caller.role}`);
    const claims = caller.role === "authenticated" ? { role: "authenticated", sub: caller.sub, aud: "authenticated" } : { role: caller.role };
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    const result = await client.query(sql, params);
    await client.query("commit");
    return result.rows as T[];
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/** Calls an RPC and returns its single value, like supabase.rpc(). */
export async function rpc<T = unknown>(caller: Caller, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const names = Object.keys(args);
  const sql = `select public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(", ")}) as value`;
  const values = names.map((n) => {
    const v = args[n];
    return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
  });
  const rows = await as<{ value: T }>(caller, sql, values);
  return rows[0]!.value;
}

/** Runs SQL as the database owner (the Supabase SQL editor). */
export async function owner<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await pool.query(sql, params)).rows as T[];
}

export async function createUser(email: string, admin = false): Promise<Caller & { role: "authenticated" }> {
  const id = randomUUID();
  await owner("insert into auth.users (id, email) values ($1, $2)", [id, email]);
  if (admin) await owner("insert into public.admins (user_id) values ($1)", [id]);
  return { role: "authenticated", sub: id };
}

export async function expectError(promise: Promise<unknown>, message: string | RegExp) {
  try {
    await promise;
  } catch (error) {
    const text = (error as Error).message;
    if (typeof message === "string" ? text.includes(message) : message.test(text)) return error as Error & { detail?: string; code?: string };
    throw new Error(`Expected error matching ${message}, got: ${text}`, { cause: error });
  }
  throw new Error(`Expected error matching ${message}, but the call succeeded`);
}

export async function enableCheckout() {
  await owner(`update public.store_settings set checkout = jsonb_set(checkout, '{enabled}', 'true') where id`);
}

export function orderPayload(items: { sku: string; quantity: number; price?: number }[], extra: Record<string, unknown> = {}) {
  return {
    paymentMethod: "cod",
    contact: { email: "ada@example.com", name: "Ada Lovelace", phone: "+44 20 7946 0000" },
    address: { line1: "12 Plaster Row", city: "London", postalCode: "E1 6AN", country: "United Kingdom" },
    items,
    ...extra,
  };
}

export const stock = async (sku: string) => Number((await owner<{ stock: number }>("select stock from public.variants where sku = $1", [sku]))[0]?.stock);
