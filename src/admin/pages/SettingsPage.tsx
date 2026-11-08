import * as React from "react";
import type { CheckoutMethod, MediaAsset, StoreSettings } from "@/catalog/types";
import { useDocumentTitle } from "@/lib/hooks";
import { useAdminData } from "../AdminApp";
import { api, describeError, removeFiles } from "../api";
import { FileButton, FocusPicker, uploadEditorial } from "../components/PhotoPicker";
import { Button, Field, Input, Notice, PageHeader, Panel, Select, Textarea, Toggle, useConfirm, useToast } from "../ui";

const METHOD_DEFAULTS: CheckoutMethod[] = [
  { id: "cod", label: "Cash on delivery", instructions: "Pay the courier when your order arrives.", enabled: false },
  { id: "bank-transfer", label: "Bank transfer", instructions: "We will email our bank details with your order reference. Your order ships once payment arrives.", enabled: false },
  { id: "pickup", label: "Pay at studio pickup", instructions: "Collect and pay at the studio. We will email you when your order is ready.", enabled: false },
];

const toMajor = (minor: number | null | undefined) => (minor === null || minor === undefined ? "" : String(minor / 100));
const toMinor = (major: string) => (major.trim() === "" ? null : Math.round(parseFloat(major.replace(",", ".")) * 100));

export default function SettingsPage() {
  useDocumentTitle("Settings — Studio");
  const { data, refresh } = useAdminData();
  const toast = useToast();
  const confirm = useConfirm();
  const [s, setS] = React.useState<StoreSettings>(() => structuredClone(data.settings));
  const [priv, setPriv] = React.useState(() => ({ orderNotificationEmail: data.privateSettings?.orderNotificationEmail ?? "", notes: data.privateSettings?.notes ?? "" }));
  const [flat, setFlat] = React.useState(toMajor(data.settings.shipping?.flatRate ?? 0));
  const [freeOver, setFreeOver] = React.useState(toMajor(data.settings.shipping?.freeOver));
  const [media, setMedia] = React.useState<Record<string, MediaAsset>>({});
  const [saving, setSaving] = React.useState(false);
  const [cleaning, setCleaning] = React.useState(false);

  const methods = METHOD_DEFAULTS.map((d) => ({ ...d, ...(s.checkout?.methods.find((m) => m.id === d.id) ?? {}) }));
  const checkout = { enabled: s.checkout?.enabled ?? false, methods };
  const setMethod = (id: string, change: Partial<CheckoutMethod>) => setS({ ...s, checkout: { ...checkout, methods: methods.map((m) => (m.id === id ? { ...m, ...change } : m)) } });
  const statementMedia = s.home.statement.mediaId ? { ...data.media, ...media }[s.home.statement.mediaId] : undefined;

  const save = async () => {
    if (checkout.enabled && !methods.some((m) => m.enabled)) {
      toast("Turn on at least one payment method before opening checkout.", "negative");
      return;
    }
    setSaving(true);
    try {
      await api.saveSettings(
        {
          name: s.name,
          description: s.description ?? "",
          currency: s.currency.toUpperCase(),
          locale: s.locale,
          lowStockThreshold: s.lowStockThreshold,
          contact: s.contact ?? {},
          rail: { eyebrow: s.rail.eyebrow, heading: s.rail.heading, caption: s.rail.caption, touchCaption: s.rail.touchCaption, autoplay: s.rail.autoplay },
          home: { statement: s.home.statement, featuredCollectionId: s.home.featuredCollectionId, lookbookId: s.home.lookbookId },
          footer: s.footer,
          checkout,
          shipping: { flatRate: toMinor(flat) ?? 0, freeOver: toMinor(freeOver), note: s.shipping?.note ?? "" },
          policies: s.policies ?? {},
        },
        priv,
      );
      await refresh();
      toast("Settings saved.");
    } catch (error) {
      toast(describeError(error), "negative");
    } finally {
      setSaving(false);
    }
  };

  const cleanUp = async () => {
    setCleaning(true);
    try {
      const unused = await api.unusedMedia();
      const uploaded = unused.filter((m) => m.storagePath);
      if (uploaded.length === 0) {
        toast("No unused images to remove.");
        return;
      }
      if (!(await confirm({ title: `Delete ${uploaded.length} unused ${uploaded.length === 1 ? "image" : "images"}?`, body: "These uploads aren’t used by any product, lookbook frame or setting. They will be deleted from storage.", confirm: "Delete images", danger: true }))) return;
      const removed = await api.deleteMedia(uploaded.map((m) => m.id));
      const paths = removed.flatMap((m) => [m.storagePath, ...(m.variants ?? []).map((v) => (v as { path?: string }).path)]).filter((p): p is string => Boolean(p));
      await removeFiles([...new Set(paths)]);
      await refresh();
      toast(`Removed ${removed.length} ${removed.length === 1 ? "image" : "images"}.`);
    } catch (error) {
      toast(describeError(error), "negative");
    } finally {
      setCleaning(false);
    }
  };

  return (
    <>
      <PageHeader title="Settings" description="How the store presents itself and takes orders." actions={<Button variant="primary" onClick={save} loading={saving}>Save settings</Button>} />
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Store">
          <div className="grid gap-5">
            <Field label="Store name" htmlFor="s-name"><Input id="s-name" maxLength={60} value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} /></Field>
            <Field label="Description" htmlFor="s-desc" hint="A sentence about the store, for search engines and link previews." optional><Textarea id="s-desc" rows={2} value={s.description ?? ""} onChange={(e) => setS({ ...s, description: e.target.value })} /></Field>
            <div className="grid gap-5 sm:grid-cols-3">
              <Field label="Currency" htmlFor="s-cur" hint="Three letters, e.g. EUR."><Input id="s-cur" maxLength={3} value={s.currency} onChange={(e) => setS({ ...s, currency: e.target.value.toUpperCase() })} /></Field>
              <Field label="Number format" htmlFor="s-loc" hint="e.g. en-US, fr-FR."><Input id="s-loc" value={s.locale} onChange={(e) => setS({ ...s, locale: e.target.value })} /></Field>
              <Field label="Low stock at" htmlFor="s-low" hint="Pieces left in a size."><Input id="s-low" inputMode="numeric" value={String(s.lowStockThreshold)} onChange={(e) => setS({ ...s, lowStockThreshold: Number(e.target.value.replace(/\D/g, "")) || 0 })} /></Field>
            </div>
          </div>
        </Panel>

        <Panel title="Contact" description="Shown on the shipping and returns page and order confirmations.">
          <div className="grid gap-5">
            <Field label="Email" htmlFor="s-email"><Input id="s-email" type="email" value={s.contact?.email ?? ""} onChange={(e) => setS({ ...s, contact: { ...s.contact, email: e.target.value } })} /></Field>
            <Field label="Phone" htmlFor="s-phone" optional><Input id="s-phone" value={s.contact?.phone ?? ""} onChange={(e) => setS({ ...s, contact: { ...s.contact, phone: e.target.value } })} /></Field>
            <Field label="Address" htmlFor="s-addr" optional><Textarea id="s-addr" rows={2} value={s.contact?.address ?? ""} onChange={(e) => setS({ ...s, contact: { ...s.contact, address: e.target.value } })} /></Field>
          </div>
        </Panel>

        <Panel id="checkout" title="Checkout" description="STILLFORM takes orders without card payments: customers choose one of the methods below and you mark orders as paid when the money arrives.">
          <div className="flex flex-col gap-5">
            <Toggle checked={checkout.enabled} onChange={(on) => setS({ ...s, checkout: { ...checkout, enabled: on } })} label="Open checkout" description="When closed, customers can browse and fill their bag but can’t place orders." />
            {checkout.enabled && !methods.some((m) => m.enabled) && <Notice tone="attention">Turn on at least one payment method.</Notice>}
            {methods.map((method) => (
              <div key={method.id} className="flex flex-col gap-3 border-t border-ink/10 pt-4">
                <Toggle checked={method.enabled} onChange={(on) => setMethod(method.id, { enabled: on })} label={method.label} />
                {method.enabled && (
                  <div className="grid gap-3">
                    <Field label="Name shown to customers" htmlFor={`m-${method.id}`}><Input id={`m-${method.id}`} maxLength={60} value={method.label} onChange={(e) => setMethod(method.id, { label: e.target.value })} /></Field>
                    <Field label="Instructions" htmlFor={`mi-${method.id}`} hint="Shown at checkout and on the order confirmation."><Textarea id={`mi-${method.id}`} rows={2} maxLength={600} value={method.instructions} onChange={(e) => setMethod(method.id, { instructions: e.target.value })} /></Field>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Shipping" description="Charged once per order. Leave the flat rate at 0 if shipping is included in your prices.">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={`Flat rate (${s.currency})`} htmlFor="sh-flat"><Input id="sh-flat" inputMode="decimal" value={flat} onChange={(e) => setFlat(e.target.value)} /></Field>
            <Field label={`Free over (${s.currency})`} htmlFor="sh-free" hint="Leave empty for no threshold." optional><Input id="sh-free" inputMode="decimal" value={freeOver} onChange={(e) => setFreeOver(e.target.value)} /></Field>
            <div className="sm:col-span-2"><Field label="Note" htmlFor="sh-note" hint="Shown under the order total, e.g. taxes included." optional><Input id="sh-note" value={s.shipping?.note ?? ""} onChange={(e) => setS({ ...s, shipping: { flatRate: s.shipping?.flatRate ?? 0, freeOver: s.shipping?.freeOver ?? null, note: e.target.value } })} /></Field></div>
          </div>
        </Panel>

        <Panel title="Policies" description="Shown on the shipping and returns page.">
          <div className="grid gap-5">
            <Field label="Shipping" htmlFor="p-ship"><Textarea id="p-ship" rows={3} value={s.policies?.shipping ?? ""} onChange={(e) => setS({ ...s, policies: { ...s.policies, shipping: e.target.value } })} /></Field>
            <Field label="Returns" htmlFor="p-ret"><Textarea id="p-ret" rows={3} value={s.policies?.returns ?? ""} onChange={(e) => setS({ ...s, policies: { ...s.policies, returns: e.target.value } })} /></Field>
          </div>
        </Panel>

        <Panel title="Homepage" description="The words around the rail and the statement beneath it.">
          <div className="grid gap-5">
            <Field label="Line above the rail" htmlFor="h-eyebrow"><Input id="h-eyebrow" value={s.rail.eyebrow} onChange={(e) => setS({ ...s, rail: { ...s.rail, eyebrow: e.target.value } })} /></Field>
            <Field label="Headline" htmlFor="h-heading"><Input id="h-heading" value={s.rail.heading} onChange={(e) => setS({ ...s, rail: { ...s.rail, heading: e.target.value } })} /></Field>
            <Field label="Hint under the rail" htmlFor="h-caption"><Input id="h-caption" value={s.rail.caption} onChange={(e) => setS({ ...s, rail: { ...s.rail, caption: e.target.value } })} /></Field>
            <Field label="Statement" htmlFor="h-body"><Textarea id="h-body" rows={2} value={s.home.statement.body} onChange={(e) => setS({ ...s, home: { ...s.home, statement: { ...s.home.statement, body: e.target.value } } })} /></Field>
            <Field label="Statement, smaller text" htmlFor="h-aside"><Textarea id="h-aside" rows={2} value={s.home.statement.aside} onChange={(e) => setS({ ...s, home: { ...s.home, statement: { ...s.home.statement, aside: e.target.value } } })} /></Field>
            <div className="flex items-end gap-4">
              <div className="w-28"><FocusPicker asset={statementMedia} ratio="4/5" /></div>
              <FileButton className="text-[13px] text-muted-foreground hover:text-ink" label={statementMedia ? "Replace statement photo" : "Add statement photo"} onFile={async (file) => {
                try {
                  const asset = await uploadEditorial(file, "Fabric close-up");
                  setMedia((m) => ({ ...m, [asset.id]: asset }));
                  setS({ ...s, home: { ...s.home, statement: { ...s.home.statement, mediaId: asset.id } } });
                } catch (error) {
                  toast(error instanceof Error && !("code" in error) ? error.message : describeError(error), "negative");
                }
              }} />
            </div>
            <Field label="Collection on the homepage" htmlFor="h-col">
              <Select id="h-col" value={s.home.featuredCollectionId} onChange={(e) => setS({ ...s, home: { ...s.home, featuredCollectionId: e.target.value } })}>
                {data.collections.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </Select>
            </Field>
          </div>
        </Panel>

        <Panel title="Private" description="Only visible to administrators. Never sent to the storefront.">
          <div className="grid gap-5">
            <Field label="Order notifications email" htmlFor="pr-email" hint="Stored for when email notifications are added; nothing is sent yet." optional><Input id="pr-email" type="email" value={priv.orderNotificationEmail} onChange={(e) => setPriv({ ...priv, orderNotificationEmail: e.target.value })} /></Field>
            <Field label="Internal notes" htmlFor="pr-notes" optional><Textarea id="pr-notes" rows={3} value={priv.notes} onChange={(e) => setPriv({ ...priv, notes: e.target.value })} /></Field>
          </div>
        </Panel>

        <Panel title="Maintenance">
          <div className="flex flex-col items-start gap-3">
            <p className="text-[13px] leading-relaxed text-muted-foreground">Replaced or removed photos stay in storage until you clean them up. Only uploads that nothing uses are deleted.</p>
            <Button onClick={cleanUp} loading={cleaning}>Clean up unused images</Button>
          </div>
        </Panel>
      </div>
    </>
  );
}
