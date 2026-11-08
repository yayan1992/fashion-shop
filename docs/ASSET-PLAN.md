# STILLFORM — asset replacement plan

Every image on the site is tagged in `src/catalog/local/media.ts` with its `origin` and a `replaceNote`. In development, open any product page with `?slots` (e.g. `/products/pique-polo?slots`) to see the empty photo slots with their brief.

## What is on the site today

| Set | Count | Origin | Where it appears |
| --- | --- | --- | --- |
| Rail cut-outs (front / back / side) | 27 (9 colourways × 3) | Supplied stock, 645 × 1000; 6 retouched to remove third-party prints | Rail, product cards, product gallery, bag |
| Campaign frames | 4 | AI-generated from the cut-outs | Lookbook, product "Worn" photo |
| Fabric close-ups | 5 | AI-generated from the cut-outs | Brand statement, lookbook, product "The cloth" |

The generated images are faithful to the products, but they are stand-ins. Replace them with a real shoot before launch.

## 1. Rail cut-outs — highest priority

All 27 are stock garments at 645 px wide: sharp on the rail and cards, soft on large retina screens. Replace every view of every colourway.

**Spec for every cut-out:**

- **Canvas:** transparent PNG or WebP, 1290 × 2000 px. Keep the 200 : 310 ratio the rail is built on.
- **Hanger:** the same wooden hanger in every shot, with the hook tip at the top centre (x 50 %, y 0).
- **Registration:** front, back and side of one colourway share identical scale and position. Shoot them on a fixed rig, rotating the hanger only, or the piece jumps in size as it turns on the rail.
- **Side view:** the garment turned 90°, centred, with the hook still at the top centre.
- **Light:** soft, frontal, consistent across the collection, with no hard drop shadow (the site adds its own).

**Order of replacement:** the retouched sets first, as they are reconstructions:

1. Heavyweight Tee in black (all 3 views)
2. Fleece Hoodie (front)
3. Fleece Crew in oat (all 3; currently recoloured lilac)
4. Oxford Shirt (front)
5. Piqué Polo (front)
6. Heavyweight Tee in bone (front)

Then the Mariner Long Sleeve, Lambswool Cardigan and Henley.

## 2. Campaign photography — 4 frames

One half-day studio shoot plus one location covers all four. Keep the current art direction: plaster walls, north light, muted warm grade, medium-format film feel, no visible logos.

| # | Look | Pieces | Format and minimum size | Placement |
| --- | --- | --- | --- | --- |
| 1 | Moss and rust | Lambswool Cardigan open over Henley | Landscape 16 : 9, 3200 × 1800, subject in the left third | Lookbook opener (full bleed; crops to 4 : 5 on phones) and the "Worn" photo for both products |
| 2 | Black, side-lit | Heavyweight Tee in black | Portrait 4 : 5, 2400 × 3000, graphite backdrop | Lookbook spread; black tee "Worn" photo |
| 3 | Stripe and oat | Mariner Long Sleeve, Fleece Crew over the shoulders | Portrait 4 : 5, 2400 × 3000, outdoors on stone | Lookbook spread; "Worn" for both products |
| 4 | Weekday morning | Fleece Hoodie over Oxford Shirt | Landscape 3 : 2, 3000 × 2000, bare interior | Lookbook wide frame; "Worn" for both products |

Set a focal point for each frame (`focus` in `media.ts`) so the phone crops stay on the model.

## 3. Fabric and detail shots — 9 frames, 4 : 5, 2400 × 3000

| Product | Have now (generated) | Shot to take |
| --- | --- | --- |
| Lambswool Cardigan | Knit and corozo button | Same, real |
| Heavyweight Tee | Bone ribbed neck | Same, real |
| Mariner Long Sleeve | Folded boat neckline | Same, real |
| Fleece Hoodie | Drawcord and loopback | Same, real |
| Oxford Shirt | Button-down collar | Same, real |
| Long-Sleeve Henley | **Missing** | Slub jersey and placket buttons |
| Fleece Crew | **Missing** | Ribbed neck and brushed reverse |
| Piqué Polo | **Missing** | Piqué texture and knitted collar |
| Heavyweight Tee in black | **Missing** (uses the bone detail) | Optional: dense black jersey under raking light |

## 4. Missing "Worn" photos

The Heavyweight Tee in bone and the Piqué Polo have no on-model image. Add one portrait each (4 : 5, 2400 × 3000), or include them in an extra campaign look.

## Not needed

- No hero photography. The rail is the hero and should stay the only image there.
- No stock or mood imagery. Every photograph should show the collection.

## After the shoot

1. Drop campaign and detail originals into `assets/editorial-source/`, named after the media id (e.g. `look-moss-rust.jpg`).
2. Run `node scripts/prepare-editorial-images.mjs` to build the 640–2048 px variants and the manifest.
3. Replace the rail cut-outs in `public/media/products/` at the new size and update `RAIL_CANVAS` in `media.ts`.
4. Change each asset's `origin` and remove its `replaceNote`. Then `npm test` confirms every reference still resolves.
