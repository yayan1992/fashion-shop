-- STILLFORM · core schema
--
-- Catalogue, editorial content, store settings and orders. Every statement is
-- safe to run again on a database that already has it, so the bundled
-- supabase/setup.sql can be re-run without harm.

-- ---------------------------------------------------------------------------
-- Shared helpers

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Media library: every image the store shows, wherever it is hosted.

create table if not exists public.media (
  id text primary key,
  -- Absolute URL (Supabase Storage) or a path served by the site itself (/media/...).
  src text not null check (char_length(src) between 1 and 2048),
  -- Object path in the "media" bucket when the file was uploaded from the dashboard.
  storage_path text,
  alt text not null default '' check (char_length(alt) <= 500),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  origin text not null default 'uploaded' check (origin in ('supplied', 'supplied-retouched', 'generated', 'uploaded')),
  replace_note text,
  -- Smaller copies for srcset: [{ "width": 640, "src": "..." }, …], widest last.
  variants jsonb not null default '[]'::jsonb check (jsonb_typeof(variants) = 'array'),
  -- CSS object-position for cropped display, e.g. "30% 50%".
  focus text check (focus is null or focus ~ '^\d{1,3}% \d{1,3}%$'),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Catalogue

create table if not exists public.categories (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  label text not null check (char_length(label) between 1 and 60),
  position integer not null default 0
);

create table if not exists public.products (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(id) <= 80),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  name text not null check (char_length(name) between 1 and 120),
  category_id text not null references public.categories (id),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  -- Minor units (cents) of the store currency.
  price integer not null check (price between 0 and 100000000),
  summary text not null default '' check (char_length(summary) <= 300),
  description text not null default '' check (char_length(description) <= 4000),
  details text[] not null default '{}',
  composition text not null default '' check (char_length(composition) <= 300),
  care text[] not null default '{}',
  fit text not null default '' check (char_length(fit) <= 600),
  fabric text check (char_length(fabric) <= 1200),
  sizes text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists products_status_idx on public.products (status);

create table if not exists public.colorways (
  product_id text not null references public.products (id) on delete cascade,
  id text not null check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(id) <= 60),
  name text not null check (char_length(name) between 1 and 60),
  swatch text not null default '#cccccc' check (swatch ~ '^#[0-9a-fA-F]{6}$'),
  position integer not null default 0,
  primary key (product_id, id)
);

-- Which image plays which part for a colourway. Front, back and side are single
-- images on the shared rail canvas; the other roles are ordered lists.
create table if not exists public.colorway_media (
  product_id text not null,
  colorway_id text not null,
  role text not null check (role in ('front', 'back', 'side', 'gallery', 'lifestyle', 'detail')),
  position integer not null default 0 check (position >= 0),
  media_id text not null references public.media (id) on delete restrict,
  primary key (product_id, colorway_id, role, position),
  foreign key (product_id, colorway_id) references public.colorways (product_id, id) on delete cascade,
  check (role not in ('front', 'back', 'side') or position = 0)
);
create index if not exists colorway_media_media_idx on public.colorway_media (media_id);

create table if not exists public.variants (
  sku text primary key check (char_length(sku) between 1 and 120),
  product_id text not null,
  colorway_id text not null,
  size text not null check (char_length(size) between 1 and 24),
  stock integer not null default 0 check (stock >= 0),
  unique (product_id, colorway_id, size),
  foreign key (product_id, colorway_id) references public.colorways (product_id, id) on delete cascade
);
create index if not exists variants_low_stock_idx on public.variants (stock);

create table if not exists public.collections (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 1 and 120),
  season text not null default '' check (char_length(season) <= 120),
  summary text not null default '' check (char_length(summary) <= 1200),
  position integer not null default 0,
  published boolean not null default true
);

create table if not exists public.collection_products (
  collection_id text not null references public.collections (id) on delete cascade,
  product_id text not null references public.products (id) on delete cascade,
  position integer not null default 0,
  primary key (collection_id, product_id)
);

-- The interactive rail: one hanger per product colourway, in display order.
create table if not exists public.rail_placements (
  product_id text not null,
  colorway_id text not null,
  position integer not null,
  primary key (product_id, colorway_id),
  foreign key (product_id, colorway_id) references public.colorways (product_id, id) on delete cascade
);

-- Products featured in the homepage collection grid; the first is shown largest.
create table if not exists public.featured_products (
  product_id text primary key references public.products (id) on delete cascade,
  position integer not null default 0
);

-- "Wear it with". Directional and ordered, so a future "complete the look"
-- feature can build on it without changing the relationship.
create table if not exists public.product_pairings (
  product_id text not null references public.products (id) on delete cascade,
  paired_product_id text not null references public.products (id) on delete cascade,
  position integer not null default 0,
  primary key (product_id, paired_product_id),
  check (product_id <> paired_product_id)
);

-- ---------------------------------------------------------------------------
-- Editorial: the lookbook is a sequence of spreads in curated layouts.

create table if not exists public.lookbooks (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 1 and 120),
  season text not null default '' check (char_length(season) <= 120),
  summary text not null default '' check (char_length(summary) <= 600),
  published boolean not null default true
);

create table if not exists public.lookbook_spreads (
  id text primary key check (char_length(id) between 1 and 80),
  lookbook_id text not null references public.lookbooks (id) on delete cascade,
  layout text not null check (layout in ('cinematic', 'pair', 'pair-flip', 'wide', 'materials')),
  note text check (char_length(note) <= 600),
  position integer not null default 0,
  published boolean not null default true
);

create table if not exists public.looks (
  id text primary key check (char_length(id) between 1 and 80),
  spread_id text not null references public.lookbook_spreads (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  caption text not null default '' check (char_length(caption) <= 300),
  tone text not null default 'plaster' check (tone in ('plaster', 'bone', 'graphite', 'ink')),
  kind text not null default 'campaign' check (kind in ('campaign', 'detail')),
  media_id text references public.media (id) on delete set null,
  position integer not null default 0,
  published boolean not null default true
);
create index if not exists looks_media_idx on public.looks (media_id);

create table if not exists public.look_pieces (
  look_id text not null references public.looks (id) on delete cascade,
  position integer not null default 0,
  product_id text not null,
  colorway_id text not null,
  view text not null default 'front' check (view in ('front', 'back', 'side')),
  primary key (look_id, position),
  foreign key (product_id, colorway_id) references public.colorways (product_id, id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Settings. Public settings are readable by every visitor; private settings
-- are for administrators only. Each table holds exactly one row.

create table if not exists public.store_settings (
  id boolean primary key default true check (id),
  name text not null default 'STILLFORM' check (char_length(name) between 1 and 60),
  description text not null default '' check (char_length(description) <= 600),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  locale text not null default 'en-US' check (locale ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  low_stock_threshold integer not null default 3 check (low_stock_threshold between 0 and 100),
  order_prefix text not null default 'SF' check (order_prefix ~ '^[A-Z]{1,6}$'),
  contact jsonb not null default '{}'::jsonb,
  rail jsonb not null default '{}'::jsonb,
  home jsonb not null default '{}'::jsonb,
  footer jsonb not null default '{}'::jsonb,
  -- { "enabled": false, "methods": [{ "id", "label", "instructions", "enabled" }] }
  checkout jsonb not null default '{"enabled": false, "methods": []}'::jsonb,
  -- { "flatRate": 0, "freeOver": null, "note": "" } in minor units
  shipping jsonb not null default '{"flatRate": 0, "freeOver": null, "note": ""}'::jsonb,
  policies jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.store_private_settings (
  id boolean primary key default true check (id),
  order_notification_email text check (order_notification_email is null or order_notification_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  notes text check (char_length(notes) <= 4000),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Orders. Created only through public.place_order(); changed only through
-- public.admin_update_order(). Items keep a snapshot of what was bought.

create sequence if not exists public.order_number_seq start 1001;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid', 'refunded')),
  payment_method text not null,
  payment_method_label text not null,
  payment_instructions text not null default '',
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  subtotal integer not null check (subtotal >= 0),
  shipping integer not null check (shipping >= 0),
  total integer not null check (total >= 0),
  email text not null,
  name text not null,
  phone text not null default '',
  address jsonb not null,
  notes text not null default '',
  restocked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  paid_at timestamptz,
  check (total = subtotal + shipping)
);
create index if not exists orders_created_idx on public.orders (created_at desc);
create index if not exists orders_status_idx on public.orders (status);

create table if not exists public.order_items (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  position integer not null,
  sku text not null,
  product_id text not null,
  colorway_id text not null,
  product_name text not null,
  colorway_name text not null,
  size text not null,
  unit_price integer not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  line_total integer not null check (line_total = unit_price * quantity),
  image_src text
);
create index if not exists order_items_order_idx on public.order_items (order_id);

create table if not exists public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  kind text not null check (kind in ('placed', 'status', 'payment', 'note')),
  from_value text,
  to_value text,
  note text,
  actor uuid,
  created_at timestamptz not null default now()
);
create index if not exists order_events_order_idx on public.order_events (order_id, created_at);

-- ---------------------------------------------------------------------------
-- Order lifecycle rules, enforced on every update path.
--
--   pending → confirmed → shipped → delivered
--   pending | confirmed → cancelled            (stock is returned once)
--   unpaid → paid → refunded

create or replace function public.orders_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.reference <> old.reference or new.subtotal <> old.subtotal or new.shipping <> old.shipping
     or new.total <> old.total or new.currency <> old.currency or new.created_at <> old.created_at then
    raise exception 'order_is_immutable' using hint = 'Totals, currency and reference cannot change after an order is placed.';
  end if;

  if new.status <> old.status then
    if not (
      (old.status = 'pending' and new.status in ('confirmed', 'cancelled')) or
      (old.status = 'confirmed' and new.status in ('shipped', 'cancelled')) or
      (old.status = 'shipped' and new.status = 'delivered')
    ) then
      raise exception 'invalid_status_transition' using detail = old.status || ' -> ' || new.status;
    end if;
    case new.status
      when 'confirmed' then new.confirmed_at := now();
      when 'shipped' then new.shipped_at := now();
      when 'delivered' then new.delivered_at := now();
      when 'cancelled' then new.cancelled_at := now();
      else null;
    end case;
    -- Cancelled is terminal, so this runs at most once per order.
    if new.status = 'cancelled' and old.restocked_at is null then
      update public.variants v
         set stock = v.stock + i.quantity
        from (select sku, sum(quantity)::integer as quantity from public.order_items where order_id = new.id group by sku) i
       where v.sku = i.sku;
      new.restocked_at := now();
    end if;
  end if;

  if new.payment_status <> old.payment_status then
    if not (
      (old.payment_status = 'unpaid' and new.payment_status = 'paid') or
      (old.payment_status = 'paid' and new.payment_status = 'refunded')
    ) then
      raise exception 'invalid_payment_transition' using detail = old.payment_status || ' -> ' || new.payment_status;
    end if;
    if new.payment_status = 'paid' then
      new.paid_at := now();
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists orders_guard on public.orders;
create trigger orders_guard before update on public.orders
  for each row execute function public.orders_guard();

drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

drop trigger if exists store_settings_touch on public.store_settings;
create trigger store_settings_touch before update on public.store_settings
  for each row execute function public.touch_updated_at();

drop trigger if exists store_private_settings_touch on public.store_private_settings;
create trigger store_private_settings_touch before update on public.store_private_settings
  for each row execute function public.touch_updated_at();

insert into public.store_settings (id) values (true) on conflict (id) do nothing;
insert into public.store_private_settings (id) values (true) on conflict (id) do nothing;
