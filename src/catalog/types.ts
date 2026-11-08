// The storefront's content model. Every field here is something a store owner
// will eventually edit in the admin dashboard; presentation components only read
// it through the Catalog, never through hardcoded values. The shapes map onto
// database tables one-to-one (media, products, colorways, variants, collections,
// lookbooks, settings) so a Supabase loader can return the same Catalog object.

/** Where an image came from, so placeholders are easy to find and replace. */
export type MediaOrigin =
  /** Supplied with the rail component, used as delivered. */
  | "supplied"
  /** Supplied, then retouched for this store (prints removed or colour toned). */
  | "supplied-retouched"
  /** AI-generated from the product cut-outs as a stand-in for a real shoot. */
  | "generated"
  /** Uploaded from the dashboard. */
  | "uploaded";

/** A resized copy of an image, for responsive srcset. */
export interface MediaVariant {
  width: number;
  src: string;
}

export interface MediaAsset {
  id: string;
  /** Public URL. Today a path under /public; later a storage bucket URL. */
  src: string;
  alt: string;
  width: number;
  height: number;
  origin: MediaOrigin;
  /** Why the asset should be replaced, when it should. */
  replaceNote?: string;
  /** Smaller copies for srcset, widest last. */
  variants?: MediaVariant[];
  /** CSS object-position used when the image is cropped, e.g. "30% 50%". */
  focus?: string;
  /** Object path in the "media" storage bucket, for files uploaded from the dashboard. */
  storagePath?: string;
}

/** Media ids for one colourway. Rail views must share one canvas and scale. */
export interface ColorwayMedia {
  /** Transparent cut-out on the shared rail canvas, hook at the top centre. */
  front: string;
  back: string;
  /** Side-on view shown while the piece rests on the rail. */
  side?: string;
  /** Extra photographs for the product page gallery, after the studio views. */
  gallery: string[];
  /** Photographs of the piece being worn. */
  lifestyle?: string[];
  /** Fabric and construction close-ups. */
  details?: string[];
}

export interface Colorway {
  id: string;
  name: string;
  /** Representative fabric colour for swatches and placeholders. */
  swatch: string;
  media: ColorwayMedia;
  /** Dashboard only: whether this colourway hangs on the rail. */
  onRail?: boolean;
}

export interface Variant {
  sku: string;
  colorwayId: string;
  size: string;
  stock: number;
}

/** A category id; labels live in Catalog.categories. */
export type ProductCategory = string;

export interface Category {
  id: string;
  label: string;
}

export type ProductStatus = "active" | "draft" | "archived";

export interface Product {
  id: string;
  slug: string;
  name: string;
  category: ProductCategory;
  status: ProductStatus;
  /** Price in minor units (cents) of the store currency. */
  price: number;
  /** One line for cards, hang tags and the rail caption. */
  summary: string;
  description: string;
  details: string[];
  composition: string;
  care: string[];
  fit: string;
  /** A few sentences on the cloth, shown beside the fabric close-up. */
  fabric?: string;
  /** Curated complementary pieces, by product id. */
  pairsWith?: string[];
  /** Sizes in display order. */
  sizes: string[];
  colorways: Colorway[];
  variants: Variant[];
  /** Dashboard only. */
  featured?: boolean;
  collectionIds?: string[];
  updatedAt?: string;
}

/** One hanger on the rail: a product shown in one colourway. */
export interface RailPlacement {
  productId: string;
  colorwayId: string;
}

export interface Collection {
  id: string;
  slug: string;
  title: string;
  season: string;
  summary: string;
  productIds: string[];
  /** Dashboard only; the storefront receives published collections. */
  published?: boolean;
}

export type Tone = "plaster" | "bone" | "graphite" | "ink";

export interface LookPiece extends RailPlacement {
  view: "front" | "back" | "side";
}

export interface Look {
  id: string;
  title: string;
  caption: string;
  tone: Tone;
  /** "campaign" frames show the clothes worn; "detail" frames show the cloth up close. */
  kind: "campaign" | "detail";
  /** A photograph. When absent, the pieces are arranged as a studio still life. */
  mediaId?: string;
  pieces: LookPiece[];
  published?: boolean;
}

/**
 * The lookbook is a sequence of spreads, each laid out by one of a fixed set of
 * editorial templates, so an owner can reorder and restock it without design work.
 *   cinematic  one full-bleed wide frame
 *   pair       a portrait with a smaller detail, text between
 *   pair-flip  the same, mirrored
 *   wide       one landscape frame inside the grid
 *   materials  a short text with two or three detail frames
 */
export type SpreadLayout = "cinematic" | "pair" | "pair-flip" | "wide" | "materials";

export interface LookbookSpread {
  id: string;
  layout: SpreadLayout;
  looks: Look[];
  /** A line of copy set beside the images. */
  note?: string;
  published?: boolean;
}

export interface Lookbook {
  id: string;
  title: string;
  season: string;
  summary: string;
  spreads: LookbookSpread[];
  published?: boolean;
}

export type CheckoutMethodId = "cod" | "bank-transfer" | "pickup";

export interface CheckoutMethod {
  id: CheckoutMethodId;
  label: string;
  /** Shown to the customer at checkout and on their confirmation. */
  instructions: string;
  enabled: boolean;
}

export interface StoreSettings {
  name: string;
  description?: string;
  /** ISO 4217 code, e.g. "USD". */
  currency: string;
  locale: string;
  /** Sizes at or below this count show a low-stock note. */
  lowStockThreshold: number;
  orderPrefix?: string;
  contact?: { email?: string; phone?: string; address?: string };
  checkout?: { enabled: boolean; methods: CheckoutMethod[] };
  /** Minor units. Free shipping applies when the subtotal reaches freeOver. */
  shipping?: { flatRate: number; freeOver: number | null; note?: string };
  policies?: { shipping?: string; returns?: string };
  rail: {
    eyebrow: string;
    heading: string;
    caption: string;
    /** Caption for touch screens, where there is no hover. */
    touchCaption?: string;
    autoplay: boolean;
    placements: RailPlacement[];
  };
  home: {
    statement: { label: string; body: string; aside: string; mediaId?: string };
    featuredCollectionId: string;
    /** Products featured in the editorial grid, in order. The first is shown largest. */
    featuredProductIds: string[];
    lookbookId: string;
  };
  footer: {
    note: string;
    links: { label: string; href: string }[];
  };
}

export interface Catalog {
  settings: StoreSettings;
  categories: Category[];
  media: Record<string, MediaAsset>;
  products: Product[];
  collections: Collection[];
  lookbooks: Lookbook[];
}
