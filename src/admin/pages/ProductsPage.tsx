import * as React from "react";
import { Link, useSearchParams } from "react-router";
import { useDocumentTitle } from "@/lib/hooks";
import { useAdminData } from "../AdminApp";
import { mediaSrc, totalStock } from "../garments";
import { Badge, ButtonLink, EmptyState, Input, PageHeader } from "../ui";
import { STATUS_LABEL, STATUS_TONE, money } from "../format";
import { ADMIN_BASE } from "@/admin/paths";

const FILTERS = [
  { value: null, label: "All" },
  { value: "active", label: "Live" },
  { value: "draft", label: "Drafts" },
  { value: "archived", label: "Archived" },
] as const;

export default function ProductsPage() {
  useDocumentTitle("Products — Studio");
  const { data } = useAdminData();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = React.useState("");
  const status = params.get("status");
  const onRail = new Set(data.settings.rail.placements.map((p) => p.productId));
  const categories = new Map(data.categories.map((c) => [c.id, c.label]));
  const products = data.products
    .filter((p) => !status || p.status === status)
    .filter((p) => !query.trim() || `${p.name} ${p.slug} ${categories.get(p.category) ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <>
      <PageHeader title="Products" description="Everything in the store. Live pieces are visible to customers; drafts are only visible here." actions={<ButtonLink to={`${ADMIN_BASE}/products/new`} variant="primary">Add a product</ButtonLink>} />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-1">
          {FILTERS.map((filter) => {
            const count = data.products.filter((p) => !filter.value || p.status === filter.value).length;
            const selected = status === filter.value;
            return (
              <button key={filter.label} type="button" aria-pressed={selected} onClick={() => setParams(filter.value ? { status: filter.value } : {}, { replace: true })} className={`h-9 px-3 text-[13px] ${selected ? "bg-ink text-chalk" : "text-ink/70 hover:bg-ink/5"}`}>
                {filter.label} <span className="tabular opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
        <Input type="search" aria-label="Search products" placeholder="Search by name or category" value={query} onChange={(e) => setQuery(e.target.value)} className="sm:max-w-xs" />
      </div>

      {data.products.length === 0 ? (
        <EmptyState title="No products yet." action={<ButtonLink to={`${ADMIN_BASE}/products/new`} variant="primary">Add your first product</ButtonLink>}>
          Start with one piece: a name, a price, sizes and a front photo are all it takes.
        </EmptyState>
      ) : products.length === 0 ? (
        <EmptyState title="Nothing matches.">Try a different search or status.</EmptyState>
      ) : (
        <div className="border border-ink/10 bg-chalk">
          <ul className="divide-y divide-ink/[0.07]">
            {products.map((product) => {
              const stock = totalStock(product);
              const low = product.variants.some((v) => v.stock <= data.settings.lowStockThreshold);
              const thumb = mediaSrc(data.media, product.colorways[0]?.media.front);
              return (
                <li key={product.id}>
                  <Link to={`${ADMIN_BASE}/products/${product.id}`} className="grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-4 px-4 py-3 transition-colors hover:bg-ink/[0.025] md:grid-cols-[48px_minmax(0,2fr)_110px_100px_120px_70px] md:px-5">
                    <span className="block aspect-[200/310] w-12 bg-bone">{thumb && <img src={thumb} alt="" className="size-full object-contain object-top" loading="lazy" />}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-medium">{product.name}</span>
                      <span className="block truncate text-[12px] text-muted-foreground">
                        {categories.get(product.category)} · {product.colorways.length} {product.colorways.length === 1 ? "colour" : "colours"}
                      </span>
                    </span>
                    <span className="justify-self-end md:justify-self-start"><Badge tone={STATUS_TONE[product.status]}>{STATUS_LABEL[product.status]}</Badge></span>
                    <span className="tabular hidden text-[14px] md:block">{money(product.price, data.settings.currency, data.settings.locale)}</span>
                    <span className="hidden text-[13px] md:block">
                      <span className="tabular">{stock}</span> in stock {low && <span className="ml-1 text-[#8a4433]">· low</span>}
                    </span>
                    <span className="hidden text-[12px] text-muted-foreground md:block">{onRail.has(product.id) ? "On rail" : ""}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}
