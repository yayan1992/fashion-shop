import * as React from "react";
import type { MediaAsset } from "@/catalog/types";
import { api, describeError, uploadFile } from "../api";
import { checkFile, decode, editorialVariants, extensionFor } from "../images";
import { Spinner, useToast } from "../ui";

/** Uploads an editorial photograph (worn, detail, campaign) at responsive sizes. */
export async function uploadEditorial(file: File, alt: string): Promise<MediaAsset> {
  const problem = checkFile(file);
  if (problem) throw new Error(problem);
  const source = await decode(file);
  const { width, height, variants } = await editorialVariants(source);
  const uploaded = [];
  for (const variant of variants) {
    const { path, url } = await uploadFile("editorial", variant.blob, extensionFor(variant.blob));
    uploaded.push({ width: variant.width, src: url, path });
  }
  const largest = uploaded.at(-1)!;
  return api.createMedia({ src: largest.src, storagePath: largest.path, alt, width, height, variants: uploaded });
}

/** A file button that hands over one validated file. */
export function FileButton({ label, onFile, disabled, className = "" }: { label: React.ReactNode; onFile: (file: File) => void; disabled?: boolean; className?: string }) {
  const input = React.useRef<HTMLInputElement>(null);
  const toast = useToast();
  return (
    <>
      <button type="button" disabled={disabled} onClick={() => input.current?.click()} className={className}>
        {label}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          const problem = checkFile(file);
          if (problem) toast(problem, "negative");
          else onFile(file);
        }}
      />
    </>
  );
}

/**
 * A strip of editorial photographs: add, remove, reorder, and click a photo to
 * set the point its crops centre on.
 */
export function PhotoStrip({ ids, media, onChange, onUploaded, alt, empty, ratio = "4/5" }: { ids: string[]; media: Record<string, MediaAsset>; onChange: (ids: string[]) => void; onUploaded: (asset: MediaAsset) => void; alt: string; empty: string; ratio?: string }) {
  const [busy, setBusy] = React.useState(false);
  const toast = useToast();
  const add = async (file: File) => {
    setBusy(true);
    try {
      const asset = await uploadEditorial(file, alt);
      onUploaded(asset);
      onChange([...ids, asset.id]);
    } catch (error) {
      toast(error instanceof Error && !("code" in error) ? error.message : describeError(error), "negative");
    } finally {
      setBusy(false);
    }
  };
  const move = (index: number, by: number) => {
    const next = [...ids];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item!);
    onChange(next);
  };
  return (
    <div className="flex flex-wrap gap-3">
      {ids.length === 0 && !busy && <p className="w-full text-[13px] text-muted-foreground">{empty}</p>}
      {ids.map((id, i) => {
        const asset = media[id];
        return (
          <figure key={id} className="group relative w-32 shrink-0">
            <FocusPicker asset={asset} ratio={ratio} />
            <figcaption className="mt-1.5 flex justify-between text-[12px]">
              <span className="flex gap-2">
                <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label="Move earlier">←</button>
                <button type="button" disabled={i === ids.length - 1} onClick={() => move(i, 1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label="Move later">→</button>
              </span>
              <button type="button" onClick={() => onChange(ids.filter((x) => x !== id))} className="text-muted-foreground hover:text-[#8a2f22]">Remove</button>
            </figcaption>
          </figure>
        );
      })}
      <FileButton
        disabled={busy}
        onFile={add}
        className="grid w-32 shrink-0 place-items-center border border-dashed border-ink/25 text-[12px] text-muted-foreground transition-colors hover:border-ink hover:text-ink disabled:opacity-60"
        label={<span className="flex flex-col items-center gap-2 py-10" style={{ aspectRatio: ratio }}>{busy ? <Spinner /> : <span className="text-xl font-light">+</span>}{busy ? "Uploading…" : "Add photo"}</span>}
      />
    </div>
  );
}

/** Shows a photograph cropped as the store will crop it; clicking sets the focal point. */
export function FocusPicker({ asset, ratio = "4/5", className = "" }: { asset: MediaAsset | undefined; ratio?: string; className?: string }) {
  const toast = useToast();
  const [focus, setFocus] = React.useState(asset?.focus ?? "50% 50%");
  if (!asset) return <div className={`bg-bone ${className}`} style={{ aspectRatio: ratio }} />;
  return (
    <button
      type="button"
      title="Click the most important point; crops will centre on it"
      className={`relative block w-full overflow-hidden bg-bone ${className}`}
      style={{ aspectRatio: ratio }}
      onClick={async (event) => {
        const box = event.currentTarget.getBoundingClientRect();
        const next = `${Math.round(((event.clientX - box.left) / box.width) * 100)}% ${Math.round(((event.clientY - box.top) / box.height) * 100)}%`;
        setFocus(next);
        try {
          await api.updateMedia(asset.id, asset.alt, next);
        } catch (error) {
          toast(describeError(error), "negative");
        }
      }}
    >
      <img src={asset.variants?.[0]?.src ?? asset.src} alt={asset.alt} className="size-full object-cover" style={{ objectPosition: focus }} />
      <span aria-hidden="true" className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-chalk bg-ink/60" style={{ left: focus.split(" ")[0], top: focus.split(" ")[1] }} />
    </button>
  );
}
