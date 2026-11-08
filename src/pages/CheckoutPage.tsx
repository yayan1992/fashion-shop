import * as React from "react";
import { Link, useNavigate } from "react-router";
import { bagSubtotal } from "@/bag/bag";
import { useBag } from "@/bag/BagProvider";
import { useCatalogState } from "@/catalog/CatalogProvider";
import { colorwayOf, formatPrice, variantBySku } from "@/catalog/selectors";
import { checkoutAvailability, describeOrderError, placeOrder, rememberOrder, shippingFor, validateOrderForm, type FieldErrors, type OrderForm } from "@/checkout/checkout";
import { Turnstile, type TurnstileHandle } from "@/checkout/Turnstile";
import { GarmentImage } from "@/components/GarmentImage";
import { useDocumentTitle } from "@/lib/hooks";

const EMPTY: OrderForm = { email: "", name: "", phone: "", line1: "", line2: "", city: "", region: "", postalCode: "", country: "", notes: "", paymentMethod: "" };

export default function CheckoutPage() {
  const { catalog, source, reload } = useCatalogState();
  const bag = useBag();
  const navigate = useNavigate();
  const availability = checkoutAvailability(catalog, source);
  const [form, setForm] = React.useState<OrderForm>(() => ({ ...EMPTY, paymentMethod: availability.open && availability.methods.length === 1 ? availability.methods[0]!.id : "" }));
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [problem, setProblem] = React.useState<string | null>(null);
  const [placing, setPlacing] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);
  const verifier = React.useRef<TurnstileHandle>(null);
  useDocumentTitle(`Checkout — ${catalog.settings.name}`);

  const lines = bag.lines.flatMap((line) => {
    const found = variantBySku(catalog, line.sku);
    return found ? [{ ...line, ...found, colorway: colorwayOf(found.product, found.variant.colorwayId) }] : [];
  });
  const subtotal = bagSubtotal(catalog, bag.lines);
  const shipping = shippingFor(catalog, subtotal);

  if (!availability.open) {
    return (
      <Shell>
        <p className="label text-muted-foreground">Checkout</p>
        <h1 className="type-wide mt-4 max-w-[20ch] text-[clamp(2rem,4vw,3rem)] font-extralight leading-tight">{availability.reason === "demo" ? "This is a preview of the store." : "Checkout isn’t open yet."}</h1>
        <p className="mt-6 max-w-[52ch] text-[15px] leading-relaxed text-muted-foreground">
          {availability.reason === "demo"
            ? "Ordering is turned off in the demo. Connect the store to Supabase to take real orders; your bag is kept in this browser in the meantime."
            : "The store isn’t taking orders at the moment. Your bag is saved in this browser, so you can come back to it."}
        </p>
        <Link to="/shop" className="label link-draw mt-10 inline-block py-1">Keep browsing</Link>
      </Shell>
    );
  }

  if (lines.length === 0) {
    return (
      <Shell>
        <h1 className="type-wide text-[clamp(2rem,4vw,3rem)] font-extralight">Your bag is empty.</h1>
        <Link to="/shop" className="label link-draw mt-8 inline-block py-1">Browse all pieces</Link>
      </Shell>
    );
  }

  const update = (field: keyof OrderForm) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (placing) return;
    const found = validateOrderForm(form);
    setErrors(found);
    setProblem(null);
    const first = Object.keys(found)[0];
    if (first) {
      formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    setPlacing(true);
    try {
      const order = await placeOrder(form, bag.lines, (await verifier.current?.token()) ?? "");
      rememberOrder(order);
      bag.dispatch({ type: "clear" });
      void reload();
      navigate(`/order/${order.reference}`, { state: order, replace: true });
    } catch (error) {
      const described = describeOrderError(error);
      setProblem(described.message);
      if (described.field) setErrors((current) => ({ ...current, [described.field!]: "Check this detail." }));
      if (described.short) {
        for (const item of described.short) bag.dispatch({ type: "set", sku: item.sku, quantity: item.available });
        void reload();
      }
    } finally {
      // Each check is good for one attempt.
      verifier.current?.reset();
      setPlacing(false);
    }
  };

  const methods = availability.methods;
  const chosen = methods.find((method) => method.id === form.paymentMethod);

  return (
    <Shell>
      <form ref={formRef} onSubmit={submit} noValidate className="grid gap-x-16 gap-y-12 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex flex-col gap-12">
          <div className="flex flex-col gap-3">
            <p className="label text-muted-foreground">Checkout</p>
            <h1 className="type-wide text-[clamp(2rem,4vw,3.25rem)] font-extralight leading-none tracking-[-0.02em]">Your order</h1>
          </div>

          <Section title="Contact">
            <Field label="Email" name="email" type="email" autoComplete="email" value={form.email} onChange={update("email")} error={errors.email} hint="For your order confirmation." />
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Full name" name="name" autoComplete="name" value={form.name} onChange={update("name")} error={errors.name} />
              <Field label="Phone" name="phone" type="tel" autoComplete="tel" value={form.phone} onChange={update("phone")} error={errors.phone} hint="For the courier." />
            </div>
          </Section>

          <Section title="Delivery">
            <Field label="Address" name="line1" autoComplete="address-line1" value={form.line1} onChange={update("line1")} error={errors.line1} />
            <Field label="Apartment, floor (optional)" name="line2" autoComplete="address-line2" value={form.line2} onChange={update("line2")} />
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Town or city" name="city" autoComplete="address-level2" value={form.city} onChange={update("city")} error={errors.city} />
              <Field label="Region (optional)" name="region" autoComplete="address-level1" value={form.region} onChange={update("region")} />
              <Field label="Postal code" name="postalCode" autoComplete="postal-code" value={form.postalCode} onChange={update("postalCode")} error={errors.postalCode} />
              <Field label="Country" name="country" autoComplete="country-name" value={form.country} onChange={update("country")} error={errors.country} />
            </div>
            <Field label="Delivery notes (optional)" name="notes" multiline value={form.notes} onChange={update("notes")} error={errors.notes} />
          </Section>

          <Section title="Payment">
            <fieldset className="flex flex-col gap-3" aria-describedby={errors.paymentMethod ? "payment-error" : undefined}>
              <legend className="sr-only">Payment method</legend>
              {methods.map((method) => (
                <label key={method.id} className={`flex cursor-pointer gap-4 border p-4 transition-colors ${form.paymentMethod === method.id ? "border-foreground" : "border-border hover:border-foreground/40"}`}>
                  <input type="radio" name="paymentMethod" value={method.id} checked={form.paymentMethod === method.id} onChange={update("paymentMethod")} className="mt-1 accent-[var(--color-foreground)]" />
                  <span className="flex flex-col gap-1">
                    <span className="text-[15px] font-medium">{method.label}</span>
                    {method.instructions && <span className="text-[13px] leading-relaxed text-muted-foreground">{method.instructions}</span>}
                  </span>
                </label>
              ))}
              {errors.paymentMethod && <p id="payment-error" className="text-[13px] text-foreground">{errors.paymentMethod}</p>}
            </fieldset>
            <p className="text-[13px] leading-relaxed text-muted-foreground">No card details are taken on this site. Your order is confirmed now and paid {chosen ? `by ${chosen.label.toLowerCase()}` : "as described above"}.</p>
          </Section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="tone-bone flex flex-col gap-6 p-6">
            <h2 className="label">Summary</h2>
            <ul className="flex flex-col gap-4">
              {lines.map((line) => (
                <li key={line.sku} className="flex gap-4">
                  <div className="relative aspect-[4/5] w-16 shrink-0 bg-plaster">
                    <GarmentImage mediaId={line.colorway.media.front} decorative className="absolute inset-x-0 bottom-[4%] top-[6%] size-full" />
                  </div>
                  <div className="flex min-w-0 flex-1 justify-between gap-3 text-[14px]">
                    <div>
                      <p className="font-medium">{line.product.name}</p>
                      <p className="text-[13px] text-muted-foreground">{line.colorway.name} · {line.variant.size} · × {line.quantity}</p>
                    </div>
                    <p className="tabular shrink-0 font-light">{formatPrice(catalog, line.product.price * line.quantity)}</p>
                  </div>
                </li>
              ))}
            </ul>
            <dl className="flex flex-col gap-2 border-t border-border pt-5 text-[14px]">
              <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="tabular">{formatPrice(catalog, subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Shipping</dt><dd className="tabular">{shipping === 0 ? "Included" : formatPrice(catalog, shipping)}</dd></div>
              <div className="flex justify-between border-t border-border pt-3 text-[16px]"><dt>Total</dt><dd className="tabular">{formatPrice(catalog, subtotal + shipping)}</dd></div>
            </dl>
            {catalog.settings.shipping?.note && <p className="text-[12px] leading-relaxed text-muted-foreground">{catalog.settings.shipping.note}</p>}
            <div>
              <Turnstile ref={verifier} />
              <div aria-live="assertive">{problem && <p className="border-l-2 border-foreground pl-3 text-[13px] leading-relaxed">{problem}</p>}</div>
            </div>
            <button type="submit" disabled={placing} className="flex h-13 items-center justify-between bg-foreground px-5 text-[13px] font-medium tracking-[0.06em] text-background transition-opacity disabled:opacity-60">
              <span>{placing ? "Placing order…" : "Place order"}</span>
              <span className="tabular font-light">{formatPrice(catalog, subtotal + shipping)}</span>
            </button>
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              By placing your order you agree to our <Link to="/info" className="underline underline-offset-2">shipping and returns policy</Link>.
            </p>
          </div>
        </aside>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto min-h-[70svh] max-w-[1280px] px-4 pb-28 pt-28 sm:px-6 md:pt-36 lg:px-10">{children}</div>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-5 border-t border-border pt-6">
      <h2 className="label">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, name, error, hint, multiline, ...input }: { label: string; name: keyof OrderForm; error?: string; hint?: string; multiline?: boolean } & React.InputHTMLAttributes<HTMLInputElement> & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = `field-${name}`;
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
  const className = `w-full border bg-transparent px-3.5 py-3 text-[15px] outline-none transition-colors focus:border-foreground ${error ? "border-foreground" : "border-border"}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] text-muted-foreground">{label}</label>
      {multiline ? (
        <textarea id={id} name={name} rows={3} aria-invalid={Boolean(error)} aria-describedby={describedBy} className={className} {...(input as React.TextareaHTMLAttributes<HTMLTextAreaElement>)} />
      ) : (
        <input id={id} name={name} aria-invalid={Boolean(error)} aria-describedby={describedBy} className={className} {...(input as React.InputHTMLAttributes<HTMLInputElement>)} />
      )}
      {hint && !error && <p id={`${id}-hint`} className="text-[12px] text-muted-foreground">{hint}</p>}
      {error && <p id={`${id}-error`} className="text-[12px] text-foreground">{error}</p>}
    </div>
  );
}
