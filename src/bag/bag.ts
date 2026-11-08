import { variantBySku } from "@/catalog/selectors";
import type { Catalog } from "@/catalog/types";

// The bag is held in the browser only. Nothing here reserves stock or creates
// an order; quantities are capped by the stock figures in the catalogue.

export interface BagLine {
  sku: string;
  quantity: number;
}

export type BagAction =
  | { type: "add"; sku: string; quantity?: number }
  | { type: "set"; sku: string; quantity: number }
  | { type: "remove"; sku: string }
  | { type: "clear" };

function stockOf(catalog: Catalog, sku: string): number {
  return variantBySku(catalog, sku)?.variant.stock ?? 0;
}

export function bagReducer(catalog: Catalog, lines: BagLine[], action: BagAction): BagLine[] {
  switch (action.type) {
    case "add": {
      const stock = stockOf(catalog, action.sku);
      if (stock <= 0) return lines;
      const existing = lines.find((line) => line.sku === action.sku);
      const quantity = Math.min(stock, (existing?.quantity ?? 0) + (action.quantity ?? 1));
      return existing
        ? lines.map((line) => (line.sku === action.sku ? { ...line, quantity } : line))
        : [...lines, { sku: action.sku, quantity }];
    }
    case "set": {
      const quantity = Math.min(stockOf(catalog, action.sku), Math.max(0, Math.floor(action.quantity)));
      if (quantity === 0) return lines.filter((line) => line.sku !== action.sku);
      return lines.map((line) => (line.sku === action.sku ? { ...line, quantity } : line));
    }
    case "remove":
      return lines.filter((line) => line.sku !== action.sku);
    case "clear":
      return [];
  }
}

/** Drops lines the catalogue no longer sells and caps quantities at current stock. */
export function reconcile(catalog: Catalog, raw: unknown): BagLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry): BagLine[] => {
    if (!entry || typeof entry !== "object") return [];
    const { sku, quantity } = entry as Partial<BagLine>;
    if (typeof sku !== "string" || typeof quantity !== "number") return [];
    const capped = Math.min(stockOf(catalog, sku), Math.floor(quantity));
    return capped > 0 ? [{ sku, quantity: capped }] : [];
  });
}

export function bagCount(lines: BagLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

export function bagSubtotal(catalog: Catalog, lines: BagLine[]): number {
  return lines.reduce((sum, line) => sum + (variantBySku(catalog, line.sku)?.product.price ?? 0) * line.quantity, 0);
}
