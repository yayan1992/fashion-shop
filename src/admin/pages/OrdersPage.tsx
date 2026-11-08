import * as React from "react";
import { Link, useSearchParams } from "react-router";
import { useDocumentTitle } from "@/lib/hooks";
import { useAdminData } from "../AdminApp";
import { api, describeError, type OrderSummary } from "../api";
import { Badge, Button, EmptyState, Input, Notice, PageHeader, Skeleton } from "../ui";
import { STATUS_LABEL, STATUS_TONE, formatDate, money } from "../format";
import { ADMIN_BASE } from "@/admin/paths";

const TABS = [
  { value: null, label: "All" },
  { value: "pending", label: "New" },
  { value: "confirmed", label: "Confirmed" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
] as const;
const PAGE = 25;

export default function OrdersPage() {
  useDocumentTitle("Orders — Studio");
  const { data } = useAdminData();
  const [params, setParams] = useSearchParams();
  const status = params.get("status");
  const [query, setQuery] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(0);
  const [result, setResult] = React.useState<{ total: number; orders: OrderSummary[] } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const timer = window.setTimeout(() => setSearch(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  React.useEffect(() => {
    let cancelled = false;
    api.orders(search || null, status, PAGE, page * PAGE).then(
      (next) => !cancelled && (setResult(next), setError(null)),
      (e) => !cancelled && setError(describeError(e)),
    );
    return () => {
      cancelled = true;
    };
  }, [search, status, page]);

  const fmt = (o: OrderSummary) => money(o.total, o.currency, data.settings.locale);

  return (
    <>
      <PageHeader title="Orders" description="Every order placed through checkout. Open one to confirm, ship or cancel it." />
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-1">
          {TABS.map((tab) => (
            <button key={tab.label} type="button" aria-pressed={status === tab.value} onClick={() => { setPage(0); setParams(tab.value ? { status: tab.value } : {}, { replace: true }); }} className={`h-9 px-3 text-[13px] ${status === tab.value ? "bg-ink text-chalk" : "text-ink/70 hover:bg-ink/5"}`}>
              {tab.label}
            </button>
          ))}
        </div>
        <Input type="search" aria-label="Search orders" placeholder="Reference, name or email" value={query} onChange={(e) => { setPage(0); setQuery(e.target.value); }} className="lg:max-w-xs" />
      </div>
      {error && <Notice tone="negative">{error}</Notice>}
      {!result ? (
        <Skeleton className="h-64 w-full" />
      ) : result.orders.length === 0 ? (
        <EmptyState title={search || status ? "No orders match." : "No orders yet."}>{search || status ? "Try another search or status." : "Orders appear here as soon as customers check out."}</EmptyState>
      ) : (
        <>
          <div className="overflow-x-auto border border-ink/10 bg-chalk">
            <table className="w-full min-w-[720px] text-left text-[13px]">
              <thead className="border-b border-ink/10 text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-normal">Order</th>
                  <th className="px-3 py-3 font-normal">Placed</th>
                  <th className="px-3 py-3 font-normal">Customer</th>
                  <th className="px-3 py-3 font-normal">Status</th>
                  <th className="px-3 py-3 font-normal">Payment</th>
                  <th className="px-5 py-3 text-right font-normal">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/[0.07]">
                {result.orders.map((order) => (
                  <tr key={order.id} className="hover:bg-ink/[0.025]">
                    <td className="px-5 py-3"><Link to={`${ADMIN_BASE}/orders/${order.reference}`} className="tabular font-medium underline-offset-4 hover:underline">{order.reference}</Link></td>
                    <td className="px-3 py-3 text-muted-foreground">{formatDate(order.createdAt, data.settings.locale)}</td>
                    <td className="px-3 py-3">{order.name}<span className="block text-[12px] text-muted-foreground">{order.itemCount} {order.itemCount === 1 ? "piece" : "pieces"} · {order.paymentMethodLabel}</span></td>
                    <td className="px-3 py-3"><Badge tone={STATUS_TONE[order.status]}>{STATUS_LABEL[order.status]}</Badge></td>
                    <td className="px-3 py-3"><Badge tone={STATUS_TONE[order.paymentStatus]}>{STATUS_LABEL[order.paymentStatus]}</Badge></td>
                    <td className="tabular px-5 py-3 text-right">{fmt(order)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between text-[13px] text-muted-foreground">
            <span>{result.total} {result.total === 1 ? "order" : "orders"}</span>
            {result.total > PAGE && (
              <span className="flex gap-2">
                <Button variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>Newer</Button>
                <Button variant="ghost" disabled={(page + 1) * PAGE >= result.total} onClick={() => setPage(page + 1)}>Older</Button>
              </span>
            )}
          </div>
        </>
      )}
    </>
  );
}
