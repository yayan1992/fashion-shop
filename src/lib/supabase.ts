import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// The browser only ever holds the public (anon / publishable) key. Every
// permission is decided by the database: row level security and the
// functions in supabase/migrations. Never put a service-role key here.

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;

export const supabase: SupabaseClient | null = url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } }) : null;

/** True when the store runs against Supabase; false in demo mode. */
export const backendConfigured = supabase !== null;

export const MEDIA_BUCKET = "media";

export class BackendError extends Error {
  readonly code?: string;
  readonly detail?: string;
  constructor(error: { message: string; code?: string; details?: string | null; hint?: string | null }) {
    super(error.message);
    this.name = "BackendError";
    this.code = error.code;
    this.detail = error.details ?? undefined;
  }
}

/** Calls a database function and returns its result, throwing a BackendError on failure. */
export async function call<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new BackendError({ message: "backend_not_configured" });
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new BackendError(error);
  return data as T;
}

/** Calls an Edge Function and returns its result, throwing a BackendError on failure. */
export async function invoke<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new BackendError({ message: "backend_not_configured" });
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (!error) return data as T;
  // Our functions answer errors in PostgREST's shape; anything else is a network problem.
  const response = (error as { context?: unknown }).context;
  const detail = response instanceof Response ? await response.json().catch(() => null) : null;
  throw detail && typeof detail.message === "string" ? new BackendError(detail) : error;
}
