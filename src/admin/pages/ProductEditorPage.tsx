import * as React from "react";
import { useBlocker, useNavigate, useParams } from "react-router";
import type { MediaAsset, Product } from "@/catalog/types";
import { useDocumentTitle } from "@/lib/hooks";
import { useAdminData } from "../AdminApp";
import { api, describeError } from "../api";
import { RailPhotoEditor } from "../components/RailPhotoEditor";
import { RailPreview } from "../components/RailPreview";
import { FileButton, PhotoStrip } from "../components/PhotoPicker";
import { garmentFor, mediaSrc, railGarments, slugify } from "../garments";
import type { Placement } from "../images";
import { Badge, Button, Field, Input, Notice, PageHeader, Panel, Select, Textarea, Toggle, useConfirm, useToast } from "../ui";
import { STATUS_LABEL, STATUS_TONE } from "../format";
import { ADMIN_BASE } from "@/admin/paths";

type Status = Product["status"];
type Role = "front" | "back" | "side";

interface ColourDraft {
  key: string;
  /** Stable id once saved; new colours get one from their name. */
  id: string;
  saved: boolean;
  name: string;
  swatch: string;
  front?: string;
  back?: string;
  side?: string;
  gallery: string[];
  lifestyle: string[];
  details: string[];
  stock: Record<string, string>;
  stockBase: Record<string, number>;
  onRail: boolean;
}

interface Draft {
  isNew: boolean;
  id: string;
  slug: string;
  slugTouched: boolean;
  name: string;
  category: string;
  status: Status;
  price: string;
  summary: string;
  description: string;
  details: string;
  composition: string;
  care: string;
  fit: string;
  fabric: string;
  sizes: string[];
  colours: ColourDraft[];
  featured: boolean;
  collectionIds: string[];
  pairsWith: string[];
}

const STANDARD_SIZES = ["XS", "S", "M", "L", "XL", "XXL"];
let keySeed = 0;
const newKey = () => `c${++keySeed}`;

function blankColour(sizes: string[]): ColourDraft {
  return { key: newKey(), id: "", saved: false, name: "", swatch: "#d9d4c9", gallery: [], lifestyle: [], details: [], stock: Object.fromEntries(sizes.map((s) => [s, "0"])), stockBase: {}, onRail: true };
}

function draftFrom(product: Product | undefined, fallbackCategory: string): Draft {
  if (!product) {
    const sizes = ["XS", "S", "M", "L", "XL"];
    return { isNew: true, id: "", slug: "", slugTouched: false, name: "", category: fallbackCategory, status: "draft", price: "", summary: "", description: "", details: "", composition: "", care: "", fit: "", fabric: "", sizes, colours: [blankColour(sizes)], featured: false, collectionIds: [], pairsWith: [] };
  }
  return {
    isNew: false,
    id: product.id,
    slug: product.slug,
    slugTouched: true,
    name: product.name,
    category: product.category,
    status: product.status,
    price: (product.price / 100).toFixed(product.price % 100 ? 2 : 0),
    summary: product.summary,
    description: product.description,
    details: product.details.join("\n"),
    composition: product.composition,
    care: product.care.join("\n"),
    fit: product.fit,
    fabric: product.fabric ?? "",
    sizes: product.sizes,
    colours: product.colorways.map((c) => {
      const variants = product.variants.filter((v) => v.colorwayId === c.id);
      return {
        key: newKey(),
        id: c.id,
        saved: true,
        name: c.name,
        swatch: c.swatch,
        front: c.media.front,
        back: c.media.back,
        side: c.media.side,
        gallery: c.media.gallery ?? [],
        lifestyle: c.media.lifestyle ?? [],
        details: c.media.details ?? [],
        stock: Object.fromEntries(variants.map((v) => [v.size, String(v.stock)])),
        stockBase: Object.fromEntries(variants.map((v) => [v.size, v.stock])),
        onRail: Boolean(c.onRail),
      };
    }),
    featured: Boolean(product.featured),
    collectionIds: product.collectionIds ?? [],
    pairsWith: product.pairsWith ?? [],
  };
}

/** Problems that block saving, and what still blocks publishing. */
function check(draft: Draft, slugTaken: boolean) {
  const errors: Record<string, string> = {};
  if (!draft.name.trim()) errors.name = "Give the product a name.";
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(draft.slug)) errors.slug = "Use lowercase letters, numbers and hyphens.";
  else if (slugTaken) errors.slug = "Another product already uses this address.";
  if (draft.price.trim() !== "" && (!/^\d+([.,]\d{1,2})?$/.test(draft.price.trim()))) errors.price = "Enter a price like 120 or 120.50.";
  draft.colours.forEach((c, i) => {
    if (!c.name.trim()) errors[`colour-${i}`] = "Name this colour.";
  });
  const names = draft.colours.map((c) => slugify(c.name));
  if (new Set(names).size !== names.length) errors.colours = "Two colours have the same name.";
  for (const c of draft.colours) for (const size of draft.sizes) if (!/^\d+$/.test(c.stock[size] ?? "0")) errors.stock = "Stock must be a whole number.";

  const publish: string[] = [];
  if (!draft.name.trim()) publish.push("a name");
  if (!(parseFloat(draft.price.replace(",", ".")) > 0)) publish.push("a price");
  if (draft.sizes.length === 0) publish.push("at least one size");
  draft.colours.forEach((c) => !c.front && publish.push(`a front photo${draft.colours.length > 1 ? ` for ${c.name || "each colour"}` : ""}`));
  return { errors, publish };
}

/** A fresh editor per product, so moving from "new" to the saved product reloads the form. */
export default function ProductEditorRoute() {
  const { id } = useParams();
  return <ProductEditorPage key={id ?? "new"} id={id} />;
}

function ProductEditorPage({ id }: { id: string | undefined }) {
  const navigate = useNavigate();
  const { data, refresh } = useAdminData();
  const toast = useToast();
  const confirm = useConfirm();
  const product = id ? data.products.find((p) => p.id === id) : undefined;
  const [initial] = React.useState(() => draftFrom(product, data.categories[0]?.id ?? ""));
  const [draft, setDraft] = React.useState<Draft>(initial);
  const [media, setMedia] = React.useState<Record<string, MediaAsset>>({});
  const [colourIndex, setColourIndex] = React.useState(0);
  const [editing, setEditing] = React.useState<{ file: File; role: Role; colour: number } | null>(null);
  const [placements, setPlacements] = React.useState<Record<string, Placement>>({});
  const [saving, setSaving] = React.useState<null | Status>(null);
  const [showErrors, setShowErrors] = React.useState(false);
  const [saved, setSaved] = React.useState(initial);
  useDocumentTitle(`${draft.name || "New product"} — Studio`);

  const allMedia = React.useMemo(() => ({ ...data.media, ...media }), [data.media, media]);
  const slugTaken = data.products.some((p) => p.slug === draft.slug && p.id !== draft.id);
  const { errors, publish } = check(draft, slugTaken);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const leaving = React.useRef(false);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => !leaving.current && dirty && saving === null && currentLocation.pathname !== nextLocation.pathname);

  React.useEffect(() => {
    if (blocker.state !== "blocked") return;
    confirm({ title: "Leave without saving?", body: "Your changes to this product haven’t been saved.", confirm: "Leave", danger: true }).then((leave) => (leave ? blocker.proceed() : blocker.reset()));
  }, [blocker, confirm]);

  React.useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setColour = (index: number, change: Partial<ColourDraft>) => setDraft((d) => ({ ...d, colours: d.colours.map((c, i) => (i === index ? { ...c, ...change } : c)) }));
  const colour = draft.colours[Math.min(colourIndex, draft.colours.length - 1)]!;
  const current = Math.min(colourIndex, draft.colours.length - 1);

  const save = async (status: Status) => {
    setShowErrors(true);
    if (Object.keys(errors).length) {
      toast("Some details need attention before saving.", "negative");
      return;
    }
    if (status === "active" && publish.length) {
      toast(`Add ${publish.join(", ")} before publishing.`, "negative");
      return;
    }
    const used = new Set<string>();
    const colours = draft.colours.map((c) => {
      let cid = c.saved ? c.id : slugify(c.name) || "colour";
      while (used.has(cid)) cid = `${cid}-2`;
      used.add(cid);
      return {
        id: cid,
        name: c.name.trim(),
        swatch: c.swatch,
        media: { front: c.front ?? null, back: c.back ?? null, side: c.side ?? null, gallery: c.gallery, lifestyle: c.lifestyle, details: c.details },
        stock: Object.fromEntries(draft.sizes.map((s) => [s, Number(c.stock[s] ?? 0)])),
        stockBase: c.stockBase,
        onRail: c.onRail && Boolean(c.front),
      };
    });
    setSaving(status);
    try {
      const result = await api.saveProduct({
        isNew: draft.isNew,
        id: draft.isNew ? undefined : draft.id,
        slug: draft.slug,
        name: draft.name,
        category: draft.category,
        status,
        price: Math.round(parseFloat((draft.price || "0").replace(",", ".")) * 100),
        summary: draft.summary,
        description: draft.description,
        details: draft.details.split("\n"),
        composition: draft.composition,
        care: draft.care.split("\n"),
        fit: draft.fit,
        fabric: draft.fabric,
        sizes: draft.sizes,
        colorways: colours,
        featured: draft.featured,
        collectionIds: draft.collectionIds,
        pairsWith: draft.pairsWith,
      });
      await refresh();
      toast(status === "active" ? (draft.status === "active" ? "Changes are live." : "Published. It’s in the store now.") : status === "archived" ? "Archived." : "Saved as a draft.");
      if (draft.isNew) {
        leaving.current = true;
        setSaved(draft);
        navigate(`${ADMIN_BASE}/products/${result.id}`, { replace: true });
      }
    } catch (error) {
      toast(describeError(error), "negative");
    } finally {
      setSaving(null);
    }
  };

  // After a refresh, rebuild the form from what the database now holds.
  const freshProduct = !draft.isNew ? data.products.find((p) => p.id === draft.id) : undefined;
  const [syncedAt, setSyncedAt] = React.useState(product?.updatedAt);
  if (freshProduct && freshProduct.updatedAt !== syncedAt) {
    setSyncedAt(freshProduct.updatedAt);
    const next = draftFrom(freshProduct, draft.category);
    setDraft(next);
    setSaved(next);
  }

  if (id && !product && !freshProduct) {
    return <PageHeader title="Product not found" description="It may have been deleted." back={{ to: `${ADMIN_BASE}/products`, label: "Products" }} />;
  }

  const remove = async () => {
    const ok = await confirm({ title: `Delete ${draft.name || "this product"}?`, body: "It will be removed from the store, the rail and the lookbook. Past orders keep their own record. Archiving hides it instead and can be undone.", confirm: "Delete product", danger: true });
    if (!ok) return;
    try {
      await api.deleteProduct(draft.id);
      leaving.current = true;
      await refresh();
      toast("Product deleted.");
      navigate(`${ADMIN_BASE}/products`, { replace: true });
    } catch (error) {
      toast(describeError(error), "negative");
    }
  };

  const tag = draft.price ? new Intl.NumberFormat(data.settings.locale, { style: "currency", currency: data.settings.currency, maximumFractionDigits: 0 }).format(parseFloat(draft.price.replace(",", ".")) || 0) : undefined;
  const previewPieces = draft.colours
    .filter((c) => c.front)
    .map((c) => garmentFor(allMedia, `draft:${c.key}`, draft.name || "New product", c.swatch, c, tag, draft.summary));
  const neighbours = railGarments(data, draft.id || undefined).slice(0, 6);
  const otherProducts = data.products.filter((p) => p.id !== draft.id && p.status !== "archived");
  const live = draft.status === "active";

  const actions = (
    <>
      {!draft.isNew && <Button variant="ghost" onClick={remove}>Delete</Button>}
      {!draft.isNew && draft.status !== "archived" && <Button variant="ghost" onClick={() => save("archived")} loading={saving === "archived"}>Archive</Button>}
      {live ? (
        <>
          <Button onClick={() => save("draft")} loading={saving === "draft"}>Unpublish</Button>
          <Button variant="primary" onClick={() => save("active")} loading={saving === "active"} disabled={!dirty}>Save changes</Button>
        </>
      ) : (
        <>
          <Button onClick={() => save("draft")} loading={saving === "draft"}>{draft.status === "archived" ? "Restore as draft" : "Save draft"}</Button>
          <Button variant="primary" onClick={() => save("active")} loading={saving === "active"}>Publish</Button>
        </>
      )}
    </>
  );

  const err = (key: string) => (showErrors ? errors[key] : undefined);

  return (
    <div className="pb-24">
      <PageHeader
        back={{ to: `${ADMIN_BASE}/products`, label: "Products" }}
        title={
          <span className="flex items-center gap-3">
            {draft.name || "New product"}
            {!draft.isNew && <Badge tone={STATUS_TONE[draft.status]}>{STATUS_LABEL[draft.status]}</Badge>}
            {dirty && <span className="text-[12px] font-normal tracking-normal text-muted-foreground" style={{ fontStretch: "100%" }}>Unsaved changes</span>}
          </span>
        }
        actions={actions}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel
            title="Photos"
            description="A front photo is all you need to publish. Back and side photos let the piece turn on the rail; without them it shows its front only. Transparent cut-outs look best, but a photo on a plain wall works too."
          >
            {draft.colours.length > 1 && (
              <div role="tablist" aria-label="Colour" className="mb-5 flex flex-wrap gap-2">
                {draft.colours.map((c, i) => (
                  <button key={c.key} role="tab" type="button" aria-selected={i === current} onClick={() => setColourIndex(i)} className={`flex items-center gap-2 border px-3 py-1.5 text-[13px] ${i === current ? "border-ink" : "border-ink/15 text-muted-foreground"}`}>
                    <span className="size-3 rounded-full" style={{ background: c.swatch }} />
                    {c.name || `Colour ${i + 1}`}
                  </button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-3 gap-3 sm:max-w-xl">
              {(["front", "back", "side"] as const).map((role) => (
                <RailSlot
                  key={role}
                  role={role}
                  src={mediaSrc(allMedia, colour[role])}
                  onFile={(file) => setEditing({ file, role, colour: current })}
                  onRemove={() => setColour(current, { [role]: undefined })}
                />
              ))}
            </div>
            <div className="mt-8 flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <p className="text-[13px] font-medium">Worn photos <span className="font-normal text-muted-foreground">(optional)</span></p>
                <PhotoStrip ids={colour.lifestyle} media={allMedia} alt={`${draft.name || "Product"} in ${colour.name || "this colour"}, worn`} empty="Shown in the product gallery. Someone wearing the piece, portrait format." onChange={(ids) => setColour(current, { lifestyle: ids })} onUploaded={(a) => setMedia((m) => ({ ...m, [a.id]: a }))} />
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-[13px] font-medium">Fabric and detail photos <span className="font-normal text-muted-foreground">(optional)</span></p>
                <PhotoStrip ids={colour.details} media={allMedia} alt={`${draft.name || "Product"}, fabric detail`} empty="The first one is shown beside “The cloth” on the product page." onChange={(ids) => setColour(current, { details: ids })} onUploaded={(a) => setMedia((m) => ({ ...m, [a.id]: a }))} />
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-[13px] font-medium">More gallery photos <span className="font-normal text-muted-foreground">(optional)</span></p>
                <PhotoStrip ids={colour.gallery} media={allMedia} alt={`${draft.name || "Product"}, detail`} empty="Extra photos added to the end of the product gallery." onChange={(ids) => setColour(current, { gallery: ids })} onUploaded={(a) => setMedia((m) => ({ ...m, [a.id]: a }))} />
              </div>
            </div>
          </Panel>

          <Panel title="Preview on the rail" description="The real rail, with this piece among its neighbours. Hover to turn it, drag it, click to open the close-up.">
            {previewPieces.length ? <RailPreview pieces={previewPieces} neighbours={neighbours} /> : <Notice>Add a front photo to see the piece on the rail.</Notice>}
          </Panel>

          <Panel title="Details">
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Name" htmlFor="name" error={err("name")}>
                <Input id="name" value={draft.name} aria-invalid={Boolean(err("name"))} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value, slug: d.slugTouched ? d.slug : slugify(e.target.value) }))} />
              </Field>
              <Field label="Web address" htmlFor="slug" error={err("slug")} hint={`/products/${draft.slug || "…"}`}>
                <Input id="slug" value={draft.slug} aria-invalid={Boolean(err("slug"))} onChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value.toLowerCase().replace(/\s+/g, "-"), slugTouched: true }))} />
              </Field>
              <Field label="Category" htmlFor="category">
                <Select id="category" value={draft.category} onChange={(e) => set("category", e.target.value)}>
                  {data.categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </Select>
              </Field>
              <Field label="One-line summary" htmlFor="summary" hint="Shown on the rail and in product cards.">
                <Input id="summary" maxLength={300} value={draft.summary} onChange={(e) => set("summary", e.target.value)} />
              </Field>
            </div>
            <div className="mt-5 grid gap-5">
              <Field label="Description" htmlFor="description">
                <Textarea id="description" rows={4} maxLength={4000} value={draft.description} onChange={(e) => set("description", e.target.value)} />
              </Field>
              <div className="grid gap-5 md:grid-cols-2">
                <Field label="Details" htmlFor="details" hint="One per line, e.g. “240 gsm jersey”." optional>
                  <Textarea id="details" rows={3} value={draft.details} onChange={(e) => set("details", e.target.value)} />
                </Field>
                <Field label="Care" htmlFor="care" hint="One instruction per line." optional>
                  <Textarea id="care" rows={3} value={draft.care} onChange={(e) => set("care", e.target.value)} />
                </Field>
                <Field label="Composition" htmlFor="composition" optional>
                  <Input id="composition" value={draft.composition} onChange={(e) => set("composition", e.target.value)} placeholder="100% organic cotton" />
                </Field>
                <Field label="Fit" htmlFor="fit" optional>
                  <Input id="fit" value={draft.fit} onChange={(e) => set("fit", e.target.value)} placeholder="True to size." />
                </Field>
              </div>
              <Field label="The cloth" htmlFor="fabric" hint="A few sentences about the fabric, shown beside the fabric photo." optional>
                <Textarea id="fabric" rows={3} maxLength={1200} value={draft.fabric} onChange={(e) => set("fabric", e.target.value)} />
              </Field>
            </div>
          </Panel>

          <Panel title="Price, sizes and stock">
            <div className="grid gap-5 md:grid-cols-[200px_1fr]">
              <Field label={`Price (${data.settings.currency})`} htmlFor="price" error={err("price")} hint="Including tax.">
                <Input id="price" inputMode="decimal" value={draft.price} aria-invalid={Boolean(err("price"))} onChange={(e) => set("price", e.target.value)} placeholder="120" />
              </Field>
              <SizesEditor sizes={draft.sizes} onChange={(sizes) => setDraft((d) => ({ ...d, sizes, colours: d.colours.map((c) => ({ ...c, stock: Object.fromEntries(sizes.map((s) => [s, c.stock[s] ?? "0"])) })) }))} />
            </div>

            <div className="mt-8 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-medium">Colours and stock</p>
                <Button variant="ghost" onClick={() => setDraft((d) => ({ ...d, colours: [...d.colours, blankColour(d.sizes)] }))} disabled={draft.colours.length >= 12}>Add a colour</Button>
              </div>
              {(err("colours") || err("stock")) && <p className="text-[12px] text-[#8a2f22]">{err("colours") ?? err("stock")}</p>}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-[13px]">
                  <thead>
                    <tr className="border-b border-ink/10 text-left text-muted-foreground">
                      <th className="py-2 pr-3 font-normal">Colour</th>
                      {draft.sizes.map((s) => <th key={s} className="px-1 py-2 text-center font-normal">{s}</th>)}
                      <th className="py-2 pl-2 text-right font-normal">Total</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {draft.colours.map((c, i) => (
                      <tr key={c.key} className="border-b border-ink/5">
                        <td className="py-2 pr-3">
                          <div className="flex items-center gap-2">
                            <input type="color" aria-label="Swatch" value={c.swatch} onChange={(e) => setColour(i, { swatch: e.target.value })} className="size-7 shrink-0 cursor-pointer border border-ink/15 bg-transparent p-0.5" />
                            <Input aria-label="Colour name" value={c.name} placeholder="Colour name" aria-invalid={Boolean(err(`colour-${i}`))} onChange={(e) => setColour(i, { name: e.target.value })} className="!py-1.5" />
                          </div>
                        </td>
                        {draft.sizes.map((s) => (
                          <td key={s} className="px-1 py-2">
                            <Input aria-label={`${c.name || "Colour"} ${s} stock`} inputMode="numeric" value={c.stock[s] ?? "0"} onChange={(e) => setColour(i, { stock: { ...c.stock, [s]: e.target.value.replace(/[^\d]/g, "") } })} className="!px-1 !py-1.5 text-center" />
                          </td>
                        ))}
                        <td className="tabular py-2 pl-2 text-right">{draft.sizes.reduce((sum, s) => sum + (Number(c.stock[s]) || 0), 0)}</td>
                        <td className="py-2 pl-2 text-right">
                          {draft.colours.length > 1 && (
                            <button type="button" aria-label={`Remove ${c.name || "colour"}`} className="text-muted-foreground hover:text-[#8a2f22]" onClick={async () => {
                              if (c.saved && !(await confirm({ title: `Remove ${c.name}?`, body: "Its photos, stock and place on the rail are removed when you save.", confirm: "Remove colour", danger: true }))) return;
                              setDraft((d) => ({ ...d, colours: d.colours.filter((x) => x.key !== c.key) }));
                              setColourIndex(0);
                            }}>×</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[12px] text-muted-foreground">Stock changes are added to whatever sells while this page is open, so no order is ever lost.</p>
            </div>
          </Panel>
        </div>

        <div className="flex flex-col gap-6">
          <Panel title="Status">
            <div className="flex flex-col gap-3 text-[13px]">
              <p>{draft.isNew ? "Not saved yet." : live ? "Live in the store." : draft.status === "archived" ? "Archived: hidden from the store." : "Draft: only visible here."}</p>
              {publish.length > 0 ? (
                <Notice tone="attention">{live ? "Before saving, add" : "To publish, add"} {publish.join(", ")}.</Notice>
              ) : (
                !live && <Notice>Ready to publish.</Notice>
              )}
            </div>
          </Panel>

          <Panel title="Where it appears">
            <div className="flex flex-col gap-5">
              {draft.colours.map((c, i) => (
                <Toggle key={c.key} checked={c.onRail && Boolean(c.front)} disabled={!c.front} onChange={(on) => setColour(i, { onRail: on })} label={`On the rail${draft.colours.length > 1 ? ` · ${c.name || `colour ${i + 1}`}` : ""}`} description={c.front ? "Adds a hanger at the end of the rail. Reorder it on the Rail page." : "Needs a front photo."} />
              ))}
              <Toggle checked={draft.featured} onChange={(on) => set("featured", on)} label="Featured on the homepage" description="Shown in the collection grid. Order featured pieces on the Collections page." />
              {data.collections.length > 0 && (
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-2 text-[14px]">Collections</legend>
                  {data.collections.map((collection) => (
                    <label key={collection.id} className="flex items-center gap-2 text-[13px]">
                      <input type="checkbox" className="accent-[#121110]" checked={draft.collectionIds.includes(collection.id)} onChange={(e) => set("collectionIds", e.target.checked ? [...draft.collectionIds, collection.id] : draft.collectionIds.filter((x) => x !== collection.id))} />
                      {collection.title}
                    </label>
                  ))}
                </fieldset>
              )}
            </div>
          </Panel>

          <Panel title="Wear it with" description="Up to six pieces, shown on the product page.">
            <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
              {otherProducts.map((p) => {
                const checked = draft.pairsWith.includes(p.id);
                const thumb = mediaSrc(allMedia, p.colorways[0]?.media.front);
                return (
                  <label key={p.id} className={`flex cursor-pointer items-center gap-3 px-2 py-1.5 text-[13px] ${checked ? "bg-ink/[0.05]" : "hover:bg-ink/[0.03]"}`}>
                    <input type="checkbox" className="accent-[#121110]" checked={checked} disabled={!checked && draft.pairsWith.length >= 6} onChange={(e) => set("pairsWith", e.target.checked ? [...draft.pairsWith, p.id] : draft.pairsWith.filter((x) => x !== p.id))} />
                    {thumb ? <img src={thumb} alt="" className="h-9 w-6 object-contain object-top" /> : <span className="h-9 w-6 bg-bone" />}
                    <span className="flex-1">{p.name}</span>
                    {p.status !== "active" && <Badge tone="muted">{STATUS_LABEL[p.status]}</Badge>}
                  </label>
                );
              })}
            </div>
          </Panel>
        </div>
      </div>

      {editing && (
        <RailPhotoEditor
          file={editing.file}
          role={editing.role}
          alt={`${draft.name || "Product"} in ${draft.colours[editing.colour]?.name || "this colour"}, ${editing.role} view, on a hanger`}
          neighbours={neighbours.map((n) => n.image).filter((src): src is string => Boolean(src)).slice(0, 2)}
          match={editing.role !== "front" ? placements[draft.colours[editing.colour]!.key] : undefined}
          onCancel={() => setEditing(null)}
          onDone={(asset, placement) => {
            setMedia((m) => ({ ...m, [asset.id]: asset }));
            setColour(editing.colour, { [editing.role]: asset.id });
            if (editing.role === "front") setPlacements((p) => ({ ...p, [draft.colours[editing.colour]!.key]: placement }));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function RailSlot({ role, src, onFile, onRemove }: { role: Role; src?: string; onFile: (file: File) => void; onRemove: () => void }) {
  const label = role === "front" ? "Front" : role === "back" ? "Back" : "Side";
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[12px]">
        {label} {role === "front" ? <span className="text-[#8a4433]">required</span> : <span className="text-muted-foreground">optional</span>}
      </p>
      <div className="relative overflow-hidden" style={{ aspectRatio: "200 / 310", backgroundImage: "repeating-conic-gradient(#e4dfd6 0% 25%, #eeeae3 0% 50%)", backgroundSize: "14px 14px" }}>
        {src ? (
          <img src={src} alt={`${label} photo`} className="absolute inset-0 size-full object-contain object-top" />
        ) : (
          <FileButton
            onFile={onFile}
            className="absolute inset-0 grid place-items-center border border-dashed border-ink/25 text-[12px] text-muted-foreground transition-colors hover:border-ink hover:text-ink"
            label={<span className="flex flex-col items-center gap-1 px-2 text-center"><span className="text-xl font-light">+</span>Add {label.toLowerCase()} photo</span>}
          />
        )}
      </div>
      {src && (
        <div className="flex justify-between text-[12px]">
          <FileButton onFile={onFile} className="text-muted-foreground hover:text-foreground" label="Replace" />
          <button type="button" onClick={onRemove} className="text-muted-foreground hover:text-[#8a2f22]">Remove</button>
        </div>
      )}
    </div>
  );
}

function SizesEditor({ sizes, onChange }: { sizes: string[]; onChange: (sizes: string[]) => void }) {
  const [custom, setCustom] = React.useState("");
  const add = (size: string) => {
    const value = size.trim();
    if (value && !sizes.includes(value) && sizes.length < 12) onChange([...sizes, value]);
  };
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[13px] font-medium">Sizes</p>
      <div className="flex flex-wrap items-center gap-2">
        {sizes.map((size) => (
          <span key={size} className="inline-flex h-9 items-center gap-2 border border-ink/20 bg-white/60 pl-3 pr-1.5 text-[13px]">
            {size}
            <button type="button" aria-label={`Remove size ${size}`} className="px-1 text-muted-foreground hover:text-[#8a2f22]" onClick={() => onChange(sizes.filter((s) => s !== size))}>×</button>
          </span>
        ))}
        {STANDARD_SIZES.filter((s) => !sizes.includes(s)).map((size) => (
          <button key={size} type="button" onClick={() => add(size)} className="h-9 border border-dashed border-ink/20 px-3 text-[13px] text-muted-foreground hover:border-ink hover:text-ink">+ {size}</button>
        ))}
        <form
          className="flex"
          onSubmit={(event) => {
            event.preventDefault();
            add(custom);
            setCustom("");
          }}
        >
          <Input aria-label="Custom size" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Other, e.g. 42" className="!h-9 !w-36 !py-1" />
        </form>
      </div>
      <p className="text-[12px] text-muted-foreground">Shown in this order. Removing a size removes its stock when you save.</p>
    </div>
  );
}
