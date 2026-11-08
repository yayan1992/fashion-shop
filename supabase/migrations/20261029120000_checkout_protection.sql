-- STILLFORM · Checkout protection
--
-- Orders no longer come straight from the browser. The place-order Edge
-- Function (supabase/functions/place-order) receives the checkout, checks
-- this throttle, verifies a Cloudflare Turnstile token with Cloudflare, and
-- only then calls place_order() with the server's own key. place_order()
-- itself is unchanged: it still validates, prices and reserves stock in one
-- transaction.
--
--   anon, authenticated   may no longer call place_order() at all, so the
--                         protection can't be skipped by calling the API
--   service_role          (the Edge Function) calls checkout_allow() and
--                         place_order()
--
-- Safe to run again.

-- ---------------------------------------------------------------------------
-- Attempts per connection, kept for a day. The function stores a keyed hash
-- of the visitor's IP address, never the address itself.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to service_role;

create table if not exists private.checkout_attempts (
  client text not null check (char_length(client) between 1 and 128),
  attempted_at timestamptz not null default now()
);
create index if not exists checkout_attempts_client_idx on private.checkout_attempts (client, attempted_at);
create index if not exists checkout_attempts_time_idx on private.checkout_attempts (attempted_at);
alter table private.checkout_attempts enable row level security;
revoke all on table private.checkout_attempts from public, anon, authenticated;
grant select, insert, delete on table private.checkout_attempts to service_role;

-- Records an attempt and says whether it may go ahead: at most 5 attempts in
-- 10 minutes and 20 in a day from one connection. Failed attempts count too.
create or replace function public.checkout_allow(p_client text)
returns boolean
language plpgsql
volatile
set search_path = ''
as $$
declare
  recent integer;
  today integer;
begin
  if p_client is null or char_length(p_client) not between 1 and 128 then
    raise exception 'invalid_client';
  end if;
  -- One decision at a time per connection, so parallel requests can't slip through together.
  perform pg_advisory_xact_lock(hashtext('stillform.checkout:' || p_client));
  delete from private.checkout_attempts where attempted_at < now() - interval '1 day';
  select count(*) filter (where attempted_at > now() - interval '10 minutes'), count(*)
    into recent, today
    from private.checkout_attempts
   where client = p_client;
  if recent >= 5 or today >= 20 then
    return false;
  end if;
  insert into private.checkout_attempts (client) values (p_client);
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Who may call what

grant usage on schema public to service_role;

revoke all on function public.checkout_allow(text) from public, anon, authenticated;
grant execute on function public.checkout_allow(text) to service_role;

revoke all on function public.place_order(jsonb) from public, anon, authenticated;
grant execute on function public.place_order(jsonb) to service_role;
