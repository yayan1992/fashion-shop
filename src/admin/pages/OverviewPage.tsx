import * as React from "react";
import { Link } from "react-router";
import { useDocumentTitle } from "@/lib/hooks";
import { useAdminData } from "../AdminApp";
import { api, describeError, type Overview } from "../api";
import { Badge, ButtonLink, EmptyState, Notice, PageHeader, Panel, Skeleton } from "../ui";
import { STATUS_LABEL, STATUS_TONE, formatDate, money } from "../format";
import { ADMIN_BASE } from "@/admin/paths";

export default function OverviewPage() {
  useDocumentTitle("Overview — Studio");
  const { data } = useAdminData();
  const [overview, setOverview] = React.useState<Overview | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    api.overview().then(setOverview, (e) => setError(describeError(e)));
  }, [data]);
  const fmt = (minor: number) => money(minor, data.settings.currency, data.settings.locale);

  return (
    <>
      <PageHeader title={`Good ${greeting()}.`} description={`${data.settings.name} at a glance: the last 30 days of orders, and what needs your attention.`} actions={<ButtonLink to={`${ADMIN_BASE}/products/new`} variant="primary">Add a product</ButtonLink>} />
      {error && <Notice tone="negative">{error}</Notice>}
      {overview && !overview.checkoutEnabled && (
        <div className="mb-6">
          <Notice tone="attention">
            Checkout is closed, so customers can browse but not order. <Link to={`${ADMIN_BASE}/settings#checkout`} className="underline underline-offset-2">Open checkout in Settings</Link> once your payment method is set up.
          </Notice>
        </div>
      )}
      <div className="grid grid-cols-2 gap-px border border-ink/10 bg-ink/10 lg:grid-cols-4">
        {[
          ["Sales, 30 days", overview ? fmt(overview.revenue30) : null, "Excludes cancelled orders"],
          ["Orders, 30 days", overview?.orders30, null],
          ["Awaiting you", overview?.awaiting, "New or confirmed, not yet shipped"],
          ["Live products", overview ? `${overview.products.active}` : null, overview ? `${overview.products.draft} in draft` : null],
        ].map(([label, value, note]) => (
          <div key={label as string} className="flex flex-col gap-2 bg-chalk px-5 py-5">
            <p className="text-[12px] text-muted-foreground">{label}</p>
            {value === null || value === undefined ? <Skeleton className="h-8 w-24" /> : <p className="type-wide tabular text-[1.75rem] font-extralight leading-none">{value}</p>}
            {note && <p className="text-[12px] text-muted-foreground">{note}</p>}
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel title="Recent orders" actions={<Link to={`${ADMIN_BASE}/orders`} className="text-[13px] text-muted-foreground hover:text-ink">All orders →</Link>}>
          {!overview ? (
            <Skeleton className="h-32 w-full" />
          ) : overview.recent.length === 0 ? (
            <EmptyState title="No orders yet.">When a customer checks out, their order appears here.</EmptyState>
          ) : (
            <ul className="-my-2 divide-y divide-ink/[0.07]">
              {overview.recent.map((order) => (
                <li key={order.id}>
                  <Link to={`${ADMIN_BASE}/orders/${order.reference}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3 hover:opacity-80 sm:grid-cols-[110px_minmax(0,1fr)_auto_auto]">
                    <span className="tabular text-[13px] font-medium">{order.reference}</span>
                    <span className="hidden truncate text-[13px] text-muted-foreground sm:block">{order.name} · {formatDate(order.createdAt, data.settings.locale)}</span>
                    <Badge tone={STATUS_TONE[order.status]}>{STATUS_LABEL[order.status]}</Badge>
                    <span className="tabular text-right text-[13px]">{fmt(order.total)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Low stock" description={`Sizes with ${data.settings.lowStockThreshold} or fewer left.`}>
          {!overview ? (
            <Skeleton className="h-32 w-full" />
          ) : overview.lowStock.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">Everything is well stocked.</p>
          ) : (
            <ul className="-my-1 flex max-h-80 flex-col divide-y divide-ink/[0.07] overflow-y-auto">
              {overview.lowStock.map((v) => (
                <li key={v.sku}>
                  <Link to={`${ADMIN_BASE}/products/${v.productId}`} className="flex items-center justify-between gap-3 py-2 text-[13px] hover:opacity-80">
                    <span className="min-w-0 truncate">{v.product} <span className="text-muted-foreground">· {v.colorway} · {v.size}</span></span>
                    <span className={`tabular shrink-0 ${v.stock === 0 ? "text-[#8a2f22]" : "text-[#8a4433]"}`}>{v.stock === 0 ? "Sold out" : `${v.stock} left`}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
}
