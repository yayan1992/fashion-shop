import { useCatalog } from "@/catalog/CatalogProvider";
import { colorwayOf, mediaById, productById } from "@/catalog/selectors";
import type { Look, LookPiece, Tone } from "@/catalog/types";

const LIGHT: Record<Tone, { base: string; light: string; floor: string; shadow: string; rail: string }> = {
  plaster: { base: "var(--color-plaster)", light: "rgb(255 255 255 / 0.55)", floor: "rgb(60 45 30 / 0.07)", shadow: "rgb(40 30 20 / 0.22)", rail: "#9a9388" },
  bone: { base: "var(--color-bone)", light: "rgb(255 252 245 / 0.5)", floor: "rgb(60 45 30 / 0.09)", shadow: "rgb(40 30 20 / 0.24)", rail: "#8d8679" },
  graphite: { base: "var(--color-graphite)", light: "rgb(255 244 228 / 0.16)", floor: "rgb(0 0 0 / 0.3)", shadow: "rgb(0 0 0 / 0.5)", rail: "#77726a" },
  ink: { base: "#1a1917", light: "rgb(255 240 220 / 0.13)", floor: "rgb(0 0 0 / 0.4)", shadow: "rgb(0 0 0 / 0.65)", rail: "#5f5b55" },
};

/** Pieces hang at this share of the frame height; the rail canvas is 645 × 1000. */
const HANG = 86;
const CANVAS_W = HANG * 0.645;
/** How much of the canvas width the cloth actually fills, per view. */
const CLOTH = { front: 0.97, back: 0.97, side: 0.3 } as const;

/**
 * Horizontal centres, in frame-height units, that sit neighbours shoulder to
 * shoulder: full views overlap like garments pushed together on a rail, side
 * views hang just clear of the next piece.
 */
function spread(views: LookPiece["view"][]): number[] {
  const centres: number[] = [];
  views.forEach((view, i) => {
    const prev = views[i - 1];
    if (!prev) return centres.push(0);
    const overlap = prev === "side" || view === "side" ? -0.04 : 0.24;
    centres.push(centres[i - 1]! + ((CLOTH[prev] + CLOTH[view]) / 2 - overlap) * CANVAS_W);
  });
  const middle = ((centres[0] ?? 0) + (centres.at(-1) ?? 0)) / 2;
  return centres.map((centre) => centre - middle);
}

/**
 * A look as a studio still life: its pieces hung on a short rail under a pool
 * of light. If the look has a campaign photograph, that is shown instead.
 */
export function StillLife({ look, className = "" }: { look: Look; className?: string }) {
  const catalog = useCatalog();
  const photo = mediaById(catalog, look.mediaId);
  const light = LIGHT[look.tone];

  if (photo) {
    return <img src={photo.src} alt={photo.alt} width={photo.width} height={photo.height} loading="lazy" decoding="async" className={`size-full object-cover ${className}`} />;
  }

  const xs = spread(look.pieces.map((piece) => piece.view));

  return (
    <div role="img" aria-label={look.caption} className={`group/look relative size-full overflow-hidden [container-type:size] ${className}`} style={{ background: light.base }}>
      <div aria-hidden="true" className="absolute inset-0" style={{ background: `radial-gradient(62% 58% at 50% 34%, ${light.light}, transparent 72%)` }} />
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[30%]" style={{ background: `linear-gradient(to bottom, transparent, ${light.floor})` }} />
      <div aria-hidden="true" className="absolute inset-x-[6%] top-[6%] h-[5px] rounded-full" style={{ background: `linear-gradient(to bottom, color-mix(in oklab, ${light.rail} 50%, white), ${light.rail} 55%, color-mix(in oklab, ${light.rail} 60%, black))`, boxShadow: `0 3px 8px ${light.shadow}` }} />
      {look.pieces.map((piece, i) => {
        const product = productById(catalog, piece.productId);
        if (!product) return null;
        const colorway = colorwayOf(product, piece.colorwayId);
        const asset = mediaById(catalog, colorway.media[piece.view] ?? colorway.media.front);
        if (!asset) return null;
        return (
          <img
            key={`${piece.productId}-${piece.view}`}
            src={asset.src}
            alt=""
            width={asset.width}
            height={asset.height}
            loading="lazy"
            decoding="async"
            draggable={false}
            className={`absolute top-[5%] w-auto max-w-none -translate-x-1/2 select-none transition-transform duration-[1600ms] ease-(--ease-settle) motion-reduce:transition-none ${i % 2 ? "group-hover/look:rotate-[-1.4deg]" : "group-hover/look:rotate-[1.1deg]"}`}
            style={{ height: `${HANG}cqh`, left: `calc(50cqw + ${(xs[i] ?? 0).toFixed(2)}cqh)`, zIndex: i + 1, transformOrigin: "50% 1.5%", filter: `drop-shadow(0 26px 24px ${light.shadow})` }}
          />
        );
      })}
    </div>
  );
}
