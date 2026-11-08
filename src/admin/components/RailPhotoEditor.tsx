import * as React from "react";
import { api, describeError, uploadFile } from "../api";
import { analyse, decode, extensionFor, fitPlacement, hasSolidEdges, RAIL_H, RAIL_W, removeBackground, renderRail, toBlob, type Analysis, type Placement } from "../images";
import { Button, Dialog, Field, Input, Notice, Spinner, Toggle } from "../ui";
import type { MediaAsset } from "@/catalog/types";

const PREVIEW_W = 232;
const PREVIEW_H = Math.round((PREVIEW_W * RAIL_H) / RAIL_W);
const K = PREVIEW_W / RAIL_W;

interface Props {
  file: File;
  role: "front" | "back" | "side";
  alt: string;
  /** Front photos of the neighbouring pieces on the rail, shown faintly for scale. */
  neighbours: string[];
  /** The front photo's alignment from this session, to match back and side views. */
  match?: Placement;
  onDone: (asset: MediaAsset, placement: Placement) => void;
  onCancel: () => void;
}

/**
 * Aligns a garment photograph on the rail canvas before upload: fit, scale,
 * position, optional removal of a plain background. The result is uploaded
 * already aligned, so the rail itself never needs to know.
 */
export function RailPhotoEditor({ file, role, alt: initialAlt, neighbours, match, onDone, onCancel }: Props) {
  const [source, setSource] = React.useState<HTMLCanvasElement | null>(null);
  const [analysis, setAnalysis] = React.useState<Analysis | null>(null);
  const [failure, setFailure] = React.useState<string | null>(null);
  const [removeBg, setRemoveBg] = React.useState(false);
  const [tolerance, setTolerance] = React.useState(30);
  const [fit, setFit] = React.useState<Placement | null>(null);
  const [size, setSize] = React.useState(1);
  const [offset, setOffset] = React.useState({ x: 0, y: 0 });
  const [alt, setAlt] = React.useState(initialAlt);
  const [busy, setBusy] = React.useState<null | "preparing" | "uploading">(null);
  const [solid, setSolid] = React.useState(false);
  const preview = React.useRef<HTMLCanvasElement>(null);
  const drag = React.useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    decode(file).then(
      (canvas) => {
        if (cancelled) return;
        const found = analyse(canvas);
        setSource(canvas);
        setAnalysis(found);
        setRemoveBg(!found.transparent && found.background !== null);
        setFit(match ?? fitPlacement(found.box));
      },
      (error: Error) => !cancelled && setFailure(error.message),
    );
    return () => {
      cancelled = true;
    };
  }, [file, match]);

  const processed = React.useMemo(() => {
    if (!source || !analysis) return null;
    return removeBg && analysis.background ? removeBackground(source, analysis.background, tolerance) : source;
  }, [source, analysis, removeBg, tolerance]);

  const placement = React.useMemo<Placement | null>(() => {
    if (!fit || !processed) return null;
    // Scale around the garment's top centre, so resizing keeps the hook in place.
    const box = analysis!.box;
    const anchorX = fit.left + (box.x + box.width / 2) * fit.scale;
    const anchorY = fit.top + box.y * fit.scale;
    const scale = fit.scale * size;
    return { scale, left: anchorX - (box.x + box.width / 2) * scale + offset.x, top: anchorY - box.y * scale + offset.y };
  }, [fit, processed, analysis, size, offset]);

  React.useEffect(() => {
    const node = preview.current;
    if (!node || !processed || !placement) return;
    const ctx = node.getContext("2d", { willReadFrequently: true })!;
    ctx.clearRect(0, 0, node.width, node.height);
    ctx.drawImage(processed, placement.left * K, placement.top * K, processed.width * placement.scale * K, processed.height * placement.scale * K);
    const corners = [ctx.getImageData(1, 1, 1, 1).data[3]!, ctx.getImageData(node.width - 2, 1, 1, 1).data[3]!, ctx.getImageData(1, node.height - 2, 1, 1).data[3]!, ctx.getImageData(node.width - 2, node.height - 2, 1, 1).data[3]!];
    setSolid(corners.filter((a) => a > 200).length >= 2);
  }, [processed, placement]);

  const confirm = async () => {
    if (!processed || !placement) return;
    try {
      setBusy("preparing");
      const rendered = renderRail(processed, placement);
      const blob = await toBlob(rendered);
      if (hasSolidEdges(rendered) && !window.confirm("This photo still has a solid background, which will show as a box on the rail. Use it anyway?")) {
        setBusy(null);
        return;
      }
      setBusy("uploading");
      const { path, url } = await uploadFile("rail", blob, extensionFor(blob));
      const asset = await api.createMedia({ src: url, storagePath: path, alt: alt.trim(), width: RAIL_W, height: RAIL_H });
      onDone(asset, placement);
    } catch (error) {
      setFailure(describeError(error));
      setBusy(null);
    }
  };

  const reset = () => {
    setSize(1);
    setOffset({ x: 0, y: 0 });
    if (analysis) setFit(fitPlacement(analysis.box));
  };

  const ready = Boolean(processed && placement);
  const roleLabel = role === "front" ? "Front photo" : role === "back" ? "Back photo" : "Side photo";

  return (
    <Dialog
      open
      wide
      title={`${roleLabel}: align on the rail`}
      onClose={busy ? () => {} : onCancel}
      actions={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy !== null}>Cancel</Button>
          <Button variant="primary" onClick={confirm} disabled={!ready} loading={busy !== null}>
            {busy === "preparing" ? "Preparing…" : busy === "uploading" ? "Uploading…" : "Use this photo"}
          </Button>
        </>
      }
    >
      <div className="grid gap-8 lg:grid-cols-[auto_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-center gap-0 overflow-hidden bg-[#e9e5dd] px-2 pt-4">
            {neighbours.slice(0, 1).map((src) => (
              <img key={src} src={src} alt="" aria-hidden="true" className="-mr-8 opacity-35" style={{ width: PREVIEW_W * 0.72, height: PREVIEW_H * 0.72 * (RAIL_H / RAIL_H), objectFit: "contain", objectPosition: "top" }} />
            ))}
            <div
              className="relative shrink-0 cursor-grab touch-none active:cursor-grabbing"
              style={{ width: PREVIEW_W, height: PREVIEW_H, backgroundImage: "repeating-conic-gradient(#ddd8cf 0% 25%, #ebe7df 0% 50%)", backgroundSize: "16px 16px" }}
              onPointerDown={(event) => {
                drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                const d = drag.current;
                if (d) setOffset({ x: d.ox + (event.clientX - d.x) / K, y: d.oy + (event.clientY - d.y) / K });
              }}
              onPointerUp={() => (drag.current = null)}
            >
              <canvas ref={preview} width={PREVIEW_W} height={PREVIEW_H} className="absolute inset-0" aria-label={`Preview of the ${roleLabel.toLowerCase()} on the rail canvas`} role="img" />
              <svg aria-hidden="true" className="pointer-events-none absolute inset-0" width={PREVIEW_W} height={PREVIEW_H}>
                <line x1="0" x2={PREVIEW_W} y1={PREVIEW_H * 0.012} y2={PREVIEW_H * 0.012} stroke="#121110" strokeOpacity="0.5" strokeWidth="2" />
                <circle cx={PREVIEW_W / 2} cy={PREVIEW_H * 0.012} r="4" fill="none" stroke="#a65a44" strokeWidth="1.5" />
                <line x1={PREVIEW_W / 2} x2={PREVIEW_W / 2} y1="0" y2={PREVIEW_H} stroke="#121110" strokeOpacity="0.12" strokeDasharray="3 4" />
                <rect x="0" y={PREVIEW_H * 0.8} width={PREVIEW_W} height={PREVIEW_H * 0.1} fill="#121110" fillOpacity="0.04" />
              </svg>
              {!ready && !failure && (
                <div className="absolute inset-0 grid place-items-center text-muted-foreground"><Spinner /></div>
              )}
            </div>
            {neighbours.slice(1, 2).map((src) => (
              <img key={src} src={src} alt="" aria-hidden="true" className="-ml-8 opacity-35" style={{ width: PREVIEW_W * 0.72, height: PREVIEW_H * 0.72, objectFit: "contain", objectPosition: "top" }} />
            ))}
          </div>
          <p className="max-w-[420px] text-[12px] leading-relaxed text-muted-foreground">
            Hang the hook on the rail at the orange mark, keep the garment centred, and let the hem fall in the shaded band. The faint pieces beside it are its neighbours on the rail, at the same scale.
          </p>
        </div>

        <div className="flex flex-col gap-6">
          {failure && <Notice tone="negative">{failure}</Notice>}
          {analysis && (
            <div className="flex flex-col gap-3">
              <p className="text-[13px] font-medium">Background</p>
              {analysis.transparent ? (
                <Notice>Transparent background. This will look its best on the rail.</Notice>
              ) : analysis.background ? (
                <>
                  <Toggle checked={removeBg} onChange={setRemoveBg} label="Remove the plain background" description="Makes the backdrop transparent from the edges inwards, keeping light parts of the garment." />
                  {removeBg && (
                    <Field label={`Strength · ${tolerance}`} htmlFor="tolerance" hint="Raise it if a halo of backdrop remains; lower it if the garment's edges start to disappear.">
                      <input id="tolerance" type="range" min={8} max={80} value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} className="accent-[#121110]" />
                    </Field>
                  )}
                </>
              ) : (
                <Notice tone="attention">This photo has a busy background, which will show as a rectangle on the rail. For the best result, upload a cut-out (transparent PNG) or a photo against a plain wall.</Notice>
              )}
              {solid && analysis.background && !removeBg && <Notice tone="attention">The background will show as a box on the rail. Turn on background removal.</Notice>}
            </div>
          )}

          <div className="flex flex-col gap-4">
            <p className="text-[13px] font-medium">Size and position</p>
            <Field label={`Size · ${Math.round(size * 100)}%`} htmlFor="size">
              <input id="size" type="range" min={0.5} max={1.6} step={0.01} value={size} onChange={(e) => setSize(Number(e.target.value))} className="accent-[#121110]" />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Left · right" htmlFor="offset-x">
                <input id="offset-x" type="range" min={-RAIL_W / 2} max={RAIL_W / 2} value={offset.x} onChange={(e) => setOffset((o) => ({ ...o, x: Number(e.target.value) }))} className="accent-[#121110]" />
              </Field>
              <Field label="Up · down" htmlFor="offset-y">
                <input id="offset-y" type="range" min={-RAIL_H / 3} max={RAIL_H / 3} value={offset.y} onChange={(e) => setOffset((o) => ({ ...o, y: Number(e.target.value) }))} className="accent-[#121110]" />
              </Field>
            </div>
            <p className="text-[12px] text-muted-foreground">You can also drag the photo in the preview.</p>
            <Button variant="ghost" className="self-start" onClick={reset}>Fit automatically</Button>
          </div>

          <Field label="Description for screen readers" htmlFor="alt" hint="What the photo shows, e.g. “Field coat in charcoal, front view, on a wooden hanger”.">
            <Input id="alt" value={alt} onChange={(e) => setAlt(e.target.value)} />
          </Field>
        </div>
      </div>
    </Dialog>
  );
}
