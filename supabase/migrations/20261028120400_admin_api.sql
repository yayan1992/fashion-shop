-- STILLFORM · admin API
--
-- Everything the dashboard changes goes through these functions. Each one
-- checks public.is_admin() first and validates its input, and each save is a
-- single transaction, so a product is never left half-saved. Functions that
-- only touch catalogue tables run with the caller's rights (row level
-- security applies as a second check); the order functions run as the owner
-- because clients have no write access to orders at all.

create or replace function public.assert_admin()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.admin_catalog()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  perform public.assert_admin();
  return public.catalog_json(true) || jsonb_build_object(
    'privateSettings', (
      select jsonb_build_object('orderNotificationEmail', ps.order_notification_email, 'notes', ps.notes)
      from public.store_private_settings ps where ps.id
    )
  );
end;
$$;

-- A product can go live once it has a price, sizes, a colourway, and a front
-- photograph for every colourway.
create or replace function public.assert_publishable(p_product text)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  missing text;
begin
  if not exists (select 1 from public.products where id = p_product and price > 0 and cardinality(sizes) > 0) then
    raise exception 'not_publishable' using detail = 'price_or_sizes';
  end if;
  if not exists (select 1 from public.colorways where product_id = p_product) then
    raise exception 'not_publishable' using detail = 'colorways';
  end if;
  select c.name into missing from public.colorways c
   where c.product_id = p_product
     and not exists (select 1 from public.colorway_media cm where cm.product_id = c.product_id and cm.colorway_id = c.id and cm.role = 'front')
   limit 1;
  if missing is not null then
    raise exception 'not_publishable' using detail = 'front_image:' || missing;
  end if;
end;
$$;

create or replace function public.sku_for(p_product text, p_colorway text, p_size text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(trim(both '-' from regexp_replace(p_product || '-' || p_colorway || '-' || p_size, '[^A-Za-z0-9]+', '-', 'g')));
$$;

-- ---------------------------------------------------------------------------
-- Products

create or replace function public.admin_save_product(p jsonb)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_slug text := lower(btrim(coalesce(p ->> 'slug', '')));
  v_id text := coalesce(nullif(btrim(p ->> 'id'), ''), lower(btrim(coalesce(p ->> 'slug', ''))));
  v_is_new boolean := coalesce((p ->> 'isNew')::boolean, false);
  v_status text := coalesce(p ->> 'status', 'draft');
  v_price integer;
  v_sizes text[];
  cw jsonb;
  cw_id text;
  cw_ids text[] := '{}';
  skus text[] := '{}';
  v_size text;
  v_sku text;
  v_desired integer;
  v_base integer;
  v_current integer;
  v_pos integer := 0;
  r text;
  item text;
  i integer;
begin
  perform public.assert_admin();

  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(v_slug) > 80 then raise exception 'invalid_product' using detail = 'slug'; end if;
  if v_status not in ('draft', 'active', 'archived') then raise exception 'invalid_product' using detail = 'status'; end if;
  if char_length(btrim(coalesce(p ->> 'name', ''))) not between 1 and 120 then raise exception 'invalid_product' using detail = 'name'; end if;
  begin
    v_price := (p ->> 'price')::integer;
  exception when others then
    raise exception 'invalid_product' using detail = 'price';
  end;
  if v_price is null or v_price not between 0 and 100000000 then raise exception 'invalid_product' using detail = 'price'; end if;
  if not exists (select 1 from public.categories where id = p ->> 'category') then raise exception 'invalid_product' using detail = 'category'; end if;

  select coalesce(array_agg(size order by ord), '{}') into v_sizes
    from (select btrim(value) as size, min(ordinality) as ord
            from jsonb_array_elements_text(coalesce(p -> 'sizes', '[]'::jsonb)) with ordinality
           where btrim(value) <> '' group by btrim(value)) s;
  if cardinality(v_sizes) > 12 or exists (select 1 from unnest(v_sizes) z where char_length(z) > 24) then
    raise exception 'invalid_product' using detail = 'sizes';
  end if;
  if jsonb_typeof(p -> 'colorways') <> 'array' or jsonb_array_length(p -> 'colorways') not between 1 and 12 then
    raise exception 'invalid_product' using detail = 'colorways';
  end if;

  if v_is_new then
    if exists (select 1 from public.products where id = v_id or slug = v_slug) then raise exception 'slug_taken'; end if;
  else
    if not exists (select 1 from public.products where id = v_id) then raise exception 'product_not_found'; end if;
    if exists (select 1 from public.products where slug = v_slug and id <> v_id) then raise exception 'slug_taken'; end if;
  end if;

  insert into public.products as t (id, slug, name, category_id, status, price, summary, description, details, composition, care, fit, fabric, sizes)
  values (
    v_id, v_slug, btrim(p ->> 'name'), p ->> 'category', v_status, v_price,
    btrim(coalesce(p ->> 'summary', '')), btrim(coalesce(p ->> 'description', '')),
    coalesce(array(select btrim(x) from jsonb_array_elements_text(coalesce(p -> 'details', '[]'::jsonb)) x where btrim(x) <> ''), '{}'),
    btrim(coalesce(p ->> 'composition', '')),
    coalesce(array(select btrim(x) from jsonb_array_elements_text(coalesce(p -> 'care', '[]'::jsonb)) x where btrim(x) <> ''), '{}'),
    btrim(coalesce(p ->> 'fit', '')), nullif(btrim(coalesce(p ->> 'fabric', '')), ''), v_sizes
  )
  on conflict (id) do update set
    slug = excluded.slug, name = excluded.name, category_id = excluded.category_id, status = excluded.status,
    price = excluded.price, summary = excluded.summary, description = excluded.description, details = excluded.details,
    composition = excluded.composition, care = excluded.care, fit = excluded.fit, fabric = excluded.fabric, sizes = excluded.sizes;

  -- Colourways and their photographs.
  for cw in select value from jsonb_array_elements(p -> 'colorways') loop
    v_pos := v_pos + 1;
    cw_id := lower(btrim(coalesce(cw ->> 'id', '')));
    if cw_id !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(cw_id) > 60 then raise exception 'invalid_product' using detail = 'colorway_id'; end if;
    if cw_id = any (cw_ids) then raise exception 'invalid_product' using detail = 'colorway_duplicate'; end if;
    if char_length(btrim(coalesce(cw ->> 'name', ''))) not between 1 and 60 then raise exception 'invalid_product' using detail = 'colorway_name'; end if;
    if coalesce(cw ->> 'swatch', '') !~ '^#[0-9a-fA-F]{6}$' then raise exception 'invalid_product' using detail = 'colorway_swatch'; end if;
    cw_ids := cw_ids || cw_id;
    insert into public.colorways (product_id, id, name, swatch, position)
    values (v_id, cw_id, btrim(cw ->> 'name'), cw ->> 'swatch', v_pos)
    on conflict (product_id, id) do update set name = excluded.name, swatch = excluded.swatch, position = excluded.position;
  end loop;
  delete from public.colorways where product_id = v_id and not (id = any (cw_ids));
  delete from public.colorway_media where product_id = v_id;

  for cw in select value from jsonb_array_elements(p -> 'colorways') loop
    cw_id := lower(btrim(cw ->> 'id'));
    foreach r in array array['front', 'back', 'side'] loop
      if nullif(cw -> 'media' ->> r, '') is not null then
        insert into public.colorway_media (product_id, colorway_id, role, position, media_id) values (v_id, cw_id, r, 0, cw -> 'media' ->> r);
      end if;
    end loop;
    foreach r in array array['gallery', 'lifestyle', 'details'] loop
      i := 0;
      for item in select value from jsonb_array_elements_text(coalesce(cw -> 'media' -> r, '[]'::jsonb)) loop
        insert into public.colorway_media (product_id, colorway_id, role, position, media_id)
        values (v_id, cw_id, case r when 'details' then 'detail' else r end, i, item);
        i := i + 1;
      end loop;
    end loop;

    -- Inventory. "stockBase" is the count the editor was showing; applying the
    -- difference keeps orders placed while the form was open.
    foreach v_size in array v_sizes loop
      v_sku := public.sku_for(v_id, cw_id, v_size);
      if exists (select 1 from public.variants where sku = v_sku and (product_id <> v_id or colorway_id <> cw_id)) then
        raise exception 'sku_conflict' using detail = v_sku;
      end if;
      begin
        v_desired := coalesce((cw -> 'stock' ->> v_size)::integer, 0);
        v_base := (cw -> 'stockBase' ->> v_size)::integer;
      exception when others then
        raise exception 'invalid_product' using detail = 'stock';
      end;
      if v_desired not between 0 and 1000000 then raise exception 'invalid_product' using detail = 'stock'; end if;
      select stock into v_current from public.variants where sku = v_sku for update;
      if v_current is not null and v_base is not null then
        v_desired := greatest(0, v_current + (v_desired - v_base));
      end if;
      insert into public.variants (sku, product_id, colorway_id, size, stock) values (v_sku, v_id, cw_id, v_size, v_desired)
      on conflict (sku) do update set stock = excluded.stock, size = excluded.size;
      skus := skus || v_sku;
    end loop;

    -- Rail membership.
    if coalesce((cw ->> 'onRail')::boolean, false) then
      insert into public.rail_placements (product_id, colorway_id, position)
      values (v_id, cw_id, coalesce((select max(position) + 1 from public.rail_placements), 0))
      on conflict (product_id, colorway_id) do nothing;
    else
      delete from public.rail_placements where product_id = v_id and colorway_id = cw_id;
    end if;
  end loop;
  delete from public.variants where product_id = v_id and not (sku = any (skus));

  -- Featured on the homepage.
  if coalesce((p ->> 'featured')::boolean, false) then
    insert into public.featured_products (product_id, position)
    values (v_id, coalesce((select max(position) + 1 from public.featured_products), 0))
    on conflict (product_id) do nothing;
  else
    delete from public.featured_products where product_id = v_id;
  end if;

  -- Collections.
  delete from public.collection_products
   where product_id = v_id and not (collection_id in (select jsonb_array_elements_text(coalesce(p -> 'collectionIds', '[]'::jsonb))));
  insert into public.collection_products (collection_id, product_id, position)
  select c, v_id, coalesce((select max(position) + 1 from public.collection_products where collection_id = c), 0)
    from jsonb_array_elements_text(coalesce(p -> 'collectionIds', '[]'::jsonb)) c
  on conflict (collection_id, product_id) do nothing;

  -- Wear it with: up to six, in order.
  delete from public.product_pairings where product_id = v_id;
  insert into public.product_pairings (product_id, paired_product_id, position)
  select v_id, x.value, x.ordinality::integer
    from jsonb_array_elements_text(coalesce(p -> 'pairsWith', '[]'::jsonb)) with ordinality x
   where x.value <> v_id and exists (select 1 from public.products where id = x.value)
   limit 6
  on conflict do nothing;

  if v_status = 'active' then
    perform public.assert_publishable(v_id);
  end if;

  return jsonb_build_object('id', v_id, 'slug', v_slug, 'status', v_status);
end;
$$;

create or replace function public.admin_set_product_status(p_product text, p_status text)
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  perform public.assert_admin();
  if p_status not in ('draft', 'active', 'archived') then raise exception 'invalid_product' using detail = 'status'; end if;
  update public.products set status = p_status where id = p_product;
  if not found then raise exception 'product_not_found'; end if;
  if p_status = 'active' then perform public.assert_publishable(p_product); end if;
end;
$$;

create or replace function public.admin_delete_product(p_product text)
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  perform public.assert_admin();
  -- Order items keep their own snapshot, so past orders are unaffected.
  delete from public.products where id = p_product;
  if not found then raise exception 'product_not_found'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Rail, featured products and collections

create or replace function public.admin_set_rail(p_placements jsonb)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  item jsonb;
  pos integer := 0;
begin
  perform public.assert_admin();
  if jsonb_typeof(p_placements) <> 'array' or jsonb_array_length(p_placements) > 24 then
    raise exception 'invalid_rail' using detail = 'A rail holds up to 24 pieces.';
  end if;
  delete from public.rail_placements where true;
  for item in select value from jsonb_array_elements(p_placements) loop
    if not exists (
      select 1 from public.colorway_media
       where product_id = item ->> 'productId' and colorway_id = item ->> 'colorwayId' and role = 'front'
    ) then
      raise exception 'invalid_rail' using detail = 'front_image:' || (item ->> 'productId') || '/' || (item ->> 'colorwayId');
    end if;
    insert into public.rail_placements (product_id, colorway_id, position)
    values (item ->> 'productId', item ->> 'colorwayId', pos)
    on conflict (product_id, colorway_id) do nothing;
    pos := pos + 1;
  end loop;
end;
$$;

create or replace function public.admin_set_featured(p_products jsonb)
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  perform public.assert_admin();
  delete from public.featured_products where true;
  insert into public.featured_products (product_id, position)
  select x.value, x.ordinality::integer
    from jsonb_array_elements_text(coalesce(p_products, '[]'::jsonb)) with ordinality x
   where exists (select 1 from public.products where id = x.value)
  on conflict (product_id) do nothing;
end;
$$;

create or replace function public.admin_save_collection(p jsonb)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_slug text := lower(btrim(coalesce(p ->> 'slug', '')));
  v_id text := coalesce(nullif(btrim(p ->> 'id'), ''), lower(btrim(coalesce(p ->> 'slug', ''))));
begin
  perform public.assert_admin();
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'invalid_collection' using detail = 'slug'; end if;
  if char_length(btrim(coalesce(p ->> 'title', ''))) not between 1 and 120 then raise exception 'invalid_collection' using detail = 'title'; end if;
  if coalesce((p ->> 'isNew')::boolean, false) and exists (select 1 from public.collections where id = v_id or slug = v_slug) then
    raise exception 'slug_taken';
  end if;
  insert into public.collections (id, slug, title, season, summary, published, position)
  values (v_id, v_slug, btrim(p ->> 'title'), btrim(coalesce(p ->> 'season', '')), btrim(coalesce(p ->> 'summary', '')),
          coalesce((p ->> 'published')::boolean, true), coalesce((select max(position) + 1 from public.collections), 0))
  on conflict (id) do update set slug = excluded.slug, title = excluded.title, season = excluded.season,
    summary = excluded.summary, published = excluded.published;
  delete from public.collection_products where collection_id = v_id;
  insert into public.collection_products (collection_id, product_id, position)
  select v_id, x.value, x.ordinality::integer
    from jsonb_array_elements_text(coalesce(p -> 'productIds', '[]'::jsonb)) with ordinality x
   where exists (select 1 from public.products where id = x.value)
  on conflict do nothing;
  return jsonb_build_object('id', v_id);
end;
$$;

create or replace function public.admin_delete_collection(p_collection text)
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  perform public.assert_admin();
  delete from public.collections where id = p_collection;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lookbook. The layouts are fixed templates; each needs a set number of frames.

create or replace function public.admin_save_lookbook(p jsonb)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_id text := btrim(coalesce(p ->> 'id', ''));
  spread jsonb;
  look jsonb;
  piece jsonb;
  spread_ids text[] := '{}';
  look_ids text[] := '{}';
  s_pos integer := 0;
  l_pos integer;
  p_pos integer;
  n integer;
  layout text;
begin
  perform public.assert_admin();
  if v_id !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'invalid_lookbook' using detail = 'id'; end if;
  if char_length(btrim(coalesce(p ->> 'title', ''))) not between 1 and 120 then raise exception 'invalid_lookbook' using detail = 'title'; end if;

  insert into public.lookbooks (id, title, season, summary, published)
  values (v_id, btrim(p ->> 'title'), btrim(coalesce(p ->> 'season', '')), btrim(coalesce(p ->> 'summary', '')), coalesce((p ->> 'published')::boolean, true))
  on conflict (id) do update set title = excluded.title, season = excluded.season, summary = excluded.summary, published = excluded.published;

  for spread in select value from jsonb_array_elements(coalesce(p -> 'spreads', '[]'::jsonb)) loop
    s_pos := s_pos + 1;
    layout := spread ->> 'layout';
    n := jsonb_array_length(coalesce(spread -> 'looks', '[]'::jsonb));
    if layout not in ('cinematic', 'pair', 'pair-flip', 'wide', 'materials') then raise exception 'invalid_lookbook' using detail = 'layout'; end if;
    if (layout in ('cinematic', 'wide') and n <> 1) or (layout in ('pair', 'pair-flip') and n <> 2) or (layout = 'materials' and n not between 2 and 3) then
      raise exception 'invalid_lookbook' using detail = 'frames:' || layout;
    end if;
    if coalesce(spread ->> 'id', '') = '' or (spread ->> 'id') = any (spread_ids) then raise exception 'invalid_lookbook' using detail = 'spread_id'; end if;
    spread_ids := spread_ids || (spread ->> 'id');
    if exists (select 1 from public.lookbook_spreads where id = spread ->> 'id' and lookbook_id <> v_id) then
      raise exception 'invalid_lookbook' using detail = 'spread_id';
    end if;
    insert into public.lookbook_spreads (id, lookbook_id, layout, note, position, published)
    values (spread ->> 'id', v_id, layout, nullif(btrim(coalesce(spread ->> 'note', '')), ''), s_pos, coalesce((spread ->> 'published')::boolean, true))
    on conflict (id) do update set layout = excluded.layout, note = excluded.note, position = excluded.position, published = excluded.published;

    l_pos := 0;
    for look in select value from jsonb_array_elements(spread -> 'looks') loop
      l_pos := l_pos + 1;
      if coalesce(look ->> 'id', '') = '' or (look ->> 'id') = any (look_ids) then raise exception 'invalid_lookbook' using detail = 'look_id'; end if;
      if char_length(btrim(coalesce(look ->> 'title', ''))) not between 1 and 120 then raise exception 'invalid_lookbook' using detail = 'look_title'; end if;
      look_ids := look_ids || (look ->> 'id');
      insert into public.looks (id, spread_id, title, caption, tone, kind, media_id, position, published)
      values (look ->> 'id', spread ->> 'id', btrim(look ->> 'title'), btrim(coalesce(look ->> 'caption', '')),
              coalesce(look ->> 'tone', 'plaster'), coalesce(look ->> 'kind', 'campaign'), nullif(look ->> 'mediaId', ''), l_pos,
              coalesce((look ->> 'published')::boolean, true))
      on conflict (id) do update set spread_id = excluded.spread_id, title = excluded.title, caption = excluded.caption,
        tone = excluded.tone, kind = excluded.kind, media_id = excluded.media_id, position = excluded.position, published = excluded.published;
      delete from public.look_pieces where look_id = look ->> 'id';
      p_pos := 0;
      for piece in select value from jsonb_array_elements(coalesce(look -> 'pieces', '[]'::jsonb)) loop
        p_pos := p_pos + 1;
        insert into public.look_pieces (look_id, position, product_id, colorway_id, view)
        values (look ->> 'id', p_pos, piece ->> 'productId', piece ->> 'colorwayId', coalesce(piece ->> 'view', 'front'));
      end loop;
    end loop;
  end loop;

  delete from public.looks l using public.lookbook_spreads s
   where s.id = l.spread_id and s.lookbook_id = v_id and not (l.id = any (look_ids));
  delete from public.lookbook_spreads where lookbook_id = v_id and not (id = any (spread_ids));
end;
$$;

-- ---------------------------------------------------------------------------
-- Media library

create or replace function public.admin_create_media(p jsonb)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_media public.media;
begin
  perform public.assert_admin();
  if coalesce(p ->> 'src', '') !~ '^(https?://|/)' then raise exception 'invalid_media' using detail = 'src'; end if;
  if coalesce(p ->> 'storagePath', '') <> '' and (p ->> 'storagePath') !~ '^[a-z0-9-]+/[A-Za-z0-9._-]+$' then
    raise exception 'invalid_media' using detail = 'storagePath';
  end if;
  insert into public.media (id, src, storage_path, alt, width, height, origin, variants, focus)
  values (
    'upload-' || replace(gen_random_uuid()::text, '-', ''),
    p ->> 'src', nullif(p ->> 'storagePath', ''), left(btrim(coalesce(p ->> 'alt', '')), 500),
    (p ->> 'width')::integer, (p ->> 'height')::integer, 'uploaded',
    coalesce(p -> 'variants', '[]'::jsonb), nullif(p ->> 'focus', '')
  ) returning * into v_media;
  return public.media_json(v_media);
end;
$$;

create or replace function public.admin_update_media(p_media text, p_alt text, p_focus text)
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  perform public.assert_admin();
  update public.media set alt = left(btrim(coalesce(p_alt, '')), 500), focus = nullif(p_focus, '') where id = p_media;
end;
$$;

-- Media not used by any product, look or setting.
create or replace function public.admin_unused_media()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  perform public.assert_admin();
  return coalesce((
    select jsonb_agg(public.media_json(m) order by m.created_at)
      from public.media m
     where not exists (select 1 from public.colorway_media cm where cm.media_id = m.id)
       and not exists (select 1 from public.looks l where l.media_id = m.id)
       and not exists (select 1 from public.store_settings s where s.home #>> '{statement,mediaId}' = m.id)
  ), '[]'::jsonb);
end;
$$;

-- Deletes unused media rows and returns their storage paths, so the caller can
-- remove the files. Rows still in use are left alone; a file is only ever
-- orphaned, never a reference broken.
create or replace function public.admin_delete_media(p_ids jsonb)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  removed jsonb;
begin
  perform public.assert_admin();
  with gone as (
    delete from public.media m
     where m.id in (select jsonb_array_elements_text(coalesce(p_ids, '[]'::jsonb)))
       and not exists (select 1 from public.colorway_media cm where cm.media_id = m.id)
       and not exists (select 1 from public.looks l where l.media_id = m.id)
       and not exists (select 1 from public.store_settings s where s.home #>> '{statement,mediaId}' = m.id)
    returning m.id, m.storage_path, m.variants
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'storagePath', storage_path, 'variants', variants)), '[]'::jsonb) into removed from gone;
  return removed;
end;
$$;

-- ---------------------------------------------------------------------------
-- Settings

create or replace function public.admin_save_settings(p_public jsonb, p_private jsonb)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  methods jsonb := coalesce(p_public #> '{checkout,methods}', '[]'::jsonb);
  enabled boolean := coalesce((p_public #>> '{checkout,enabled}')::boolean, false);
  flat integer;
  free_over integer;
begin
  perform public.assert_admin();
  if char_length(btrim(coalesce(p_public ->> 'name', ''))) not between 1 and 60 then raise exception 'invalid_settings' using detail = 'name'; end if;
  if coalesce(p_public ->> 'currency', '') !~ '^[A-Z]{3}$' then raise exception 'invalid_settings' using detail = 'currency'; end if;
  if jsonb_typeof(methods) <> 'array' or exists (
    select 1 from jsonb_array_elements(methods) m
     where m ->> 'id' not in ('cod', 'bank-transfer', 'pickup')
        or char_length(btrim(coalesce(m ->> 'label', ''))) not between 1 and 60
        or char_length(coalesce(m ->> 'instructions', '')) > 600
  ) then
    raise exception 'invalid_settings' using detail = 'checkout_methods';
  end if;
  if enabled and not exists (select 1 from jsonb_array_elements(methods) m where coalesce((m ->> 'enabled')::boolean, false)) then
    raise exception 'invalid_settings' using detail = 'checkout_needs_method';
  end if;
  begin
    flat := coalesce((p_public #>> '{shipping,flatRate}')::integer, 0);
    free_over := (p_public #>> '{shipping,freeOver}')::integer;
  exception when others then
    raise exception 'invalid_settings' using detail = 'shipping';
  end;
  if flat not between 0 and 10000000 or (free_over is not null and free_over not between 0 and 100000000) then
    raise exception 'invalid_settings' using detail = 'shipping';
  end if;

  update public.store_settings set
    name = btrim(p_public ->> 'name'),
    description = left(btrim(coalesce(p_public ->> 'description', '')), 600),
    currency = p_public ->> 'currency',
    locale = coalesce(nullif(p_public ->> 'locale', ''), locale),
    low_stock_threshold = coalesce((p_public ->> 'lowStockThreshold')::integer, low_stock_threshold),
    contact = coalesce(p_public -> 'contact', '{}'::jsonb),
    rail = coalesce(p_public -> 'rail', rail) - 'placements',
    home = coalesce(p_public -> 'home', home) - 'featuredProductIds',
    footer = coalesce(p_public -> 'footer', footer),
    checkout = jsonb_build_object('enabled', enabled, 'methods', methods),
    shipping = jsonb_build_object('flatRate', flat, 'freeOver', free_over, 'note', left(coalesce(p_public #>> '{shipping,note}', ''), 600)),
    policies = coalesce(p_public -> 'policies', '{}'::jsonb)
  where id;

  if p_private is not null then
    update public.store_private_settings set
      order_notification_email = nullif(btrim(coalesce(p_private ->> 'orderNotificationEmail', '')), ''),
      notes = left(coalesce(p_private ->> 'notes', ''), 4000)
    where id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Orders

create or replace function public.order_json(o public.orders, p_items boolean)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', o.id, 'reference', o.reference, 'status', o.status, 'paymentStatus', o.payment_status,
    'paymentMethod', o.payment_method, 'paymentMethodLabel', o.payment_method_label,
    'currency', o.currency, 'subtotal', o.subtotal, 'shipping', o.shipping, 'total', o.total,
    'email', o.email, 'name', o.name, 'phone', o.phone, 'address', o.address, 'notes', o.notes,
    'createdAt', o.created_at, 'updatedAt', o.updated_at, 'restockedAt', o.restocked_at,
    'itemCount', (select coalesce(sum(quantity), 0) from public.order_items i where i.order_id = o.id)
  ) || case when p_items then jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'sku', i.sku, 'productId', i.product_id, 'colorwayId', i.colorway_id, 'name', i.product_name,
        'colorway', i.colorway_name, 'size', i.size, 'unitPrice', i.unit_price, 'quantity', i.quantity,
        'lineTotal', i.line_total, 'imageSrc', i.image_src
      ) order by i.position) from public.order_items i where i.order_id = o.id
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('kind', e.kind, 'from', e.from_value, 'to', e.to_value, 'note', e.note, 'createdAt', e.created_at) order by e.created_at, e.id)
      from public.order_events e where e.order_id = o.id
    ), '[]'::jsonb)
  ) else '{}'::jsonb end;
$$;

create or replace function public.admin_orders(p_search text default null, p_status text default null, p_limit integer default 50, p_offset integer default 0)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  q text := nullif(btrim(coalesce(p_search, '')), '');
begin
  perform public.assert_admin();
  return jsonb_build_object(
    'total', (
      select count(*) from public.orders o
       where (p_status is null or o.status = p_status)
         and (q is null or o.reference ilike '%' || q || '%' or o.email ilike '%' || q || '%' or o.name ilike '%' || q || '%')
    ),
    'orders', coalesce((
      select jsonb_agg(public.order_json(o, false) order by o.created_at desc)
        from (
          select * from public.orders o
           where (p_status is null or o.status = p_status)
             and (q is null or o.reference ilike '%' || q || '%' or o.email ilike '%' || q || '%' or o.name ilike '%' || q || '%')
           order by o.created_at desc
           limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)
        ) o
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_order(p_reference text)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  o public.orders;
begin
  perform public.assert_admin();
  select * into o from public.orders where reference = p_reference;
  if o is null then raise exception 'order_not_found'; end if;
  return public.order_json(o, true);
end;
$$;

create or replace function public.admin_update_order(p_reference text, p_status text default null, p_payment_status text default null, p_note text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  o public.orders;
  updated public.orders;
begin
  perform public.assert_admin();
  select * into o from public.orders where reference = p_reference for update;
  if o is null then raise exception 'order_not_found'; end if;

  update public.orders
     set status = coalesce(p_status, status),
         payment_status = coalesce(p_payment_status, payment_status)
   where id = o.id
  returning * into updated;

  if updated.status <> o.status then
    insert into public.order_events (order_id, kind, from_value, to_value, actor) values (o.id, 'status', o.status, updated.status, auth.uid());
  end if;
  if updated.payment_status <> o.payment_status then
    insert into public.order_events (order_id, kind, from_value, to_value, actor) values (o.id, 'payment', o.payment_status, updated.payment_status, auth.uid());
  end if;
  if nullif(btrim(coalesce(p_note, '')), '') is not null then
    insert into public.order_events (order_id, kind, note, actor) values (o.id, 'note', left(btrim(p_note), 1000), auth.uid());
  end if;
  return public.order_json(updated, true);
end;
$$;

create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  threshold integer := (select low_stock_threshold from public.store_settings where id);
begin
  perform public.assert_admin();
  return jsonb_build_object(
    'currency', (select currency from public.store_settings where id),
    'checkoutEnabled', (select coalesce((checkout ->> 'enabled')::boolean, false) from public.store_settings where id),
    'revenue30', (select coalesce(sum(total), 0) from public.orders where status <> 'cancelled' and created_at > now() - interval '30 days'),
    'orders30', (select count(*) from public.orders where created_at > now() - interval '30 days'),
    'awaiting', (select count(*) from public.orders where status in ('pending', 'confirmed')),
    'unpaid', (select count(*) from public.orders where payment_status = 'unpaid' and status <> 'cancelled'),
    'recent', coalesce((select jsonb_agg(public.order_json(o, false) order by o.created_at desc) from (select * from public.orders order by created_at desc limit 6) o), '[]'::jsonb),
    'lowStock', coalesce((
      select jsonb_agg(jsonb_build_object('sku', v.sku, 'productId', p.id, 'product', p.name, 'colorway', c.name, 'size', v.size, 'stock', v.stock, 'status', p.status)
                       order by v.stock, p.name)
        from public.variants v
        join public.products p on p.id = v.product_id
        join public.colorways c on c.product_id = v.product_id and c.id = v.colorway_id
       where v.stock <= threshold and p.status <> 'archived'
    ), '[]'::jsonb),
    'products', jsonb_build_object(
      'active', (select count(*) from public.products where status = 'active'),
      'draft', (select count(*) from public.products where status = 'draft')
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin functions are not callable by visitors at all.

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.assert_admin()', 'public.admin_catalog()', 'public.assert_publishable(text)',
    'public.admin_save_product(jsonb)', 'public.admin_set_product_status(text, text)', 'public.admin_delete_product(text)',
    'public.admin_set_rail(jsonb)', 'public.admin_set_featured(jsonb)', 'public.admin_save_collection(jsonb)',
    'public.admin_delete_collection(text)', 'public.admin_save_lookbook(jsonb)', 'public.admin_create_media(jsonb)',
    'public.admin_update_media(text, text, text)', 'public.admin_unused_media()', 'public.admin_delete_media(jsonb)',
    'public.admin_save_settings(jsonb, jsonb)', 'public.order_json(public.orders, boolean)',
    'public.admin_orders(text, text, integer, integer)', 'public.admin_order(text)',
    'public.admin_update_order(text, text, text, text)', 'public.admin_overview()'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
