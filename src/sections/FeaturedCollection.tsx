import { Link } from "react-router";
import { useCatalog } from "@/catalog/CatalogProvider";
import { productById } from "@/catalog/selectors";
import type { Product } from "@/catalog/types";
import { ProductCard } from "@/components/ProductCard";
import { Reveal } from "@/components/Reveal";

export function FeaturedCollection() {
  const catalog = useCatalog();
  const { home } = catalog.settings;
  const collection = catalog.collections.find((candidate) => candidate.id === home.featuredCollectionId);
  const featured = home.featuredProductIds.map((id) => productById(catalog, id)).filter((product): product is Product => Boolean(product));
  if (!collection || featured.length === 0) return null;
  const [lead, ...rest] = featured;

  return (
    <section id="collection" aria-labelledby="collection-title" className="scroll-mt-16 border-t border-border">
      <div className="mx-auto max-w-[1600px] px-4 py-20 sm:px-6 md:py-28 lg:px-10">
        <div className="grid gap-x-10 gap-y-14 md:grid-cols-12">
          <div className="flex flex-col gap-6 md:sticky md:top-28 md:col-span-4 md:self-start md:pr-6">
            <p className="label text-muted-foreground">{collection.season}</p>
            <h2 id="collection-title" className="type-wide text-[clamp(2.25rem,4vw,3.75rem)] font-extralight leading-none tracking-[-0.02em]">
              {collection.title}
            </h2>
            <p className="max-w-[38ch] text-[15px] leading-relaxed text-muted-foreground">{collection.summary}</p>
            <Link to="/shop" className="label link-draw self-start py-1">
              View all {collection.productIds.length} pieces
            </Link>
          </div>
          {lead && (
            <Reveal className="md:col-span-8">
              <ProductCard product={lead} size="feature" />
            </Reveal>
          )}
        </div>
        <ul className="mt-14 grid gap-x-6 gap-y-14 sm:grid-cols-2 md:mt-20 lg:grid-cols-3">
          {rest.map((product, i) => (
            <Reveal as="li" key={product.id} delay={i * 120}>
              <ProductCard product={product} />
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
