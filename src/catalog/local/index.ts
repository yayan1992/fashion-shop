import type { Catalog, Category, Collection, Lookbook, StoreSettings } from "../types";
import { media } from "./media";
import { products } from "./products";

const categories: Category[] = [
  { id: "tops", label: "Tops" },
  { id: "shirts", label: "Shirts" },
  { id: "knitwear", label: "Knitwear" },
  { id: "sweats", label: "Sweats" },
];

const collections: Collection[] = [
  {
    id: "collection-01",
    slug: "collection-01",
    title: "Collection 01",
    season: "Autumn–Winter 2026",
    summary: "Eight pieces in bone, ink, moss and rust. Heavy cloth, plain construction, nothing printed on the outside.",
    productIds: ["heavyweight-tee", "mariner-long-sleeve", "oxford-shirt", "lambswool-cardigan", "henley", "fleece-hoodie", "fleece-crew", "pique-polo"],
  },
];

const lookbooks: Lookbook[] = [
  {
    id: "lookbook-01",
    title: "Lookbook",
    season: "Collection 01 · Autumn–Winter 2026",
    summary: "Eight pieces, worn the way they are meant to be: layered, unhurried, in plain light.",
    spreads: [
      {
        id: "opening",
        layout: "cinematic",
        looks: [
          {
            id: "look-01",
            title: "Moss and rust",
            caption: "Lambswool Cardigan in moss, open over the Long-Sleeve Henley in rust",
            tone: "bone",
            kind: "campaign",
            mediaId: "editorial/look-moss-rust",
            pieces: [
              { productId: "lambswool-cardigan", colorwayId: "moss", view: "front" },
              { productId: "henley", colorwayId: "rust", view: "front" },
            ],
          },
        ],
      },
      {
        id: "foundation",
        layout: "pair",
        note: "The Heavyweight Tee is the piece the rest of the collection is built on: 240 gsm jersey, dense enough to hold its line, in black and in bone.",
        looks: [
          {
            id: "look-02",
            title: "Black, side-lit",
            caption: "Heavyweight Tee in black",
            tone: "ink",
            kind: "campaign",
            mediaId: "editorial/look-black-tee",
            pieces: [{ productId: "heavyweight-tee", colorwayId: "black", view: "front" }],
          },
          {
            id: "detail-01",
            title: "The neck",
            caption: "Heavyweight Tee in bone, ribbed crew neck",
            tone: "bone",
            kind: "detail",
            mediaId: "editorial/detail-bone-tee",
            pieces: [{ productId: "heavyweight-tee", colorwayId: "bone", view: "front" }],
          },
        ],
      },
      {
        id: "coast",
        layout: "pair-flip",
        note: "The stripe is knitted in from dyed yarn, not printed on, so it stays sharp after years of washing.",
        looks: [
          {
            id: "look-03",
            title: "Stripe and oat",
            caption: "Mariner Long Sleeve with the Fleece Crew in oat over the shoulders",
            tone: "plaster",
            kind: "campaign",
            mediaId: "editorial/look-stripe-oat",
            pieces: [
              { productId: "mariner-long-sleeve", colorwayId: "ink-stripe", view: "front" },
              { productId: "fleece-crew", colorwayId: "oat", view: "front" },
            ],
          },
          {
            id: "detail-02",
            title: "Yarn-dyed stripe",
            caption: "Mariner Long Sleeve, boat neckline",
            tone: "plaster",
            kind: "detail",
            mediaId: "editorial/detail-mariner",
            pieces: [{ productId: "mariner-long-sleeve", colorwayId: "ink-stripe", view: "front" }],
          },
        ],
      },
      {
        id: "morning",
        layout: "wide",
        looks: [
          {
            id: "look-04",
            title: "Weekday morning",
            caption: "Fleece Hoodie in grey marl over the Oxford Shirt in pale blue",
            tone: "plaster",
            kind: "campaign",
            mediaId: "editorial/look-oxford-hoodie",
            pieces: [
              { productId: "fleece-hoodie", colorwayId: "grey-marl", view: "front" },
              { productId: "oxford-shirt", colorwayId: "pale-blue", view: "front" },
            ],
          },
        ],
      },
      {
        id: "cloth",
        layout: "materials",
        note: "Loopback fleece brushed on the reverse. Oxford cloth washed after sewing. Cloth chosen for how it wears in, not how it looks on the first day.",
        looks: [
          {
            id: "detail-03",
            title: "Loopback fleece",
            caption: "Fleece Hoodie, flat cotton drawcord",
            tone: "plaster",
            kind: "detail",
            mediaId: "editorial/detail-fleece",
            pieces: [{ productId: "fleece-hoodie", colorwayId: "grey-marl", view: "front" }],
          },
          {
            id: "detail-04",
            title: "Oxford cloth",
            caption: "Oxford Shirt, unlined button-down collar",
            tone: "plaster",
            kind: "detail",
            mediaId: "editorial/detail-oxford",
            pieces: [{ productId: "oxford-shirt", colorwayId: "pale-blue", view: "front" }],
          },
        ],
      },
    ],
  },
];

const settings: StoreSettings = {
  name: "STILLFORM",
  description: "A small collection of heavyweight garments, cut once and cut well.",
  currency: "USD",
  locale: "en-US",
  lowStockThreshold: 3,
  orderPrefix: "SF",
  contact: { email: "studio@stillform.example", phone: "", address: "" },
  // Live checkout is configured in the dashboard once Supabase is connected.
  checkout: {
    enabled: false,
    methods: [
      { id: "cod", label: "Cash on delivery", instructions: "Pay the courier in cash or by card when your order arrives.", enabled: true },
      { id: "bank-transfer", label: "Bank transfer", instructions: "We will email our bank details with your order reference. Your order ships once payment arrives.", enabled: false },
      { id: "pickup", label: "Pay at studio pickup", instructions: "Collect and pay at the studio. We will email you when your order is ready.", enabled: false },
    ],
  },
  shipping: { flatRate: 0, freeOver: null, note: "Shipping is included in the price. Prices include applicable taxes." },
  policies: {
    shipping: "Orders are packed by hand and dispatched within three working days. You will receive your tracking details by email.",
    returns: "Unworn pieces can be returned within 30 days of delivery for a full refund. Contact the studio with your order reference to arrange a return.",
  },
  rail: {
    eyebrow: "Collection 01 · Autumn–Winter 2026",
    heading: "Clothes that keep their form.",
    caption: "Run a hand along the rail. Click a piece to take it down.",
    touchCaption: "Swipe along the rail, then tap a piece to bring it forward.",
    autoplay: false,
    placements: [
      { productId: "heavyweight-tee", colorwayId: "bone" },
      { productId: "mariner-long-sleeve", colorwayId: "ink-stripe" },
      { productId: "oxford-shirt", colorwayId: "pale-blue" },
      { productId: "lambswool-cardigan", colorwayId: "moss" },
      { productId: "henley", colorwayId: "rust" },
      { productId: "fleece-hoodie", colorwayId: "grey-marl" },
      { productId: "fleece-crew", colorwayId: "oat" },
      { productId: "heavyweight-tee", colorwayId: "black" },
    ],
  },
  home: {
    statement: {
      label: "The house",
      body: "We make a small number of garments in heavy, honest cloth, and we keep making them.",
      aside: "No prints on the outside, no seasonal markdowns. Each piece is cut to be worn for years, and to hang well on the days it isn't.",
      mediaId: "editorial/detail-lambswool",
    },
    featuredCollectionId: "collection-01",
    featuredProductIds: ["lambswool-cardigan", "mariner-long-sleeve", "oxford-shirt", "fleece-hoodie"],
    lookbookId: "lookbook-01",
  },
  footer: {
    note: "A preview of the STILLFORM storefront. Orders and payments are not yet enabled.",
    links: [
      { label: "Shop all", href: "/shop" },
      { label: "Collection 01", href: "/#collection" },
      { label: "Lookbook", href: "/#lookbook" },
      { label: "Shipping and returns", href: "/info" },
    ],
  },
};

export const localCatalog: Catalog = { settings, categories, media, products, collections, lookbooks };
