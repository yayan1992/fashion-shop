// Focused check of the Data API permissions in supabase/setup.sql.
//
//   node tests/db/permissions.mjs
//
// Builds a fresh Postgres twice, once like a new Supabase project that does
// not expose new tables and functions automatically ("strict"), once like an
// older project that exposes everything by default ("legacy"), and checks
// that both end with the same minimal grants and a working store.

import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

const TABLES = ["media", "categories", "products", "colorways", "colorway_media", "variants", "collections", "collection_products", "rail_placements", "featured_products", "product_pairings", "lookbooks", "lookbook_spreads", "looks", "look_pieces", "store_settings", "store_private_settings", "orders", "order_items", "order_events", "admins"];
const CATALOGUE = TABLES.slice(0, 15);
const EDITABLE = CATALOGUE.filter((t) => t !== "categories");

// Expected privileges: table → { anon: [...], authenticated: [...] }
const expected = Object.fromEntries(TABLES.map((t) => [t, { anon: [], authenticated: [] }]));
for (const t of [...CATALOGUE, "store_settings"]) expected[t].anon.push("SELECT"), expected[t].authenticated.push("SELECT");
for (const t of EDITABLE) expected[t].authenticated.push("INSERT", "UPDATE", "DELETE");
expected.store_settings.authenticated.push("UPDATE");
expected.store_private_settings.authenticated.push("SELECT", "UPDATE");
for (const t of ["orders", "order_items", "order_events"]) expected[t].authenticated.push("SELECT");

const STOREFRONT_FNS = ["storefront_catalog", "catalog_json", "media_json", "media_is_public", "is_admin"];
// Called only by the place-order Edge Function, with the server key.
const SERVER_FNS = ["place_order", "checkout_allow"];
const DEFINER = ["admin_update_order", "is_admin", "media_is_public", "place_order"];

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${ok || !detail ? "" : `\n      ${detail}`}`);
};

async function run(mode) {
  console.log(`\n${mode === "strict" ? "Strict project (new tables and functions not exposed automatically)" : "Legacy project (everything exposed by default)"}`);
  const dir = mkdtempSync(join(tmpdir(), "stillform-perm-"));
  const port = 56000 + Math.floor(Math.random() * 2000);
  const server = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "postgres", port, persistent: false, onLog: () => {}, onError: () => {} });
  await server.initialise();
  await server.start();
  const pool = new pg.Pool({ connectionString: `postgres://postgres:postgres@localhost:${port}/postgres`, max: 4 });
  try {
    await pool.query(readFileSync("tests/db/supabase-shim.sql", "utf8"));
    if (mode === "legacy") {
      await pool.query(`grant usage on schema public to anon, authenticated, service_role;
        alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
        alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
        alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;`);
    }
    await pool.query(readFileSync("supabase/setup.sql", "utf8"));

    // 1. Table privileges, exactly.
    const { rows: privs } = await pool.query(`
      select c.relname as t, r.role, array(
        select p from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
        where has_table_privilege(r.role, c.oid, p) order by p) as granted
      from pg_class c cross join (values ('anon'), ('authenticated')) r(role)
      where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'`);
    const wrong = privs.filter((row) => JSON.stringify(row.granted) !== JSON.stringify([...(expected[row.t]?.[row.role] ?? [])].sort()));
    check("table privileges match the minimal set for anon and authenticated", wrong.length === 0, wrong.map((w) => `${w.role} on ${w.t}: ${w.granted.join(", ") || "none"}`).join("; "));
    check("no API role can read orders, customers, private settings or the admin list as a visitor",
      privs.filter((r) => r.role === "anon" && ["orders", "order_items", "order_events", "store_private_settings", "admins"].includes(r.t)).every((r) => r.granted.length === 0));

    // 2. Function EXECUTE.
    const { rows: fns } = await pool.query(`
      select p.proname as name, p.prosecdef as definer, coalesce(array_to_string(p.proconfig, ','), '') as config,
        has_function_privilege('anon', p.oid, 'execute') as anon,
        has_function_privilege('authenticated', p.oid, 'execute') as auth,
        has_function_privilege('service_role', p.oid, 'execute') as server,
        exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE') as public
      from pg_proc p where p.pronamespace = 'public'::regnamespace`);
    const trigger = ["touch_updated_at", "orders_guard"];
    const bad = fns.filter((f) => {
      const serverOnly = SERVER_FNS.includes(f.name);
      const wantAnon = STOREFRONT_FNS.includes(f.name);
      const wantAuth = !trigger.includes(f.name) && !serverOnly;
      return f.public || f.anon !== wantAnon || f.auth !== wantAuth || (serverOnly && !f.server);
    });
    check(`EXECUTE granted explicitly: ${STOREFRONT_FNS.length} storefront functions to anon, ${fns.length - STOREFRONT_FNS.length - SERVER_FNS.length - 2} dashboard functions to authenticated only, ${SERVER_FNS.join(" and ")} to the server role only, nothing to PUBLIC`, bad.length === 0, bad.map((f) => `${f.name}: public=${f.public} anon=${f.anon} authenticated=${f.auth} server=${f.server}`).join("; "));
    const { rows: [priv] } = await pool.query("select has_schema_privilege('anon', 'private', 'usage') as anon, has_schema_privilege('authenticated', 'private', 'usage') as auth, has_table_privilege('service_role', 'private.checkout_attempts', 'insert') as server");
    check("checkout attempts are out of the API's reach (private schema, server role only)", !priv.anon && !priv.auth && priv.server);
    const definers = fns.filter((f) => f.definer).map((f) => f.name).sort();
    check(`exactly ${DEFINER.length} SECURITY DEFINER functions (${DEFINER.join(", ")})`, JSON.stringify(definers) === JSON.stringify(DEFINER), definers.join(", "));
    check("every function pins search_path to empty", fns.every((f) => f.config === 'search_path=""'), fns.filter((f) => f.config !== 'search_path=""').map((f) => f.name).join(", "));

    // 3. The store works through those grants.
    const adminId = randomUUID();
    const shopperId = randomUUID();
    await pool.query("insert into auth.users (id, email) values ($1, 'admin@perm.test'), ($2, 'shopper@perm.test')", [adminId, shopperId]);
    await pool.query("insert into public.admins (user_id) values ($1)", [adminId]);
    const as = async (role, sub, sql, params = []) => {
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query(`set local role ${role}`);
        await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(sub ? { role, sub } : { role })]);
        const result = await client.query(sql, params);
        await client.query("commit");
        return result.rows;
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    };
    const anon = (sql, p) => as("anon", null, sql, p);
    const shopper = (sql, p) => as("authenticated", shopperId, sql, p);
    const admin = (sql, p) => as("authenticated", adminId, sql, p);
    const fails = async (promise, pattern) => promise.then(() => false, (e) => pattern.test(e.message));

    const catalog = (await anon("select public.storefront_catalog() as c"))[0].c;
    check("visitor loads the storefront catalogue (8 products, rail, lookbook)", catalog.products.length === 8 && catalog.settings.rail.placements.length === 8 && catalog.lookbooks.length === 1);
    const asAdminFlag = (await anon("select public.catalog_json(true) as c"))[0].c;
    check("a visitor asking catalog_json for admin mode gets the public view", !JSON.stringify(asAdminFlag).includes('"featured"') && !asAdminFlag.privateSettings);
    await pool.query(`update public.store_settings set checkout = jsonb_set(checkout, '{enabled}', 'true') where id`);
    const server = (sql, p) => as("service_role", null, sql, p);
    check("visitor and shopper cannot place orders directly, bypassing the checkout function", (await fails(anon("select public.place_order('{}'::jsonb)"), /permission denied/)) && (await fails(shopper("select public.place_order('{}'::jsonb)"), /permission denied/)));
    const order = (await server("select public.place_order($1::jsonb) as o", [JSON.stringify({ paymentMethod: "cod", contact: { email: "test@example.com", name: "Test Customer", phone: "+1 555 0100" }, address: { line1: "1 Test St", city: "Testville", postalCode: "00000", country: "Testland" }, items: [{ sku: "HENLEY-RUST-M", quantity: 1, price: 1 }] })]))[0].o;
    check("the checkout function places an order, priced by the database", order.total === 12000);
    check("visitor cannot read orders or private settings", (await fails(anon("select * from public.orders"), /permission denied/)) && (await fails(anon("select * from public.store_private_settings"), /permission denied/)));
    check("visitor cannot write the catalogue", await fails(anon("update public.products set price = 1"), /permission denied/));
    check("visitor cannot call admin functions", await fails(anon("select public.admin_catalog()"), /permission denied/));
    check("visitor cannot use the order number sequence", await fails(anon("select nextval('public.order_number_seq')"), /permission denied/));
    check("signed-in shopper sees no orders and no private settings", (await shopper("select * from public.orders")).length === 0 && (await shopper("select * from public.store_private_settings")).length === 0);
    check("signed-in shopper is refused by every admin function", (await fails(shopper("select public.admin_catalog()"), /not_authorized/)) && (await fails(shopper("select public.admin_update_order('SF-1001', 'cancelled')"), /not_authorized/)) && (await fails(shopper("select public.admin_save_settings('{}', '{}')"), /not_authorized/)));
    check("signed-in shopper cannot change prices or stock directly", (await shopper("update public.variants set stock = 999 returning sku")).length === 0 && (await shopper("update public.products set price = 1 returning id")).length === 0);
    check("signed-in shopper cannot write orders or make themselves admin", (await fails(shopper("update public.orders set status = 'delivered'"), /permission denied/)) && (await fails(shopper("insert into public.admins (user_id) values (auth.uid())"), /permission denied/)));

    // Every dashboard function, once, as an administrator.
    const adminCatalog = (await admin("select public.admin_catalog() as c"))[0].c;
    check("admin_catalog", adminCatalog.products.length === 8 && "privateSettings" in adminCatalog);
    const media = (await admin("select public.admin_create_media($1::jsonb) as m", [JSON.stringify({ src: "https://example.test/rail/a.webp", storagePath: "rail/a.webp", width: 1290, height: 2000, alt: "Test" })]))[0].m;
    await admin("select public.admin_update_media($1, 'Test tee', '50% 40%')", [media.id]);
    await admin("select public.admin_save_product($1::jsonb)", [JSON.stringify({ isNew: true, slug: "perm-tee", name: "Permission Tee", category: "tops", status: "active", price: 5000, sizes: ["M"], colorways: [{ id: "ink", name: "Ink", swatch: "#111111", media: { front: media.id }, stock: { M: 3 }, onRail: true }], featured: true, pairsWith: ["henley"], collectionIds: ["collection-01"] })]);
    check("admin_create_media, admin_update_media, admin_save_product (uses sku_for, assert_publishable)", (await pool.query("select stock from public.variants where sku = 'PERM-TEE-INK-M'")).rows[0]?.stock === 3);
    await admin("select public.admin_set_product_status('perm-tee', 'draft')");
    await admin("select public.admin_set_rail($1::jsonb)", [JSON.stringify(catalog.settings.rail.placements)]);
    await admin("select public.admin_set_featured($1::jsonb)", [JSON.stringify(catalog.settings.home.featuredProductIds)]);
    await admin("select public.admin_save_collection($1::jsonb)", [JSON.stringify({ isNew: true, slug: "perm-test", title: "Permission test", productIds: ["henley"] })]);
    await admin("select public.admin_delete_collection('perm-test')");
    await admin("select public.admin_save_lookbook($1::jsonb)", [JSON.stringify(adminCatalog.lookbooks[0])]);
    await admin("select public.admin_save_settings($1::jsonb, $2::jsonb)", [JSON.stringify({ ...catalog.settings, checkout: catalog.settings.checkout }), JSON.stringify({ orderNotificationEmail: "orders@example.test", notes: "" })]);
    check("admin_set_product_status, admin_set_rail, admin_set_featured, admin_save/delete_collection, admin_save_lookbook, admin_save_settings", true);
    const list = (await admin("select public.admin_orders(null, null, 10, 0) as o"))[0].o;
    const detail = (await admin("select public.admin_order($1) as o", [order.reference]))[0].o;
    const cancelled = (await admin("select public.admin_update_order($1, 'cancelled') as o", [order.reference]))[0].o;
    const overview = (await admin("select public.admin_overview() as o"))[0].o;
    check("admin_orders, admin_order, admin_update_order (cancel restocks), admin_overview", list.total === 1 && detail.items.length === 1 && cancelled.status === "cancelled" && overview.orders30 === 1 && (await pool.query("select stock from public.variants where sku = 'HENLEY-RUST-M'")).rows[0].stock === 8);
    await admin("select public.admin_delete_product('perm-tee')");
    const unused = (await admin("select public.admin_unused_media() as m"))[0].m;
    const removed = (await admin("select public.admin_delete_media($1::jsonb) as m", [JSON.stringify([media.id])]))[0].m;
    check("admin_delete_product, admin_unused_media, admin_delete_media", unused.some((m) => m.id === media.id) && removed.length === 1);

    // Storage (Supabase manages storage grants; the policies are ours).
    const upload = (who) => who("insert into storage.objects (bucket_id, name, owner) values ('media', $1, auth.uid()) returning name", [`rail/${randomUUID()}.webp`]);
    check("storage: only administrators can upload to the media bucket", (await fails(upload(anon), /row-level security/)) && (await fails(upload(shopper), /row-level security/)) && (await upload(admin)).length === 1);
  } catch (error) {
    failures++;
    console.log(`  ✗ unexpected error: ${error.message}`);
  } finally {
    await pool.end();
    await server.stop();
    rmSync(dir, { recursive: true, force: true });
  }
}

await run("strict");
await run("legacy");
console.log(failures ? `\n${failures} check(s) failed` : "\nAll permission checks passed in both project types.");
process.exit(failures ? 1 : 0);
