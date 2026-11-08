import * as React from "react";
import { Link } from "react-router";
import { useBag } from "@/bag/BagProvider";
import { useCatalog } from "@/catalog/CatalogProvider";
import { colorwayOf, colorwayStock, formatPrice, productPath, stockLevel, variantFor } from "@/catalog/selectors";
import type { Product } from "@/catalog/types";

interface PurchasePanelProps {
  product: Product;
  colorwayId: string;
  /** Lets the shopper switch colourway. Without it the colourway is fixed (a piece taken off the rail). */
  onColorwayChange?: (colorwayId: string) => void;
  /** Called by "View bag" after the bag drawer has been asked to open. */
  onViewBag?: () => void;
  /** Hide the price line when the surrounding layout already shows it. */
  showPrice?: boolean;
}

export function PurchasePanel({ product, colorwayId, onColorwayChange, onViewBag, showPrice = true }: PurchasePanelProps) {
  const catalog = useCatalog();
  const bag = useBag();
  const id = React.useId();
  const colorway = colorwayOf(product, colorwayId);
  const [chosenSize, setSize] = React.useState<string | null>(null);
  const [note, setMessage] = React.useState<{ tone: "error" | "done"; text: string; colorwayId: string } | null>(null);
  const sizeGroup = React.useRef<HTMLFieldSetElement>(null);

  // A size chosen in one colourway carries over only if it is in stock in the current one.
  const size = chosenSize && (variantFor(product, colorway.id, chosenSize)?.stock ?? 0) > 0 ? chosenSize : null;
  const message = note?.colorwayId === colorway.id ? note : null;

  const variant = size ? variantFor(product, colorway.id, size) : undefined;
  const inBag = variant ? (bag.lines.find((line) => line.sku === variant.sku)?.quantity ?? 0) : 0;
  const remaining = variant ? variant.stock - inBag : 0;
  const soldOut = colorwayStock(product, colorway.id) === 0;
  const others = product.colorways.filter((candidate) => candidate.id !== colorway.id);

  const add = () => {
    if (!variant) {
      setMessage({ tone: "error", text: "Choose a size first.", colorwayId: colorway.id });
      sizeGroup.current?.querySelector<HTMLInputElement>("input:not(:disabled)")?.focus();
      return;
    }
    if (remaining <= 0) return;
    bag.dispatch({ type: "add", sku: variant.sku });
    setMessage({ tone: "done", text: `Added ${product.name}, ${colorway.name}, size ${variant.size}.`, colorwayId: colorway.id });
  };

  let stockNote = "";
  if (soldOut) stockNote = `Sold out in ${colorway.name.toLowerCase()}.`;
  else if (variant) {
    const level = stockLevel(variant.stock, catalog.settings.lowStockThreshold);
    stockNote = level === "low" ? `Only ${variant.stock} left in ${variant.size}.` : `In stock in ${variant.size}.`;
    if (inBag > 0 && remaining <= 0) stockNote = `All remaining ${variant.size} stock is in your bag.`;
  }

  return (
    <div className="flex flex-col gap-6 text-left md:gap-7">
      {showPrice && <p className="tabular text-lg font-light">{formatPrice(catalog, product.price)}</p>}

      <div className="flex flex-col gap-3">
        <p className="label text-muted-foreground">
          Colour <span className="text-foreground">— {colorway.name}</span>
        </p>
        {onColorwayChange && product.colorways.length > 1 ? (
          <div role="radiogroup" aria-label="Colour" className="flex gap-2.5">
            {product.colorways.map((option) => {
              const checked = option.id === colorway.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  aria-label={option.name}
                  tabIndex={checked ? 0 : -1}
                  onClick={() => onColorwayChange(option.id)}
                  onKeyDown={(event) => {
                    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
                    event.preventDefault();
                    const index = product.colorways.findIndex((candidate) => candidate.id === colorway.id);
                    const next = product.colorways[(index + (event.key === "ArrowRight" ? 1 : -1) + product.colorways.length) % product.colorways.length];
                    if (next) onColorwayChange(next.id);
                    const group = event.currentTarget.parentElement;
                    requestAnimationFrame(() => group?.querySelector<HTMLElement>("[aria-checked=true]")?.focus());
                  }}
                  className={`grid size-9 place-items-center rounded-full border transition-colors ${checked ? "border-foreground" : "border-transparent hover:border-border"}`}
                >
                  <span className="size-6 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)]" style={{ background: option.swatch }} />
                </button>
              );
            })}
          </div>
        ) : (
          others.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Also in{" "}
              {others.map((option, i) => (
                <React.Fragment key={option.id}>
                  {i > 0 && ", "}
                  <Link to={productPath(product, option.id)} className="link-draw text-foreground">
                    {option.name.toLowerCase()}
                  </Link>
                </React.Fragment>
              ))}
            </p>
          )
        )}
      </div>

      <fieldset ref={sizeGroup} className="flex flex-col gap-3" aria-describedby={`${id}-stock`}>
        <legend className="label mb-3 text-muted-foreground">Size</legend>
        <div className="grid grid-cols-5 gap-1.5">
          {product.sizes.map((option) => {
            const stock = variantFor(product, colorway.id, option)?.stock ?? 0;
            const unavailable = stock <= 0;
            return (
              <label key={option} className={`relative ${unavailable ? "cursor-not-allowed" : "cursor-pointer"}`}>
                <input
                  type="radio"
                  name={`${id}-size`}
                  value={option}
                  checked={size === option}
                  disabled={unavailable}
                  onChange={() => {
                    setSize(option);
                    setMessage(null);
                  }}
                  className="peer sr-only"
                  aria-label={unavailable ? `${option}, sold out` : option}
                />
                <span className="tabular flex h-11 items-center justify-center border border-border text-[13px] transition-colors peer-checked:border-foreground peer-checked:bg-foreground peer-checked:text-background peer-focus-visible:outline peer-focus-visible:outline-[1.5px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring peer-disabled:text-muted-foreground/60 hover:border-foreground/60 peer-disabled:hover:border-border">
                  {option}
                </span>
                {unavailable && <span aria-hidden="true" className="pointer-events-none absolute inset-x-2 top-1/2 h-px -rotate-[18deg] bg-muted-foreground/50" />}
              </label>
            );
          })}
        </div>
        <p id={`${id}-stock`} aria-live="polite" className={`min-h-5 text-[13px] ${variant && stockLevel(variant.stock, catalog.settings.lowStockThreshold) === "low" ? "text-foreground" : "text-muted-foreground"}`}>
          {stockNote}
        </p>
      </fieldset>

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={add}
          disabled={soldOut || (variant !== undefined && remaining <= 0)}
          className="group relative flex h-13 items-center justify-between overflow-hidden bg-foreground px-5 text-[13px] font-medium tracking-[0.06em] text-background transition-[background-color,opacity] hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span>{soldOut ? "Sold out" : "Add to bag"}</span>
          <span className="tabular font-light">{formatPrice(catalog, product.price)}</span>
        </button>
        <div aria-live="polite" className="min-h-6 text-[13px]">
          {message?.tone === "error" && <p className="text-foreground">{message.text}</p>}
          {message?.tone === "done" && (
            <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-muted-foreground">
              <span>{message.text}</span>
              <button
                type="button"
                className="link-draw text-foreground"
                onClick={() => {
                  bag.setOpen(true);
                  onViewBag?.();
                }}
              >
                View bag ({bag.count})
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
