import { Link } from "react-router";
import { useCatalog } from "@/catalog/CatalogProvider";
import { colorwayOf, formatPrice, productPath } from "@/catalog/selectors";
import type { Product } from "@/catalog/types";
import { GarmentImage } from "./GarmentImage";

/** Product tile: the piece hangs on bone; hover turns it to show the back. */
export function ProductCard({ product, colorwayId, size = "regular", className = "" }: { product: Product; colorwayId?: string; size?: "regular" | "feature"; className?: string }) {
  const catalog = useCatalog();
  const colorway = colorwayOf(product, colorwayId);
  return (
    <Link to={productPath(product, colorway.id)} className={`group flex flex-col gap-4 outline-none ${className}`}>
      <div className={`tone-bone relative overflow-hidden ${size === "feature" ? "aspect-[4/5] md:aspect-[5/4]" : "aspect-[4/5]"} group-focus-visible:outline group-focus-visible:outline-[1.5px] group-focus-visible:outline-offset-4 group-focus-visible:outline-ring`}>
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[22%] bg-gradient-to-b from-transparent to-black/[0.045]" />
        <div className={`absolute inset-x-0 bottom-[4%] top-[7%] transition-transform duration-[1200ms] ease-(--ease-settle) group-hover:scale-[1.025] motion-reduce:transition-none`}>
          {/* Hover turns the piece to its back, when there is a back photograph. */}
          <GarmentImage mediaId={colorway.media.front} alt={`${product.name} in ${colorway.name.toLowerCase()}`} className={`absolute inset-0 size-full drop-shadow-[0_18px_22px_rgb(40_30_20/0.16)] transition-opacity duration-500 motion-reduce:transition-none ${colorway.media.back ? "group-hover:opacity-0" : ""}`} />
          {colorway.media.back && <GarmentImage mediaId={colorway.media.back} decorative className="absolute inset-0 size-full opacity-0 drop-shadow-[0_18px_22px_rgb(40_30_20/0.16)] transition-opacity duration-500 group-hover:opacity-100 motion-reduce:transition-none" />}
        </div>
      </div>
      <div className="flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-[15px] font-medium">{product.name}</h3>
          <p className="mt-1 flex items-center gap-2 text-[13px] text-muted-foreground">
            {colorway.name}
            {product.colorways.length > 1 && (
              <span role="img" className="flex gap-1" aria-label={`${product.colorways.length} colours`}>
                {product.colorways.map((option) => (
                  <span key={option.id} className={`size-2.5 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.15)] ${option.id === colorway.id ? "ring-1 ring-foreground/50 ring-offset-1 ring-offset-background" : ""}`} style={{ background: option.swatch }} />
                ))}
              </span>
            )}
          </p>
        </div>
        <p className="tabular shrink-0 text-[15px] font-light">{formatPrice(catalog, product.price)}</p>
      </div>
    </Link>
  );
}
