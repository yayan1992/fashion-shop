import * as React from "react";
import { useDocumentTitle } from "@/lib/hooks";
import { useAdminData } from "../AdminApp";
import { api, describeError } from "../api";
import { RailPreview } from "../components/RailPreview";
import { garmentFor, mediaSrc } from "../garments";
import { Badge, Button, EmptyState, Notice, PageHeader, Panel, Select, useToast } from "../ui";
import { STATUS_LABEL } from "../format";

type Placement = { productId: string; colorwayId: string };
const key = (p: Placement) => `${p.productId}:${p.colorwayId}`;

export default function RailPage() {
  useDocumentTitle("Rail — Studio");
  const { data, refresh } = useAdminData();
  const toast = useToast();
  const [order, setOrder] = React.useState<Placement[]>(data.settings.rail.placements);
  const [saving, setSaving] = React.useState(false);
  const [dragging, setDragging] = React.useState<number | null>(null);
  const [adding, setAdding] = React.useState("");
  const dirty = JSON.stringify(order) !== JSON.stringify(data.settings.rail.placements);

  const entries = order.flatMap((placement) => {
    const product = data.products.find((p) => p.id === placement.productId);
    const colorway = product?.colorways.find((c) => c.id === placement.colorwayId);
    return product && colorway ? [{ placement, product, colorway }] : [];
  });
  const available = data.products.flatMap((product) =>
    product.status === "archived" ? [] : product.colorways.filter((c) => c.media.front && !order.some((p) => p.productId === product.id && p.colorwayId === c.id)).map((c) => ({ product, colorway: c })),
  );
  const garments = entries.map(({ product, colorway }) => garmentFor(data.media, `${product.id}:${colorway.id}`, product.name, colorway.swatch, colorway.media, new Intl.NumberFormat(data.settings.locale, { style: "currency", currency: data.settings.currency, maximumFractionDigits: 0 }).format(product.price / 100), product.summary));

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return;
    setOrder((current) => {
      const next = [...current];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item!);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.setRail(order);
      await refresh();
      toast("Rail saved. The store shows the new order.");
    } catch (error) {
      toast(describeError(error), "negative");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="The rail"
        description="The pieces hanging on the homepage, from left to right. Drag to reorder, or use the arrows. Six to ten pieces suit a desktop screen; on phones the rail becomes a swipeable carousel."
        actions={
          <>
            {dirty && <Button variant="ghost" onClick={() => setOrder(data.settings.rail.placements)}>Undo changes</Button>}
            <Button variant="primary" onClick={save} loading={saving} disabled={!dirty}>Save rail</Button>
          </>
        }
      />
      <div className="flex flex-col gap-6">
        <Panel title="Preview" description="Exactly how the rail will look and move. Drafts show here but stay hidden in the store until published.">
          {garments.length ? <RailPreview pieces={garments} neighbours={[]} height={320} /> : <EmptyState title="The rail is empty.">Add pieces below. Each needs a front photo.</EmptyState>}
        </Panel>

        <Panel title={`On the rail · ${entries.length}`}>
          <ol className="flex flex-col gap-2">
            {entries.map(({ placement, product, colorway }, i) => (
              <li
                key={key(placement)}
                draggable
                onDragStart={() => setDragging(i)}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (dragging !== null && dragging !== i) {
                    move(dragging, i);
                    setDragging(i);
                  }
                }}
                onDragEnd={() => setDragging(null)}
                className={`flex cursor-grab items-center gap-4 border bg-white/50 px-3 py-2 active:cursor-grabbing ${dragging === i ? "border-ink" : "border-ink/10"}`}
              >
                <span aria-hidden="true" className="select-none text-muted-foreground">⋮⋮</span>
                <span className="tabular w-6 text-[12px] text-muted-foreground">{i + 1}</span>
                <img src={mediaSrc(data.media, colorway.media.front)} alt="" className="h-12 w-8 object-contain object-top" />
                <span className="min-w-0 flex-1 truncate text-[14px]">
                  {product.name} <span className="text-muted-foreground">· {colorway.name}</span>
                </span>
                {product.status !== "active" && <Badge tone="muted">{STATUS_LABEL[product.status]}</Badge>}
                {!colorway.media.back && <span className="hidden text-[12px] text-muted-foreground sm:inline">front only</span>}
                <span className="flex items-center gap-1">
                  <Button variant="ghost" className="!h-8 !px-2" aria-label={`Move ${product.name} left`} onClick={() => move(i, i - 1)} disabled={i === 0}>←</Button>
                  <Button variant="ghost" className="!h-8 !px-2" aria-label={`Move ${product.name} right`} onClick={() => move(i, i + 1)} disabled={i === entries.length - 1}>→</Button>
                  <Button variant="ghost" className="!h-8 !px-2" aria-label={`Take ${product.name} off the rail`} onClick={() => setOrder((current) => current.filter((p) => key(p) !== key(placement)))}>Remove</Button>
                </span>
              </li>
            ))}
          </ol>
          {entries.length > 12 && <div className="mt-4"><Notice tone="attention">More than twelve pieces can look crowded on smaller laptops.</Notice></div>}
          <div className="mt-6 flex flex-col gap-2 border-t border-ink/10 pt-5 sm:flex-row sm:items-end">
            <label className="flex flex-1 flex-col gap-1.5 text-[13px] font-medium">
              Add a piece
              <Select value={adding} onChange={(e) => setAdding(e.target.value)}>
                <option value="">Choose a product and colour…</option>
                {available.map(({ product, colorway }) => (
                  <option key={`${product.id}:${colorway.id}`} value={`${product.id}:${colorway.id}`}>
                    {product.name} · {colorway.name}{product.status !== "active" ? ` (${STATUS_LABEL[product.status]})` : ""}
                  </option>
                ))}
              </Select>
            </label>
            <Button
              disabled={!adding || order.length >= 24}
              onClick={() => {
                const [productId, colorwayId] = adding.split(":");
                setOrder((current) => [...current, { productId: productId!, colorwayId: colorwayId! }]);
                setAdding("");
              }}
            >
              Add to the end
            </Button>
          </div>
          {available.length === 0 && <p className="mt-2 text-[12px] text-muted-foreground">Every product with a front photo is already on the rail.</p>}
        </Panel>
      </div>
    </>
  );
}
