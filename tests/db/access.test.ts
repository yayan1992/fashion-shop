import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, as, createUser, enableCheckout, expectError, orderPayload, owner, pool, rpc, type Caller, server } from "./db";

// Who can read and change what. Every check runs as the API role a real
// request would use (anon, a signed-in shopper, an administrator).

let shopper: Caller;
let admin: Caller;

beforeAll(async () => {
  shopper = await createUser("shopper@access.test");
  admin = await createUser("admin@access.test", true);
  await enableCheckout();
  // A draft product with its own media, an unpublished look and an order with customer details.
  await owner(`
    insert into public.media (id, src, width, height) values ('test-draft-front', '/draft.webp', 645, 1000) on conflict do nothing;
    insert into public.products (id, slug, name, category_id, status, price, sizes) values ('secret-coat', 'secret-coat', 'Secret Coat', 'tops', 'draft', 90000, '{M}') on conflict do nothing;
    insert into public.colorways (product_id, id, name) values ('secret-coat', 'black', 'Black') on conflict do nothing;
    insert into public.colorway_media (product_id, colorway_id, role, media_id) values ('secret-coat', 'black', 'front', 'test-draft-front') on conflict do nothing;
    insert into public.variants (sku, product_id, colorway_id, size, stock) values ('SECRET-COAT-BLACK-M', 'secret-coat', 'black', 'M', 5) on conflict do nothing;
    insert into public.rail_placements (product_id, colorway_id, position) values ('secret-coat', 'black', 99) on conflict do nothing;
    update public.looks set published = false where id = 'detail-04';
  `);
  await rpc(server, "place_order", { p_order: orderPayload([{ sku: "HENLEY-RUST-M", quantity: 1 }]) });
});

afterAll(async () => {
  await owner("update public.looks set published = true where id = 'detail-04'");
  await pool.end();
});

describe("published storefront data", () => {
  it("shows visitors only active products, published looks and their media", async () => {
    const catalog = await rpc<{ products: { id: string }[]; media: Record<string, unknown>; settings: { rail: { placements: { productId: string }[] } }; lookbooks: { spreads: { looks: { id: string }[] }[] }[] }>(anon, "storefront_catalog");
    expect(catalog.products.map((p) => p.id)).not.toContain("secret-coat");
    const seeded = ["heavyweight-tee", "mariner-long-sleeve", "oxford-shirt", "lambswool-cardigan", "henley", "fleece-hoodie", "fleece-crew", "pique-polo"];
    expect(catalog.products.map((p) => p.id)).toEqual(expect.arrayContaining(seeded));
    expect(catalog.products.every((p) => (p as { status?: string }).status === "active")).toBe(true);
    expect(catalog.media["test-draft-front"]).toBeUndefined();
    expect(catalog.settings.rail.placements.map((p) => p.productId)).not.toContain("secret-coat");
    expect(catalog.lookbooks[0]!.spreads.flatMap((s) => s.looks.map((l) => l.id))).not.toContain("detail-04");
  });

  it("shows an administrator browsing the shop the same published view", async () => {
    const catalog = await rpc<{ products: { id: string }[] }>(admin, "storefront_catalog");
    expect(catalog.products.map((p) => p.id)).not.toContain("secret-coat");
  });

  it("keeps drafts out of direct table reads too", async () => {
    for (const caller of [anon, shopper]) {
      expect(await as(caller, "select id from public.products where id = 'secret-coat'")).toHaveLength(0);
      expect(await as(caller, "select sku from public.variants where product_id = 'secret-coat'")).toHaveLength(0);
      expect(await as(caller, "select id from public.media where id = 'test-draft-front'")).toHaveLength(0);
      expect(await as(caller, "select id from public.looks where id = 'detail-04'")).toHaveLength(0);
    }
    expect(await as(admin, "select id from public.products where id = 'secret-coat'")).toHaveLength(1);
  });

  it("lets anyone read the public settings", async () => {
    const rows = await as<{ name: string }>(anon, "select name from public.store_settings");
    expect(rows[0]?.name).toBe("STILLFORM");
  });
});

describe("private data", () => {
  it("never shows orders, order items or customer details to visitors or shoppers", async () => {
    for (const table of ["orders", "order_items", "order_events"]) {
      // Visitors have no access at all; signed-in shoppers are filtered to nothing.
      await expectError(as(anon, `select * from public.${table}`), "permission denied");
      expect(await as(shopper, `select * from public.${table}`)).toHaveLength(0);
    }
    expect((await as(admin, "select email from public.orders")).length).toBeGreaterThan(0);
  });

  it("keeps private settings and the admin list private", async () => {
    await expectError(as(anon, "select * from public.store_private_settings"), "permission denied");
    expect(await as(shopper, "select * from public.store_private_settings")).toHaveLength(0);
    await expectError(as(shopper, "select * from public.admins"), "permission denied");
    expect(await as(admin, "select * from public.store_private_settings")).toHaveLength(1);
  });

  it("reports admin status from the database, not the client", async () => {
    expect(await rpc(anon, "is_admin")).toBe(false);
    expect(await rpc(shopper, "is_admin")).toBe(false);
    expect(await rpc(admin, "is_admin")).toBe(true);
  });
});

describe("writes", () => {
  it("refuses catalogue changes from visitors and shoppers", async () => {
    // Visitors hold no write privileges at all.
    await expectError(as(anon, "update public.products set price = 1 where id = 'henley'"), "permission denied");
    await expectError(as(anon, "update public.variants set stock = 999 where sku = 'HENLEY-RUST-M'"), "permission denied");
    await expectError(as(anon, "insert into public.products (id, slug, name, category_id, price) values ('x', 'x', 'X', 'tops', 1)"), "permission denied");
    await expectError(as(anon, "update public.store_settings set name = 'Hacked' where id"), "permission denied");
    // Signed-in shoppers share the dashboard's privileges, and row level security stops them.
    expect(await as(shopper, "update public.products set price = 1 where id = 'henley' returning id")).toHaveLength(0);
    expect(await as(shopper, "update public.variants set stock = 999 where sku = 'HENLEY-RUST-M' returning sku")).toHaveLength(0);
    await expectError(as(shopper, "insert into public.products (id, slug, name, category_id, price) values ('x', 'x', 'X', 'tops', 1)"), "row-level security");
    expect(await as(shopper, "update public.store_settings set name = 'Hacked' where id returning id")).toHaveLength(0);
    expect((await owner<{ price: number }>("select price from public.products where id = 'henley'"))[0]?.price).toBe(12000);
  });

  it("refuses to let anyone write orders directly or make themselves admin", async () => {
    for (const caller of [anon, shopper, admin]) {
      await expectError(as(caller, "insert into public.orders (reference, payment_method, payment_method_label, currency, subtotal, shipping, total, email, name, address) values ('X-1', 'cod', 'COD', 'USD', 0, 0, 0, 'a@b.co', 'A', '{}')"), "permission denied");
      await expectError(as(caller, "update public.orders set status = 'delivered'"), "permission denied");
    }
    await expectError(as(shopper, "insert into public.admins (user_id) values (auth.uid())"), "permission denied");
  });

  it("blocks every admin function for visitors and shoppers", async () => {
    await expectError(rpc(anon, "admin_catalog"), "permission denied");
    await expectError(rpc(anon, "admin_save_product", { p: {} }), "permission denied");
    await expectError(rpc(shopper, "admin_catalog"), "not_authorized");
    await expectError(rpc(shopper, "admin_orders"), "not_authorized");
    await expectError(rpc(shopper, "admin_update_order", { p_reference: "SF-1001", p_status: "cancelled" }), "not_authorized");
    await expectError(rpc(shopper, "admin_save_settings", { p_public: {}, p_private: {} }), "not_authorized");
    await expectError(rpc(shopper, "admin_set_rail", { p_placements: [] }), "not_authorized");
  });
});

describe("storage", () => {
  const upload = (caller: Caller, bucket = "media") =>
    as(caller, "insert into storage.objects (bucket_id, name, owner) values ($1, $2, auth.uid()) returning name", [bucket, `rail/${crypto.randomUUID()}.webp`]);

  it("lets only administrators upload, list, replace and delete product images", async () => {
    await expectError(upload(anon), "row-level security");
    await expectError(upload(shopper), "row-level security");
    const [file] = await upload(admin);
    expect(file).toBeDefined();
    expect(await as(anon, "select name from storage.objects where bucket_id = 'media'")).toHaveLength(0);
    expect(await as(shopper, "delete from storage.objects where bucket_id = 'media' returning name")).toHaveLength(0);
    expect((await as(admin, "select name from storage.objects where bucket_id = 'media'")).length).toBeGreaterThan(0);
    expect((await as(admin, "delete from storage.objects where bucket_id = 'media' returning name")).length).toBeGreaterThan(0);
  });

  it("serves the bucket publicly with type and size limits", async () => {
    const [bucket] = await owner<{ public: boolean; file_size_limit: string; allowed_mime_types: string[] }>("select * from storage.buckets where id = 'media'");
    expect(bucket?.public).toBe(true);
    expect(Number(bucket?.file_size_limit)).toBe(10 * 1024 * 1024);
    expect(bucket?.allowed_mime_types).toEqual(["image/jpeg", "image/png", "image/webp", "image/avif"]);
  });
});
