import * as React from "react";
import type { Collection } from "@/catalog/types";
import { useDocumentTitle } from "@/lib/hooks";
import { useAdminData } from "../AdminApp";
import { api, describeError } from "../api";
import { mediaSrc, slugify } from "../garments";
import { Badge, Button, Field, Input, PageHeader, Panel, Select, Textarea, Toggle, useConfirm, useToast } from "../ui";
import { STATUS_LABEL } from "../format";

/** An ordered list of products with add, remove and reorder. */
function ProductList({ ids, onChange, emptyText }: { ids: string[]; onChange: (ids: string[]) => void; emptyText: string }) {
  const { data } = useAdminData();
  const [adding, setAdding] = React.useState("");
  const move = (i: number, by: number) => {
    const next = [...ids];
    const [item] = next.splice(i, 1);
    next.splice(i + by, 0, item!);
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-3">
      {ids.length === 0 && <p className="text-[13px] text-muted-foreground">{emptyText}</p>}
      <ol className="flex flex-col gap-1.5">
        {ids.map((id, i) => {
          const product = data.products.find((p) => p.id === id);
          if (!product) return null;
          return (
            <li key={id} className="flex items-center gap-3 border border-ink/10 bg-white/50 px-3 py-1.5 text-[13px]">
              <span className="tabular w-5 text-muted-foreground">{i + 1}</span>
              <img src={mediaSrc(data.media, product.colorways[0]?.media.front)} alt="" className="h-10 w-7 object-contain object-top" />
              <span className="flex-1">{product.name}</span>
              {product.status !== "active" && <Badge tone="muted">{STATUS_LABEL[product.status]}</Badge>}
              <Button variant="ghost" className="!h-8 !px-2" aria-label={`Move ${product.name} up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</Button>
              <Button variant="ghost" className="!h-8 !px-2" aria-label={`Move ${product.name} down`} disabled={i === ids.length - 1} onClick={() => move(i, 1)}>↓</Button>
              <Button variant="ghost" className="!h-8 !px-2" onClick={() => onChange(ids.filter((x) => x !== id))}>Remove</Button>
            </li>
          );
        })}
      </ol>
      <div className="flex gap-2">
        <Select aria-label="Add a product" value={adding} onChange={(e) => setAdding(e.target.value)}>
          <option value="">Add a product…</option>
          {data.products.filter((p) => !ids.includes(p.id) && p.status !== "archived").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <Button disabled={!adding} onClick={() => { onChange([...ids, adding]); setAdding(""); }}>Add</Button>
      </div>
    </div>
  );
}

export default function CollectionsPage() {
  useDocumentTitle("Collections — Studio");
  const { data, refresh } = useAdminData();
  const toast = useToast();
  const confirm = useConfirm();
  const [featured, setFeatured] = React.useState(data.settings.home.featuredProductIds);
  const [savingFeatured, setSavingFeatured] = React.useState(false);
  const [editing, setEditing] = React.useState<(Collection & { isNew?: boolean }) | null>(null);
  const [saving, setSaving] = React.useState(false);

  const saveFeatured = async () => {
    setSavingFeatured(true);
    try {
      await api.setFeatured(featured);
      await refresh();
      toast("Homepage selection saved.");
    } catch (error) {
      toast(describeError(error), "negative");
    } finally {
      setSavingFeatured(false);
    }
  };

  const saveCollection = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await api.saveCollection({ ...editing, slug: editing.slug || slugify(editing.title) });
      await refresh();
      setEditing(null);
      toast("Collection saved.");
    } catch (error) {
      toast(describeError(error), "negative");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title="Collections" description="Group pieces into collections, and choose which pieces lead the homepage." actions={<Button variant="primary" onClick={() => setEditing({ id: "", slug: "", title: "", season: "", summary: "", productIds: [], published: true, isNew: true })}>New collection</Button>} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title="Homepage selection"
          description="The pieces in the collection grid under the rail. The first is shown largest."
          actions={<Button variant="primary" onClick={saveFeatured} loading={savingFeatured} disabled={JSON.stringify(featured) === JSON.stringify(data.settings.home.featuredProductIds)}>Save</Button>}
        >
          <ProductList ids={featured} onChange={setFeatured} emptyText="No pieces selected; the homepage grid is hidden." />
        </Panel>

        <div className="flex flex-col gap-6">
          {data.collections.map((collection) => (
            <Panel
              key={collection.id}
              title={<span className="flex items-center gap-2">{collection.title} {!collection.published && <Badge tone="muted">Hidden</Badge>}</span>}
              description={`${collection.season ? `${collection.season} · ` : ""}${collection.productIds.length} pieces${data.settings.home.featuredCollectionId === collection.id ? " · shown on the homepage" : ""}`}
              actions={<Button onClick={() => setEditing({ ...collection, published: collection.published ?? true })}>Edit</Button>}
            >
              <div className="flex flex-wrap gap-2">
                {collection.productIds.map((id) => {
                  const product = data.products.find((p) => p.id === id);
                  const src = mediaSrc(data.media, product?.colorways[0]?.media.front);
                  return src ? <img key={id} src={src} alt={product?.name} title={product?.name} className="h-16 w-11 bg-bone object-contain object-top" /> : null;
                })}
              </div>
            </Panel>
          ))}
        </div>
      </div>

      {editing && (
        <Panel
          className="mt-6"
          title={editing.isNew ? "New collection" : `Edit ${editing.title}`}
          actions={
            <div className="flex gap-2">
              {!editing.isNew && (
                <Button variant="ghost" onClick={async () => {
                  if (!(await confirm({ title: `Delete ${editing.title}?`, body: "The pieces stay in the store; only the grouping is removed.", confirm: "Delete collection", danger: true }))) return;
                  try {
                    await api.deleteCollection(editing.id);
                    await refresh();
                    setEditing(null);
                    toast("Collection deleted.");
                  } catch (error) {
                    toast(describeError(error), "negative");
                  }
                }}>Delete</Button>
              )}
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              <Button variant="primary" onClick={saveCollection} loading={saving} disabled={!editing.title.trim()}>Save collection</Button>
            </div>
          }
        >
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Title" htmlFor="c-title"><Input id="c-title" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></Field>
            <Field label="Season" htmlFor="c-season" optional><Input id="c-season" value={editing.season} placeholder="Autumn–Winter 2026" onChange={(e) => setEditing({ ...editing, season: e.target.value })} /></Field>
            <div className="md:col-span-2"><Field label="Summary" htmlFor="c-summary" optional><Textarea id="c-summary" value={editing.summary} onChange={(e) => setEditing({ ...editing, summary: e.target.value })} /></Field></div>
            <Toggle checked={editing.published ?? true} onChange={(on) => setEditing({ ...editing, published: on })} label="Visible in the store" />
          </div>
          <div className="mt-6">
            <p className="mb-3 text-[13px] font-medium">Pieces, in order</p>
            <ProductList ids={editing.productIds} onChange={(ids) => setEditing({ ...editing, productIds: ids })} emptyText="No pieces yet." />
          </div>
        </Panel>
      )}
    </>
  );
}
