import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { localCatalog } from "./local";
import { formatPrice, railEntries } from "./selectors";

// Guards the content model: every reference resolves, so a later admin
// dashboard (or a hand edit) can't leave the storefront pointing at nothing.

const catalog = localCatalog;
const productIds = new Set(catalog.products.map((product) => product.id));

describe("catalogue integrity", () => {
  it("resolves every media reference to a file in /public", () => {
    for (const product of catalog.products) {
      for (const colorway of product.colorways) {
        const { front, back, side, gallery, lifestyle = [], details = [] } = colorway.media;
        for (const id of [front, back, side, ...gallery, ...lifestyle, ...details].filter(Boolean) as string[]) {
          const asset = catalog.media[id];
          expect(asset, `${product.id}/${colorway.id} → ${id}`).toBeDefined();
          expect(existsSync(join("public", asset!.src)), asset!.src).toBe(true);
        }
      }
    }
  });

  it("gives every product a variant per size and colourway with unique SKUs", () => {
    const skus = new Set<string>();
    for (const product of catalog.products) {
      for (const colorway of product.colorways) {
        for (const size of product.sizes) {
          const variant = product.variants.find((candidate) => candidate.colorwayId === colorway.id && candidate.size === size);
          expect(variant, `${product.id} ${colorway.id} ${size}`).toBeDefined();
          expect(skus.has(variant!.sku)).toBe(false);
          skus.add(variant!.sku);
        }
      }
    }
  });

  it("points rail, collections, lookbooks and home features at real products", () => {
    expect(railEntries(catalog)).toHaveLength(catalog.settings.rail.placements.length);
    for (const collection of catalog.collections) for (const id of collection.productIds) expect(productIds.has(id), id).toBe(true);
    for (const id of catalog.settings.home.featuredProductIds) expect(productIds.has(id), id).toBe(true);
    for (const id of catalog.products.flatMap((product) => product.pairsWith ?? [])) expect(productIds.has(id), id).toBe(true);
    const statement = catalog.settings.home.statement.mediaId;
    if (statement) expect(catalog.media[statement], statement).toBeDefined();
    for (const look of catalog.lookbooks.flatMap((lookbook) => lookbook.spreads.flatMap((spread) => spread.looks))) {
      if (look.mediaId) expect(catalog.media[look.mediaId], look.mediaId).toBeDefined();
      for (const piece of look.pieces) {
        const product = catalog.products.find((candidate) => candidate.id === piece.productId);
        expect(product?.colorways.some((colorway) => colorway.id === piece.colorwayId), `${look.id} ${piece.productId}`).toBe(true);
      }
    }
  });

  it("ships every responsive variant of every photograph", () => {
    for (const asset of Object.values(catalog.media)) {
      for (const variant of asset.variants ?? []) expect(existsSync(join("public", variant.src)), variant.src).toBe(true);
      expect(asset.alt.length, asset.id).toBeGreaterThan(10);
    }
  });

  it("formats prices in the store currency", () => {
    expect(formatPrice(catalog, 8500)).toBe("$85");
    expect(formatPrice(catalog, 8550)).toBe("$85.50");
  });
});
