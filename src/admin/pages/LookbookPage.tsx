import * as React from "react";
import { Link } from "react-router";
import type { Look, Lookbook, LookbookSpread, MediaAsset, SpreadLayout } from "@/catalog/types";
import { useDocumentTitle } from "@/lib/hooks";
import { useAdminData } from "../AdminApp";
import { api, describeError } from "../api";
import { FileButton, FocusPicker, uploadEditorial } from "../components/PhotoPicker";
import { Badge, Button, Field, Input, Notice, PageHeader, Panel, Select, Spinner, Textarea, Toggle, useConfirm, useToast } from "../ui";

const LAYOUTS: { id: SpreadLayout; label: string; frames: [number, number]; hint: string }[] = [
  { id: "cinematic", label: "Cinematic", frames: [1, 1], hint: "One wide photograph, edge to edge." },
  { id: "pair", label: "Portrait and detail", frames: [2, 2], hint: "A large portrait, a smaller detail and a line of text." },
  { id: "pair-flip", label: "Detail and portrait", frames: [2, 2], hint: "The same, mirrored." },
  { id: "wide", label: "Wide frame", frames: [1, 1], hint: "One landscape photograph inside the page margins." },
  { id: "materials", label: "Materials", frames: [2, 3], hint: "A short text with two or three close-ups." },
];

const uid = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
const blankLook = (kind: Look["kind"]): Look => ({ id: uid("look"), title: "", caption: "", tone: "plaster", kind, pieces: [], published: true });

function Diagram({ layout }: { layout: SpreadLayout }) {
  const box = "fill-ink/15";
  return (
    <svg viewBox="0 0 48 30" className="h-6 w-10" aria-hidden="true">
      {layout === "cinematic" && <rect x="0" y="6" width="48" height="18" className={box} />}
      {layout === "wide" && <rect x="6" y="5" width="40" height="20" className={box} />}
      {layout === "pair" && <><rect x="2" y="2" width="20" height="26" className={box} /><rect x="32" y="14" width="12" height="14" className={box} /></>}
      {layout === "pair-flip" && <><rect x="26" y="2" width="20" height="26" className={box} /><rect x="4" y="14" width="12" height="14" className={box} /></>}
      {layout === "materials" && <><rect x="2" y="6" width="12" height="3" className={box} /><rect x="18" y="4" width="13" height="16" className={box} /><rect x="33" y="10" width="13" height="16" className={box} /></>}
    </svg>
  );
}

export default function LookbookPage() {
  useDocumentTitle("Lookbook — Studio");
  const { data, refresh } = useAdminData();
  const toast = useToast();
  const confirm = useConfirm();
  const source = data.lookbooks[0];
  const [book, setBook] = React.useState<Lookbook | null>(source ? structuredClone(source) : null);
  // Pick up the saved version after each save.
  const [synced, setSynced] = React.useState(source);
  if (synced !== source) {
    setSynced(source);
    setBook(source ? structuredClone(source) : null);
  }
  const [media, setMedia] = React.useState<Record<string, MediaAsset>>({});
  const [saving, setSaving] = React.useState(false);
  const [addLayout, setAddLayout] = React.useState<SpreadLayout>("cinematic");
  const allMedia = { ...data.media, ...media };
  const dirty = JSON.stringify(book) !== JSON.stringify(source);

  if (!book) return <PageHeader title="Lookbook" description="No lookbook exists yet. Run the setup script to create one." />;

  const setSpread = (i: number, change: Partial<LookbookSpread>) => setBook((b) => b && { ...b, spreads: b.spreads.map((s, j) => (j === i ? { ...s, ...change } : s)) });
  const setLook = (si: number, li: number, change: Partial<Look>) => setSpread(si, { looks: book.spreads[si]!.looks.map((l, j) => (j === li ? { ...l, ...change } : l)) });
  const moveSpread = (i: number, by: number) => setBook((b) => {
    if (!b) return b;
    const spreads = [...b.spreads];
    const [s] = spreads.splice(i, 1);
    spreads.splice(i + by, 0, s!);
    return { ...b, spreads };
  });
  const missingTitles = book.spreads.some((s) => s.looks.some((l) => !l.title.trim()));

  const save = async () => {
    if (missingTitles) {
      toast("Every frame needs a title.", "negative");
      return;
    }
    setSaving(true);
    try {
      await api.saveLookbook(book);
      await refresh();
      toast("Lookbook saved.");
    } catch (error) {
      toast(describeError(error), "negative");
    } finally {
      setSaving(false);
    }
  };

  const changeLayout = (i: number, layout: SpreadLayout) => {
    const spec = LAYOUTS.find((l) => l.id === layout)!;
    const looks = [...book.spreads[i]!.looks];
    while (looks.length < spec.frames[0]) looks.push(blankLook(looks.length === 0 ? "campaign" : "detail"));
    setSpread(i, { layout, looks: looks.slice(0, spec.frames[1]) });
  };

  return (
    <>
      <PageHeader
        title="Lookbook"
        description="The editorial section on the homepage. Each spread uses one of five curated layouts, so the page always holds together. Photos link to the pieces they show."
        actions={
          <>
            <Link to="/#lookbook" target="_blank" className="text-[13px] text-muted-foreground hover:text-ink">View in store ↗</Link>
            <Button variant="primary" onClick={save} loading={saving} disabled={!dirty}>Save lookbook</Button>
          </>
        }
      />
      <div className="flex flex-col gap-6">
        <Panel title="Introduction">
          <div className="grid gap-5 md:grid-cols-3">
            <Field label="Title" htmlFor="lb-title"><Input id="lb-title" value={book.title} onChange={(e) => setBook({ ...book, title: e.target.value })} /></Field>
            <Field label="Season line" htmlFor="lb-season" optional><Input id="lb-season" value={book.season} onChange={(e) => setBook({ ...book, season: e.target.value })} /></Field>
            <Field label="Summary" htmlFor="lb-summary" optional><Input id="lb-summary" value={book.summary} onChange={(e) => setBook({ ...book, summary: e.target.value })} /></Field>
          </div>
          <div className="mt-5"><Toggle checked={book.published ?? true} onChange={(on) => setBook({ ...book, published: on })} label="Show the lookbook on the homepage" /></div>
        </Panel>

        {book.spreads.map((spread, si) => {
          const spec = LAYOUTS.find((l) => l.id === spread.layout)!;
          return (
            <Panel
              key={spread.id}
              title={<span className="flex items-center gap-3"><Diagram layout={spread.layout} /> Spread {si + 1} · {spec.label} {spread.published === false && <Badge tone="muted">Hidden</Badge>}</span>}
              description={spec.hint}
              actions={
                <div className="flex flex-wrap items-center gap-1">
                  <Button variant="ghost" className="!h-8 !px-2" aria-label="Move spread up" disabled={si === 0} onClick={() => moveSpread(si, -1)}>↑</Button>
                  <Button variant="ghost" className="!h-8 !px-2" aria-label="Move spread down" disabled={si === book.spreads.length - 1} onClick={() => moveSpread(si, 1)}>↓</Button>
                  <Button variant="ghost" className="!h-8 !px-2" onClick={async () => {
                    if (await confirm({ title: "Remove this spread?", body: "Its photos stay in your media library until you clean up unused images.", confirm: "Remove spread", danger: true })) setBook({ ...book, spreads: book.spreads.filter((_, j) => j !== si) });
                  }}>Remove</Button>
                </div>
              }
            >
              <div className="mb-5 grid gap-5 md:grid-cols-[220px_1fr_auto] md:items-end">
                <Field label="Layout" htmlFor={`layout-${si}`}>
                  <Select id={`layout-${si}`} value={spread.layout} onChange={(e) => changeLayout(si, e.target.value as SpreadLayout)}>
                    {LAYOUTS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                  </Select>
                </Field>
                {(spread.layout === "pair" || spread.layout === "pair-flip" || spread.layout === "materials") ? (
                  <Field label="Text beside the photos" htmlFor={`note-${si}`} optional>
                    <Textarea id={`note-${si}`} rows={2} value={spread.note ?? ""} onChange={(e) => setSpread(si, { note: e.target.value })} />
                  </Field>
                ) : <span />}
                <Toggle checked={spread.published ?? true} onChange={(on) => setSpread(si, { published: on })} label="Visible" />
              </div>
              <div className="grid gap-5 lg:grid-cols-3">
                {spread.looks.map((look, li) => (
                  <LookEditor key={look.id} look={look} media={allMedia} onChange={(change) => setLook(si, li, change)} onUploaded={(a) => setMedia((m) => ({ ...m, [a.id]: a }))} onRemove={spread.looks.length > spec.frames[0] ? () => setSpread(si, { looks: spread.looks.filter((_, j) => j !== li) }) : undefined} />
                ))}
                {spread.looks.length < spec.frames[1] && (
                  <button type="button" onClick={() => setSpread(si, { looks: [...spread.looks, blankLook("detail")] })} className="min-h-40 border border-dashed border-ink/20 text-[13px] text-muted-foreground hover:border-ink hover:text-ink">+ Add a frame</button>
                )}
              </div>
            </Panel>
          );
        })}

        <Panel title="Add a spread">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-5">
              {LAYOUTS.map((l) => (
                <button key={l.id} type="button" aria-pressed={addLayout === l.id} onClick={() => setAddLayout(l.id)} className={`flex flex-col items-start gap-2 border p-3 text-left text-[12px] ${addLayout === l.id ? "border-ink" : "border-ink/15 text-muted-foreground"}`}>
                  <Diagram layout={l.id} />
                  {l.label}
                </button>
              ))}
            </div>
            <Button onClick={() => {
              const spec = LAYOUTS.find((l) => l.id === addLayout)!;
              setBook({ ...book, spreads: [...book.spreads, { id: uid("spread"), layout: addLayout, published: true, looks: Array.from({ length: spec.frames[0] }, (_, i) => blankLook(i === 0 && addLayout !== "materials" ? "campaign" : "detail")) }] });
            }}>Add spread</Button>
          </div>
        </Panel>
        {missingTitles && <Notice tone="attention">Give every frame a title before saving.</Notice>}
      </div>
    </>
  );
}

function LookEditor({ look, media, onChange, onUploaded, onRemove }: { look: Look; media: Record<string, MediaAsset>; onChange: (change: Partial<Look>) => void; onUploaded: (asset: MediaAsset) => void; onRemove?: () => void }) {
  const { data } = useAdminData();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const asset = look.mediaId ? media[look.mediaId] : undefined;
  const upload = async (file: File) => {
    setBusy(true);
    try {
      const uploaded = await uploadEditorial(file, look.caption || look.title || "Lookbook photograph");
      onUploaded(uploaded);
      onChange({ mediaId: uploaded.id });
    } catch (error) {
      toast(error instanceof Error && !("code" in error) ? error.message : describeError(error), "negative");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-3 border border-ink/10 bg-white/40 p-3">
      <div className="relative">
        {asset ? <FocusPicker asset={asset} ratio="4/3" /> : <div className="grid aspect-[4/3] place-items-center bg-bone text-[12px] text-muted-foreground">{busy ? <Spinner /> : "No photo: the pieces are shown as a still life"}</div>}
      </div>
      <div className="flex justify-between text-[12px]">
        <FileButton disabled={busy} onFile={upload} className="text-muted-foreground hover:text-ink" label={busy ? "Uploading…" : asset ? "Replace photo" : "Upload photo"} />
        {asset && <span className="text-muted-foreground">Click the photo to set its focus</span>}
      </div>
      <Field label="Title" htmlFor={`${look.id}-title`}><Input id={`${look.id}-title`} value={look.title} aria-invalid={!look.title.trim()} onChange={(e) => onChange({ title: e.target.value })} /></Field>
      <Field label="Caption" htmlFor={`${look.id}-caption`} hint="Also read aloud to screen readers." optional><Input id={`${look.id}-caption`} value={look.caption} onChange={(e) => onChange({ caption: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Kind" htmlFor={`${look.id}-kind`}>
          <Select id={`${look.id}-kind`} value={look.kind} onChange={(e) => onChange({ kind: e.target.value as Look["kind"] })}>
            <option value="campaign">Look (numbered)</option>
            <option value="detail">Detail</option>
          </Select>
        </Field>
        <Field label="Backdrop" htmlFor={`${look.id}-tone`}>
          <Select id={`${look.id}-tone`} value={look.tone} onChange={(e) => onChange({ tone: e.target.value as Look["tone"] })}>
            <option value="plaster">Plaster</option>
            <option value="bone">Bone</option>
            <option value="graphite">Graphite</option>
            <option value="ink">Ink</option>
          </Select>
        </Field>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-[13px] font-medium">Pieces shown</p>
        {look.pieces.map((piece, i) => {
          const product = data.products.find((p) => p.id === piece.productId);
          return (
            <div key={i} className="flex items-center gap-2 text-[13px]">
              <span className="flex-1 truncate">{product?.name ?? piece.productId} · {product?.colorways.find((c) => c.id === piece.colorwayId)?.name}</span>
              <button type="button" className="text-muted-foreground hover:text-[#8a2f22]" onClick={() => onChange({ pieces: look.pieces.filter((_, j) => j !== i) })}>Remove</button>
            </div>
          );
        })}
        <Select aria-label="Add a piece to this frame" value="" onChange={(e) => {
          const [productId, colorwayId] = e.target.value.split(":");
          if (productId && colorwayId) onChange({ pieces: [...look.pieces, { productId, colorwayId, view: "front" }] });
        }}>
          <option value="">Link a piece…</option>
          {data.products.filter((p) => p.status !== "archived").flatMap((p) => p.colorways.map((c) => <option key={`${p.id}:${c.id}`} value={`${p.id}:${c.id}`}>{p.name} · {c.name}</option>))}
        </Select>
      </div>
      <div className="flex items-center justify-between border-t border-ink/10 pt-3">
        <Toggle checked={look.published ?? true} onChange={(on) => onChange({ published: on })} label="Visible" />
        {onRemove && <button type="button" onClick={onRemove} className="text-[12px] text-muted-foreground hover:text-[#8a2f22]">Remove frame</button>}
      </div>
    </div>
  );
}
