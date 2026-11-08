-- STILLFORM · storefront API
--
-- storefront_catalog(): the whole published catalogue as one JSON document in
--   the shape of the app's Catalog type (src/catalog/types.ts).
-- place_order(): the only way to create an order. Validates the request,
--   prices it from the database, locks and decrements stock atomically and
--   stores a snapshot of every item. Nothing the browser sends about prices,
--   totals or stock is trusted.

create or replace function public.media_json(m public.media)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', m.id, 'src', m.src, 'alt', m.alt, 'width', m.width, 'height', m.height,
    'origin', m.origin, 'replaceNote', m.replace_note, 'focus', m.focus, 'storagePath', m.storage_path,
    'variants', case when jsonb_array_length(m.variants) > 0 then m.variants end
  ));
$$;

-- Builds the catalogue. With p_admin = false only published content is
-- included, whoever is asking, so an administrator browsing the shop sees
-- exactly what customers see. p_admin = true has no effect unless the caller
-- is an administrator.
create or replace function public.catalog_json(p_admin boolean)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with
  -- Dashboard fields and drafts only ever go to an administrator.
  flags as (select p_admin and public.is_admin() as admin),
  visible_products as (
    select p.* from public.products p where (select admin from flags) or p.status = 'active'
  ),
  product_docs as (
    select p.id, p.name, jsonb_strip_nulls(jsonb_build_object(
      'id', p.id, 'slug', p.slug, 'name', p.name, 'category', p.category_id, 'status', p.status,
      'price', p.price, 'summary', p.summary, 'description', p.description,
      'details', to_jsonb(p.details), 'composition', p.composition, 'care', to_jsonb(p.care),
      'fit', p.fit, 'fabric', p.fabric, 'sizes', to_jsonb(p.sizes),
      'colorways', coalesce((
        select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'id', c.id, 'name', c.name, 'swatch', c.swatch,
          'onRail', case when (select admin from flags) then exists (select 1 from public.rail_placements r where r.product_id = c.product_id and r.colorway_id = c.id) end,
          'media', jsonb_strip_nulls(jsonb_build_object(
            'front', (select cm.media_id from public.colorway_media cm where cm.product_id = c.product_id and cm.colorway_id = c.id and cm.role = 'front'),
            'back', (select cm.media_id from public.colorway_media cm where cm.product_id = c.product_id and cm.colorway_id = c.id and cm.role = 'back'),
            'side', (select cm.media_id from public.colorway_media cm where cm.product_id = c.product_id and cm.colorway_id = c.id and cm.role = 'side'),
            'gallery', coalesce((select jsonb_agg(cm.media_id order by cm.position) from public.colorway_media cm where cm.product_id = c.product_id and cm.colorway_id = c.id and cm.role = 'gallery'), '[]'::jsonb),
            'lifestyle', coalesce((select jsonb_agg(cm.media_id order by cm.position) from public.colorway_media cm where cm.product_id = c.product_id and cm.colorway_id = c.id and cm.role = 'lifestyle'), '[]'::jsonb),
            'details', coalesce((select jsonb_agg(cm.media_id order by cm.position) from public.colorway_media cm where cm.product_id = c.product_id and cm.colorway_id = c.id and cm.role = 'detail'), '[]'::jsonb)
          ))
        )) order by c.position, c.id)
        from public.colorways c where c.product_id = p.id
      ), '[]'::jsonb),
      'variants', coalesce((
        select jsonb_agg(jsonb_build_object('sku', v.sku, 'colorwayId', v.colorway_id, 'size', v.size, 'stock', v.stock)
                         order by c.position, array_position(p.sizes, v.size))
        from public.variants v join public.colorways c on c.product_id = v.product_id and c.id = v.colorway_id
        where v.product_id = p.id
      ), '[]'::jsonb),
      'pairsWith', coalesce((
        select jsonb_agg(pp.paired_product_id order by pp.position)
        from public.product_pairings pp join public.products q on q.id = pp.paired_product_id
        where pp.product_id = p.id and ((select admin from flags) or q.status = 'active')
      ), '[]'::jsonb),
      'featured', case when (select admin from flags) then exists (select 1 from public.featured_products f where f.product_id = p.id) end,
      'collectionIds', case when (select admin from flags) then coalesce((select jsonb_agg(cp.collection_id) from public.collection_products cp where cp.product_id = p.id), '[]'::jsonb) end,
      'updatedAt', case when (select admin from flags) then to_jsonb(p.updated_at) end
    )) as doc
    from visible_products p
  ),
  settings as (select * from public.store_settings where id)
  select jsonb_build_object(
    'settings', (
      select jsonb_strip_nulls(jsonb_build_object(
        'name', s.name, 'description', s.description, 'currency', s.currency, 'locale', s.locale,
        'lowStockThreshold', s.low_stock_threshold, 'orderPrefix', s.order_prefix,
        'contact', s.contact, 'footer', s.footer, 'checkout', s.checkout, 'shipping', s.shipping, 'policies', s.policies,
        'rail', s.rail || jsonb_build_object('placements', coalesce((
          select jsonb_agg(jsonb_build_object('productId', r.product_id, 'colorwayId', r.colorway_id) order by r.position)
          from public.rail_placements r join public.products p on p.id = r.product_id
          where ((select admin from flags) or p.status = 'active')
            and exists (select 1 from public.colorway_media cm where cm.product_id = r.product_id and cm.colorway_id = r.colorway_id and cm.role = 'front')
        ), '[]'::jsonb)),
        'home', s.home || jsonb_build_object('featuredProductIds', coalesce((
          select jsonb_agg(f.product_id order by f.position)
          from public.featured_products f join public.products p on p.id = f.product_id
          where (select admin from flags) or p.status = 'active'
        ), '[]'::jsonb))
      ))
      from settings s
    ),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'label', c.label) order by c.position, c.label) from public.categories c), '[]'::jsonb),
    'media', coalesce((
      select jsonb_object_agg(m.id, public.media_json(m))
      from public.media m where (select admin from flags) or public.media_is_public(m.id)
    ), '{}'::jsonb),
    'products', coalesce((select jsonb_agg(d.doc order by d.name) from product_docs d), '[]'::jsonb),
    'collections', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', c.id, 'slug', c.slug, 'title', c.title, 'season', c.season, 'summary', c.summary,
        'published', case when (select admin from flags) then c.published end,
        'productIds', coalesce((
          select jsonb_agg(cp.product_id order by cp.position)
          from public.collection_products cp join public.products p on p.id = cp.product_id
          where cp.collection_id = c.id and ((select admin from flags) or p.status = 'active')
        ), '[]'::jsonb)
      )) order by c.position, c.title)
      from public.collections c where (select admin from flags) or c.published
    ), '[]'::jsonb),
    'lookbooks', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', b.id, 'title', b.title, 'season', b.season, 'summary', b.summary,
        'published', case when (select admin from flags) then b.published end,
        'spreads', coalesce((
          select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
            'id', sp.id, 'layout', sp.layout, 'note', sp.note,
            'published', case when (select admin from flags) then sp.published end,
            'looks', coalesce((
              select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                'id', l.id, 'title', l.title, 'caption', l.caption, 'tone', l.tone, 'kind', l.kind, 'mediaId', l.media_id,
                'published', case when (select admin from flags) then l.published end,
                'pieces', coalesce((
                  select jsonb_agg(jsonb_build_object('productId', lp.product_id, 'colorwayId', lp.colorway_id, 'view', lp.view) order by lp.position)
                  from public.look_pieces lp join public.products p on p.id = lp.product_id
                  where lp.look_id = l.id and ((select admin from flags) or p.status = 'active')
                ), '[]'::jsonb)
              )) order by l.position)
              from public.looks l where l.spread_id = sp.id and ((select admin from flags) or l.published)
            ), '[]'::jsonb)
          )) order by sp.position)
          from public.lookbook_spreads sp where sp.lookbook_id = b.id and ((select admin from flags) or sp.published)
        ), '[]'::jsonb)
      )) order by b.id)
      from public.lookbooks b where (select admin from flags) or b.published
    ), '[]'::jsonb)
  );
$$;

-- Runs with the caller's rights, so row level security filters every row as
-- well: even p_admin = true only returns drafts to an administrator.
revoke all on function public.catalog_json(boolean) from public;
grant execute on function public.catalog_json(boolean) to anon, authenticated;
revoke all on function public.media_json(public.media) from public;
grant execute on function public.media_json(public.media) to anon, authenticated;

create or replace function public.storefront_catalog()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select public.catalog_json(false);
$$;

revoke all on function public.storefront_catalog() from public;
grant execute on function public.storefront_catalog() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Checkout

create or replace function public.place_order(p_order jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.store_settings;
  method jsonb;
  contact jsonb := coalesce(p_order -> 'contact', '{}'::jsonb);
  address jsonb := coalesce(p_order -> 'address', '{}'::jsonb);
  v_email text := lower(btrim(coalesce(contact ->> 'email', '')));
  v_name text := btrim(coalesce(contact ->> 'name', ''));
  v_phone text := btrim(coalesce(contact ->> 'phone', ''));
  v_line1 text := btrim(coalesce(address ->> 'line1', ''));
  v_line2 text := btrim(coalesce(address ->> 'line2', ''));
  v_city text := btrim(coalesce(address ->> 'city', ''));
  v_region text := btrim(coalesce(address ->> 'region', ''));
  v_postal text := btrim(coalesce(address ->> 'postalCode', ''));
  v_country text := btrim(coalesce(address ->> 'country', ''));
  v_notes text := btrim(coalesce(p_order ->> 'notes', ''));
  requested jsonb;
  line record;
  short jsonb := '[]'::jsonb;
  v_subtotal integer := 0;
  v_shipping integer := 0;
  flat integer;
  free_over integer;
  v_order public.orders;
  v_position integer := 0;
begin
  select * into s from public.store_settings where id;
  if s is null or coalesce((s.checkout ->> 'enabled')::boolean, false) is not true then
    raise exception 'checkout_unavailable' using hint = 'Checkout is not enabled for this store.';
  end if;

  select m into method from jsonb_array_elements(coalesce(s.checkout -> 'methods', '[]'::jsonb)) m
   where m ->> 'id' = p_order ->> 'paymentMethod' and coalesce((m ->> 'enabled')::boolean, false);
  if method is null then
    raise exception 'invalid_payment_method';
  end if;

  -- Contact and delivery details.
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then raise exception 'invalid_contact' using detail = 'email'; end if;
  if char_length(v_name) not between 1 and 120 then raise exception 'invalid_contact' using detail = 'name'; end if;
  if char_length(v_phone) not between 5 and 40 or v_phone !~ '^[0-9+()\-.\s]+$' then raise exception 'invalid_contact' using detail = 'phone'; end if;
  if char_length(v_line1) not between 1 and 200 then raise exception 'invalid_contact' using detail = 'line1'; end if;
  if char_length(v_line2) > 200 then raise exception 'invalid_contact' using detail = 'line2'; end if;
  if char_length(v_city) not between 1 and 100 then raise exception 'invalid_contact' using detail = 'city'; end if;
  if char_length(v_region) > 100 then raise exception 'invalid_contact' using detail = 'region'; end if;
  if char_length(v_postal) not between 1 and 20 then raise exception 'invalid_contact' using detail = 'postalCode'; end if;
  if char_length(v_country) not between 2 and 60 then raise exception 'invalid_contact' using detail = 'country'; end if;
  if char_length(v_notes) > 1000 then raise exception 'invalid_contact' using detail = 'notes'; end if;

  -- Items: 1–25 distinct SKUs, 1–10 of each. Repeated SKUs are merged.
  if jsonb_typeof(p_order -> 'items') <> 'array' or jsonb_array_length(p_order -> 'items') not between 1 and 25 then
    raise exception 'invalid_items';
  end if;
  begin
    select jsonb_object_agg(sku, quantity) into requested
      from (
        select i ->> 'sku' as sku, sum((i ->> 'quantity')::integer) as quantity
          from jsonb_array_elements(p_order -> 'items') i
         group by i ->> 'sku'
      ) merged;
  exception when others then
    raise exception 'invalid_items';
  end;
  if exists (select 1 from jsonb_each_text(requested) r where r.key is null or r.value::integer not between 1 and 10) then
    raise exception 'invalid_items';
  end if;

  -- Lock every requested variant in a fixed order, so concurrent checkouts
  -- queue behind each other instead of deadlocking or overselling.
  perform 1 from public.variants v where v.sku in (select jsonb_object_keys(requested)) order by v.sku for update;

  for line in
    select r.key as sku, r.value::integer as quantity, v.stock, v.product_id, v.colorway_id, v.size,
           p.name as product_name, p.price, p.status, c.name as colorway_name,
           (select m.src from public.colorway_media cm join public.media m on m.id = cm.media_id
             where cm.product_id = v.product_id and cm.colorway_id = v.colorway_id and cm.role = 'front') as image_src
      from jsonb_each_text(requested) r
      left join public.variants v on v.sku = r.key
      left join public.products p on p.id = v.product_id
      left join public.colorways c on c.product_id = v.product_id and c.id = v.colorway_id
     order by r.key
  loop
    if line.product_id is null then raise exception 'unknown_item' using detail = line.sku; end if;
    if line.status <> 'active' then raise exception 'unavailable_item' using detail = line.sku; end if;
    if line.stock < line.quantity then
      short := short || jsonb_build_object('sku', line.sku, 'requested', line.quantity, 'available', line.stock);
    end if;
    v_subtotal := v_subtotal + line.price * line.quantity;
  end loop;

  if jsonb_array_length(short) > 0 then
    raise exception 'insufficient_stock' using detail = short::text;
  end if;

  flat := greatest(coalesce((s.shipping ->> 'flatRate')::integer, 0), 0);
  free_over := (s.shipping ->> 'freeOver')::integer;
  v_shipping := case when free_over is not null and v_subtotal >= free_over then 0 else flat end;

  insert into public.orders (
    reference, payment_method, payment_method_label, payment_instructions, currency,
    subtotal, shipping, total, email, name, phone, address, notes
  ) values (
    s.order_prefix || '-' || nextval('public.order_number_seq'),
    method ->> 'id', coalesce(method ->> 'label', method ->> 'id'), coalesce(method ->> 'instructions', ''), s.currency,
    v_subtotal, v_shipping, v_subtotal + v_shipping, v_email, v_name, v_phone,
    jsonb_build_object('line1', v_line1, 'line2', v_line2, 'city', v_city, 'region', v_region, 'postalCode', v_postal, 'country', v_country),
    v_notes
  ) returning * into v_order;

  for line in
    select r.key as sku, r.value::integer as quantity, v.product_id, v.colorway_id, v.size,
           p.name as product_name, p.price, c.name as colorway_name, c.position as colorway_position,
           (select m.src from public.colorway_media cm join public.media m on m.id = cm.media_id
             where cm.product_id = v.product_id and cm.colorway_id = v.colorway_id and cm.role = 'front') as image_src
      from jsonb_each_text(requested) r
      join public.variants v on v.sku = r.key
      join public.products p on p.id = v.product_id
      join public.colorways c on c.product_id = v.product_id and c.id = v.colorway_id
     order by p.name, c.position, array_position(p.sizes, v.size)
  loop
    v_position := v_position + 1;
    insert into public.order_items (order_id, position, sku, product_id, colorway_id, product_name, colorway_name, size, unit_price, quantity, line_total, image_src)
    values (v_order.id, v_position, line.sku, line.product_id, line.colorway_id, line.product_name, line.colorway_name, line.size, line.price, line.quantity, line.price * line.quantity, line.image_src);
    update public.variants set stock = stock - line.quantity where sku = line.sku;
  end loop;

  insert into public.order_events (order_id, kind, to_value) values (v_order.id, 'placed', 'pending');

  return jsonb_build_object(
    'reference', v_order.reference,
    'status', v_order.status,
    'paymentStatus', v_order.payment_status,
    'paymentMethod', v_order.payment_method_label,
    'paymentInstructions', v_order.payment_instructions,
    'currency', v_order.currency,
    'subtotal', v_order.subtotal,
    'shipping', v_order.shipping,
    'total', v_order.total,
    'email', v_order.email,
    'createdAt', v_order.created_at,
    'items', (
      select jsonb_agg(jsonb_build_object(
        'name', i.product_name, 'colorway', i.colorway_name, 'size', i.size,
        'quantity', i.quantity, 'unitPrice', i.unit_price, 'lineTotal', i.line_total, 'imageSrc', i.image_src
      ) order by i.position)
      from public.order_items i where i.order_id = v_order.id
    )
  );
end;
$$;

revoke all on function public.place_order(jsonb) from public;
grant execute on function public.place_order(jsonb) to anon, authenticated;
