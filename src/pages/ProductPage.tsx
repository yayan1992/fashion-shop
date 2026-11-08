import * as React from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useCatalog } from "@/catalog/CatalogProvider";
import { activeProducts, colorwayOf, formatPrice, productById, productBySlug } from "@/catalog/selectors";
import type { Catalog, Look, Product } from "@/catalog/types";
import { AssetSlot } from "@/components/AssetSlot";
import { GarmentImage } from "@/components/GarmentImage";
import { Photo } from "@/components/Photo";
import { ProductCard } from "@/components/ProductCard";
import { PurchasePanel } from "@/components/PurchasePanel";
import { Reveal } from "@/components/Reveal";
import { useDocumentTitle } from "@/lib/hooks";
import NotFoundPage from "./NotFoundPage";

type Slide = { kind: "cutout" | "photo"; mediaId: string; label: string; wide?: boolean };

/** The first lookbook frame that shows this product worn, with its number in the book. */
function lookFor(catalog: Catalog, productId: string): { look: Look; number: number } | null {
  let number = 0;
  for (const look of catalog.lookbooks.flatMap((lookbook) => lookbook.spreads.flatMap((spread) => spread.looks))) {
    if (look.kind !== "campaign") continue;
    number++;
    if (look.pieces.some((piece) => piece.productId === productId)) return { look, number };
  }
  return null;
}

export default function ProductPage() {
  const catalog = useCatalog();
  const { slug = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const product = productBySlug(catalog, slug);
  const colorway = product ? colorwayOf(product, params.get("colour")) : null;
  useDocumentTitle(product && colorway ? `${product.name}, ${colorway.name} — ${catalog.settings.name}` : `Not found — ${catalog.settings.name}`);
  const [slide, setSlide] = React.useState(0);
  const strip = React.useRef<HTMLDivElement>(null);
  const purchase = React.useRef<HTMLDivElement>(null);

  // A new product or colourway starts the gallery from the front view; the scroll handler updates the counter.
  React.useEffect(() => {
    strip.current?.scrollTo({ left: 0 });
  }, [slug, colorway?.id]);

  if (!product || !colorway) return <NotFoundPage />;

  const { front, back, side } = colorway.media;
  const worn = colorway.media.lifestyle?.[0];
  const detail = colorway.media.details?.[0];
  const slides: Slide[] = [];
  if (front) slides.push({ kind: "cutout", mediaId: front, label: "Front", wide: true });
  if (worn) slides.push({ kind: "photo", mediaId: worn, label: "Worn" });
  if (back) slides.push({ kind: "cutout", mediaId: back, label: "Back" });
  if (side) slides.push({ kind: "cutout", mediaId: side, label: "Side", wide: Boolean(worn) });
  for (const extra of colorway.media.gallery) slides.push({ kind: "photo", mediaId: extra, label: "Detail" });

  const styled = lookFor(catalog, product.id);
  const partners = styled?.look.pieces.filter((piece) => piece.productId !== product.id) ?? [];
  const companions = [...new Set([...partners.map((piece) => piece.productId), ...(product.pairsWith ?? [])])]
    .map((id) => productById(catalog, id))
    .filter((candidate): candidate is Product => Boolean(candidate))
    .slice(0, 3);
  const fallback = activeProducts(catalog).filter((candidate) => candidate.id !== product.id).slice(0, 3);
  const partnerColour = (id: string) => partners.find((piece) => piece.productId === id)?.colorwayId;

  const accordions = [
    { title: "Details", body: <ul className="flex flex-col gap-1.5">{product.details.map((line) => <li key={line}>{line}</li>)}</ul> },
    { title: "Composition and care", body: <div className="flex flex-col gap-3"><p>{product.composition}</p><ul className="flex flex-col gap-1.5">{product.care.map((line) => <li key={line}>{line}</li>)}</ul></div> },
    { title: "Fit", body: <p>{product.fit}</p> },
  ];

  return (
    <article className="pt-16">
      <div className="mx-auto grid max-w-[1600px] gap-8 pb-20 sm:px-6 md:grid-cols-12 md:gap-12 md:pb-28 md:pt-10 lg:px-10">
        {/* Gallery: a swipeable strip on phones, an editorial grid on larger screens. */}
        <div className="md:col-span-7">
          <div
            ref={strip}
            className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] md:grid md:grid-cols-2 md:gap-3 md:overflow-visible"
            onScroll={(event) => {
              const node = event.currentTarget;
              setSlide(Math.round(node.scrollLeft / Math.max(1, node.clientWidth)));
            }}
            aria-label={`${product.name} photos`}
            role="region"
            tabIndex={0}
          >
            {slides.map((entry, i) => (
              <figure key={entry.mediaId} className={`relative w-full shrink-0 snap-center ${entry.wide ? "md:col-span-2" : ""}`}>
                {entry.kind === "photo" ? (
                  <Photo mediaId={entry.mediaId} ratio={false} sizes="(min-width: 768px) 28vw, 100vw" className="aspect-[4/5]" />
                ) : (
                  <div className={`tone-bone relative aspect-[4/5] ${entry.wide ? (i === 0 ? "md:aspect-[6/5]" : "md:aspect-[2/1]") : ""}`}>
                    <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-b from-transparent to-black/[0.05]" />
                    <GarmentImage mediaId={entry.mediaId} eager={i === 0} className="absolute inset-x-0 bottom-[4%] top-[6%] size-full drop-shadow-[0_24px_26px_rgb(40_30_20/0.18)]" />
                  </div>
                )}
                <figcaption className={`label absolute bottom-4 left-4 ${entry.kind === "photo" ? "text-chalk/90" : "text-muted-foreground"}`}>{entry.label}</figcaption>
              </figure>
            ))}
            {!worn && <AssetSlot label="Worn photograph" spec="On-model, this colourway · 4:5 · 2400 × 3000" className="hidden md:flex" />}
          </div>
          <div className="mt-4 flex justify-center gap-1.5 md:hidden" aria-hidden="true">
            {slides.map((entry, i) => (
              <span key={entry.mediaId} className={`h-1 rounded-full transition-[width,background-color] duration-300 ${slide === i ? "w-5 bg-foreground" : "w-1 bg-foreground/25"}`} />
            ))}
          </div>
        </div>

        <div className="px-4 sm:px-0 md:col-span-5 md:col-start-8 lg:col-span-4 lg:col-start-9">
          <div className="flex flex-col gap-7 md:sticky md:top-28">
            <nav aria-label="Breadcrumb" className="label flex gap-2 text-muted-foreground">
              <Link to="/shop" className="link-draw">Shop</Link>
              <span aria-hidden="true">/</span>
              <Link to="/#rail" className="link-draw">Back to the rail</Link>
            </nav>
            <div className="flex flex-col gap-3">
              <h1 className="type-wide text-[clamp(2rem,3.4vw,3rem)] font-extralight leading-[1.05] tracking-[-0.02em]">{product.name}</h1>
              <p className="tabular text-lg font-light">{formatPrice(catalog, product.price)}</p>
            </div>
            <p className="max-w-[46ch] text-[15px] leading-relaxed text-muted-foreground">{product.description}</p>
            <div ref={purchase}>
              <PurchasePanel product={product} colorwayId={colorway.id} showPrice={false} onColorwayChange={(id) => setParams(id === product.colorways[0]?.id ? {} : { colour: id }, { replace: true })} />
            </div>
            <div className="border-t border-border">
              {accordions.map((section) => (
                <details key={section.title} className="group border-b border-border">
                  <summary className="label flex cursor-pointer list-none items-center justify-between py-4 [&::-webkit-details-marker]:hidden">
                    {section.title}
                    <span aria-hidden="true" className="text-base font-light transition-transform duration-300 group-open:rotate-45">+</span>
                  </summary>
                  <div className="pb-5 text-[14px] leading-relaxed text-muted-foreground">{section.body}</div>
                </details>
              ))}
            </div>
          </div>
        </div>
      </div>

      {(product.fabric || detail) && (
        <section aria-labelledby="cloth-title" className="tone-bone">
          <div className="mx-auto grid max-w-[1600px] items-center gap-x-12 gap-y-10 px-4 py-20 sm:px-6 md:grid-cols-12 md:py-28 lg:px-10">
            {detail ? (
              <Reveal className="md:col-span-5">
                <Photo mediaId={detail} ratio="4/5" sizes="(min-width: 768px) 40vw, 100vw" />
              </Reveal>
            ) : (
              <AssetSlot label="Fabric close-up" spec="Macro of the cloth or a construction detail · 4:5 · 2400 × 3000" className="md:col-span-5" />
            )}
            <div className={`flex flex-col gap-6 ${detail ? "md:col-span-6 md:col-start-7" : "md:col-span-8 md:col-start-3"}`}>
              <p id="cloth-title" className="label text-muted-foreground">The cloth</p>
              {product.fabric && <p className="type-wide text-balance text-[clamp(1.5rem,2.6vw,2.4rem)] font-extralight leading-[1.2] tracking-[-0.015em]">{product.fabric}</p>}
              <dl className="grid grid-cols-2 gap-6 border-t border-border pt-6 text-[14px]">
                <div>
                  <dt className="label mb-2 text-muted-foreground">Composition</dt>
                  <dd>{product.composition}</dd>
                </div>
                <div>
                  <dt className="label mb-2 text-muted-foreground">Care</dt>
                  <dd className="flex flex-col gap-1">{product.care.map((line) => <span key={line}>{line}</span>)}</dd>
                </div>
              </dl>
            </div>
          </div>
        </section>
      )}

      <section aria-labelledby="pairs-title" className="border-t border-border">
        <div className="mx-auto max-w-[1600px] px-4 py-20 sm:px-6 md:py-28 lg:px-10">
          <div className="mb-10 flex flex-col gap-3 md:mb-14 md:flex-row md:items-end md:justify-between">
            <h2 id="pairs-title" className="type-wide text-[clamp(1.75rem,3vw,2.5rem)] font-extralight leading-none tracking-[-0.02em]">
              {companions.length ? "Wear it with" : "Also on the rail"}
            </h2>
            {styled && (
              <p className="text-[14px] text-muted-foreground">
                Styled in{" "}
                <Link to="/#lookbook" className="link-draw text-foreground">
                  Look {String(styled.number).padStart(2, "0")}, {styled.look.title.toLowerCase()}
                </Link>
              </p>
            )}
          </div>
          <ul className="grid gap-x-5 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {(companions.length ? companions : fallback).map((candidate) => (
              <li key={candidate.id}>
                <ProductCard product={candidate} colorwayId={partnerColour(candidate.id)} />
              </li>
            ))}
          </ul>
        </div>
      </section>

      <BuyBar product={product} target={purchase} />
    </article>
  );
}

/** Phones only: keeps size selection one tap away once the purchase panel scrolls out of view. */
function BuyBar({ product, target }: { product: Product; target: React.RefObject<HTMLDivElement | null> }) {
  const catalog = useCatalog();
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    const node = target.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(Boolean(entry && !entry.isIntersecting && entry.boundingClientRect.top < 0)));
    observer.observe(node);
    return () => observer.disconnect();
  }, [target]);
  return (
    <div
      inert={!visible}
      className={`fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md transition-[translate,visibility] duration-500 ease-(--ease-settle) motion-reduce:transition-none md:hidden ${visible ? "visible translate-y-0" : "invisible translate-y-full"}`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium">{product.name}</p>
          <p className="tabular text-[13px] text-muted-foreground">{formatPrice(catalog, product.price)}</p>
        </div>
        <button
          type="button"
          className="h-11 shrink-0 bg-foreground px-5 text-[13px] font-medium tracking-[0.06em] text-background"
          onClick={() => {
            target.current?.scrollIntoView({ behavior: "smooth", block: "center" });
            target.current?.querySelector<HTMLInputElement>("input:not(:disabled)")?.focus({ preventScroll: true });
          }}
        >
          Choose a size
        </button>
      </div>
    </div>
  );
}
