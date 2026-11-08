# STILLFORM backend

Supabase (Postgres, Auth, Storage). Everything lives in `supabase/migrations/`, seven files applied in order, plus one Edge Function in `supabase/functions/place-order`. The migrations are and safe to re-run. `npm run db:build` regenerates `supabase/seed.sql` and the one-file `supabase/setup.sql` from the demo catalogue and the migrations.

## Design in one paragraph

The browser holds only the public anon key. It talks to the database through a small set of SQL functions (RPCs). The storefront reads through `storefront_catalog()`. Orders go through the `place-order` Edge Function, which throttles and checks Cloudflare Turnstile before calling `place_order()` with the server's key. The rest are `admin_*` functions for the dashboard. Every table has row level security. Visitors can read published catalogue content and nothing else. Orders, customer details and private settings are readable by administrators only, and no client can write them directly: orders are created by `place_order()`, which only the Edge Function may call, and changed by `admin_update_order()`. "Administrator" means listed in `public.admins`. That table can only be changed by the database owner, and every admin function checks it in the database (`is_admin()`).

## Tables

| Table | Purpose | Key constraints |
| --- | --- | --- |
| `media` | Every image: URL, size, alt text, focus point, responsive variants, storage path | `src` is an absolute URL or a site path |
| `categories` | Shop filter categories | |
| `products` | Name, slug, status (`draft` / `active` / `archived`), price in minor units, copy, sizes | price ≥ 0; slug pattern; unique slug |
| `colorways` | Colours per product, `(product_id, id)` | swatch is `#rrggbb` |
| `colorway_media` | Which image plays which role: `front`, `back`, `side`, `gallery`, `lifestyle`, `detail` | front, back and side are single images; media can't be deleted while used |
| `variants` | SKU per colour × size, with stock | **stock ≥ 0** (a check constraint, so overselling is impossible even by mistake) |
| `collections`, `collection_products` | Groupings, ordered | |
| `rail_placements` | Hangers on the homepage rail, ordered | |
| `featured_products` | Homepage collection grid, ordered | |
| `product_pairings` | "Wear it with", directional and ordered | Ready for a later "complete the look" feature |
| `lookbooks`, `lookbook_spreads`, `looks`, `look_pieces` | Editorial content in five fixed layouts | Layout frame counts enforced by `admin_save_lookbook` |
| `store_settings` | One row of public settings: name, currency, contact, checkout methods, shipping, policies, homepage copy | |
| `store_private_settings` | One row of admin-only settings | |
| `admins` | User ids allowed to manage the store | Owner-only writes |
| `orders` | Reference, status, payment status, totals, customer and address | `total = subtotal + shipping`; totals immutable (trigger) |
| `order_items` | Snapshot per line: name, colour, size, unit price, quantity, image | `line_total = unit_price × quantity` |
| `order_events` | Placed, status, payment and note history | |
| `private.checkout_attempts` | Recent order attempts per connection, for the checkout limit. Holds a keyed hash of the IP address, never the address, and is pruned after a day | Not reachable through the API |

## Row level security

| Table | Visitors (anon) and signed-in shoppers | Administrators |
| --- | --- | --- |
| `products`, `colorways`, `colorway_media`, `variants`, `rail_placements`, `featured_products`, `product_pairings` | Read rows of **active** products only | Full access |
| `media` | Read only images used by something published (`media_is_public()`) | Full access |
| `collections`, `collection_products` | Published collections, active products | Full access |
| `lookbooks`, `lookbook_spreads`, `looks`, `look_pieces` | Published content only | Full access |
| `categories`, `store_settings` | Read | Read; update settings |
| `store_private_settings` | None | Read and update |
| `orders`, `order_items`, `order_events` | **None** | Read; writes only through `admin_update_order()` |
| `admins` | A user can see their own row | Same (owner-only writes) |
| `storage.objects` (bucket `media`) | None (files are public by URL; names are random) | Read, upload, replace, delete |

The `media` bucket is public-read, limited to JPEG, PNG, WebP and AVIF, and 10 MB per file.

## Checkout protection

```
browser ──▶ place-order Edge Function ──▶ checkout_allow()   5 attempts / 10 min, 20 / day per connection
            (verify_jwt off)          ──▶ Cloudflare siteverify (Turnstile token, single use, action "checkout")
                                      ──▶ place_order()     validate, price, reserve stock: one transaction
```

- `place_order()` and `checkout_allow()` are executable by `service_role` only, so calling the API directly gets "permission denied". The function uses the project's secret key, which Supabase provides to Edge Functions; the browser never has it.
- The function fails closed. Without `TURNSTILE_SECRET_KEY`, every order is refused with `checkout_protection_not_configured`. It does the same for Cloudflare's published test secrets, which pass any token, unless `TURNSTILE_ALLOW_TEST_KEYS=true` is set (test projects only). Production builds of the store ignore test site keys.
- The client IP comes from the edge network's own headers. On hosted Supabase, forged `X-Forwarded-For`, `X-Real-IP` and `True-Client-IP` headers are ignored, and a forged `CF-Connecting-IP` is rejected by Cloudflare before the function runs (tested).
- A failed, unverified or throttled attempt never reaches `place_order()`. Database refusals (`insufficient_stock` and so on) pass through unchanged, so the store can correct the bag as before.
- The logic is in `handler.ts`, which uses only web-standard APIs. The tests run the same code in Node.
- Limits are in `…_checkout_protection.sql`. Turnstile is the main defence; the per-connection limit slows a single source down.

## Data API permissions

`…_api_grants.sql` sets the base permissions and `…_checkout_protection.sql` narrows checkout. It removes every grant the API roles hold on STILLFORM's tables and functions, then grants exactly what the store needs. The result is the same on a project that automatically exposes new tables and functions and on one that doesn't. `npm run test:permissions` checks both.

| Role | Tables | Functions |
| --- | --- | --- |
| `anon` | `SELECT` on the 15 catalogue tables and `store_settings` | `storefront_catalog`, `catalog_json`, `media_json`, `media_is_public`, `is_admin` |
| `authenticated` | The same reads, plus `INSERT`/`UPDATE`/`DELETE` on catalogue tables except `categories`; `UPDATE` on `store_settings`; `SELECT`/`UPDATE` on `store_private_settings`; `SELECT` on `orders`, `order_items`, `order_events` | The storefront functions, plus every `admin_*` function and its helpers |
| `service_role` (the Edge Function) | `private.checkout_attempts` | `place_order`, `checkout_allow` |
| `PUBLIC` | none | none |

Every write and admin read is still limited to administrators by row level security, and every admin function checks `is_admin()` first. Nobody but the owner can write orders, the order sequence or `admins`. `catalog_json(true)` returns the public view unless the caller is an administrator. Four functions run with owner rights: `place_order`, `admin_update_order`, `is_admin` and `media_is_public`. Each validates or authorises its own input, and like every function they pin `search_path` to empty. Storage grants belong to Supabase; the `media` bucket's policies are ours.

## Functions

| Function | Who | What it does |
| --- | --- | --- |
| `storefront_catalog()` | anyone | The published catalogue as one JSON document (the app's `Catalog` type). Filters to published content even for admins, and RLS filters again. |
| `checkout_allow(p_client)` | Edge Function | Records an order attempt and says whether the connection is under its limit. |
| `place_order(p_order)` | Edge Function | Validates contact, address, payment method and items (1–25 lines, 1–10 each); locks variants in SKU order; refuses sold-out, draft or unknown items; prices from the database; computes shipping from settings; inserts order, items and event; decrements stock. Atomic. |
| `is_admin()` | anyone | Whether the caller is in `admins`. |
| `admin_catalog()` | admin | Everything, including drafts, plus private settings. |
| `admin_save_product(p)` | admin | Product, colours, photos, stock, rail, feature, collections and pairings in one transaction. Publishing requires price > 0, sizes, and a front photo per colour. Stock edits are applied as a delta from what the editor showed, so concurrent orders are never lost. |
| `admin_set_product_status`, `admin_delete_product` | admin | Publish, unpublish, archive or delete. Orders keep their snapshots. |
| `admin_set_rail`, `admin_set_featured` | admin | Replace the rail or homepage selection (rail pieces need a front photo). |
| `admin_save_collection`, `admin_delete_collection` | admin | |
| `admin_save_lookbook(p)` | admin | Replaces a lookbook's spreads and looks; enforces layout frame counts. |
| `admin_create_media`, `admin_update_media` | admin | Register an uploaded image; set alt text and focal point. |
| `admin_unused_media`, `admin_delete_media` | admin | Find and delete images nothing uses. Deletes rows first, then the caller removes the files, so a reference is never broken. |
| `admin_save_settings(p_public, p_private)` | admin | Validated settings. Checkout can only open with an enabled payment method. |
| `admin_orders`, `admin_order`, `admin_update_order` | admin | List, search, open, change status, payment status and notes. |
| `admin_overview()` | admin | 30-day sales and orders, orders awaiting action, low-stock sizes, recent orders. |

Admin functions are not executable by `anon` at all, and each checks `is_admin()` as its first statement. `place_order` and `admin_update_order` run with owner rights (`security definer`), because no API role has write access to orders. All other functions run with the caller's rights, so row level security applies twice.

## Order lifecycle

```
pending → confirmed → shipped → delivered
pending | confirmed → cancelled          (stock is returned exactly once)
unpaid → paid → refunded
```

Enforced by a trigger on `orders`, so it holds for every update path. Cancelling returns each item's quantity to its variant, if the variant still exists, and stamps `restocked_at`. Cancelled is terminal, so stock can't be returned twice.

## Testing

| Suite | Command | Runs against |
| --- | --- | --- |
| Permissions | `npm run test:permissions` | Fresh Postgres twice, as a strict and as a legacy Supabase project: exact grants, the four owner-rights functions, checkout closed to direct calls, and the store working through those grants. |
| Database | `npm run test:db` | Real Postgres 17 (embedded) with the real `setup.sql` and a stand-in for Supabase's `auth` and `storage` schemas (`tests/db/supabase-shim.sql`). Covers RLS isolation, storage policies, admin authorisation, pricing, validation, concurrency, lifecycle, snapshots, idempotent setup, and the `place-order` handler: throttle, Turnstile outcomes, failing closed, errors passed through. |
| Browser, live | `npm run test:e2e` (project `live`) | The app in a browser against `tests/harness/server.mjs`: real Postgres with the real migrations; Supabase's REST (RPC), Auth (password grant) and Storage HTTP APIs emulated. Storage uploads are authorised by the real `storage.objects` policies. Checkout runs the real `place-order` handler, with Cloudflare's Turnstile test keys verified by Cloudflare. |
| Browser, demo | `npm run test:e2e` (projects `desktop`, `mobile`) | The storefront without a backend. |

| Real project | `npm run verify:remote`, `npm run test:remote` | Your linked Supabase project. See "For developers" in `docs/SETUP.md`. |

The emulated pieces mean the local suites prove the SQL and the app, not Supabase's own services. The real-project checks cover those.
