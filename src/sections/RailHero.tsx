import * as React from "react";
import { Link } from "react-router";
import { useCatalog } from "@/catalog/CatalogProvider";
import { formatPrice, productPath, railEntries } from "@/catalog/selectors";
import { PurchasePanel } from "@/components/PurchasePanel";
import { ClothingRailHero } from "@/components/ui/product-rail-gallery";

/** Garments hang as tall as the viewport comfortably allows. */
function useRailHeight() {
  const pick = () => Math.round(Math.min(540, Math.max(300, window.innerHeight * 0.52)));
  const [height, setHeight] = React.useState(pick);
  React.useEffect(() => {
    const onResize = () => setHeight(pick());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return height;
}

function useCoarsePointer() {
  const [coarse] = React.useState(() => window.matchMedia("(hover: none)").matches);
  return coarse;
}

// Film grain, so the studio wall has the same tooth as the photography.
const GRAIN = `url("data:image/svg+xml,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.9 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")}")`;

function StudioLight() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
      {/* window light falling from the left, a slightly deeper floor */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(100deg, rgb(255 255 255 / 0.55), rgb(255 255 255 / 0) 46%), radial-gradient(70% 55% at 72% 8%, rgb(255 255 255 / 0.3), transparent 70%), linear-gradient(to bottom, transparent 70%, rgb(70 55 40 / 0.07))" }} />
      <div className="absolute inset-0 opacity-[0.07] mix-blend-multiply" style={{ backgroundImage: GRAIN }} />
    </div>
  );
}

export function RailHero() {
  const catalog = useCatalog();
  const entries = React.useMemo(() => railEntries(catalog), [catalog]);
  const garments = React.useMemo(() => entries.map((entry) => entry.garment), [entries]);
  const byId = React.useMemo(() => new Map(entries.map((entry) => [entry.garment.id, entry])), [entries]);
  const maxHeight = useRailHeight();
  const coarse = useCoarsePointer();
  const { rail } = catalog.settings;
  const total = String(entries.length).padStart(2, "0");

  return (
    <ClothingRailHero
      id="rail"
      items={garments}
      hanger="none"
      aria-label={rail.heading}
      autoplay={rail.autoplay}
      maxHeight={maxHeight}
      labels={{ front: "Front", back: "Back", close: "Back to the rail", show: "Show" }}
      className="flex flex-col pt-16 md:min-h-[100svh] md:justify-center"
      backdrop={<StudioLight />}
      header={
        <div className="relative z-10 mx-auto flex w-full max-w-[1600px] items-baseline justify-between gap-6 px-4 pt-6 sm:px-6 lg:px-10">
          <p className="label">{rail.eyebrow}</p>
          <p className="label hidden text-muted-foreground sm:block">
            <span className="tabular">{total}</span> pieces on the rail
          </p>
        </div>
      }
      aside={
        <h1 className="type-wide order-last text-balance text-[clamp(2.4rem,5.6vw,5.75rem)] font-extralight leading-[0.95] tracking-[-0.035em] md:order-none">{rail.heading}</h1>
      }
      footerClassName="relative z-10 mx-auto grid w-full max-w-[1600px] items-end gap-x-10 gap-y-8 px-4 pb-10 pt-2 sm:px-6 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] md:pb-12 lg:px-10"
      renderCaption={(item, context) => {
        const entry = item ? byId.get(item.id) : null;
        if (!entry || context.index === null) {
          return (
            <div className="flex flex-col gap-4 border-t border-border pt-4">
              <p className="text-[14px] leading-relaxed text-muted-foreground">{coarse ? (rail.touchCaption ?? rail.caption) : rail.caption}</p>
              <Link to="/shop" className="label link-draw self-start py-1">
                Shop all pieces
              </Link>
            </div>
          );
        }
        return (
          <div key={item?.id} className="animate-in fade-in flex flex-col gap-2 border-t border-foreground pt-4 [animation-duration:400ms] motion-reduce:animate-none">
            <div className="flex items-baseline justify-between gap-4">
              <p className="label tabular text-muted-foreground">
                {String(context.index + 1).padStart(2, "0")} / {total}
              </p>
              <p className="tabular text-[15px] font-light">{formatPrice(catalog, entry.product.price)}</p>
            </div>
            <p className="text-[17px] font-medium leading-snug">
              {entry.product.name} <span className="font-light text-muted-foreground">— {entry.colorway.name}</span>
            </p>
            <p className="text-[13px] leading-relaxed text-muted-foreground">{entry.product.summary}</p>
            <div className="mt-2 flex items-center gap-6">
              <button type="button" onClick={context.open} className="label link-draw py-1">
                Take it down
              </button>
              <Link to={productPath(entry.product, entry.colorwayId)} className="label py-1 text-muted-foreground hover:text-foreground">
                Details
              </Link>
            </div>
          </div>
        );
      }}
      renderDetail={(item, context) => {
        const entry = byId.get(item.id);
        if (!entry) return null;
        return (
          <div className="mx-auto flex w-full max-w-sm flex-col gap-5 text-left md:mx-0 md:gap-6">
            <div className="flex flex-col gap-2 md:gap-3">
              <p className="label text-muted-foreground">
                On the rail · <span className="tabular">{context.index + 1} of {context.total}</span>
              </p>
              <div className="flex items-baseline justify-between gap-4">
                <h3 id={context.titleId} className="type-wide text-[1.6rem] font-extralight leading-[1.1] tracking-[-0.01em] md:text-[1.9rem]">
                  {entry.product.name}
                </h3>
                <p className="tabular shrink-0 text-lg font-light">{formatPrice(catalog, entry.product.price)}</p>
              </div>
            </div>
            <p className="text-[14px] leading-relaxed text-muted-foreground max-md:order-last">{entry.product.description}</p>
            {context.hasBack && <div role="group" aria-label="View" className="flex gap-6">
              {(["front", "back"] as const).map((face) => (
                <button key={face} type="button" aria-pressed={context.side === face} onClick={() => context.turnTo(face)} className={`label relative pb-1.5 transition-colors ${context.side === face ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  {face === "front" ? "Front" : "Back"}
                  <span aria-hidden="true" className={`absolute inset-x-0 bottom-0 h-px origin-left bg-foreground transition-transform duration-300 motion-reduce:transition-none ${context.side === face ? "scale-x-100" : "scale-x-0"}`} />
                </button>
              ))}
            </div>}
            <PurchasePanel product={entry.product} colorwayId={entry.colorwayId} onViewBag={context.close} showPrice={false} />
            <Link to={productPath(entry.product, entry.colorwayId)} className="label link-draw self-start py-1 max-md:order-last">
              Full details
            </Link>
          </div>
        );
      }}
    />
  );
}
