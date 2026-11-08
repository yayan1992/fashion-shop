import type { Catalog, MediaAsset } from "@/catalog/types";
import { BackendError, call as backendCall, MEDIA_BUCKET, supabase } from "@/lib/supabase";

// In the showroom build (__DEMO_DASHBOARD__) the same calls run against the
// browser-local demo instead of Supabase. The flag is a build-time constant, so
// other builds drop the demo branch and never bundle it.
const call = <T,>(fn: string, args?: Record<string, unknown>): Promise<T> =>
  __DEMO_DASHBOARD__ ? import("@/demo/rpc").then((m) => m.demoCall<T>(fn, args)) : backendCall<T>(fn, args);

// Typed access to the admin functions in supabase/migrations/…_admin_api.sql.

export interface AdminCatalog extends Catalog {
  privateSettings: { orderNotificationEmail: string | null; notes: string | null };
}

export type OrderStatus = "pending" | "confirmed" | "shipped" | "delivered" | "cancelled";
export type PaymentStatus = "unpaid" | "paid" | "refunded";

export interface OrderSummary {
  id: string;
  reference: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: string;
  paymentMethodLabel: string;
  currency: string;
  subtotal: number;
  shipping: number;
  total: number;
  email: string;
  name: string;
  phone: string;
  address: { line1: string; line2: string; city: string; region: string; postalCode: string; country: string };
  notes: string;
  createdAt: string;
  updatedAt: string;
  restockedAt: string | null;
  itemCount: number;
}

export interface OrderDetail extends OrderSummary {
  items: { sku: string; productId: string; colorwayId: string; name: string; colorway: string; size: string; unitPrice: number; quantity: number; lineTotal: number; imageSrc: string | null }[];
  events: { kind: string; from: string | null; to: string | null; note: string | null; createdAt: string }[];
}

export interface Overview {
  currency: string;
  checkoutEnabled: boolean;
  revenue30: number;
  orders30: number;
  awaiting: number;
  unpaid: number;
  recent: OrderSummary[];
  lowStock: { sku: string; productId: string; product: string; colorway: string; size: string; stock: number; status: string }[];
  products: { active: number; draft: number };
}

export const api = {
  isAdmin: () => call<boolean>("is_admin"),
  catalog: () => call<AdminCatalog>("admin_catalog"),
  overview: () => call<Overview>("admin_overview"),
  saveProduct: (p: unknown) => call<{ id: string; slug: string; status: string }>("admin_save_product", { p }),
  setProductStatus: (id: string, status: string) => call<void>("admin_set_product_status", { p_product: id, p_status: status }),
  deleteProduct: (id: string) => call<void>("admin_delete_product", { p_product: id }),
  setRail: (placements: { productId: string; colorwayId: string }[]) => call<void>("admin_set_rail", { p_placements: placements }),
  setFeatured: (ids: string[]) => call<void>("admin_set_featured", { p_products: ids }),
  saveCollection: (p: unknown) => call<{ id: string }>("admin_save_collection", { p }),
  deleteCollection: (id: string) => call<void>("admin_delete_collection", { p_collection: id }),
  saveLookbook: (p: unknown) => call<void>("admin_save_lookbook", { p }),
  createMedia: (p: { src: string; storagePath: string; alt: string; width: number; height: number; variants?: { width: number; src: string }[]; focus?: string }) => call<MediaAsset>("admin_create_media", { p }),
  updateMedia: (id: string, alt: string, focus: string | null) => call<void>("admin_update_media", { p_media: id, p_alt: alt, p_focus: focus }),
  unusedMedia: () => call<MediaAsset[]>("admin_unused_media"),
  deleteMedia: (ids: string[]) => call<{ id: string; storagePath: string | null; variants: { src: string }[] }[]>("admin_delete_media", { p_ids: ids }),
  saveSettings: (publicSettings: unknown, privateSettings: unknown) => call<void>("admin_save_settings", { p_public: publicSettings, p_private: privateSettings }),
  orders: (search: string | null, status: string | null, limit = 50, offset = 0) => call<{ total: number; orders: OrderSummary[] }>("admin_orders", { p_search: search, p_status: status, p_limit: limit, p_offset: offset }),
  order: (reference: string) => call<OrderDetail>("admin_order", { p_reference: reference }),
  updateOrder: (reference: string, change: { status?: OrderStatus; paymentStatus?: PaymentStatus; note?: string }) =>
    call<OrderDetail>("admin_update_order", { p_reference: reference, p_status: change.status ?? null, p_payment_status: change.paymentStatus ?? null, p_note: change.note ?? null }),
};

/** Uploads a file to the media bucket under a random name and returns its public URL. */
export async function uploadFile(folder: "rail" | "editorial", blob: Blob, extension: string): Promise<{ path: string; url: string }> {
  if (__DEMO_DASHBOARD__) {
    // Demo "uploads" stay in this browser as data URLs.
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new BackendError({ message: "upload_failed" }));
      reader.readAsDataURL(blob);
    });
    return { path: `${folder}/${crypto.randomUUID()}.${extension}`, url };
  }
  if (!supabase) throw new BackendError({ message: "backend_not_configured" });
  const path = `${folder}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, await blob.arrayBuffer(), {
    contentType: blob.type,
    // Every upload has a fresh name, so it can be cached forever.
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw new BackendError({ message: error.message || "upload_failed" });
  return { path, url: supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl };
}

export async function removeFiles(paths: string[]) {
  if (__DEMO_DASHBOARD__) return;
  if (!supabase || paths.length === 0) return;
  await supabase.storage.from(MEDIA_BUCKET).remove(paths);
}

const MESSAGES: Record<string, string> = {
  not_authorized: "This account isn’t a store administrator.",
  backend_not_configured: "The store isn’t connected to Supabase yet.",
  slug_taken: "Another item already uses that web address. Choose a different one.",
  product_not_found: "That product no longer exists. It may have been deleted in another tab.",
  sku_conflict: "Those sizes clash with another product’s stock codes. Rename the colourway or size.",
  invalid_rail: "Every piece on the rail needs a front photo.",
  order_not_found: "That order could not be found.",
  invalid_status_transition: "That order can’t move to that status from where it is now.",
  invalid_payment_transition: "That payment change isn’t allowed from the order’s current payment status.",
  order_is_immutable: "Order totals can’t be changed after the order is placed.",
};

const DETAIL: Record<string, string> = {
  slug: "Use lowercase letters, numbers and hyphens for the web address.",
  name: "Give it a name (up to 120 characters).",
  price: "Enter a price of zero or more.",
  category: "Choose a category.",
  sizes: "Use up to 12 sizes, each up to 24 characters.",
  colorways: "Add between 1 and 12 colours.",
  colorway_id: "Each colour needs a short code (letters, numbers, hyphens).",
  colorway_duplicate: "Two colours have the same name. Give each a different name.",
  colorway_name: "Each colour needs a name.",
  colorway_swatch: "Pick a swatch colour for each colour.",
  stock: "Stock must be a whole number from 0 to 1,000,000.",
  price_or_sizes: "Set a price above zero and at least one size before publishing.",
  checkout_needs_method: "Turn on at least one payment method before opening checkout.",
  checkout_methods: "Each payment method needs a name (up to 60 characters).",
  currency: "Use a three-letter currency code, such as USD or EUR.",
  shipping: "Shipping amounts must be zero or more.",
  title: "Give it a title.",
  layout: "Choose one of the lookbook layouts.",
  look_title: "Every frame needs a title.",
};

/** A sentence a store owner can act on, for any error the backend can return. */
export function describeError(error: unknown): string {
  if (!(error instanceof BackendError)) return error instanceof Error && /fetch|network/i.test(error.message) ? "The store couldn’t be reached. Check your connection and try again." : "Something went wrong. Please try again.";
  const detail = error.detail ?? "";
  if (error.message === "not_publishable") {
    if (detail.startsWith("front_image:")) return `Add a front photo for the ${detail.slice(12)} colour before publishing.`;
    if (detail === "colorways") return "Add at least one colour before publishing.";
    return DETAIL[detail] ?? "This product isn’t ready to publish yet.";
  }
  if (error.message.startsWith("invalid_") && DETAIL[detail]) return DETAIL[detail];
  if (detail.startsWith("frames:")) {
    const layout = detail.slice(7);
    const need: Record<string, string> = { cinematic: "one frame", wide: "one frame", pair: "two frames", "pair-flip": "two frames", materials: "two or three frames" };
    return `The “${layout}” layout needs ${need[layout] ?? "a different number of frames"}.`;
  }
  if (detail.startsWith("front_image:")) return MESSAGES.invalid_rail!;
  return MESSAGES[error.message] ?? (/row-level security|permission denied/i.test(error.message) ? MESSAGES.not_authorized! : `The change couldn’t be saved: ${error.message}`);
}
