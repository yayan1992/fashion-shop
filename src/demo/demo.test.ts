import { beforeEach, describe, expect, it } from "vitest";
import type { AdminCatalog, OrderDetail } from "@/admin/api";
import { railEntries } from "@/catalog/selectors";
import { demoCall } from "./rpc";
import { demoStore } from "./store";

const admin = () => demoCall<AdminCatalog>("admin_catalog");
const code = async (promise: Promise<unknown>) => promise.then(() => "ok", (e: Error & { detail?: string }) => `${e.message}${e.detail ? `:${e.detail}` : ""}`);

beforeEach(() => demoStore.reset());

describe("the demo catalogue", () => {
  it("starts as the built-in collection plus one draft, with checkout closed", async () => {
    const catalog = await admin();
    expect(catalog.products.filter((p) => p.status === "active")).toHaveLength(8);
    expect(catalog.products.filter((p) => p.status === "draft")).toHaveLength(1);
    const store = demoStore.storefront();
    expect(store.products.map((p) => p.id)).not.toContain("linen-overshirt");
    expect(store.settings.checkout?.enabled).toBe(false);
    expect(railEntries(store)).toHaveLength(8);
  });

  it("shows price, stock and rail changes in the storefront", async () => {
    const tee = (await admin()).products.find((p) => p.id === "heavyweight-tee")!;
    const colorways = tee.colorways.map((c) => ({
      id: c.id, name: c.name, swatch: c.swatch, media: c.media, onRail: c.id !== "black",
      stock: Object.fromEntries(tee.variants.filter((v) => v.colorwayId === c.id).map((v) => [v.size, v.stock + 5])),
      stockBase: Object.fromEntries(tee.variants.filter((v) => v.colorwayId === c.id).map((v) => [v.size, v.stock])),
    }));
    await demoCall("admin_save_product", { p: { ...tee, price: 9900, colorways } });
    const store = demoStore.storefront();
    const saved = store.products.find((p) => p.id === "heavyweight-tee")!;
    expect(saved.price).toBe(9900);
    expect(saved.variants.find((v) => v.sku === "HEAVYWEIGHT-TEE-BONE-M")!.stock).toBe(17);
    expect(railEntries(store).some((e) => e.productId === "heavyweight-tee" && e.colorwayId === "black")).toBe(false);
  });

  it("publishes a draft and hides an archived piece everywhere", async () => {
    await demoCall("admin_set_product_status", { p_product: "linen-overshirt", p_status: "active" });
    expect(demoStore.storefront().products.map((p) => p.id)).toContain("linen-overshirt");
    await demoCall("admin_set_product_status", { p_product: "oxford-shirt", p_status: "archived" });
    const store = demoStore.storefront();
    expect(store.products.map((p) => p.id)).not.toContain("oxford-shirt");
    expect(railEntries(store).some((e) => e.productId === "oxford-shirt")).toBe(false);
    expect(store.collections[0]!.productIds).not.toContain("oxford-shirt");
  });

  it("validates like the database", async () => {
    const tee = (await admin()).products.find((p) => p.id === "heavyweight-tee")!;
    expect(await code(demoCall("admin_save_product", { p: { ...tee, slug: "Bad Slug" } }))).toBe("invalid_product:slug");
    expect(await code(demoCall("admin_save_product", { p: { ...tee, isNew: true, id: undefined, slug: "henley" } }))).toBe("slug_taken");
    expect(await code(demoCall("admin_set_rail", { p_placements: [{ productId: "nope", colorwayId: "x" }] }))).toBe("invalid_rail:front_image:nope/x");
    const draft = (await admin()).products.find((p) => p.id === "linen-overshirt")!;
    const bare = draft.colorways.map((c) => ({ ...c, media: { ...c.media, front: null }, stock: {} }));
    expect(await code(demoCall("admin_save_product", { p: { ...draft, status: "active", colorways: bare } }))).toMatch(/^not_publishable:front_image:/);
  });

  it("reorders the rail and resets to the original", async () => {
    const before = demoStore.storefront().settings.rail.placements;
    await demoCall("admin_set_rail", { p_placements: [...before].reverse() });
    expect(demoStore.storefront().settings.rail.placements[0]).toEqual(before[before.length - 1]);
    demoStore.reset();
    expect(demoStore.storefront().settings.rail.placements).toEqual(before);
  });

  it("drops a deleted product from the rail, collections and lookbook", async () => {
    await demoCall("admin_delete_product", { p_product: "henley" });
    const store = demoStore.storefront();
    expect(store.settings.rail.placements.some((p) => p.productId === "henley")).toBe(false);
    expect(store.collections[0]!.productIds).not.toContain("henley");
    expect(JSON.stringify(store.lookbooks)).not.toContain('"productId":"henley"');
  });

  it("keeps collections and lookbook changes in the store", async () => {
    await demoCall("admin_save_collection", { p: { isNew: true, slug: "capsule", title: "Capsule", season: "Spring", summary: "", productIds: ["henley"], published: true } });
    await demoCall("admin_save_collection", { p: { id: "capsule", slug: "capsule", title: "Capsule", season: "Spring", summary: "", productIds: ["henley"], published: false } });
    expect(demoStore.storefront().collections.map((c) => c.id)).not.toContain("capsule");
    const book = (await admin()).lookbooks[0]!;
    expect(await code(demoCall("admin_save_lookbook", { p: { ...book, spreads: [{ ...book.spreads[0]!, layout: "pair" }] } }))).toBe("invalid_lookbook:frames:pair");
    await demoCall("admin_save_lookbook", { p: { ...book, title: "Edited lookbook" } });
    expect(demoStore.storefront().lookbooks[0]!.title).toBe("Edited lookbook");
  });
});

describe("demo orders", () => {
  it("follows the order rules and returns stock when cancelled", async () => {
    const order = await demoCall<OrderDetail>("admin_order", { p_reference: "SF-1014" });
    const sku = order.items[0]!.sku;
    const stock = () => demoStore.state().catalog.products.flatMap((p) => p.variants).find((v) => v.sku === sku)!.stock;
    const before = stock();
    expect(await code(demoCall("admin_update_order", { p_reference: "SF-1014", p_status: "delivered" }))).toBe("invalid_status_transition:pending -> delivered");
    const cancelled = await demoCall<OrderDetail>("admin_update_order", { p_reference: "SF-1014", p_status: "cancelled" });
    expect(cancelled.status).toBe("cancelled");
    expect(stock()).toBe(before + order.items[0]!.quantity);
    expect(await code(demoCall("admin_update_order", { p_reference: "SF-1014", p_payment_status: "refunded" }))).toBe("invalid_payment_transition:unpaid -> refunded");
  });

  it("lists, searches and summarises", async () => {
    const all = await demoCall<{ total: number; orders: OrderDetail[] }>("admin_orders", { p_search: null, p_status: null, p_limit: 50, p_offset: 0 });
    expect(all.total).toBe(12);
    const found = await demoCall<{ total: number }>("admin_orders", { p_search: "marlowe", p_status: null });
    expect(found.total).toBe(2);
    const overview = await demoCall<{ awaiting: number; recent: unknown[] }>("admin_overview");
    expect(overview.awaiting).toBe(4);
    expect(overview.recent).toHaveLength(6);
  });
});
