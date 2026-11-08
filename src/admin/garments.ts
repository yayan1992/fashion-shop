import type { RailGarment } from "@/components/ui/product-rail-gallery";
import type { Catalog, MediaAsset, Product } from "@/catalog/types";

/** A URL-safe id from a name: "Field Coat" → "field-coat". */
export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export const mediaSrc = (media: Record<string, MediaAsset>, id: string | undefined) => (id ? media[id]?.src : undefined);

/** One hanger for the rail, from a product colourway and the media library. */
export function garmentFor(media: Record<string, MediaAsset>, id: string, name: string, swatch: string, photos: { front?: string; back?: string; side?: string }, tag?: string, description?: string): RailGarment {
  return {
    id,
    name,
    color: swatch,
    tag,
    description,
    image: mediaSrc(media, photos.front),
    backImage: mediaSrc(media, photos.back),
    sideImage: mediaSrc(media, photos.side),
  };
}

/** The rail as it stands, excluding one product (the one being edited). */
export function railGarments(catalog: Catalog, excludeProduct?: string): RailGarment[] {
  return catalog.settings.rail.placements.flatMap((placement) => {
    if (placement.productId === excludeProduct) return [];
    const product = catalog.products.find((p) => p.id === placement.productId);
    const colorway = product?.colorways.find((c) => c.id === placement.colorwayId);
    if (!product || !colorway?.media.front) return [];
    return [garmentFor(catalog.media, `${product.id}:${colorway.id}`, product.name, colorway.swatch, colorway.media)];
  });
}

export function totalStock(product: Product) {
  return product.variants.reduce((sum, variant) => sum + variant.stock, 0);
}
