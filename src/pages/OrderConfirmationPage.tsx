import { Link, useLocation, useParams } from "react-router";
import { useCatalog } from "@/catalog/CatalogProvider";
import { recallOrder, type PlacedOrder } from "@/checkout/checkout";
import { useDocumentTitle } from "@/lib/hooks";

export default function OrderConfirmationPage() {
  const catalog = useCatalog();
  const { reference = "" } = useParams();
  const { state } = useLocation();
  const order = ((state as PlacedOrder | null)?.reference === reference ? (state as PlacedOrder) : null) ?? recallOrder(reference);
  useDocumentTitle(`Order ${reference} — ${catalog.settings.name}`);
  const money = (minor: number) => new Intl.NumberFormat(catalog.settings.locale, { style: "currency", currency: order?.currency ?? catalog.settings.currency, minimumFractionDigits: minor % 100 === 0 ? 0 : 2 }).format(minor / 100);

  return (
    <div className="mx-auto max-w-[880px] px-4 pb-28 pt-32 sm:px-6 md:pt-40">
      <p className="label text-muted-foreground">Order received</p>
      <h1 className="type-wide mt-4 text-[clamp(2.25rem,5vw,4rem)] font-extralight leading-[1.02] tracking-[-0.02em]">Thank you.</h1>
      <p className="mt-6 text-[17px]">
        Your order reference is <strong className="tabular font-medium">{reference}</strong>. Keep it for any questions about your order.
      </p>

      {order ? (
        <>
          <div className="mt-12 grid gap-8 border-t border-border pt-8 sm:grid-cols-2">
            <div>
              <p className="label mb-3 text-muted-foreground">Payment</p>
              <p className="text-[15px] font-medium">{order.paymentMethod} · not yet paid</p>
              {order.paymentInstructions && <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{order.paymentInstructions}</p>}
            </div>
            <div>
              <p className="label mb-3 text-muted-foreground">What happens next</p>
              <p className="text-[14px] leading-relaxed text-muted-foreground">The studio will confirm your order and prepare it for dispatch. Questions? Write to {catalog.settings.contact?.email ? <a className="underline underline-offset-2" href={`mailto:${catalog.settings.contact.email}`}>{catalog.settings.contact.email}</a> : "the studio"} with your reference.</p>
            </div>
          </div>
          <ul className="mt-10 divide-y divide-border border-y border-border">
            {order.items.map((item) => (
              <li key={`${item.name}-${item.colorway}-${item.size}`} className="flex items-center gap-4 py-4 text-[14px]">
                {item.imageSrc && <img src={item.imageSrc} alt="" className="aspect-[4/5] w-14 shrink-0 bg-bone object-contain object-top p-1" />}
                <div className="flex-1">
                  <p className="font-medium">{item.name}</p>
                  <p className="text-[13px] text-muted-foreground">{item.colorway} · {item.size} · × {item.quantity}</p>
                </div>
                <p className="tabular font-light">{money(item.lineTotal)}</p>
              </li>
            ))}
          </ul>
          <dl className="ml-auto mt-6 flex max-w-xs flex-col gap-2 text-[14px]">
            <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="tabular">{money(order.subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Shipping</dt><dd className="tabular">{order.shipping === 0 ? "Included" : money(order.shipping)}</dd></div>
            <div className="flex justify-between border-t border-border pt-2 text-[16px]"><dt>Total</dt><dd className="tabular">{money(order.total)}</dd></div>
          </dl>
        </>
      ) : (
        <p className="mt-8 text-[15px] leading-relaxed text-muted-foreground">Your order has been recorded. The full summary was shown when you placed it; contact the studio with your reference if you need a copy.</p>
      )}

      <Link to="/shop" className="label link-draw mt-14 inline-block py-1">Continue browsing</Link>
    </div>
  );
}
