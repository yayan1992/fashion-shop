// Prepares editorial photographs (campaign frames and fabric close-ups).
//
// Reads full-size sources from assets/editorial-source and writes WebP copies
// at several widths to public/media/editorial, plus a manifest the media
// library reads. Widths never exceed the source, so nothing is upscaled.
//
//   node scripts/prepare-editorial-images.mjs

import { mkdir, readdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const SRC = "assets/editorial-source";
const OUT = "public/media/editorial";
const MANIFEST = "src/catalog/local/editorial-manifest.json";
const WIDTHS = [640, 1080, 1600, 2048];

await mkdir(OUT, { recursive: true });
const manifest = {};

for (const file of (await readdir(SRC)).filter((name) => /\.(png|jpe?g|webp)$/i.test(name)).sort()) {
  const name = file.replace(/\.[^.]+$/, "");
  const source = sharp(`${SRC}/${file}`).flatten({ background: "#eeeae3" });
  const { width, height } = await source.metadata();
  const widths = [...new Set([...WIDTHS.filter((w) => w < width), Math.min(width, WIDTHS.at(-1))])];
  const variants = [];
  for (const w of widths) {
    const src = `/media/editorial/${name}-${w}.webp`;
    await source.clone().resize({ width: w }).webp({ quality: 82, effort: 6 }).toFile(`public${src}`);
    variants.push({ width: w, src });
  }
  const largest = variants.at(-1);
  manifest[name] = { width: largest.width, height: Math.round((height * largest.width) / width), variants };
  console.log(name, `${width}×${height}`, "→", widths.join(", "));
}

await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
