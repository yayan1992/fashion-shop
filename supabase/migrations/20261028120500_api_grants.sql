-- STILLFORM · Data API permissions
--
-- The complete list of what the Data API roles may touch. Newer Supabase
-- projects can be created without automatically exposing new tables and
-- functions; older ones expose everything by default. This file first
-- removes whatever was granted, then grants exactly what the store needs,
-- so both kinds of project end up with the same, minimal permissions.
--
--   anon           visitors: read the published catalogue, place orders
--   authenticated  signed-in users: the same, plus the dashboard's tables and
--                  functions. Row level security and each admin function's
--                  own is_admin() check limit all of it to administrators.
--
-- Rows are still filtered by the policies in …_security.sql: a grant only
-- opens the door, row level security decides what is behind it.

grant usage on schema public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tables

revoke all on table
  public.media, public.categories, public.products, public.colorways, public.colorway_media, public.variants,
  public.collections, public.collection_products, public.rail_placements, public.featured_products,
  public.product_pairings, public.lookbooks, public.lookbook_spreads, public.looks, public.look_pieces,
  public.store_settings, public.store_private_settings, public.orders, public.order_items, public.order_events,
  public.admins
from anon, authenticated;

-- The published catalogue and public settings (policies show published rows only).
grant select on table
  public.media, public.categories, public.products, public.colorways, public.colorway_media, public.variants,
  public.collections, public.collection_products, public.rail_placements, public.featured_products,
  public.product_pairings, public.lookbooks, public.lookbook_spreads, public.looks, public.look_pieces,
  public.store_settings
to anon, authenticated;

-- Catalogue editing from the dashboard (policies: administrators only).
-- Categories are set up by the seed and not edited from the dashboard.
grant insert, update, delete on table
  public.media, public.products, public.colorways, public.colorway_media, public.variants,
  public.collections, public.collection_products, public.rail_placements, public.featured_products,
  public.product_pairings, public.lookbooks, public.lookbook_spreads, public.looks, public.look_pieces
to authenticated;
grant update on table public.store_settings to authenticated;

-- Administrator-only reads (policies: administrators only).
grant select, update on table public.store_private_settings to authenticated;
grant select on table public.orders, public.order_items, public.order_events to authenticated;

-- Orders are written only by place_order() and admin_update_order(), which
-- run as the owner. No API role may write them, or touch the admin list
-- (is_admin() reads it as the owner).
revoke all on sequence public.order_number_seq from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Functions

revoke all on function
  public.touch_updated_at(), public.orders_guard(),
  public.is_admin(), public.media_is_public(text), public.media_json(public.media), public.catalog_json(boolean),
  public.storefront_catalog(), public.place_order(jsonb),
  public.assert_admin(), public.assert_publishable(text), public.sku_for(text, text, text), public.order_json(public.orders, boolean),
  public.admin_catalog(), public.admin_save_product(jsonb), public.admin_set_product_status(text, text), public.admin_delete_product(text),
  public.admin_set_rail(jsonb), public.admin_set_featured(jsonb), public.admin_save_collection(jsonb), public.admin_delete_collection(text),
  public.admin_save_lookbook(jsonb), public.admin_create_media(jsonb), public.admin_update_media(text, text, text),
  public.admin_unused_media(), public.admin_delete_media(jsonb), public.admin_save_settings(jsonb, jsonb),
  public.admin_orders(text, text, integer, integer), public.admin_order(text),
  public.admin_update_order(text, text, text, text), public.admin_overview()
from public, anon, authenticated;

-- Storefront. place_order runs as the owner and validates and prices every
-- request itself; is_admin and media_is_public run as the owner to read the
-- admin list and publication state, and only ever return a yes or no.
grant execute on function
  public.storefront_catalog(), public.catalog_json(boolean), public.media_json(public.media),
  public.media_is_public(text), public.is_admin(), public.place_order(jsonb)
to anon, authenticated;

-- Dashboard. Every admin_* function starts with assert_admin(), which raises
-- not_authorized for anyone not listed in public.admins. admin_update_order
-- is the only one that runs as the owner. The helpers are called from inside
-- the admin functions.
grant execute on function
  public.assert_admin(), public.assert_publishable(text), public.sku_for(text, text, text), public.order_json(public.orders, boolean),
  public.admin_catalog(), public.admin_save_product(jsonb), public.admin_set_product_status(text, text), public.admin_delete_product(text),
  public.admin_set_rail(jsonb), public.admin_set_featured(jsonb), public.admin_save_collection(jsonb), public.admin_delete_collection(text),
  public.admin_save_lookbook(jsonb), public.admin_create_media(jsonb), public.admin_update_media(text, text, text),
  public.admin_unused_media(), public.admin_delete_media(jsonb), public.admin_save_settings(jsonb, jsonb),
  public.admin_orders(text, text, integer, integer), public.admin_order(text),
  public.admin_update_order(text, text, text, text), public.admin_overview()
to authenticated;

-- touch_updated_at and orders_guard are trigger functions: they run as part
-- of a table write and need no grant.
