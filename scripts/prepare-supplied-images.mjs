// Prepares the supplied rail cut-outs for the STILLFORM prototype.
//
// Reads the untouched originals in assets/supplied-originals and writes
// storefront copies to public/media/products. Third-party prints are
// retouched out and a few colourways are toned into the house palette.
// Every source keeps its 645 × 1000 canvas so front, back and side views
// stay registered when a garment turns on the rail.
//
//   node scripts/prepare-supplied-images.mjs [source-folder ...]

import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const SRC = "assets/supplied-originals";
const OUT = "public/media/products";

/**
 * erase: regions holding a print. `mode` picks how the print is found inside
 * the region: "light"/"dark" compare luminance with the region's median,
 * "rect" clears the whole region (small tonal embroidery).
 * tone: optional colour grade limited to one hue band so hangers stay put.
 */
const JOBS = [
  { from: "bone-tee", to: "heavyweight-tee/bone", erase: { front: [{ rect: [396, 292, 488, 330], mode: "rect", donor: [0, 70] }] } },
  {
    from: "cc-graphic",
    to: "heavyweight-tee/black",
    erase: {
      front: [{ rect: [150, 286, 500, 396], mode: "light", thr: 18, grow: 4, donor: [0, 130] }],
      back: [{ rect: [256, 180, 360, 226], mode: "light", thr: 18, grow: 3, donor: [0, 60] }],
      side: [{ rect: [236, 250, 410, 430], mode: "light", thr: 40, grow: 3, donor: [0, 180], minY: 250 }],
    },
  },
  { from: "breton", to: "mariner-long-sleeve/ink-stripe" },
  {
    from: "oxford-sky",
    to: "oxford-shirt/pale-blue",
    erase: { front: [{ rect: [402, 316, 494, 348], mode: "rect", donor: [0, 50] }] },
    tone: { hue: [175, 245], saturation: 0.72 },
  },
  { from: "cardigan-olive", to: "lambswool-cardigan/moss" },
  { from: "henley-brick", to: "henley/rust", tone: { hue: [0, 40], saturation: 0.82, extraHue: [340, 360] } },
  {
    from: "hoodie-heather",
    to: "fleece-hoodie/grey-marl",
    erase: { front: [{ rect: [194, 316, 442, 418], mode: "rect", donor: [0, 110] }] },
  },
  {
    from: "sweat-lilac",
    to: "fleece-crew/oat",
    erase: { front: [{ rect: [190, 280, 440, 376], mode: "light", thr: 14, grow: 5, donor: [0, 120] }] },
    tone: { hue: [235, 330], recolor: [205, 197, 182] },
  },
  {
    from: "polo-forest",
    to: "pique-polo/bottle",
    erase: { front: [{ rect: [384, 310, 470, 348], mode: "rect", donor: [0, 60] }] },
    tone: { hue: [100, 180], saturation: 0.7 },
  },
];

const VIEWS = ["front", "back", "side"];

async function load(path) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { px: Float32Array.from(data), w: info.width, h: info.height };
}

const lum = (px, i) => 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];

const PAD = 10;

function erase(img, region) {
  const { px, w } = img;
  // work on the region plus a clean margin so the fill is seeded from cloth, never from the print
  const [ix0, iy0, ix1, iy1] = region.rect;
  const [x0, y0, x1, y1] = [ix0 - PAD, iy0 - PAD, ix1 + PAD, iy1 + PAD];
  const rw = x1 - x0;
  const rh = y1 - y0;
  const at = (x, y) => (y * w + x) * 4;
  const opaque = (x, y) => px[at(x, y) + 3] > 250;

  // 1. find the print
  let mask = new Uint8Array(rw * rh);
  if (region.mode === "rect") {
    for (let y = iy0; y < iy1; y++) for (let x = ix0; x < ix1; x++) mask[(y - y0) * rw + (x - x0)] = 1;
  } else {
    const values = [];
    for (let y = iy0; y < iy1; y++) for (let x = ix0; x < ix1; x++) if (opaque(x, y)) values.push(lum(px, at(x, y)));
    values.sort((a, b) => a - b);
    const median = values[Math.floor(values.length / 2)] ?? 0;
    for (let y = iy0; y < iy1; y++) {
      for (let x = ix0; x < ix1; x++) {
        if (region.minY && y < region.minY) continue;
        const l = lum(px, at(x, y));
        const hit = region.mode === "light" ? l > median + region.thr : l < median - region.thr;
        if (hit && opaque(x, y)) mask[(y - y0) * rw + (x - x0)] = 1;
      }
    }
  }
  // 2. grow it past the anti-aliased halo
  for (let g = 0; g < Math.min(PAD - 2, region.grow ?? 0); g++) {
    const next = mask.slice();
    for (let y = 1; y < rh - 1; y++) for (let x = 1; x < rw - 1; x++) {
      const k = y * rw + x;
      if (mask[k - 1] || mask[k + 1] || mask[k - rw] || mask[k + rw]) next[k] = 1;
    }
    mask = next;
  }
  // never touch transparent background; semi-opaque silhouette edges may still carry print
  const cloth = (x, y) => px[at(x, y) + 3] > 120;
  for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) if (!cloth(x + x0, y + y0)) mask[y * rw + x] = 0;

  // 3. harmonic fill: smooth shading from the surrounding cloth only
  const anchor = new Uint8Array(rw * rh);
  const fill = new Float32Array(rw * rh * 3);
  const base = [0, 0, 0];
  let anchors = 0;
  for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
    const k = y * rw + x;
    const i = at(x + x0, y + y0);
    anchor[k] = !mask[k] && opaque(x + x0, y + y0) ? 1 : 0;
    for (let c = 0; c < 3; c++) {
      fill[k * 3 + c] = px[i + c];
      if (anchor[k]) base[c] += px[i + c];
    }
    anchors += anchor[k];
  }
  for (let c = 0; c < 3; c++) base[c] /= Math.max(1, anchors);
  for (let y = 0; y < rh; y++) {
    let left = -1;
    for (let x = 0; x < rw; x++) {
      const k = y * rw + x;
      if (!mask[k]) {
        if (anchor[k]) left = x;
        continue;
      }
      let right = x;
      while (right < rw && !anchor[y * rw + right]) right++;
      for (let c = 0; c < 3; c++) {
        const a = left >= 0 ? fill[(y * rw + left) * 3 + c] : right < rw ? fill[(y * rw + right) * 3 + c] : base[c];
        const b = right < rw ? fill[(y * rw + right) * 3 + c] : a;
        const t = left >= 0 && right < rw ? (x - left) / (right - left) : 0;
        fill[k * 3 + c] = a + (b - a) * t;
      }
    }
  }
  const usable = (k) => anchor[k] || mask[k];
  for (let it = 0; it < 900; it++) {
    for (let y = 1; y < rh - 1; y++) for (let x = 1; x < rw - 1; x++) {
      const k = y * rw + x;
      if (!mask[k]) continue;
      const near = [k - 1, k + 1, k - rw, k + rw].filter(usable);
      if (!near.length) continue;
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (const n of near) sum += fill[n * 3 + c];
        fill[k * 3 + c] = sum / near.length;
      }
    }
  }

  // 4. graft the fabric grain from a clean patch nearby
  const [dx, dy] = region.donor;
  const blurred = (x, y, c) => {
    let sum = 0;
    let n = 0;
    for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) {
      sum += px[at(x + i, y + j) + c];
      n++;
    }
    return sum / n;
  };
  for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
    const k = y * rw + x;
    if (!mask[k]) continue;
    const sx = x + x0 + dx;
    const sy = y + y0 + dy;
    const i = at(x + x0, y + y0);
    const donorOk = opaque(sx, sy);
    for (let c = 0; c < 3; c++) {
      const grain = donorOk ? px[at(sx, sy) + c] - blurred(sx, sy, c) : 0;
      px[i + c] = Math.max(0, Math.min(255, fill[k * 3 + c] + grain * 0.95));
    }
  }
}

function rgbToHsv(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let hue = 0;
  if (d) {
    if (max === r) hue = ((g - b) / d) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  return { hue, sat: max ? d / max : 0 };
}

function tone(img, spec) {
  const { px } = img;
  const inBand = (hue) => (hue >= spec.hue[0] && hue <= spec.hue[1]) || (spec.extraHue && hue >= spec.extraHue[0] && hue <= spec.extraHue[1]);
  const target = spec.recolor;
  const targetLum = target ? 0.2126 * target[0] + 0.7152 * target[1] + 0.0722 * target[2] : 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 8) continue;
    const { hue, sat } = rgbToHsv(px[i], px[i + 1], px[i + 2]);
    if (!inBand(hue) || sat < 0.06) continue;
    const weight = Math.min(1, (sat - 0.06) / 0.08);
    const l = lum(px, i);
    for (let c = 0; c < 3; c++) {
      const v = px[i + c];
      const graded = target ? (target[c] / targetLum) * l * 1.02 : l + (v - l) * spec.saturation;
      px[i + c] = Math.max(0, Math.min(255, v + (graded - v) * weight));
    }
  }
}

const only = process.argv.slice(2);
for (const job of JOBS.filter((j) => !only.length || only.includes(j.from))) {
  await mkdir(`${OUT}/${job.to.split("/")[0]}`, { recursive: true });
  for (const view of VIEWS) {
    const img = await load(`${SRC}/${job.from}/${view}.webp`);
    for (const region of job.erase?.[view] ?? []) erase(img, region);
    if (job.tone) tone(img, job.tone);
    const out = `${OUT}/${job.to}-${view}.webp`;
    await sharp(Buffer.from(Uint8ClampedArray.from(img.px)), { raw: { width: img.w, height: img.h, channels: 4 } })
      .webp({ quality: 90, alphaQuality: 100, effort: 6 })
      .toFile(out);
    console.log("wrote", out);
  }
}
