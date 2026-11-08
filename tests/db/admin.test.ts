import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anon, createUser, enableCheckout, expectError, orderPayload, owner, pool, rpc, stock, type Caller, server } from "./db";

let admin: Caller;
type Doc = { products: { id: string; status: string; colorways: { id: string; onRail?: boolean; media: { front?: string; back?: string } }[]; variants: { sku: string; stock: number }[]; featured?: boolean; pairsWith: string[] }[]; settings: { rail: { placements: { productId: string }[] } } };

async function media(src = "https://cdn.example/rail/coat.webp") {
  return rpc<{ id: string }>(admin, "admin_create_media", { p: { src, storagePath: `rail/${crypto.randomUUID()}.webp`, width: 1290, height: 2000, alt: "Coat" } });
}

function product(front: string | null, extra: Record<string, unknown> = {}) {
  return {
    isNew: true,
    slug: "field-coat",
    name: "Field Coat",
    category: "tops",
    status: "draft",
    price: 42000,
    summary: "A long coat in dense wool.",
    sizes: ["S", "M", "L"],
    colorways: [{ id: "charcoal", name: "Charcoal", swatch: "#3a3a3a", media: { front }, stock: { S: 2, M: 3, L: 0 }, onRail: true }],
    ...extra,
  };
}

beforeAll(async () => {
  admin = await createUser("admin@admin.test", true);
  await enableCheckout();
});
afterAll(() => pool.end());

describe("products", () => {
  it("creates a product from one front photograph and publishes it", async () => {
    const front = await media();
    await rpc(admin, "admin_save_product", { p: product(front.id) });
    let doc = await rpc<Doc>(anon, "storefront_catalog");
    expect(doc.products.find((p) => p.id === "field-coat")).toBeUndefined();

    await rpc(admin, "admin_set_product_status", { p_product: "field-coat", p_status: "active" });
    doc = await rpc<Doc>(anon, "storefront_catalog");
    const coat = doc.products.find((p) => p.id === "field-coat");
    expect(coat?.colorways[0]?.media).toEqual({ front: front.id, gallery: [], lifestyle: [], details: [] });
    expect(coat?.variants.map((v) => [v.sku, v.stock])).toEqual([["FIELD-COAT-CHARCOAL-S", 2], ["FIELD-COAT-CHARCOAL-M", 3], ["FIELD-COAT-CHARCOAL-L", 0]]);
    expect(doc.settings.rail.placements.at(-1)).toEqual({ productId: "field-coat", colorwayId: "charcoal" });
  });

  it("won't publish a product without a front photograph, a price or sizes", async () => {
    await expectError(rpc(admin, "admin_save_product", { p: product(null, { slug: "no-photo", status: "active" }) }), "not_publishable");
    expect(await owner("select 1 from public.products where id = 'no-photo'")).toHaveLength(0);
    const front = await media();
    await expectError(rpc(admin, "admin_save_product", { p: product(front.id, { slug: "free-coat", status: "active", price: 0 }) }), "not_publishable");
    await expectError(rpc(admin, "admin_save_product", { p: product(front.id, { slug: "no-sizes", status: "active", sizes: [] }) }), "not_publishable");
  });

  it("validates what the form sends", async () => {
    const front = await media();
    await expectError(rpc(admin, "admin_save_product", { p: product(front.id, { slug: "Bad Slug" }) }), "invalid_product");
    await expectError(rpc(admin, "admin_save_product", { p: product(front.id, { slug: "neg", price: -5 }) }), "invalid_product");
    await expectError(rpc(admin, "admin_save_product", { p: product(front.id, { slug: "field-coat" }) }), "slug_taken");
    await expectError(
      rpc(admin, "admin_save_product", { p: product(front.id, { slug: "neg-stock", colorways: [{ id: "a", name: "A", swatch: "#000000", media: { front: front.id }, stock: { S: -1 } }] }) }),
      "invalid_product",
    );
  });

  it("applies stock edits on top of orders placed while the form was open", async () => {
    const before = await stock("FIELD-COAT-CHARCOAL-M");
    await rpc(server, "place_order", { p_order: orderPayload([{ sku: "FIELD-COAT-CHARCOAL-M", quantity: 1 }]) });
    const front = (await owner<{ media_id: string }>("select media_id from public.colorway_media where product_id = 'field-coat' and role = 'front'"))[0]!.media_id;
    // The editor showed 3 in M and the owner typed 10: they meant "add 7".
    await rpc(admin, "admin_save_product", {
      p: { ...product(front), isNew: false, id: "field-coat", status: "active", colorways: [{ id: "charcoal", name: "Charcoal", swatch: "#3a3a3a", media: { front }, stock: { S: 2, M: 10, L: 0 }, stockBase: { S: 2, M: before, L: 0 }, onRail: true }] },
    });
    expect(await stock("FIELD-COAT-CHARCOAL-M")).toBe(10 - 1);
  });

  it("adds a back photograph, a pairing and the homepage feature", async () => {
    const front = (await owner<{ media_id: string }>("select media_id from public.colorway_media where product_id = 'field-coat' and role = 'front'"))[0]!.media_id;
    const back = await media("https://cdn.example/rail/coat-back.webp");
    await rpc(admin, "admin_save_product", {
      p: { ...product(front), isNew: false, id: "field-coat", status: "active", featured: true, pairsWith: ["henley", "field-coat", "missing"], colorways: [{ id: "charcoal", name: "Charcoal", swatch: "#3a3a3a", media: { front, back: back.id }, stock: { S: 2, M: 9, L: 0 }, onRail: true }] },
    });
    const coat = (await rpc<Doc>(anon, "storefront_catalog")).products.find((p) => p.id === "field-coat");
    expect(coat?.colorways[0]?.media.back).toBe(back.id);
    expect(coat?.pairsWith).toEqual(["henley"]);
    const adminDoc = await rpc<Doc>(admin, "admin_catalog");
    expect(adminDoc.products.find((p) => p.id === "field-coat")?.featured).toBe(true);
  });

  it("archives and deletes without touching past orders", async () => {
    await rpc(admin, "admin_set_product_status", { p_product: "field-coat", p_status: "archived" });
    expect((await rpc<Doc>(anon, "storefront_catalog")).products.find((p) => p.id === "field-coat")).toBeUndefined();
    const ordered = await owner("select 1 from public.order_items where product_id = 'field-coat'");
    await rpc(admin, "admin_delete_product", { p_product: "field-coat" });
    expect(await owner("select 1 from public.order_items where product_id = 'field-coat'")).toHaveLength(ordered.length);
  });
});

describe("rail, lookbook and settings", () => {
  it("reorders the rail and refuses pieces without a front photograph", async () => {
    await rpc(admin, "admin_set_rail", { p_placements: [{ productId: "heavyweight-tee", colorwayId: "black" }, { productId: "henley", colorwayId: "rust" }] });
    const placements = (await rpc<Doc>(anon, "storefront_catalog")).settings.rail.placements;
    expect(placements.map((p) => p.productId)).toEqual(["heavyweight-tee", "henley"]);
    await owner("insert into public.products (id, slug, name, category_id, price) values ('bare', 'bare', 'Bare', 'tops', 100); insert into public.colorways (product_id, id, name) values ('bare', 'x', 'X')");
    await expectError(rpc(admin, "admin_set_rail", { p_placements: [{ productId: "bare", colorwayId: "x" }] }), "invalid_rail");
  });

  it("keeps lookbook spreads to their curated layouts", async () => {
    const doc = await rpc<{ lookbooks: { id: string; title: string; season: string; summary: string; spreads: { id: string; layout: string; looks: unknown[] }[] }[] }>(admin, "admin_catalog");
    const book = doc.lookbooks[0]!;
    const broken = { ...book, spreads: [{ ...book.spreads[0]!, looks: [] }] };
    await expectError(rpc(admin, "admin_save_lookbook", { p: broken }), "invalid_lookbook");
    const reordered = { ...book, title: "Lookbook, revised", spreads: [...book.spreads].reverse() };
    await rpc(admin, "admin_save_lookbook", { p: reordered });
    const after = await rpc<{ lookbooks: { title: string; spreads: { id: string }[] }[] }>(anon, "storefront_catalog");
    expect(after.lookbooks[0]?.title).toBe("Lookbook, revised");
    expect(after.lookbooks[0]?.spreads.map((s) => s.id)).toEqual(book.spreads.map((s) => s.id).reverse());
  });

  it("only enables checkout with at least one payment method, and keeps private settings private", async () => {
    const base = { name: "STILLFORM", currency: "USD", checkout: { enabled: true, methods: [{ id: "cod", label: "Cash on delivery", instructions: "", enabled: false }] }, shipping: { flatRate: 0, freeOver: null } };
    await expectError(rpc(admin, "admin_save_settings", { p_public: base, p_private: {} }), "invalid_settings");
    await expectError(rpc(admin, "admin_save_settings", { p_public: { ...base, currency: "dollars" }, p_private: {} }), "invalid_settings");
    await expectError(rpc(admin, "admin_save_settings", { p_public: { ...base, checkout: { enabled: false, methods: [{ id: "crypto", label: "Crypto", enabled: true }] } }, p_private: {} }), "invalid_settings");
    const valid = { ...base, checkout: { enabled: true, methods: [{ id: "cod", label: "Cash on delivery", instructions: "Pay on delivery.", enabled: true }] } };
    await rpc(admin, "admin_save_settings", { p_public: valid, p_private: { orderNotificationEmail: "orders@stillform.example", notes: "Supplier: Mill & Co" } });
    const publicDoc = JSON.stringify(await rpc(anon, "storefront_catalog"));
    expect(publicDoc).not.toContain("orders@stillform.example");
    expect(publicDoc).not.toContain("Supplier");
    expect(JSON.stringify(await rpc(admin, "admin_catalog"))).toContain("orders@stillform.example");
  });
});

describe("media and setup", () => {
  it("cleans up only images nothing uses", async () => {
    const used = (await owner<{ media_id: string }>("select media_id from public.colorway_media limit 1"))[0]!.media_id;
    const spare = await media("https://cdn.example/rail/spare.webp");
    const unused = await rpc<{ id: string }[]>(admin, "admin_unused_media");
    expect(unused.map((m) => m.id)).toContain(spare.id);
    expect(unused.map((m) => m.id)).not.toContain(used);
    const removed = await rpc<{ id: string; storagePath: string }[]>(admin, "admin_delete_media", { p_ids: [spare.id, used] });
    expect(removed.map((m) => m.id)).toEqual([spare.id]);
    expect(removed[0]?.storagePath).toMatch(/^rail\//);
    expect(await owner("select 1 from public.media where id = $1", [used])).toHaveLength(1);
  });

  it("can run the whole setup script again without changing the store", async () => {
    const before = await owner("select (select count(*) from public.products) p, (select count(*) from public.variants) v, (select sum(stock) from public.variants) s, (select name from public.store_settings) n");
    await owner(readFileSync("supabase/setup.sql", "utf8"));
    const after = await owner("select (select count(*) from public.products) p, (select count(*) from public.variants) v, (select sum(stock) from public.variants) s, (select name from public.store_settings) n");
    expect(after).toEqual(before);
  });
});
