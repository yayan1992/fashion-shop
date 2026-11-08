import type { Tone } from "./ui";

// Labels, tones and number formatting shared across the dashboard.

export const STATUS_TONE: Record<string, Tone> = {
  active: "positive",
  draft: "muted",
  archived: "neutral",
  pending: "attention",
  confirmed: "neutral",
  shipped: "neutral",
  delivered: "positive",
  cancelled: "muted",
  unpaid: "attention",
  paid: "positive",
  refunded: "muted",
};

export const STATUS_LABEL: Record<string, string> = {
  active: "Live",
  draft: "Draft",
  archived: "Archived",
  pending: "New",
  confirmed: "Confirmed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  unpaid: "Unpaid",
  paid: "Paid",
  refunded: "Refunded",
};

/** Formats minor units in the store currency. */
export function money(minor: number, currency: string, locale = "en-US") {
  return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: minor % 100 === 0 ? 0 : 2 }).format(minor / 100);
}

export function formatDate(iso: string, locale = "en-US") {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}
