import * as React from "react";
import { Link } from "react-router";
import { useCatalog } from "@/catalog/CatalogProvider";
import { productById, productPath } from "@/catalog/selectors";
import type { Look, LookbookSpread } from "@/catalog/types";
import { Photo } from "@/components/Photo";
import { Reveal } from "@/components/Reveal";
import { StillLife } from "@/components/StillLife";

/** Campaign frames are numbered through the book; detail frames are not. */
type Numbered = Look & { number?: number };

export function Lookbook() {
  const catalog = useCatalog();
  const lookbook = catalog.lookbooks.find((candidate) => candidate.id === catalog.settings.home.lookbookId);
  if (!lookbook) return null;

  let count = 0;
  const spreads = lookbook.spreads.map((spread) => ({ ...spread, looks: spread.looks.map((look): Numbered => (look.kind === "campaign" ? { ...look, number: ++count } : look)) }));

  return (
    <section id="lookbook" aria-labelledby="lookbook-title" className="tone-ink scroll-mt-16 overflow-hidden">
      <div className="mx-auto grid max-w-[1600px] gap-6 px-4 pb-14 pt-24 sm:px-6 md:grid-cols-12 md:pb-20 md:pt-36 lg:px-10">
        <p className="label text-muted-foreground md:col-span-12">{lookbook.season}</p>
        <h2 id="lookbook-title" className="type-wide text-[clamp(3rem,9vw,9rem)] font-extralight leading-[0.9] tracking-[-0.035em] md:col-span-8">
          {lookbook.title}
        </h2>
        <p className="max-w-[34ch] self-end text-[15px] leading-relaxed text-muted-foreground md:col-span-4 md:justify-self-end">{lookbook.summary}</p>
      </div>
      <div className="flex flex-col gap-24 pb-28 md:gap-40 md:pb-40">
        {spreads.map((spread) => (
          <Spread key={spread.id} spread={spread} />
        ))}
      </div>
    </section>
  );
}

function Spread({ spread }: { spread: LookbookSpread & { looks: Numbered[] } }) {
  const [first, second, third] = spread.looks;
  if (!first) return null;

  if (spread.layout === "cinematic") {
    return (
      <Reveal as="figure">
        <Frame look={first} ratio="aspect-[4/5] md:aspect-[16/8]" sizes="100vw" />
        <Caption look={first} className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-10" />
      </Reveal>
    );
  }

  if (spread.layout === "wide") {
    return (
      <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-10">
        <Reveal as="figure" className="md:ml-[calc(100%/12)]">
          <Frame look={first} ratio="aspect-[4/5] sm:aspect-[3/2]" sizes="(min-width: 1600px) 1450px, (min-width: 768px) 90vw, 100vw" />
          <Caption look={first} />
        </Reveal>
      </div>
    );
  }

  if (spread.layout === "materials") {
    const frames = [first, second, third].filter((look): look is Numbered => Boolean(look));
    return (
      <div className="mx-auto grid w-full max-w-[1600px] gap-x-5 gap-y-12 px-4 sm:px-6 md:grid-cols-12 lg:px-10">
        <div className="flex flex-col gap-5 md:col-span-4 md:pr-8">
          <p className="label text-muted-foreground">The cloth</p>
          {spread.note && <p className="type-wide text-[clamp(1.35rem,2vw,1.85rem)] font-extralight leading-[1.25] tracking-[-0.01em]">{spread.note}</p>}
        </div>
        {frames.map((look, i) => (
          <Reveal as="figure" key={look.id} delay={i * 140} className={`md:col-span-4 ${i % 2 ? "md:mt-24" : ""}`}>
            <Frame look={look} ratio="aspect-[4/5]" sizes="(min-width: 768px) 33vw, 100vw" />
            <Caption look={look} />
          </Reveal>
        ))}
      </div>
    );
  }

  // pair / pair-flip: a large portrait, and a smaller detail set lower with the note above it.
  const flip = spread.layout === "pair-flip";
  return (
    <div className="mx-auto grid w-full max-w-[1600px] gap-x-5 gap-y-12 px-4 sm:px-6 md:grid-cols-12 lg:px-10">
      <Reveal as="figure" className={`md:col-span-6 md:row-span-2 ${flip ? "md:col-start-7" : ""}`}>
        <Frame look={first} ratio="aspect-[4/5]" sizes="(min-width: 768px) 50vw, 100vw" />
        <Caption look={first} />
      </Reveal>
      {spread.note && (
        <p className={`type-wide self-end text-[clamp(1.35rem,2vw,1.85rem)] font-extralight leading-[1.25] tracking-[-0.01em] md:row-start-1 ${flip ? "md:col-span-4 md:col-start-2" : "md:col-span-4 md:col-start-8"}`}>{spread.note}</p>
      )}
      {second && (
        <Reveal as="figure" delay={160} className={`ml-[22%] md:row-start-2 md:ml-0 md:self-end ${flip ? "md:col-span-3 md:col-start-2" : "md:col-span-3 md:col-start-9"}`}>
          <Frame look={second} ratio="aspect-[4/5]" sizes="(min-width: 768px) 25vw, 78vw" />
          <Caption look={second} />
        </Reveal>
      )}
    </div>
  );
}

function Frame({ look, ratio, sizes }: { look: Numbered; ratio: string; sizes: string }) {
  if (!look.mediaId) {
    return (
      <div className={ratio}>
        <StillLife look={look} />
      </div>
    );
  }
  return <Photo mediaId={look.mediaId} sizes={sizes} ratio={false} className={ratio} />;
}

function Caption({ look, className = "" }: { look: Numbered; className?: string }) {
  const catalog = useCatalog();
  const seen = new Set<string>();
  const pieces = look.pieces.filter((piece) => (seen.has(piece.productId) ? false : (seen.add(piece.productId), true)));
  return (
    <figcaption className={`mt-4 flex flex-col gap-1 text-[13px] sm:flex-row sm:items-baseline sm:justify-between sm:gap-8 ${className}`}>
      <p className="text-foreground">
        <span className="label tabular mr-3 text-muted-foreground">{look.number ? `Look ${String(look.number).padStart(2, "0")}` : "Detail"}</span>
        {look.title}
      </p>
      <p className="text-muted-foreground">
        {pieces.map((piece, i) => {
          const product = productById(catalog, piece.productId);
          if (!product) return null;
          return (
            <React.Fragment key={piece.productId}>
              {i > 0 && <span aria-hidden="true"> · </span>}
              <Link to={productPath(product, piece.colorwayId)} className="link-draw text-foreground/85 hover:text-foreground">
                {product.name}
              </Link>
            </React.Fragment>
          );
        })}
      </p>
    </figcaption>
  );
}
