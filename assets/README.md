# Image sources

Full-size originals go here. This folder isn't published; the site uses the optimised copies the scripts write to `public/media`.

| Folder | Script | Writes |
| --- | --- | --- |
| `assets/editorial-source/` | `node scripts/prepare-editorial-images.mjs` | 640–2048 px WebP copies in `public/media/editorial` |
| `assets/supplied-originals/` | `node scripts/prepare-supplied-images.mjs` | Rail cut-outs in `public/media/products` |

Once your store is connected to Supabase, you don't need either script: photos you upload in the dashboard are prepared in the browser. See `docs/ASSET-PLAN.md` for what to shoot.
