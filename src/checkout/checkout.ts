import type { CatalogSource } from "@/catalog/CatalogProvider";
import type { Catalog, CheckoutMethod } from "@/catalog/types";
import { BackendError, invoke } from "@/lib/supabase";

export type CheckoutAvailability = { open: true; methods: CheckoutMethod[] } | { open: false; reason: "demo" | "closed" };

/** Checkout opens only against a live backend whose owner has enabled at least one payment method. */
export function checkoutAvailability(catalog: Catalog, source: CatalogSource): CheckoutAvailability {
  if (source !== "live") return { open: false, reason: "demo" };
  const methods = (catalog.settings.checkout?.methods ?? []).filter((method) => method.enabled);
  if (!catalog.settings.checkout?.enabled || methods.length === 0) return { open: false, reason: "closed" };
  return { open: true, methods };
}

/** The shipping the database will charge; shown before ordering, recalculated by the server. */
export function shippingFor(catalog: Catalog, subtotal: number): number {
  const { flatRate = 0, freeOver = null } = catalog.settings.shipping ?? {};
  return freeOver !== null && subtotal >= freeOver ? 0 : flatRate;
}

export interface OrderForm {
  email: string;
  name: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  notes: string;
  paymentMethod: string;
}

export type FieldErrors = Partial<Record<keyof OrderForm, string>>;

/** The same rules the database enforces, checked first for instant feedback. */
export function validateOrderForm(form: OrderForm): FieldErrors {
  const errors: FieldErrors = {};
  const length = (value: string, min: number, max: number) => value.trim().length >= min && value.trim().length <= max;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) errors.email = "Enter an email address, like name@example.com.";
  if (!length(form.name, 1, 120)) errors.name = "Enter the name for delivery.";
  if (!length(form.phone, 5, 40) || !/^[0-9+()\-.\s]+$/.test(form.phone.trim())) errors.phone = "Enter a phone number the courier can call.";
  if (!length(form.line1, 1, 200)) errors.line1 = "Enter the street address.";
  if (!length(form.city, 1, 100)) errors.city = "Enter the town or city.";
  if (!length(form.postalCode, 1, 20)) errors.postalCode = "Enter the postal code.";
  if (!length(form.country, 2, 60)) errors.country = "Enter the country.";
  if (form.notes.trim().length > 1000) errors.notes = "Keep delivery notes under 1,000 characters.";
  if (!form.paymentMethod) errors.paymentMethod = "Choose how you will pay.";
  return errors;
}

export interface PlacedOrder {
  reference: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  paymentInstructions: string;
  currency: string;
  subtotal: number;
  shipping: number;
  total: number;
  email: string;
  createdAt: string;
  items: { name: string; colorway: string; size: string; quantity: number; unitPrice: number; lineTotal: number; imageSrc: string | null }[];
}

/** Sent through the place-order Edge Function, which checks the Turnstile token before the database sees the order. */
export async function placeOrder(form: OrderForm, lines: { sku: string; quantity: number }[], token: string): Promise<PlacedOrder> {
  return invoke<PlacedOrder>("place-order", {
    token,
    order: {
      paymentMethod: form.paymentMethod,
      contact: { email: form.email, name: form.name, phone: form.phone },
      address: { line1: form.line1, line2: form.line2, city: form.city, region: form.region, postalCode: form.postalCode, country: form.country },
      notes: form.notes,
      // Only what and how many; the database prices the order itself.
      items: lines.map(({ sku, quantity }) => ({ sku, quantity })),
    },
  });
}

export type ShortItem = { sku: string; requested: number; available: number };

/** Turns a failed order into something the shopper can act on. */
export function describeOrderError(error: unknown): { message: string; field?: keyof OrderForm; short?: ShortItem[] } {
  if (!(error instanceof BackendError)) return { message: "We couldn’t reach the store. Check your connection and try again; you have not been charged." };
  switch (error.message) {
    case "insufficient_stock": {
      let short: ShortItem[];
      try {
        short = JSON.parse(error.detail ?? "[]");
      } catch {
        short = [];
      }
      return { message: "Some pieces sold out while you were checking out. Your bag has been updated to what is available.", short };
    }
    case "unavailable_item":
    case "unknown_item":
      return { message: "A piece in your bag is no longer available. Remove it and try again." };
    case "invalid_contact": {
      const field = (error.detail ?? undefined) as keyof OrderForm | undefined;
      return { message: "Check the highlighted detail and try again.", field };
    }
    case "invalid_payment_method":
      return { message: "That payment method is no longer offered. Choose another.", field: "paymentMethod" };
    case "checkout_unavailable":
      return { message: "Checkout has just been closed by the store. Your bag is saved; please try again later." };
    case "invalid_items":
      return { message: "Your bag has an invalid quantity (1–10 of each piece). Adjust it and try again." };
    case "verification_required":
    case "verification_failed":
      return { message: "We couldn’t confirm this order came from a person. Nothing was charged; please try again." };
    case "too_many_attempts":
      return { message: "Too many order attempts from this connection. Your bag is saved; please wait a few minutes and try again." };
    case "checkout_protection_not_configured":
      return { message: "Checkout isn’t fully set up yet. Your bag is saved; please try again later." };
    default:
      return { message: "Your order could not be placed. Nothing was charged; please try again." };
  }
}

const LAST_ORDER_KEY = "stillform.lastOrder";

export function rememberOrder(order: PlacedOrder) {
  try {
    sessionStorage.setItem(LAST_ORDER_KEY, JSON.stringify(order));
  } catch {
    // The confirmation still works from navigation state.
  }
}

export function recallOrder(reference: string): PlacedOrder | null {
  try {
    const order = JSON.parse(sessionStorage.getItem(LAST_ORDER_KEY) ?? "null") as PlacedOrder | null;
    return order?.reference === reference ? order : null;
  } catch {
    return null;
  }
}
