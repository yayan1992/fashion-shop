import type { RailGarment } from "@/components/ui/product-rail-gallery";
import type { Catalog, Colorway, MediaAsset, Product, RailPlacement, Variant } from "./types";

export function activeProducts(catalog: Catalog): Product[] {
  return catalog.products.filter((product) => product.status === "active");
}

export function productById(catalog: Catalog, id: string): Product | undefined {
  return catalog.products.find((product) => product.id === id && product.status === "active");
}

export function productBySlug(catalog: Catalog, slug: string): Product | undefined {
  return catalog.products.find((product) => product.slug === slug && product.status === "active");
}

export function colorwayOf(product: Product, colorwayId: string | null | undefined): Colorway {
  return product.colorways.find((colorway) => colorway.id === colorwayId) ?? product.colorways[0]!;
}

export function mediaById(catalog: Catalog, id: string | undefined): MediaAsset | undefined {
  return id ? catalog.media[id] : undefined;
}

export function variantFor(product: Product, colorwayId: string, size: string): Variant | undefined {
  return product.variants.find((variant) => variant.colorwayId === colorwayId && variant.size === size);
}

export function variantBySku(catalog: Catalog, sku: string): { product: Product; variant: Variant } | undefined {
  for (const product of activeProducts(catalog)) {
    const variant = product.variants.find((candidate) => candidate.sku === sku);
    if (variant) return { product, variant };
  }
  return undefined;
}

export function colorwayStock(product: Product, colorwayId: string): number {
  return product.variants.filter((variant) => variant.colorwayId === colorwayId).reduce((sum, variant) => sum + variant.stock, 0);
}

export type StockLevel = "in-stock" | "low" | "sold-out";

export function stockLevel(stock: number, lowStockThreshold: number): StockLevel {
  if (stock <= 0) return "sold-out";
  return stock <= lowStockThreshold ? "low" : "in-stock";
}

export function formatPrice(catalog: Catalog, minor: number): string {
  const { currency, locale } = catalog.settings;
  return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: minor % 100 === 0 ? 0 : 2 }).format(minor / 100);
}

export function productPath(product: Product, colorwayId?: string): string {
  const first = product.colorways[0]?.id;
  return colorwayId && colorwayId !== first ? `/products/${product.slug}?colour=${colorwayId}` : `/products/${product.slug}`;
}

export function railKey(placement: RailPlacement): string {
  return `${placement.productId}:${placement.colorwayId}`;
}

export interface RailEntry extends RailPlacement {
  product: Product;
  colorway: Colorway;
  garment: RailGarment;
}

/** Turns the rail placements from store settings into garments the rail can hang. */
export function railEntries(catalog: Catalog): RailEntry[] {
  return catalog.settings.rail.placements.flatMap((placement) => {
    const product = productById(catalog, placement.productId);
    if (!product) return [];
    const colorway = product.colorways.find((candidate) => candidate.id === placement.colorwayId);
    if (!colorway) return [];
    const src = (id?: string) => mediaById(catalog, id)?.src;
    const garment: RailGarment = {
      id: railKey(placement),
      name: product.colorways.length > 1 ? `${product.name}, ${colorway.name}` : product.name,
      description: product.summary,
      details: product.details,
      color: colorway.swatch,
      tag: formatPrice(catalog, product.price),
      image: src(colorway.media.front),
      backImage: src(colorway.media.back),
      sideImage: src(colorway.media.side),
    };
    return [{ ...placement, product, colorway, garment }];
  });
}
