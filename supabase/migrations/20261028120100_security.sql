-- STILLFORM · access control
--
-- Administrators are listed in public.admins, which only a database owner can
-- change (SQL editor or service role); there is no way to grant admin from the
-- browser. Every table has row level security. Visitors can read published
-- storefront content only; orders, customer details and private settings are
-- readable by administrators only, and are never written directly by clients:
-- orders go through public.place_order(), admin changes through admin_* functions.

create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- True when a media row is used by something a visitor can see.
create or replace function public.media_is_public(p_media_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.colorway_media cm
      join public.products p on p.id = cm.product_id
     where cm.media_id = p_media_id and p.status = 'active'
  ) or exists (
    select 1 from public.looks l
      join public.lookbook_spreads s on s.id = l.spread_id
      join public.lookbooks b on b.id = s.lookbook_id
     where l.media_id = p_media_id and l.published and s.published and b.published
  ) or exists (
    select 1 from public.store_settings st where st.home #>> '{statement,mediaId}' = p_media_id
  );
$$;

revoke all on function public.media_is_public(text) from public;
grant execute on function public.media_is_public(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row level security

alter table public.media enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.colorways enable row level security;
alter table public.colorway_media enable row level security;
alter table public.variants enable row level security;
alter table public.collections enable row level security;
alter table public.collection_products enable row level security;
alter table public.rail_placements enable row level security;
alter table public.featured_products enable row level security;
alter table public.product_pairings enable row level security;
alter table public.lookbooks enable row level security;
alter table public.lookbook_spreads enable row level security;
alter table public.looks enable row level security;
alter table public.look_pieces enable row level security;
alter table public.store_settings enable row level security;
alter table public.store_private_settings enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;
alter table public.admins enable row level security;

-- Administrators manage the whole catalogue and editorial content.
do $$
declare
  t text;
begin
  foreach t in array array[
    'media', 'categories', 'products', 'colorways', 'colorway_media', 'variants', 'collections',
    'collection_products', 'rail_placements', 'featured_products', 'product_pairings', 'lookbooks',
    'lookbook_spreads', 'looks', 'look_pieces'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
      t || '_admin_all', t
    );
  end loop;
end;
$$;

-- Visitors read only what is published.
drop policy if exists categories_public_read on public.categories;
create policy categories_public_read on public.categories for select to anon, authenticated using (true);

drop policy if exists products_public_read on public.products;
create policy products_public_read on public.products for select to anon, authenticated
  using (status = 'active');

drop policy if exists colorways_public_read on public.colorways;
create policy colorways_public_read on public.colorways for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.status = 'active'));

drop policy if exists colorway_media_public_read on public.colorway_media;
create policy colorway_media_public_read on public.colorway_media for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.status = 'active'));

drop policy if exists variants_public_read on public.variants;
create policy variants_public_read on public.variants for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.status = 'active'));

drop policy if exists media_public_read on public.media;
create policy media_public_read on public.media for select to anon, authenticated
  using (public.media_is_public(id));

drop policy if exists collections_public_read on public.collections;
create policy collections_public_read on public.collections for select to anon, authenticated
  using (published);

drop policy if exists collection_products_public_read on public.collection_products;
create policy collection_products_public_read on public.collection_products for select to anon, authenticated
  using (
    exists (select 1 from public.collections c where c.id = collection_id and c.published)
    and exists (select 1 from public.products p where p.id = product_id and p.status = 'active')
  );

drop policy if exists rail_placements_public_read on public.rail_placements;
create policy rail_placements_public_read on public.rail_placements for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.status = 'active'));

drop policy if exists featured_products_public_read on public.featured_products;
create policy featured_products_public_read on public.featured_products for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.status = 'active'));

drop policy if exists product_pairings_public_read on public.product_pairings;
create policy product_pairings_public_read on public.product_pairings for select to anon, authenticated
  using (
    exists (select 1 from public.products p where p.id = product_id and p.status = 'active')
    and exists (select 1 from public.products p where p.id = paired_product_id and p.status = 'active')
  );

drop policy if exists lookbooks_public_read on public.lookbooks;
create policy lookbooks_public_read on public.lookbooks for select to anon, authenticated
  using (published);

drop policy if exists lookbook_spreads_public_read on public.lookbook_spreads;
create policy lookbook_spreads_public_read on public.lookbook_spreads for select to anon, authenticated
  using (published and exists (select 1 from public.lookbooks b where b.id = lookbook_id and b.published));

drop policy if exists looks_public_read on public.looks;
create policy looks_public_read on public.looks for select to anon, authenticated
  using (
    published and exists (
      select 1 from public.lookbook_spreads s join public.lookbooks b on b.id = s.lookbook_id
       where s.id = spread_id and s.published and b.published
    )
  );

drop policy if exists look_pieces_public_read on public.look_pieces;
create policy look_pieces_public_read on public.look_pieces for select to anon, authenticated
  using (
    exists (select 1 from public.products p where p.id = product_id and p.status = 'active')
    and exists (select 1 from public.looks l where l.id = look_id and l.published)
  );

-- Public settings: readable by everyone, editable by administrators.
drop policy if exists store_settings_public_read on public.store_settings;
create policy store_settings_public_read on public.store_settings for select to anon, authenticated using (true);
drop policy if exists store_settings_admin_update on public.store_settings;
create policy store_settings_admin_update on public.store_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Private settings: administrators only.
drop policy if exists store_private_settings_admin_read on public.store_private_settings;
create policy store_private_settings_admin_read on public.store_private_settings for select to authenticated
  using (public.is_admin());
drop policy if exists store_private_settings_admin_update on public.store_private_settings;
create policy store_private_settings_admin_update on public.store_private_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Orders: administrators read; nobody writes directly.
drop policy if exists orders_admin_read on public.orders;
create policy orders_admin_read on public.orders for select to authenticated using (public.is_admin());
drop policy if exists order_items_admin_read on public.order_items;
create policy order_items_admin_read on public.order_items for select to authenticated using (public.is_admin());
drop policy if exists order_events_admin_read on public.order_events;
create policy order_events_admin_read on public.order_events for select to authenticated using (public.is_admin());

-- A signed-in user can see whether they themselves are an administrator.
drop policy if exists admins_self_read on public.admins;
create policy admins_self_read on public.admins for select to authenticated using (user_id = auth.uid());

-- Belt and braces: remove direct write privileges where no client should write.
revoke insert, update, delete, truncate on public.orders, public.order_items, public.order_events, public.admins from anon, authenticated;
revoke all on public.store_private_settings from anon;
revoke insert, delete, truncate on public.store_settings, public.store_private_settings from anon, authenticated;
revoke usage on sequence public.order_number_seq from anon, authenticated;
