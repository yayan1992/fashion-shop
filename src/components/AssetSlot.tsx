import { useLocation } from "react-router";

/**
 * Marks where a photograph will go once it exists. Invisible to shoppers; in
 * development, add ?slots to the URL to see every open slot with its brief.
 */
export function AssetSlot({ label, spec, ratio = "4/5", className = "" }: { label: string; spec: string; ratio?: string; className?: string }) {
  const { search } = useLocation();
  if (!import.meta.env.DEV || !new URLSearchParams(search).has("slots")) return null;
  return (
    <div
      className={`flex flex-col justify-end gap-1 border border-dashed border-muted-foreground/40 p-4 text-[12px] text-muted-foreground ${className}`}
      style={{ aspectRatio: ratio, backgroundImage: "repeating-linear-gradient(135deg, transparent 0 10px, color-mix(in oklab, var(--color-foreground) 4%, transparent) 10px 11px)" }}
    >
      <span className="label text-foreground">{label}</span>
      <span>{spec}</span>
    </div>
  );
}
