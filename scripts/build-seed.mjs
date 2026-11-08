// Builds the Supabase starter data from the demo catalogue, and the one-file
// setup script for the Supabase SQL editor.
//
//   node scripts/build-seed.mjs
//
// Writes:
//   supabase/seed.sql   the demo STILLFORM collection (runs only on an empty store)
//   supabase/setup.sql  every migration followed by the seed, for a fresh project
//
// Product ids, SKUs and image paths are kept exactly as in the demo catalogue.
// Demo images stay where they are (served by the site from /media/...); only
// photographs uploaded from the dashboard live in Supabase Storage.

import { readdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "vite";

const server = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
const { localCatalog: catalog } = await server.ssrLoadModule("/src/catalog/local/index.ts");
await server.close();

const q = (value) => (value === null || value === undefined ? "null" : `'${String(value).replace(/'/g, "''")}'`);
const arr = (values) => `array[${values.map(q).join(", ")}]::text[]`;
const json = (value) => `${q(JSON.stringify(value))}::jsonb`;
const rows = (table, columns, values) =>
  values.length ? `  insert into public.${table} (${columns.join(", ")}) values\n    ${values.map((v) => `(${v.join(", ")})`).join(",\n    ")}\n  on conflict do nothing;\n` : "";

const media = Object.values(catalog.media);
const products = catalog.products;
const colorways = products.flatMap((p) => p.colorways.map((c, i) => ({ p, c, i })));
const roleRows = colorways.flatMap(({ p, c }) => [
  ...["front", "back", "side"].filter((r) => c.media[r]).map((r) => [q(p.id), q(c.id), q(r), "0", q(c.media[r])]),
  ...[["gallery", "gallery"], ["lifestyle", "lifestyle"], ["details", "detail"]].flatMap(([key, role]) =>
    (c.media[key] ?? []).map((id, i) => [q(p.id), q(c.id), q(role), String(i), q(id)]),
  ),
]);
const s = catalog.settings;
const lookbook = catalog.lookbooks;

const body = [
  rows("categories", ["id", "label", "position"], catalog.categories.map((c, i) => [q(c.id), q(c.label), String(i)])),
  rows(
    "media",
    ["id", "src", "alt", "width", "height", "origin", "replace_note", "variants", "focus"],
    media.map((m) => [q(m.id), q(m.src), q(m.alt), String(m.width), String(m.height), q(m.origin), q(m.replaceNote), json(m.variants ?? []), q(m.focus)]),
  ),
  rows(
    "products",
    ["id", "slug", "name", "category_id", "status", "price", "summary", "description", "details", "composition", "care", "fit", "fabric", "sizes"],
    products.map((p) => [q(p.id), q(p.slug), q(p.name), q(p.category), q(p.status), String(p.price), q(p.summary), q(p.description), arr(p.details), q(p.composition), arr(p.care), q(p.fit), q(p.fabric), arr(p.sizes)]),
  ),
  rows("colorways", ["product_id", "id", "name", "swatch", "position"], colorways.map(({ p, c, i }) => [q(p.id), q(c.id), q(c.name), q(c.swatch), String(i + 1)])),
  rows("colorway_media", ["product_id", "colorway_id", "role", "position", "media_id"], roleRows),
  rows("variants", ["sku", "product_id", "colorway_id", "size", "stock"], products.flatMap((p) => p.variants.map((v) => [q(v.sku), q(p.id), q(v.colorwayId), q(v.size), String(v.stock)]))),
  rows("collections", ["id", "slug", "title", "season", "summary", "position"], catalog.collections.map((c, i) => [q(c.id), q(c.slug), q(c.title), q(c.season), q(c.summary), String(i)])),
  rows("collection_products", ["collection_id", "product_id", "position"], catalog.collections.flatMap((c) => c.productIds.map((id, i) => [q(c.id), q(id), String(i)]))),
  rows("rail_placements", ["product_id", "colorway_id", "position"], s.rail.placements.map((r, i) => [q(r.productId), q(r.colorwayId), String(i)])),
  rows("featured_products", ["product_id", "position"], s.home.featuredProductIds.map((id, i) => [q(id), String(i)])),
  rows("product_pairings", ["product_id", "paired_product_id", "position"], products.flatMap((p) => (p.pairsWith ?? []).map((id, i) => [q(p.id), q(id), String(i)]))),
  rows("lookbooks", ["id", "title", "season", "summary"], lookbook.map((b) => [q(b.id), q(b.title), q(b.season), q(b.summary)])),
  rows("lookbook_spreads", ["id", "lookbook_id", "layout", "note", "position"], lookbook.flatMap((b) => b.spreads.map((sp, i) => [q(sp.id), q(b.id), q(sp.layout), q(sp.note), String(i)]))),
  rows(
    "looks",
    ["id", "spread_id", "title", "caption", "tone", "kind", "media_id", "position"],
    lookbook.flatMap((b) => b.spreads.flatMap((sp) => sp.looks.map((l, i) => [q(l.id), q(sp.id), q(l.title), q(l.caption), q(l.tone), q(l.kind), q(l.mediaId), String(i)]))),
  ),
  rows(
    "look_pieces",
    ["look_id", "position", "product_id", "colorway_id", "view"],
    lookbook.flatMap((b) => b.spreads.flatMap((sp) => sp.looks.flatMap((l) => l.pieces.map((piece, i) => [q(l.id), String(i), q(piece.productId), q(piece.colorwayId), q(piece.view)])))),
  ),
  `  update public.store_settings set
    name = ${q(s.name)},
    description = ${q(s.description ?? "")},
    currency = ${q(s.currency)},
    locale = ${q(s.locale)},
    low_stock_threshold = ${s.lowStockThreshold},
    order_prefix = ${q(s.orderPrefix ?? "SF")},
    contact = ${json(s.contact ?? {})},
    rail = ${json({ eyebrow: s.rail.eyebrow, heading: s.rail.heading, caption: s.rail.caption, touchCaption: s.rail.touchCaption, autoplay: s.rail.autoplay })},
    home = ${json({ statement: s.home.statement, featuredCollectionId: s.home.featuredCollectionId, lookbookId: s.home.lookbookId })},
    footer = ${json(s.footer)},
    checkout = ${json(s.checkout ?? { enabled: false, methods: [] })},
    shipping = ${json(s.shipping ?? { flatRate: 0, freeOver: null, note: "" })},
    policies = ${json(s.policies ?? {})}
  where id;
`,
].join("\n");

const seed = `-- STILLFORM · starter data
--
-- Generated by scripts/build-seed.mjs from src/catalog/local. Do not edit by hand.
-- Loads the demo collection into an empty store. If the store already has
-- products or media, nothing is changed, so running it again is always safe.

do $seed$
begin
  if exists (select 1 from public.products) or exists (select 1 from public.media) then
    raise notice 'STILLFORM seed skipped: the store already has content.';
    return;
  end if;

${body}
  raise notice 'STILLFORM seed loaded: % products.', (select count(*) from public.products);
end;
$seed$;
`;

await writeFile("supabase/seed.sql", seed);

const dir = "supabase/migrations";
const migrations = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
const parts = await Promise.all(migrations.map(async (f) => `-- ===== ${f} =====\n\n${await readFile(`${dir}/${f}`, "utf8")}`));
await writeFile(
  "supabase/setup.sql",
  `-- STILLFORM · one-file database setup
--
-- Generated by scripts/build-seed.mjs. Paste into the Supabase SQL editor of a
-- new project and run it once. Every statement is safe to run again.
-- Contains: ${migrations.join(", ")}, seed.sql

${parts.join("\n\n")}

-- ===== seed.sql =====

${seed}`,
);

console.log(`seed: ${products.length} products, ${media.length} media, ${colorways.length} colourways; setup.sql: ${migrations.length} migrations`);
