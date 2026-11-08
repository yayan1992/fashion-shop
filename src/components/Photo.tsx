import * as React from "react";
import { useCatalog } from "@/catalog/CatalogProvider";
import { mediaById } from "@/catalog/selectors";

interface PhotoProps {
  mediaId: string | undefined;
  /** The rendered width, for the browser to pick a size, e.g. "(min-width: 768px) 50vw, 100vw". */
  sizes: string;
  /** Box ratio such as "4/5". Omitted, the photograph keeps its own proportions; false leaves sizing to className. */
  ratio?: string | false;
  className?: string;
  eager?: boolean;
  decorative?: boolean;
}

/**
 * A photograph from the media library, served at the smallest width that fills
 * its box and cropped around the asset's focal point. It never renders wider
 * than its largest source, so low-resolution files are not blown up.
 */
export function Photo({ mediaId, sizes, ratio, className = "", eager = false, decorative = false }: PhotoProps) {
  const catalog = useCatalog();
  const asset = mediaById(catalog, mediaId);
  const [loaded, setLoaded] = React.useState(false);
  if (!asset) return null;
  const srcSet = asset.variants?.map((variant) => `${variant.src} ${variant.width}w`).join(", ");
  return (
    <div className={`relative overflow-hidden bg-bone ${className}`} style={ratio === false ? undefined : { aspectRatio: ratio ?? `${asset.width} / ${asset.height}` }}>
      <img
        src={asset.src}
        srcSet={srcSet}
        sizes={sizes}
        alt={decorative ? "" : asset.alt}
        width={asset.width}
        height={asset.height}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        draggable={false}
        onLoad={() => setLoaded(true)}
        className={`absolute inset-0 size-full object-cover transition-opacity duration-700 motion-reduce:transition-none ${loaded ? "opacity-100" : "opacity-0"}`}
        style={{ objectPosition: asset.focus ?? "50% 50%" }}
      />
    </div>
  );
}
