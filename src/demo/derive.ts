import type { AdminCatalog } from "@/admin/api";
import type { Catalog, Lookbook } from "@/catalog/types";
import type { DemoState } from "./seed";

// The demo keeps one full catalogue (drafts, unpublished collections, every
// rail placement) and derives the two views the real backend serves:
// admin_catalog() for the dashboard and storefront_catalog() for visitors.

/** The dashboard's view: everything, with the flags the editors read. */
export function adminView(state: DemoState): AdminCatalog {
  const { catalog } = state;
  const onRail = new Set(catalog.settings.rail.placements.map((p) => `${p.productId}:${p.colorwayId}`));
  const featured = new Set(catalog.settings.home.featuredProductIds);
  return {
    ...catalog,
    products: catalog.products.map((product) => ({
      ...product,
      featured: featured.has(product.id),
      collectionIds: catalog.collections.filter((c) => c.productIds.includes(product.id)).map((c) => c.id),
      colorways: product.colorways.map((c) => ({ ...c, onRail: onRail.has(`${product.id}:${c.id}`) })),
    })),
    privateSettings: state.privateSettings,
  };
}

/** What a visitor sees: published pieces only, and checkout always closed. */
export function storefrontView(state: DemoState): Catalog {
  const { catalog } = state;
  const active = new Set(catalog.products.filter((p) => p.status === "active").map((p) => p.id));
  const hasFront = (productId: string, colorwayId: string) => Boolean(catalog.products.find((p) => p.id === productId)?.colorways.find((c) => c.id === colorwayId)?.media.front);
  const lookbooks: Lookbook[] = catalog.lookbooks
    .filter((b) => b.published !== false)
    .map((b) => ({
      ...b,
      spreads: b.spreads
        .filter((s) => s.published !== false)
        .map((s) => ({
          ...s,
          looks: s.looks.filter((l) => l.published !== false).map((l) => ({ ...l, pieces: l.pieces.filter((piece) => active.has(piece.productId)) })),
        })),
    }));
  return {
    ...catalog,
    settings: {
      ...catalog.settings,
      // The showroom never takes orders, whatever the simulated settings say.
      checkout: catalog.settings.checkout ? { ...catalog.settings.checkout, enabled: false } : undefined,
      rail: { ...catalog.settings.rail, placements: catalog.settings.rail.placements.filter((p) => active.has(p.productId) && hasFront(p.productId, p.colorwayId)) },
      home: { ...catalog.settings.home, featuredProductIds: catalog.settings.home.featuredProductIds.filter((id) => active.has(id)) },
    },
    products: catalog.products
      .filter((p) => p.status === "active")
      .map((p) => ({ ...p, pairsWith: p.pairsWith?.filter((id) => active.has(id)) })),
    collections: catalog.collections.filter((c) => c.published !== false).map((c) => ({ ...c, productIds: c.productIds.filter((id) => active.has(id)) })),
    lookbooks,
  };
}
