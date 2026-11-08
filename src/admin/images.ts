// Image preparation in the browser, before anything is uploaded.
//
// Rail photographs are re-drawn onto the rail's shared canvas (the supplied
// cut-outs use 645 × 1000; uploads use 2× that), with the hanger hook at the
// top centre. Because the alignment is baked into the uploaded file, the
// rail's turning, shadows and masks work exactly as they do for the original
// cut-outs, with no runtime adjustments. Editorial photographs are saved at a
// few widths for responsive loading. No external image service is involved.

export const RAIL_W = 1290;
export const RAIL_H = 2000;
export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
export const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_SOURCE_SIDE = 2600;
const EDITORIAL_WIDTHS = [640, 1080, 1600, 2048];

export function checkFile(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) return "Use a JPEG, PNG, WebP or AVIF image.";
  if (file.size > MAX_FILE_BYTES) return "That file is larger than 15 MB. Export a smaller copy and try again.";
  return null;
}

function canvas(width: number, height: number) {
  const node = document.createElement("canvas");
  node.width = width;
  node.height = height;
  return node;
}

function context(node: HTMLCanvasElement) {
  const ctx = node.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("This browser can’t edit images.");
  return ctx;
}

/** Decodes a file into a canvas, scaled down if it is very large. */
export async function decode(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("This image couldn’t be opened. Try a JPEG or PNG.");
  });
  const ratio = Math.min(1, MAX_SOURCE_SIDE / Math.max(bitmap.width, bitmap.height));
  const node = canvas(Math.round(bitmap.width * ratio), Math.round(bitmap.height * ratio));
  context(node).drawImage(bitmap, 0, 0, node.width, node.height);
  bitmap.close();
  return node;
}

export interface Analysis {
  /** The photo already has a transparent background. */
  transparent: boolean;
  /** A plain, even background colour, when there is one. */
  background: [number, number, number] | null;
  /** The garment's bounding box in source pixels. */
  box: { x: number; y: number; width: number; height: number };
}

const distance = (data: Uint8ClampedArray, i: number, [r, g, b]: [number, number, number]) => Math.hypot(data[i]! - r, data[i + 1]! - g, data[i + 2]! - b);

export function analyse(source: HTMLCanvasElement, tolerance = 30): Analysis {
  const { width, height } = source;
  const { data } = context(source).getImageData(0, 0, width, height);
  const border: number[] = [];
  const step = Math.max(1, Math.floor((width + height) / 400));
  for (let x = 0; x < width; x += step) border.push((x) * 4, ((height - 1) * width + x) * 4);
  for (let y = 0; y < height; y += step) border.push((y * width) * 4, (y * width + width - 1) * 4);

  const clear = border.filter((i) => data[i + 3]! < 24).length / border.length;
  const transparent = clear > 0.6;
  let background: [number, number, number] | null = null;
  if (!transparent) {
    const opaque = border.filter((i) => data[i + 3]! > 200);
    const mean = [0, 1, 2].map((c) => opaque.reduce((sum, i) => sum + data[i + c]!, 0) / Math.max(1, opaque.length)) as [number, number, number];
    const spread = opaque.reduce((sum, i) => sum + distance(data, i, mean), 0) / Math.max(1, opaque.length);
    if (spread < 18) background = mean.map(Math.round) as [number, number, number];
  }

  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const content = data[i + 3]! > 24 && (!background || distance(data, i, background) > tolerance);
      if (!content) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const box = maxX < 0 ? { x: 0, y: 0, width, height } : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  return { transparent, background, box };
}

/**
 * Makes a plain background transparent by flooding in from the edges, so
 * light parts of the garment itself are kept. Edges are softened by a pixel.
 */
export function removeBackground(source: HTMLCanvasElement, background: [number, number, number], tolerance: number): HTMLCanvasElement {
  const { width, height } = source;
  const out = canvas(width, height);
  const ctx = context(out);
  ctx.drawImage(source, 0, 0);
  const image = ctx.getImageData(0, 0, width, height);
  const { data } = image;
  const removed = new Uint8Array(width * height);
  const stack: number[] = [];
  const visit = (p: number) => {
    if (removed[p] || distance(data, p * 4, background) > tolerance) return;
    removed[p] = 1;
    stack.push(p);
  };
  for (let x = 0; x < width; x++) { visit(x); visit((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { visit(y * width); visit(y * width + width - 1); }
  while (stack.length) {
    const p = stack.pop()!;
    const x = p % width;
    if (x > 0) visit(p - 1);
    if (x < width - 1) visit(p + 1);
    if (p >= width) visit(p - width);
    if (p < width * (height - 1)) visit(p + width);
  }
  for (let p = 0; p < removed.length; p++) {
    if (removed[p]) {
      data[p * 4 + 3] = 0;
      continue;
    }
    const x = p % width;
    const edge = (x > 0 && removed[p - 1]) || (x < width - 1 && removed[p + 1]) || (p >= width && removed[p - width]) || (p < width * (height - 1) && removed[p + width]);
    if (edge) data[p * 4 + 3] = Math.round(data[p * 4 + 3]! * Math.min(1, distance(data, p * 4, background) / (tolerance * 2.2)));
  }
  ctx.putImageData(image, 0, 0);
  return out;
}

/** Where the source sits on the rail canvas: its scale and the rail-pixel position of its top-left corner. */
export interface Placement {
  scale: number;
  left: number;
  top: number;
}

/** Hangs the garment like the supplied cut-outs: hook at the top centre, about 86 % of the canvas tall. */
export function fitPlacement(box: Analysis["box"]): Placement {
  const scale = Math.min((RAIL_H * 0.86) / box.height, (RAIL_W * 0.96) / box.width);
  return { scale, left: RAIL_W / 2 - (box.x + box.width / 2) * scale, top: RAIL_H * 0.004 - box.y * scale };
}

export function renderRail(source: HTMLCanvasElement, placement: Placement): HTMLCanvasElement {
  const out = canvas(RAIL_W, RAIL_H);
  const ctx = context(out);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, placement.left, placement.top, source.width * placement.scale, source.height * placement.scale);
  return out;
}

/** True when the rendered rail image still has a solid edge that would show as a box. */
export function hasSolidEdges(rendered: HTMLCanvasElement): boolean {
  const { data } = context(rendered).getImageData(0, 0, rendered.width, rendered.height);
  const corners = [0, rendered.width - 1, (rendered.height - 1) * rendered.width, rendered.height * rendered.width - 1];
  return corners.filter((p) => data[p * 4 + 3]! > 200).length >= 2;
}

export function toBlob(node: HTMLCanvasElement, quality = 0.9): Promise<Blob> {
  return new Promise((resolve, reject) =>
    node.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The image couldn’t be prepared."))), "image/webp", quality),
  );
}

export const extensionFor = (blob: Blob) => (blob.type === "image/webp" ? "webp" : blob.type === "image/png" ? "png" : "jpg");

/** Editorial photographs at the widths the site requests, never wider than the source. */
export async function editorialVariants(source: HTMLCanvasElement): Promise<{ width: number; height: number; variants: { width: number; blob: Blob }[] }> {
  const widths = [...new Set([...EDITORIAL_WIDTHS.filter((w) => w < source.width), Math.min(source.width, EDITORIAL_WIDTHS.at(-1)!)])];
  const variants = [];
  for (const width of widths) {
    const height = Math.round((source.height * width) / source.width);
    const node = canvas(width, height);
    const ctx = context(node);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, width, height);
    variants.push({ width, blob: await toBlob(node, 0.84) });
  }
  const largest = widths.at(-1)!;
  return { width: largest, height: Math.round((source.height * largest) / source.width), variants };
}
