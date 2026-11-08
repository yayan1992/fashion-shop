import { useCatalog } from "@/catalog/CatalogProvider";
import { formatPrice } from "@/catalog/selectors";
import { useDocumentTitle } from "@/lib/hooks";

/** Shipping, returns and contact, from the store settings. */
export default function InfoPage() {
  const catalog = useCatalog();
  const { policies, shipping, contact, name } = catalog.settings;
  useDocumentTitle(`Shipping and returns — ${name}`);
  const sections = [
    { title: "Shipping", body: policies?.shipping },
    { title: "Returns", body: policies?.returns },
  ].filter((section) => section.body);

  return (
    <div className="mx-auto max-w-[880px] px-4 pb-28 pt-32 sm:px-6 md:pt-40">
      <p className="label text-muted-foreground">Information</p>
      <h1 className="type-wide mt-4 text-[clamp(2.25rem,5vw,4rem)] font-extralight leading-[1.02] tracking-[-0.02em]">Shipping and returns</h1>
      <div className="mt-14 flex flex-col divide-y divide-border border-y border-border">
        {sections.map((section) => (
          <section key={section.title} className="grid gap-4 py-8 sm:grid-cols-[180px_1fr]">
            <h2 className="label">{section.title}</h2>
            <p className="whitespace-pre-line text-[15px] leading-relaxed text-muted-foreground">{section.body}</p>
          </section>
        ))}
        <section className="grid gap-4 py-8 sm:grid-cols-[180px_1fr]">
          <h2 className="label">Charges</h2>
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            {shipping && shipping.flatRate > 0
              ? `Shipping is ${formatPrice(catalog, shipping.flatRate)}${shipping.freeOver !== null ? `, free on orders of ${formatPrice(catalog, shipping.freeOver)} or more` : ""}.`
              : "Shipping is included in the price."}{" "}
            {shipping?.note}
          </p>
        </section>
        {(contact?.email || contact?.phone || contact?.address) && (
          <section className="grid gap-4 py-8 sm:grid-cols-[180px_1fr]">
            <h2 className="label">Contact</h2>
            <div className="flex flex-col gap-1 text-[15px] text-muted-foreground">
              {contact.email && <a href={`mailto:${contact.email}`} className="link-draw self-start text-foreground">{contact.email}</a>}
              {contact.phone && <span>{contact.phone}</span>}
              {contact.address && <span className="whitespace-pre-line">{contact.address}</span>}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
