import { useCatalog } from "@/catalog/CatalogProvider";
import { mediaById } from "@/catalog/selectors";

/** A rail cut-out from the media library, hanging from the top of its box. */
export function GarmentImage({ mediaId, alt, className = "", eager = false, decorative = false }: { mediaId: string | undefined; alt?: string; className?: string; eager?: boolean; decorative?: boolean }) {
  const catalog = useCatalog();
  const asset = mediaById(catalog, mediaId);
  if (!asset) return null;
  return (
    <img
      src={asset.src}
      alt={decorative ? "" : (alt ?? asset.alt)}
      width={asset.width}
      height={asset.height}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
      className={`select-none object-contain object-top ${className}`}
    />
  );
}
