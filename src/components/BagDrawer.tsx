import * as React from "react";
import { Link } from "react-router";
import { bagSubtotal } from "@/bag/bag";
import { useBag } from "@/bag/BagProvider";
import { useCatalogState } from "@/catalog/CatalogProvider";
import { colorwayOf, formatPrice, productPath, variantBySku } from "@/catalog/selectors";
import { checkoutAvailability, shippingFor } from "@/checkout/checkout";
import { useFocusTrap, useScrollLock } from "@/lib/hooks";
import { GarmentImage } from "./GarmentImage";

export function BagDrawer() {
  const { catalog, source } = useCatalogState();
  const bag = useBag();
  const panelRef = React.useRef<HTMLDivElement>(null);
  const close = () => bag.setOpen(false);
  useScrollLock(bag.isOpen);
  useFocusTrap(panelRef, bag.isOpen, close);

  const subtotal = bagSubtotal(catalog, bag.lines);
  const checkout = checkoutAvailability(catalog, source);
  const shipping = shippingFor(catalog, subtotal);

  return (
    <div className={`fixed inset-0 z-[60] ${bag.isOpen ? "visible" : "invisible delay-500"} transition-[visibility]`} inert={!bag.isOpen}>
      <div aria-hidden="true" onClick={close} className={`absolute inset-0 bg-ink/25 backdrop-blur-[2px] transition-opacity duration-500 motion-reduce:transition-none ${bag.isOpen ? "opacity-100" : "opacity-0"}`} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bag-title"
        className={`absolute inset-y-0 right-0 flex w-full max-w-[440px] flex-col bg-background shadow-[-30px_0_60px_-30px_rgb(18_17_16/0.25)] transition-transform duration-500 ease-(--ease-settle) motion-reduce:transition-none ${bag.isOpen ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-6">
          <h2 id="bag-title" className="label">
            Bag <span className="tabular ml-1 text-muted-foreground">{bag.count}</span>
          </h2>
          <button type="button" className="label link-draw py-1" onClick={close} data-autofocus>
            Close
          </button>
        </div>

        {bag.lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-start justify-center gap-6 px-6">
            <p className="type-wide text-2xl font-extralight">Your bag is empty.</p>
            <Link to="/shop" onClick={close} className="label link-draw py-1">
              Browse all pieces
            </Link>
          </div>
        ) : (
          <>
            <ul className="flex-1 divide-y divide-border overflow-y-auto px-6">
              {bag.lines.map((line) => {
                const found = variantBySku(catalog, line.sku);
                if (!found) return null;
                const { product, variant } = found;
                const colorway = colorwayOf(product, variant.colorwayId);
                return (
                  <li key={line.sku} className="flex gap-4 py-5">
                    <Link to={productPath(product, colorway.id)} onClick={close} className="tone-bone relative block aspect-[4/5] w-20 shrink-0 overflow-hidden" tabIndex={-1} aria-hidden="true">
                      <GarmentImage mediaId={colorway.media.front} decorative className="absolute inset-x-0 bottom-[4%] top-[6%] size-full" />
                    </Link>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex items-baseline justify-between gap-3">
                        <Link to={productPath(product, colorway.id)} onClick={close} className="link-draw text-[14px] font-medium">
                          {product.name}
                        </Link>
                        <span className="tabular text-[14px] font-light">{formatPrice(catalog, product.price * line.quantity)}</span>
                      </div>
                      <p className="mt-1 text-[13px] text-muted-foreground">
                        {colorway.name} · {variant.size}
                      </p>
                      <div className="mt-auto flex items-center justify-between pt-3">
                        <div className="flex items-center border border-border" role="group" aria-label={`Quantity of ${product.name}`}>
                          <button type="button" className="grid size-8 place-items-center text-muted-foreground hover:text-foreground" aria-label="Decrease quantity" onClick={() => bag.dispatch({ type: "set", sku: line.sku, quantity: line.quantity - 1 })}>
                            −
                          </button>
                          <span className="tabular w-7 text-center text-[13px]" aria-live="polite">
                            {line.quantity}
                          </span>
                          <button
                            type="button"
                            className="grid size-8 place-items-center text-muted-foreground hover:text-foreground disabled:opacity-30"
                            aria-label="Increase quantity"
                            disabled={line.quantity >= variant.stock}
                            onClick={() => bag.dispatch({ type: "set", sku: line.sku, quantity: line.quantity + 1 })}
                          >
                            +
                          </button>
                        </div>
                        <button type="button" className="text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" onClick={() => bag.dispatch({ type: "remove", sku: line.sku })}>
                          Remove
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="shrink-0 border-t border-border px-6 pb-6 pt-5">
              <div className="flex items-baseline justify-between">
                <span className="label">Subtotal</span>
                <span className="tabular text-lg font-light">{formatPrice(catalog, subtotal)}</span>
              </div>
              <p className="mt-1 text-[13px] text-muted-foreground">{shipping === 0 ? "Shipping is included." : `Shipping ${formatPrice(catalog, shipping)}, added at checkout.`}</p>
              {checkout.open ? (
                <Link to="/checkout" onClick={close} className="mt-5 flex h-13 w-full items-center justify-center bg-foreground text-[13px] font-medium tracking-[0.06em] text-background transition-opacity hover:opacity-90">
                  Checkout
                </Link>
              ) : (
                <>
                  <button type="button" disabled aria-describedby="checkout-note" className="mt-5 flex h-13 w-full cursor-not-allowed items-center justify-center bg-foreground text-[13px] font-medium tracking-[0.06em] text-background opacity-40">
                    Checkout
                  </button>
                  <p id="checkout-note" className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
                    {checkout.reason === "demo"
                      ? "This is a demo of the store: ordering is turned off and your bag is kept in this browser only."
                      : "Checkout isn’t open yet. Your bag is saved in this browser."}
                  </p>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
