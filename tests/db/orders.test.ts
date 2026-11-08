import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createUser, enableCheckout, expectError, orderPayload, owner, pool, rpc, stock, type Caller, server } from "./db";

// Checkout and order handling, against real Postgres with concurrent connections.

type Placed = { reference: string; subtotal: number; shipping: number; total: number; items: { name: string; unitPrice: number; quantity: number }[] };
let admin: Caller;

/** A product of its own per test, so stock levels never collide. */
async function testProduct(id: string, stockLevel: number, price = 10000) {
  await owner(
    `insert into public.products (id, slug, name, category_id, status, price, sizes) values ($1, $1, $2, 'tops', 'active', $3, '{M}');
     insert into public.colorways (product_id, id, name) values ($1, 'ink', 'Ink');
     insert into public.variants (sku, product_id, colorway_id, size, stock) values (upper($1) || '-INK-M', $1, 'ink', 'M', $4);`.replace(/\$1/g, `'${id}'`).replace("$2", `'${id} name'`).replace("$3", String(price)).replace("$4", String(stockLevel)),
  );
  return `${id.toUpperCase()}-INK-M`;
}

beforeAll(async () => {
  admin = await createUser("admin@orders.test", true);
  await enableCheckout();
});
afterAll(() => pool.end());

describe("placing an order", () => {
  it("prices the order from the database and ignores prices sent by the browser", async () => {
    const sku = await testProduct("price-check", 5, 12500);
    const order = await rpc<Placed>(server, "place_order", { p_order: orderPayload([{ sku, quantity: 2, price: 1 }], { total: 1, subtotal: 1 }) });
    expect(order.reference).toMatch(/^SF-\d+$/);
    expect(order.subtotal).toBe(25000);
    expect(order.total).toBe(25000);
    expect(order.items[0]).toMatchObject({ unitPrice: 12500, quantity: 2 });
    expect(await stock(sku)).toBe(3);
  });

  it("applies the configured shipping policy", async () => {
    const sku = await testProduct("shipping-check", 10, 5000);
    await owner(`update public.store_settings set shipping = '{"flatRate": 800, "freeOver": 20000, "note": ""}' where id`);
    const small = await rpc<Placed>(server, "place_order", { p_order: orderPayload([{ sku, quantity: 1 }]) });
    const large = await rpc<Placed>(server, "place_order", { p_order: orderPayload([{ sku, quantity: 4 }]) });
    await owner(`update public.store_settings set shipping = '{"flatRate": 0, "freeOver": null, "note": ""}' where id`);
    expect([small.shipping, small.total]).toEqual([800, 5800]);
    expect([large.shipping, large.total]).toEqual([0, 20000]);
  });

  it("merges repeated lines for the same item", async () => {
    const sku = await testProduct("merge-check", 5);
    const order = await rpc<Placed>(server, "place_order", { p_order: orderPayload([{ sku, quantity: 1 }, { sku, quantity: 2 }]) });
    expect(order.items).toHaveLength(1);
    expect(order.items[0]?.quantity).toBe(3);
    expect(await stock(sku)).toBe(2);
  });

  it("rejects invalid contact details, items and payment methods", async () => {
    const sku = await testProduct("validation-check", 5);
    const good = orderPayload([{ sku, quantity: 1 }]);
    const cases: [Record<string, unknown>, string][] = [
      [{ ...good, contact: { ...good.contact, email: "not-an-email" } }, "invalid_contact"],
      [{ ...good, contact: { ...good.contact, name: "" } }, "invalid_contact"],
      [{ ...good, contact: { ...good.contact, phone: "call me" } }, "invalid_contact"],
      [{ ...good, address: { ...good.address, line1: "" } }, "invalid_contact"],
      [{ ...good, address: { ...good.address, country: "" } }, "invalid_contact"],
      [{ ...good, items: [] }, "invalid_items"],
      [{ ...good, items: [{ sku, quantity: 0 }] }, "invalid_items"],
      [{ ...good, items: [{ sku, quantity: 11 }] }, "invalid_items"],
      [{ ...good, items: [{ sku, quantity: "lots" }] }, "invalid_items"],
      [{ ...good, items: "everything" }, "invalid_items"],
      [{ ...good, items: [{ sku: "NOT-A-SKU", quantity: 1 }] }, "unknown_item"],
      [{ ...good, paymentMethod: "bank-transfer" }, "invalid_payment_method"],
      [{ ...good, paymentMethod: "card" }, "invalid_payment_method"],
    ];
    for (const [payload, error] of cases) await expectError(rpc(server, "place_order", { p_order: payload }), error);
    expect(await stock(sku)).toBe(5);
    expect(await owner("select 1 from public.order_items where sku = $1", [sku])).toHaveLength(0);
  });

  it("refuses drafts and archived products", async () => {
    const sku = await testProduct("draft-check", 5);
    await owner("update public.products set status = 'draft' where id = 'draft-check'");
    await expectError(rpc(server, "place_order", { p_order: orderPayload([{ sku, quantity: 1 }]) }), "unavailable_item");
  });

  it("refuses orders while checkout is switched off", async () => {
    const sku = await testProduct("disabled-check", 5);
    await owner(`update public.store_settings set checkout = jsonb_set(checkout, '{enabled}', 'false') where id`);
    await expectError(rpc(server, "place_order", { p_order: orderPayload([{ sku, quantity: 1 }]) }), "checkout_unavailable");
    await enableCheckout();
  });
});

describe("stock", () => {
  it("refuses an order larger than the stock and changes nothing", async () => {
    const sku = await testProduct("short-check", 2);
    const other = await testProduct("short-other", 5);
    const error = await expectError(rpc(server, "place_order", { p_order: orderPayload([{ sku, quantity: 3 }, { sku: other, quantity: 1 }]) }), "insufficient_stock");
    expect(JSON.parse(error.detail ?? "[]")).toEqual([{ sku, requested: 3, available: 2 }]);
    expect(await stock(sku)).toBe(2);
    expect(await stock(other)).toBe(5);
  });

  it("never oversells when many shoppers buy the last pieces at the same moment", async () => {
    const sku = await testProduct("race-check", 3);
    const attempts = await Promise.allSettled(Array.from({ length: 12 }, () => rpc(server, "place_order", { p_order: orderPayload([{ sku, quantity: 1 }]) })));
    const won = attempts.filter((a) => a.status === "fulfilled");
    const lost = attempts.filter((a): a is PromiseRejectedResult => a.status === "rejected");
    expect(won).toHaveLength(3);
    expect(lost.every((a) => String(a.reason?.message).includes("insufficient_stock"))).toBe(true);
    expect(await stock(sku)).toBe(0);
  });

  it("serialises competing multi-item orders without deadlocks", async () => {
    const a = await testProduct("lock-a", 4);
    const b = await testProduct("lock-b", 4);
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        rpc(server, "place_order", { p_order: orderPayload(i % 2 ? [{ sku: a, quantity: 1 }, { sku: b, quantity: 1 }] : [{ sku: b, quantity: 1 }, { sku: a, quantity: 1 }]) }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(4);
    expect([await stock(a), await stock(b)]).toEqual([0, 0]);
  });
});

describe("after the order", () => {
  it("keeps a snapshot of what was bought when the product later changes", async () => {
    const sku = await testProduct("snapshot-check", 5, 15000);
    const order = await rpc<Placed>(server, "place_order", { p_order: orderPayload([{ sku, quantity: 1 }]) });
    await owner("update public.products set name = 'Renamed', price = 99999 where id = 'snapshot-check'");
    await owner("delete from public.products where id = 'snapshot-check'");
    const detail = await rpc<{ items: { name: string; unitPrice: number }[]; total: number }>(admin, "admin_order", { p_reference: order.reference });
    expect(detail.items[0]).toMatchObject({ name: "snapshot-check name", unitPrice: 15000 });
    expect(detail.total).toBe(15000);
  });

  it("follows the order lifecycle and rejects invalid transitions", async () => {
    const sku = await testProduct("lifecycle-check", 5);
    const { reference } = await rpc<Placed>(server, "place_order", { p_order: orderPayload([{ sku, quantity: 1 }]) });
    await expectError(rpc(admin, "admin_update_order", { p_reference: reference, p_status: "delivered" }), "invalid_status_transition");
    await rpc(admin, "admin_update_order", { p_reference: reference, p_status: "confirmed" });
    await rpc(admin, "admin_update_order", { p_reference: reference, p_payment_status: "paid" });
    await rpc(admin, "admin_update_order", { p_reference: reference, p_status: "shipped" });
    await expectError(rpc(admin, "admin_update_order", { p_reference: reference, p_status: "cancelled" }), "invalid_status_transition");
    await expectError(rpc(admin, "admin_update_order", { p_reference: reference, p_payment_status: "unpaid" }), "invalid_payment_transition");
    const done = await rpc<{ status: string; paymentStatus: string; events: { kind: string; to: string }[] }>(admin, "admin_update_order", { p_reference: reference, p_status: "delivered" });
    expect([done.status, done.paymentStatus]).toEqual(["delivered", "paid"]);
    expect(done.events.map((e) => e.to)).toEqual(["pending", "confirmed", "paid", "shipped", "delivered"]);
    expect(await stock(sku)).toBe(4);
  });

  it("returns stock exactly once when an order is cancelled", async () => {
    const sku = await testProduct("cancel-check", 5);
    const { reference } = await rpc<Placed>(server, "place_order", { p_order: orderPayload([{ sku, quantity: 2 }]) });
    expect(await stock(sku)).toBe(3);
    await rpc(admin, "admin_update_order", { p_reference: reference, p_status: "cancelled" });
    expect(await stock(sku)).toBe(5);
    // A second cancel (a double click) changes nothing; reopening is refused.
    const again = await rpc<{ status: string }>(admin, "admin_update_order", { p_reference: reference, p_status: "cancelled" });
    expect(again.status).toBe("cancelled");
    await expectError(rpc(admin, "admin_update_order", { p_reference: reference, p_status: "confirmed" }), "invalid_status_transition");
    expect(await stock(sku)).toBe(5);
  });

  it("cancels cleanly when the product has since been deleted", async () => {
    const sku = await testProduct("deleted-check", 5);
    const { reference } = await rpc<Placed>(server, "place_order", { p_order: orderPayload([{ sku, quantity: 1 }]) });
    await owner("delete from public.products where id = 'deleted-check'");
    const cancelled = await rpc<{ status: string }>(admin, "admin_update_order", { p_reference: reference, p_status: "cancelled" });
    expect(cancelled.status).toBe("cancelled");
  });

  it("does not let totals be edited after the fact, even by the database owner", async () => {
    const sku = await testProduct("immutable-check", 5);
    const { reference } = await rpc<Placed>(server, "place_order", { p_order: orderPayload([{ sku, quantity: 1 }]) });
    await expectError(owner("update public.orders set total = 1, subtotal = 1 where reference = $1", [reference]), "order_is_immutable");
  });

  it("lists, searches and summarises orders for the administrator", async () => {
    const all = await rpc<{ total: number; orders: { reference: string }[] }>(admin, "admin_orders", {});
    expect(all.total).toBeGreaterThan(5);
    const found = await rpc<{ total: number }>(admin, "admin_orders", { p_search: "ada@example.com", p_status: "cancelled" });
    expect(found.total).toBeGreaterThanOrEqual(2);
    const overview = await rpc<{ orders30: number; revenue30: number; lowStock: { sku: string }[] }>(admin, "admin_overview");
    expect(overview.orders30).toBe(all.total);
    expect(overview.lowStock.some((v) => v.sku === "RACE-CHECK-INK-M")).toBe(true);
  });
});
