import type { AdminCatalog, OrderDetail, OrderStatus, PaymentStatus } from "@/admin/api";
import { localCatalog } from "@/catalog/local";
import type { Catalog, Product } from "@/catalog/types";
import { variantFor } from "@/catalog/selectors";

// Everything here is fictional: invented customers, example.com addresses and
// reserved 555 phone numbers. Nothing is read from, or sent to, any backend.

export interface DemoState {
  version: number;
  /** The full catalogue as the owner sees it: drafts, unpublished collections, every rail placement. */
  catalog: Catalog;
  privateSettings: AdminCatalog["privateSettings"];
  orders: OrderDetail[];
}

export const DEMO_VERSION = 1;

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

type Line = [productId: string, colorwayId: string, size: string, quantity: number];

interface Customer {
  name: string;
  email: string;
  phone: string;
  address: OrderDetail["address"];
}

const CUSTOMERS: Customer[] = [
  { name: "Ines Marlowe", email: "ines.marlowe@example.com", phone: "+1 555 0100", address: { line1: "14 Alder Row", line2: "", city: "Portland", region: "OR", postalCode: "97205", country: "United States" } },
  { name: "Tomas Verhoeven", email: "tomas.v@example.com", phone: "+31 555 0123", address: { line1: "Keizersgracht 88", line2: "Flat 2", city: "Amsterdam", region: "", postalCode: "1015 CT", country: "Netherlands" } },
  { name: "Aiko Brandt", email: "aiko.brandt@example.com", phone: "+49 555 0147", address: { line1: "Lindenstrasse 5", line2: "", city: "Hamburg", region: "", postalCode: "20099", country: "Germany" } },
  { name: "Noor Castellanos", email: "noor.c@example.com", phone: "+1 555 0166", address: { line1: "902 Larch Street", line2: "", city: "Austin", region: "TX", postalCode: "78701", country: "United States" } },
  { name: "Elias Okonkwo", email: "elias.o@example.com", phone: "+44 555 0182", address: { line1: "7 Pemberton Mews", line2: "", city: "Bristol", region: "", postalCode: "BS1 4DJ", country: "United Kingdom" } },
  { name: "Mara Lindqvist", email: "mara.l@example.com", phone: "+46 555 0199", address: { line1: "Hornsgatan 31", line2: "", city: "Stockholm", region: "", postalCode: "118 49", country: "Sweden" } },
];

const METHODS: Record<string, string> = { cod: "Cash on delivery", "bank-transfer": "Bank transfer", pickup: "Pay at studio pickup" };

const HOUR = 3_600_000;

export function createSeed(now = Date.now()): DemoState {
  const catalog = clone(localCatalog);
  catalog.settings.footer.note = "A fictional demo of the STILLFORM storefront. Nothing here is real: no orders, payments or customers.";
  catalog.settings.contact = { email: "studio@stillform.example", phone: "", address: "" };

  // One unpublished piece, so the Products page shows how drafts behave.
  const base = catalog.products.find((p) => p.id === "oxford-shirt")!;
  const draft: Product = {
    ...clone(base),
    id: "linen-overshirt",
    slug: "linen-overshirt",
    name: "Linen Overshirt",
    status: "draft",
    price: 17500,
    summary: "Washed linen, patch pockets, a boxy cut. Still in sampling.",
    description: "An unlined overshirt in washed linen. A draft in the demo: edit it, add stock, publish it and watch it appear in the shop.",
    details: ["Washed linen", "Patch pockets", "Boxy fit"],
    composition: "100% European linen",
    pairsWith: [],
    colorways: base.colorways.map((c) => ({ ...clone(c), id: c.id, name: c.name })),
    variants: base.variants.map((v) => ({ ...v, sku: v.sku.replace("OXFORD-SHIRT", "LINEN-OVERSHIRT"), stock: 6 })),
  };
  catalog.products.push(draft);

  const orders: OrderDetail[] = [];
  const add = (n: number, hoursAgo: number, customer: number, lines: Line[], status: OrderStatus, payment: PaymentStatus, method: string, notes = "") => {
    const c = CUSTOMERS[customer]!;
    const created = new Date(now - hoursAgo * HOUR).toISOString();
    const items = lines.map(([productId, colorwayId, size, quantity]) => {
      const product = catalog.products.find((p) => p.id === productId)!;
      const colorway = product.colorways.find((cw) => cw.id === colorwayId)!;
      return {
        sku: variantFor(product, colorwayId, size)!.sku,
        productId,
        colorwayId,
        name: product.name,
        colorway: colorway.name,
        size,
        unitPrice: product.price,
        quantity,
        lineTotal: product.price * quantity,
        imageSrc: catalog.media[colorway.media.front]?.src ?? null,
      };
    });
    const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
    const events: OrderDetail["events"] = [{ kind: "status", from: null, to: "pending", note: null, createdAt: created }];
    const steps: OrderStatus[] = ["confirmed", "shipped", "delivered"];
    const reached = status === "cancelled" ? [] : steps.slice(0, steps.indexOf(status) + 1);
    reached.forEach((to, i) => events.push({ kind: "status", from: i === 0 ? "pending" : reached[i - 1]!, to, note: null, createdAt: new Date(now - hoursAgo * HOUR + (i + 1) * 6 * HOUR).toISOString() }));
    if (status === "cancelled") events.push({ kind: "status", from: "pending", to: "cancelled", note: null, createdAt: new Date(now - hoursAgo * HOUR + 3 * HOUR).toISOString() });
    if (payment !== "unpaid") events.push({ kind: "payment", from: "unpaid", to: payment, note: null, createdAt: new Date(now - hoursAgo * HOUR + 8 * HOUR).toISOString() });
    orders.push({
      id: `demo-order-${n}`,
      reference: `SF-${1000 + n}`,
      status,
      paymentStatus: payment,
      paymentMethod: method,
      paymentMethodLabel: METHODS[method]!,
      currency: catalog.settings.currency,
      subtotal,
      shipping: 0,
      total: subtotal,
      email: c.email,
      name: c.name,
      phone: c.phone,
      address: c.address,
      notes,
      createdAt: created,
      updatedAt: events[events.length - 1]!.createdAt,
      restockedAt: status === "cancelled" ? events[events.length - 1]!.createdAt : null,
      itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
      items,
      events,
    });
  };

  add(14, 3, 0, [["lambswool-cardigan", "moss", "M", 1], ["heavyweight-tee", "bone", "M", 2]], "pending", "unpaid", "cod", "Please leave with the neighbour if I'm out.");
  add(13, 9, 1, [["mariner-long-sleeve", "ink-stripe", "L", 1]], "pending", "unpaid", "bank-transfer");
  add(12, 27, 2, [["fleece-hoodie", "grey-marl", "S", 1], ["oxford-shirt", "pale-blue", "S", 1]], "confirmed", "paid", "bank-transfer");
  add(11, 52, 3, [["henley", "rust", "M", 1]], "confirmed", "unpaid", "cod");
  add(10, 80, 4, [["fleece-crew", "oat", "L", 1], ["heavyweight-tee", "black", "L", 1]], "shipped", "paid", "bank-transfer");
  add(9, 130, 5, [["pique-polo", catalog.products.find((p) => p.id === "pique-polo")!.colorways[0]!.id, "M", 1]], "delivered", "paid", "pickup");
  add(8, 190, 0, [["heavyweight-tee", "bone", "S", 3]], "delivered", "paid", "cod");
  add(7, 260, 1, [["oxford-shirt", "pale-blue", "M", 1], ["lambswool-cardigan", "moss", "L", 1]], "delivered", "paid", "bank-transfer");
  add(6, 330, 2, [["fleece-hoodie", "grey-marl", "M", 1]], "cancelled", "unpaid", "cod", "Ordered the wrong size.");
  add(5, 420, 3, [["mariner-long-sleeve", "ink-stripe", "S", 2]], "delivered", "paid", "pickup");
  add(4, 520, 4, [["henley", "rust", "L", 1]], "delivered", "paid", "cod");
  add(3, 640, 5, [["heavyweight-tee", "black", "M", 1], ["fleece-crew", "oat", "M", 1]], "delivered", "paid", "bank-transfer");

  orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { version: DEMO_VERSION, catalog, privateSettings: { orderNotificationEmail: "orders@stillform.example", notes: "Demo notes: these stay in your browser." }, orders };
}
