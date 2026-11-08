import * as React from "react";
import { useParams } from "react-router";
import { useDocumentTitle } from "@/lib/hooks";
import { useAdminData } from "../AdminApp";
import { api, describeError, type OrderDetail, type OrderStatus, type PaymentStatus } from "../api";
import { Badge, Button, Notice, PageHeader, Panel, Skeleton, Textarea, useConfirm, useToast } from "../ui";
import { STATUS_LABEL, STATUS_TONE, formatDate, money } from "../format";
import { ADMIN_BASE } from "@/admin/paths";

// The next steps an order can take; the database enforces the same rules.
const NEXT: Record<OrderStatus, { status: OrderStatus; label: string }[]> = {
  pending: [{ status: "confirmed", label: "Confirm order" }],
  confirmed: [{ status: "shipped", label: "Mark as shipped" }],
  shipped: [{ status: "delivered", label: "Mark as delivered" }],
  delivered: [],
  cancelled: [],
};

const EVENT_TEXT: Record<string, string> = {
  pending: "Order placed",
  confirmed: "Confirmed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled; stock returned",
  paid: "Marked as paid",
  refunded: "Marked as refunded",
};

export default function OrderPage() {
  const { reference = "" } = useParams();
  useDocumentTitle(`${reference} — Studio`);
  const { data, refresh } = useAdminData();
  const toast = useToast();
  const confirm = useConfirm();
  const [order, setOrder] = React.useState<OrderDetail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [note, setNote] = React.useState("");

  React.useEffect(() => {
    api.order(reference).then(setOrder, (e) => setError(describeError(e)));
  }, [reference]);

  if (error) return <PageHeader title="Order not found" description={error} back={{ to: `${ADMIN_BASE}/orders`, label: "Orders" }} />;
  if (!order) return <Skeleton className="h-96 w-full" />;

  const fmt = (minor: number) => money(minor, order.currency, data.settings.locale);
  const pieces = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const cancellable = order.status === "pending" || order.status === "confirmed";

  const update = async (key: string, change: { status?: OrderStatus; paymentStatus?: PaymentStatus; note?: string }, message: string) => {
    setBusy(key);
    try {
      setOrder(await api.updateOrder(order.reference, change));
      toast(message);
      if (change.status === "cancelled") void refresh();
    } catch (e) {
      toast(describeError(e), "negative");
    } finally {
      setBusy(null);
    }
  };

  const address = order.address;

  return (
    <>
      <PageHeader
        back={{ to: `${ADMIN_BASE}/orders`, label: "Orders" }}
        title={<span className="tabular">{order.reference}</span>}
        description={`Placed ${formatDate(order.createdAt, data.settings.locale)} · ${pieces} ${pieces === 1 ? "piece" : "pieces"} · ${fmt(order.total)}`}
        actions={
          <>
            {cancellable && (
              <Button variant="danger" loading={busy === "cancel"} onClick={async () => {
                const ok = await confirm({ title: `Cancel ${order.reference}?`, body: `The order is closed and its ${pieces} ${pieces === 1 ? "piece returns" : "pieces return"} to stock. This can’t be undone.${order.paymentStatus === "paid" ? " It has been paid: refund the customer, then mark it refunded." : ""}`, confirm: "Cancel order", danger: true });
                if (ok) await update("cancel", { status: "cancelled" }, "Order cancelled. Stock has been returned.");
              }}>Cancel order</Button>
            )}
            {order.paymentStatus === "unpaid" && order.status !== "cancelled" && <Button loading={busy === "paid"} onClick={() => update("paid", { paymentStatus: "paid" }, "Marked as paid.")}>Mark as paid</Button>}
            {order.paymentStatus === "paid" && order.status === "cancelled" && <Button loading={busy === "refunded"} onClick={() => update("refunded", { paymentStatus: "refunded" }, "Marked as refunded.")}>Mark as refunded</Button>}
            {NEXT[order.status].map((next) => (
              <Button key={next.status} variant="primary" loading={busy === next.status} onClick={() => update(next.status, { status: next.status }, `${STATUS_LABEL[next.status]}.`)}>{next.label}</Button>
            ))}
          </>
        }
      />
      <div className="mb-6 flex flex-wrap gap-2">
        <Badge tone={STATUS_TONE[order.status]}>{STATUS_LABEL[order.status]}</Badge>
        <Badge tone={STATUS_TONE[order.paymentStatus]}>{STATUS_LABEL[order.paymentStatus]} · {order.paymentMethodLabel}</Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-6">
          <Panel title="Items">
            <ul className="-my-2 divide-y divide-ink/[0.07]">
              {order.items.map((item) => (
                <li key={item.sku} className="flex items-center gap-4 py-3 text-[14px]">
                  <span className="block h-14 w-10 shrink-0 bg-bone">{item.imageSrc && <img src={item.imageSrc} alt="" className="size-full object-contain object-top" />}</span>
                  <span className="flex-1">
                    {item.name}
                    <span className="block text-[12px] text-muted-foreground">{item.colorway} · {item.size} · <span className="tabular">{item.sku}</span></span>
                  </span>
                  <span className="tabular text-muted-foreground">{item.quantity} × {fmt(item.unitPrice)}</span>
                  <span className="tabular w-24 text-right">{fmt(item.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <dl className="ml-auto mt-4 flex max-w-xs flex-col gap-1.5 border-t border-ink/10 pt-4 text-[14px]">
              <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="tabular">{fmt(order.subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Shipping</dt><dd className="tabular">{order.shipping ? fmt(order.shipping) : "Included"}</dd></div>
              <div className="flex justify-between text-[15px] font-medium"><dt>Total</dt><dd className="tabular">{fmt(order.total)}</dd></div>
            </dl>
            <p className="mt-4 text-[12px] text-muted-foreground">Prices and names are as they were when the order was placed.</p>
          </Panel>

          <Panel title="History">
            <ol className="flex flex-col gap-3 text-[13px]">
              {order.events.map((event, i) => (
                <li key={i} className="grid grid-cols-[120px_1fr] gap-3">
                  <span className="text-muted-foreground">{formatDate(event.createdAt, data.settings.locale)}</span>
                  <span>{event.kind === "note" ? <span className="whitespace-pre-line">Note: {event.note}</span> : EVENT_TEXT[event.to ?? ""] ?? event.to}</span>
                </li>
              ))}
            </ol>
            <div className="mt-5 flex flex-col gap-2 border-t border-ink/10 pt-4">
              <Textarea aria-label="Add an internal note" rows={2} placeholder="Add an internal note (not shown to the customer)" value={note} onChange={(e) => setNote(e.target.value)} />
              <Button className="self-end" disabled={!note.trim()} loading={busy === "note"} onClick={async () => { await update("note", { note }, "Note added."); setNote(""); }}>Add note</Button>
            </div>
          </Panel>
        </div>

        <div className="flex flex-col gap-6">
          <Panel title="Customer">
            <div className="flex flex-col gap-1 text-[14px]">
              <p className="font-medium">{order.name}</p>
              <a href={`mailto:${order.email}`} className="underline-offset-4 hover:underline">{order.email}</a>
              <a href={`tel:${order.phone}`} className="text-muted-foreground">{order.phone}</a>
            </div>
          </Panel>
          <Panel title="Delivery address">
            <address className="text-[14px] not-italic leading-relaxed">
              {address.line1}<br />
              {address.line2 && <>{address.line2}<br /></>}
              {address.city}{address.region ? `, ${address.region}` : ""} {address.postalCode}<br />
              {address.country}
            </address>
            {order.notes && <div className="mt-4"><Notice>Customer note: {order.notes}</Notice></div>}
          </Panel>
          <Panel title="Payment">
            <p className="text-[14px]">{order.paymentMethodLabel} · <span className="text-muted-foreground">{STATUS_LABEL[order.paymentStatus]}</span></p>
            <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">STILLFORM doesn’t take card payments. Mark the order as paid once you have received the money.</p>
          </Panel>
        </div>
      </div>
    </>
  );
}
