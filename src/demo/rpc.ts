import type { OrderDetail, OrderStatus, OrderSummary, Overview, PaymentStatus } from "@/admin/api";
import type { Catalog, CheckoutMethod, Collection, Colorway, Lookbook, MediaAsset, Product, ProductStatus, Variant } from "@/catalog/types";
import { BackendError } from "@/lib/supabase";
import { adminView } from "./derive";
import type { DemoState } from "./seed";
import { demoStore } from "./store";

// The Studio's database functions (supabase/migrations/…_admin_api.sql),
// re-implemented over the browser-local demo state with the same validation
// and the same error codes, so the real dashboard pages run unchanged.

// Arguments arrive as the JSON the dashboard sent; every function validates what it reads.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Args = Record<string, any>;

const fail = (message: string, detail?: string): never => {
  throw new BackendError({ message, details: detail });
};

const clone = <T,>(value: T): T => (value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T));
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const list = (value: unknown): string[] => (Array.isArray(value) ? value.map((v) => text(v)).filter(Boolean) : []);
const skuFor = (product: string, colorway: string, size: string) =>
  `${product}-${colorway}-${size}`.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toUpperCase();
const key = (productId: string, colorwayId: string) => `${productId}:${colorwayId}`;

/** Runs a change on a copy of the demo, and stores it only if nothing threw. */
function mutate<T>(change: (draft: DemoState) => T): T {
  const draft = clone(demoStore.state());
  const result = change(draft);
  demoStore.commit(draft);
  return result;
}

function assertPublishable(product: Product) {
  if (!(product.price > 0 && product.sizes.length > 0)) fail("not_publishable", "price_or_sizes");
  if (product.colorways.length === 0) fail("not_publishable", "colorways");
  const missing = product.colorways.find((c) => !c.media.front);
  if (missing) fail("not_publishable", `front_image:${missing.name}`);
}

/** Removes every reference to a product that no longer exists. */
function forget(draft: DemoState, productId: string) {
  const { catalog } = draft;
  catalog.settings.rail.placements = catalog.settings.rail.placements.filter((p) => p.productId !== productId);
  catalog.settings.home.featuredProductIds = catalog.settings.home.featuredProductIds.filter((id) => id !== productId);
  catalog.collections.forEach((c) => (c.productIds = c.productIds.filter((id) => id !== productId)));
  catalog.products.forEach((p) => (p.pairsWith = p.pairsWith?.filter((id) => id !== productId)));
  catalog.lookbooks.forEach((b) => b.spreads.forEach((s) => s.looks.forEach((l) => (l.pieces = l.pieces.filter((piece) => piece.productId !== productId)))));
}

function saveProduct(p: Record<string, unknown>) {
  return mutate((draft) => {
    const { catalog } = draft;
    const slug = text(p.slug).toLowerCase();
    const id = text(p.id) || slug;
    const isNew = p.isNew === true;
    const status = (text(p.status) || "draft") as ProductStatus;
    if (!SLUG.test(slug) || slug.length > 80) fail("invalid_product", "slug");
    if (!["draft", "active", "archived"].includes(status)) fail("invalid_product", "status");
    const name = text(p.name);
    if (name.length < 1 || name.length > 120) fail("invalid_product", "name");
    const price = Number(p.price);
    if (!Number.isInteger(price) || price < 0 || price > 100_000_000) fail("invalid_product", "price");
    if (!catalog.categories.some((c) => c.id === p.category)) fail("invalid_product", "category");
    const sizes = [...new Set(list(p.sizes))];
    if (sizes.length > 12 || sizes.some((s) => s.length > 24)) fail("invalid_product", "sizes");
    const colorways = Array.isArray(p.colorways) ? (p.colorways as Record<string, unknown>[]) : [];
    if (colorways.length < 1 || colorways.length > 12) fail("invalid_product", "colorways");

    const existing = catalog.products.find((x) => x.id === id);
    if (isNew) {
      if (existing || catalog.products.some((x) => x.slug === slug)) fail("slug_taken");
    } else {
      if (!existing) fail("product_not_found");
      if (catalog.products.some((x) => x.slug === slug && x.id !== id)) fail("slug_taken");
    }

    const next: Product = {
      id,
      slug,
      name,
      category: String(p.category),
      status,
      price,
      summary: text(p.summary),
      description: text(p.description),
      details: list(p.details),
      composition: text(p.composition),
      care: list(p.care),
      fit: text(p.fit),
      fabric: text(p.fabric) || undefined,
      pairsWith: list(p.pairsWith).filter((other) => other !== id && catalog.products.some((x) => x.id === other)).slice(0, 6),
      sizes,
      colorways: [],
      variants: [],
      updatedAt: new Date().toISOString(),
    };

    const others = catalog.products.filter((x) => x.id !== id);
    const seen: string[] = [];
    const rail: string[] = [];
    for (const raw of colorways) {
      const cid = text(raw.id).toLowerCase();
      if (!SLUG.test(cid) || cid.length > 60) fail("invalid_product", "colorway_id");
      if (seen.includes(cid)) fail("invalid_product", "colorway_duplicate");
      const cname = text(raw.name);
      if (cname.length < 1 || cname.length > 60) fail("invalid_product", "colorway_name");
      if (!/^#[0-9a-fA-F]{6}$/.test(String(raw.swatch ?? ""))) fail("invalid_product", "colorway_swatch");
      seen.push(cid);
      const m = (raw.media ?? {}) as Record<string, unknown>;
      const one = (v: unknown) => (typeof v === "string" && v ? v : undefined);
      const many = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x !== "") : []);
      const colorway: Colorway = {
        id: cid,
        name: cname,
        swatch: String(raw.swatch),
        media: { front: one(m.front) as string, back: one(m.back) as string, side: one(m.side), gallery: many(m.gallery), lifestyle: many(m.lifestyle), details: many(m.details) },
      };
      next.colorways.push(colorway);
      const stock = (raw.stock ?? {}) as Record<string, unknown>;
      const base = (raw.stockBase ?? {}) as Record<string, unknown>;
      for (const size of sizes) {
        const sku = skuFor(id, cid, size);
        if (others.some((x) => x.variants.some((v) => v.sku === sku))) fail("sku_conflict", sku);
        let desired = Number(stock[size] ?? 0);
        if (!Number.isInteger(desired) || desired < 0 || desired > 1_000_000) fail("invalid_product", "stock");
        const current = existing?.variants.find((v) => v.sku === sku)?.stock;
        const baseline = base[size] == null ? undefined : Number(base[size]);
        // The editor's count is applied as a difference, so orders placed meanwhile are kept.
        if (current !== undefined && baseline !== undefined && Number.isFinite(baseline)) desired = Math.max(0, current + (desired - baseline));
        next.variants.push({ sku, colorwayId: cid, size, stock: desired } satisfies Variant);
      }
      if (raw.onRail === true) rail.push(cid);
    }

    // Rail, featured and collection membership.
    const placements = catalog.settings.rail.placements.filter((pl) => pl.productId !== id || seen.includes(pl.colorwayId));
    for (const cid of seen) {
      const has = placements.some((pl) => pl.productId === id && pl.colorwayId === cid);
      if (rail.includes(cid) && !has) placements.push({ productId: id, colorwayId: cid });
      if (!rail.includes(cid) && has) placements.splice(placements.findIndex((pl) => pl.productId === id && pl.colorwayId === cid), 1);
    }
    catalog.settings.rail.placements = placements;
    const featured = catalog.settings.home.featuredProductIds.filter((x) => x !== id);
    if (p.featured === true) {
      const at = catalog.settings.home.featuredProductIds.indexOf(id);
      if (at >= 0) featured.splice(at, 0, id);
      else featured.push(id);
    }
    catalog.settings.home.featuredProductIds = featured;
    const memberOf = new Set(list(p.collectionIds));
    for (const c of catalog.collections) {
      if (memberOf.has(c.id) && !c.productIds.includes(id)) c.productIds.push(id);
      if (!memberOf.has(c.id)) c.productIds = c.productIds.filter((x) => x !== id);
    }

    if (status === "active") assertPublishable(next);
    if (existing) catalog.products[catalog.products.indexOf(existing)] = next;
    else catalog.products.push(next);
    return { id, slug, status };
  });
}

function setRail(placements: { productId: string; colorwayId: string }[]) {
  mutate((draft) => {
    if (!Array.isArray(placements) || placements.length > 24) fail("invalid_rail", "A rail holds up to 24 pieces.");
    const seen = new Set<string>();
    const next = placements.filter((pl) => !seen.has(key(pl.productId, pl.colorwayId)) && seen.add(key(pl.productId, pl.colorwayId)));
    for (const pl of next) {
      const colorway = draft.catalog.products.find((x) => x.id === pl.productId)?.colorways.find((c) => c.id === pl.colorwayId);
      if (!colorway?.media.front) fail("invalid_rail", `front_image:${pl.productId}/${pl.colorwayId}`);
    }
    draft.catalog.settings.rail.placements = next.map(({ productId, colorwayId }) => ({ productId, colorwayId }));
  });
}

function saveCollection(p: Record<string, unknown>) {
  return mutate((draft) => {
    const slug = text(p.slug).toLowerCase();
    const id = text(p.id) || slug;
    if (!SLUG.test(slug)) fail("invalid_collection", "slug");
    const title = text(p.title);
    if (title.length < 1 || title.length > 120) fail("invalid_collection", "title");
    const { collections, products } = draft.catalog;
    if (p.isNew === true && collections.some((c) => c.id === id || c.slug === slug)) fail("slug_taken");
    const next: Collection = {
      id,
      slug,
      title,
      season: text(p.season),
      summary: text(p.summary),
      published: p.published !== false,
      productIds: [...new Set(list(p.productIds))].filter((pid) => products.some((x) => x.id === pid)),
    };
    const at = collections.findIndex((c) => c.id === id);
    if (at >= 0) collections[at] = next;
    else collections.push(next);
    return { id };
  });
}

function saveLookbook(p: Record<string, unknown>) {
  mutate((draft) => {
    const id = text(p.id);
    if (!SLUG.test(id)) fail("invalid_lookbook", "id");
    const title = text(p.title);
    if (title.length < 1 || title.length > 120) fail("invalid_lookbook", "title");
    const spreads = (Array.isArray(p.spreads) ? p.spreads : []) as Lookbook["spreads"];
    const spreadIds = new Set<string>();
    const lookIds = new Set<string>();
    for (const spread of spreads) {
      const n = spread.looks?.length ?? 0;
      const layout = spread.layout;
      if (!["cinematic", "pair", "pair-flip", "wide", "materials"].includes(layout)) fail("invalid_lookbook", "layout");
      if (((layout === "cinematic" || layout === "wide") && n !== 1) || ((layout === "pair" || layout === "pair-flip") && n !== 2) || (layout === "materials" && (n < 2 || n > 3))) fail("invalid_lookbook", `frames:${layout}`);
      if (!spread.id || spreadIds.has(spread.id)) fail("invalid_lookbook", "spread_id");
      spreadIds.add(spread.id);
      for (const look of spread.looks) {
        if (!look.id || lookIds.has(look.id)) fail("invalid_lookbook", "look_id");
        const lt = text(look.title);
        if (lt.length < 1 || lt.length > 120) fail("invalid_lookbook", "look_title");
        lookIds.add(look.id);
      }
    }
    const next: Lookbook = {
      id,
      title,
      season: text(p.season),
      summary: text(p.summary),
      published: p.published !== false,
      spreads: clone(spreads).map((s) => ({ ...s, note: text(s.note) || undefined, looks: s.looks.map((l) => ({ ...l, tone: l.tone ?? "plaster", kind: l.kind ?? "campaign", mediaId: l.mediaId || undefined, pieces: (l.pieces ?? []).map((pc) => ({ ...pc, view: pc.view ?? "front" })) })) })),
    };
    const { lookbooks } = draft.catalog;
    const at = lookbooks.findIndex((b) => b.id === id);
    if (at >= 0) lookbooks[at] = next;
    else lookbooks.push(next);
  });
}

function usedMedia(catalog: Catalog): Set<string> {
  const used = new Set<string>();
  catalog.products.forEach((p) => p.colorways.forEach((c) => [c.media.front, c.media.back, c.media.side, ...c.media.gallery, ...(c.media.lifestyle ?? []), ...(c.media.details ?? [])].forEach((m) => m && used.add(m))));
  catalog.lookbooks.forEach((b) => b.spreads.forEach((s) => s.looks.forEach((l) => l.mediaId && used.add(l.mediaId))));
  if (catalog.settings.home.statement.mediaId) used.add(catalog.settings.home.statement.mediaId);
  return used;
}

function saveSettings(pub: Args, priv: Args | null) {
  mutate((draft) => {
    const { settings } = draft.catalog;
    const name = text(pub.name);
    if (name.length < 1 || name.length > 60) fail("invalid_settings", "name");
    if (!/^[A-Z]{3}$/.test(String(pub.currency ?? ""))) fail("invalid_settings", "currency");
    const methods = (pub.checkout?.methods ?? []) as CheckoutMethod[];
    if (!Array.isArray(methods) || methods.some((m) => !["cod", "bank-transfer", "pickup"].includes(m.id) || text(m.label).length < 1 || text(m.label).length > 60 || (m.instructions ?? "").length > 600)) fail("invalid_settings", "checkout_methods");
    const enabled = pub.checkout?.enabled === true;
    if (enabled && !methods.some((m) => m.enabled)) fail("invalid_settings", "checkout_needs_method");
    const flat = Number(pub.shipping?.flatRate ?? 0);
    const freeOver = pub.shipping?.freeOver == null ? null : Number(pub.shipping.freeOver);
    if (!Number.isInteger(flat) || flat < 0 || flat > 10_000_000 || (freeOver !== null && (!Number.isInteger(freeOver) || freeOver < 0 || freeOver > 100_000_000))) fail("invalid_settings", "shipping");
    draft.catalog.settings = {
      ...settings,
      name,
      description: text(pub.description).slice(0, 600),
      currency: pub.currency,
      locale: pub.locale || settings.locale,
      lowStockThreshold: pub.lowStockThreshold ?? settings.lowStockThreshold,
      contact: pub.contact ?? {},
      rail: { ...(pub.rail ?? settings.rail), placements: settings.rail.placements },
      home: { ...(pub.home ?? settings.home), featuredProductIds: settings.home.featuredProductIds },
      footer: pub.footer ?? settings.footer,
      checkout: { enabled, methods },
      shipping: { flatRate: flat, freeOver, note: String(pub.shipping?.note ?? "").slice(0, 600) },
      policies: pub.policies ?? {},
    };
    if (priv) draft.privateSettings = { orderNotificationEmail: text(priv.orderNotificationEmail) || null, notes: String(priv.notes ?? "").slice(0, 4000) };
  });
}

// ---------------------------------------------------------------------------
// Orders

const summary = (order: OrderDetail): OrderSummary => {
  const { items, events, ...rest } = order;
  void items;
  void events;
  return rest;
};

const NEXT_STATUS: Record<OrderStatus, OrderStatus[]> = { pending: ["confirmed", "cancelled"], confirmed: ["shipped", "cancelled"], shipped: ["delivered"], delivered: [], cancelled: [] };

function updateOrder(reference: string, status: OrderStatus | null, payment: PaymentStatus | null, note: string | null) {
  return mutate((draft) => {
    const order = draft.orders.find((o) => o.reference === reference);
    if (!order) return fail("order_not_found");
    const now = new Date().toISOString();
    if (status && status !== order.status) {
      if (!NEXT_STATUS[order.status].includes(status)) fail("invalid_status_transition", `${order.status} -> ${status}`);
      order.events.push({ kind: "status", from: order.status, to: status, note: null, createdAt: now });
      order.status = status;
      if (status === "cancelled") {
        // Cancelling returns the pieces to stock, as the database does.
        for (const item of order.items) {
          const variant = draft.catalog.products.flatMap((p) => p.variants).find((v) => v.sku === item.sku);
          if (variant) variant.stock += item.quantity;
        }
        order.restockedAt = now;
      }
    }
    if (payment && payment !== order.paymentStatus) {
      if (!((order.paymentStatus === "unpaid" && payment === "paid") || (order.paymentStatus === "paid" && payment === "refunded"))) fail("invalid_payment_transition", `${order.paymentStatus} -> ${payment}`);
      order.events.push({ kind: "payment", from: order.paymentStatus, to: payment, note: null, createdAt: now });
      order.paymentStatus = payment;
    }
    if (text(note)) order.events.push({ kind: "note", from: null, to: null, note: text(note).slice(0, 1000), createdAt: now });
    order.updatedAt = now;
    return clone(order);
  });
}

function overview(): Overview {
  const { catalog, orders } = demoStore.state();
  const since = Date.now() - 30 * 24 * 3_600_000;
  const recent30 = orders.filter((o) => Date.parse(o.createdAt) > since);
  return {
    currency: catalog.settings.currency,
    checkoutEnabled: catalog.settings.checkout?.enabled ?? false,
    revenue30: recent30.filter((o) => o.status !== "cancelled").reduce((sum, o) => sum + o.total, 0),
    orders30: recent30.length,
    awaiting: orders.filter((o) => o.status === "pending" || o.status === "confirmed").length,
    unpaid: orders.filter((o) => o.paymentStatus === "unpaid" && o.status !== "cancelled").length,
    recent: [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6).map(summary),
    lowStock: catalog.products
      .filter((p) => p.status !== "archived")
      .flatMap((p) => p.variants.filter((v) => v.stock <= catalog.settings.lowStockThreshold).map((v) => ({ sku: v.sku, productId: p.id, product: p.name, colorway: p.colorways.find((c) => c.id === v.colorwayId)?.name ?? v.colorwayId, size: v.size, stock: v.stock, status: p.status })))
      .sort((a, b) => a.stock - b.stock || a.product.localeCompare(b.product)),
    products: { active: catalog.products.filter((p) => p.status === "active").length, draft: catalog.products.filter((p) => p.status === "draft").length },
  };
}

// ---------------------------------------------------------------------------

const functions: Record<string, (a: Args) => unknown> = {
  is_admin: () => true,
  admin_catalog: () => adminView(demoStore.state()),
  admin_overview: overview,
  admin_save_product: (a) => saveProduct(a.p),
  admin_set_product_status: (a) =>
    mutate((draft) => {
      if (!["draft", "active", "archived"].includes(a.p_status)) fail("invalid_product", "status");
      const product = draft.catalog.products.find((x) => x.id === a.p_product);
      if (!product) fail("product_not_found");
      product!.status = a.p_status;
      product!.updatedAt = new Date().toISOString();
      if (a.p_status === "active") assertPublishable(product!);
    }),
  admin_delete_product: (a) =>
    mutate((draft) => {
      const at = draft.catalog.products.findIndex((x) => x.id === a.p_product);
      if (at < 0) fail("product_not_found");
      draft.catalog.products.splice(at, 1);
      forget(draft, a.p_product);
    }),
  admin_set_rail: (a) => setRail(a.p_placements),
  admin_set_featured: (a) =>
    mutate((draft) => {
      draft.catalog.settings.home.featuredProductIds = [...new Set<string>(a.p_products ?? [])].filter((id) => draft.catalog.products.some((x) => x.id === id));
    }),
  admin_save_collection: (a) => saveCollection(a.p),
  admin_delete_collection: (a) =>
    mutate((draft) => {
      draft.catalog.collections = draft.catalog.collections.filter((c) => c.id !== a.p_collection);
    }),
  admin_save_lookbook: (a) => saveLookbook(a.p),
  admin_create_media: (a) =>
    mutate((draft) => {
      const p = a.p as Args;
      if (!/^(https?:\/\/|\/|data:image\/)/.test(String(p.src ?? ""))) fail("invalid_media", "src");
      const asset: MediaAsset = {
        id: `upload-${crypto.randomUUID().replace(/-/g, "")}`,
        src: p.src,
        alt: text(p.alt).slice(0, 500),
        width: Number(p.width),
        height: Number(p.height),
        origin: "uploaded",
        variants: p.variants ?? [],
        focus: p.focus || undefined,
        storagePath: p.storagePath || undefined,
      };
      draft.catalog.media[asset.id] = asset;
      return asset;
    }),
  admin_update_media: (a) =>
    mutate((draft) => {
      const asset = draft.catalog.media[a.p_media];
      if (asset) {
        asset.alt = text(a.p_alt).slice(0, 500);
        asset.focus = a.p_focus || undefined;
      }
    }),
  admin_unused_media: () => {
    const { catalog } = demoStore.state();
    const used = usedMedia(catalog);
    return Object.values(catalog.media).filter((m) => !used.has(m.id));
  },
  admin_delete_media: (a) =>
    mutate((draft) => {
      const used = usedMedia(draft.catalog);
      const removed: { id: string; storagePath: string | null; variants: { src: string }[] }[] = [];
      for (const id of a.p_ids ?? []) {
        const asset = draft.catalog.media[id];
        if (!asset || used.has(id)) continue;
        removed.push({ id, storagePath: asset.storagePath ?? null, variants: asset.variants ?? [] });
        delete draft.catalog.media[id];
      }
      return removed;
    }),
  admin_save_settings: (a) => saveSettings(a.p_public, a.p_private),
  admin_orders: (a) => {
    const q = text(a.p_search).toLowerCase();
    const matches = [...demoStore.state().orders]
      .filter((o) => (!a.p_status || o.status === a.p_status) && (!q || [o.reference, o.email, o.name].some((v) => v.toLowerCase().includes(q))))
      .sort((x, y) => y.createdAt.localeCompare(x.createdAt));
    const limit = Math.min(Math.max(a.p_limit ?? 50, 1), 200);
    const offset = Math.max(a.p_offset ?? 0, 0);
    return { total: matches.length, orders: matches.slice(offset, offset + limit).map(summary) };
  },
  admin_order: (a) => {
    const order = demoStore.state().orders.find((o) => o.reference === a.p_reference);
    return order ? clone(order) : fail("order_not_found");
  },
  admin_update_order: (a) => updateOrder(a.p_reference, a.p_status, a.p_payment_status, a.p_note),
};

const LATENCY_MS = 90;

/** The demo's stand-in for `call()`: runs a Studio function against the browser-local demo. */
export async function demoCall<T>(fn: string, args: Args = {}): Promise<T> {
  const handler = functions[fn];
  if (!handler) throw new BackendError({ message: "backend_not_configured" });
  await new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
  return clone(handler(args)) as T;
}
