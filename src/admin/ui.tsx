import * as React from "react";
import { Link } from "react-router";
import { useFocusTrap, useScrollLock } from "@/lib/hooks";

// The dashboard's building blocks, in the storefront's own type and palette.

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON: Record<ButtonVariant, string> = {
  primary: "bg-ink text-chalk hover:bg-graphite disabled:bg-ink/40",
  secondary: "border border-ink/25 bg-chalk text-ink hover:border-ink disabled:opacity-50",
  ghost: "text-ink/70 hover:bg-ink/5 hover:text-ink disabled:opacity-40",
  danger: "border border-[#8a2f22]/40 bg-chalk text-[#8a2f22] hover:border-[#8a2f22] hover:bg-[#8a2f22] hover:text-chalk disabled:opacity-50",
};

export function Button({ variant = "secondary", loading, className = "", children, ...props }: { variant?: ButtonVariant; loading?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...props} disabled={props.disabled || loading} className={`inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap px-4 text-[13px] font-medium tracking-[0.02em] transition-colors disabled:cursor-not-allowed ${BUTTON[variant]} ${className}`}>
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function ButtonLink({ to, variant = "secondary", className = "", children }: { to: string; variant?: ButtonVariant; className?: string; children: React.ReactNode }) {
  return (
    <Link to={to} className={`inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap px-4 text-[13px] font-medium tracking-[0.02em] transition-colors ${BUTTON[variant]} ${className}`}>
      {children}
    </Link>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`inline-block size-3.5 animate-spin rounded-full border-[1.5px] border-current border-r-transparent motion-reduce:animate-none ${className}`} />;
}

export function PageHeader({ title, description, actions, back }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; back?: { to: string; label: string } }) {
  return (
    <header className="mb-8 flex flex-col gap-5 md:mb-10 md:flex-row md:items-end md:justify-between">
      <div className="flex min-w-0 flex-col gap-2">
        {back && (
          <Link to={back.to} className="label self-start text-muted-foreground hover:text-foreground">
            ← {back.label}
          </Link>
        )}
        <h1 className="type-wide truncate text-[clamp(1.75rem,3vw,2.5rem)] font-extralight leading-tight tracking-[-0.02em]">{title}</h1>
        {description && <p className="max-w-[62ch] text-[14px] leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Panel({ title, description, actions, children, className = "", id }: { title?: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`border border-ink/10 bg-chalk ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ink/10 px-5 py-4 md:px-6">
          <div className="flex flex-col gap-1">
            {title && <h2 className="text-[15px] font-medium">{title}</h2>}
            {description && <p className="max-w-[64ch] text-[13px] leading-relaxed text-muted-foreground">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className="px-5 py-5 md:px-6">{children}</div>
    </section>
  );
}

export function Field({ label, hint, error, children, htmlFor, optional }: { label: string; hint?: React.ReactNode; error?: string; children: React.ReactNode; htmlFor?: string; optional?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-medium">
        {label} {optional && <span className="font-normal text-muted-foreground">(optional)</span>}
      </label>
      {children}
      {error ? <p className="text-[12px] text-[#8a2f22]">{error}</p> : hint ? <p className="text-[12px] leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

const CONTROL = "w-full border border-ink/15 bg-white/70 px-3 py-2.5 text-[14px] outline-none transition-colors placeholder:text-ink/35 focus:border-ink aria-[invalid=true]:border-[#8a2f22]";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className = "", ...props }, ref) {
  return <input ref={ref} {...props} className={`${CONTROL} ${className}`} />;
});

export function Textarea({ className = "", ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={`${CONTROL} leading-relaxed ${className}`} />;
}

export function Select({ className = "", children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`${CONTROL} appearance-none bg-[length:10px] bg-[right_12px_center] bg-no-repeat pr-8 ${className}`} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23121110' stroke-width='1.2'/%3E%3C/svg%3E\")" }}>
      {children}
    </select>
  );
}

export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (checked: boolean) => void; label: React.ReactNode; description?: React.ReactNode; disabled?: boolean }) {
  const id = React.useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={id} className="flex flex-col gap-0.5">
        <span className="text-[14px]">{label}</span>
        {description && <span className="text-[12px] leading-relaxed text-muted-foreground">{description}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors disabled:opacity-40 ${checked ? "bg-ink" : "bg-ink/15"}`}
      >
        <span className={`absolute top-0.5 size-5 rounded-full bg-chalk shadow-sm transition-[left] duration-200 ${checked ? "left-[18px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}

export type Tone = "neutral" | "positive" | "attention" | "muted" | "negative";
const BADGE: Record<Tone, string> = {
  neutral: "bg-ink/[0.06] text-ink",
  positive: "bg-[#2f5d46]/10 text-[#24503a]",
  attention: "bg-[#a65a44]/12 text-[#8a4433]",
  muted: "bg-ink/[0.04] text-muted-foreground",
  negative: "bg-[#8a2f22]/10 text-[#8a2f22]",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={`inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-[11px] font-medium tracking-[0.04em] ${BADGE[tone]}`}>{children}</span>;
}

export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 border border-dashed border-ink/15 px-6 py-10">
      <p className="type-wide text-xl font-extralight">{title}</p>
      {children && <p className="max-w-[56ch] text-[14px] leading-relaxed text-muted-foreground">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-ink/[0.06] motion-reduce:animate-none ${className}`} />;
}

export function Notice({ tone = "neutral", children }: { tone?: "neutral" | "attention" | "negative"; children: React.ReactNode }) {
  const color = tone === "negative" ? "border-[#8a2f22] text-[#8a2f22]" : tone === "attention" ? "border-[#a65a44]" : "border-ink/40";
  return <div className={`border-l-2 bg-chalk px-4 py-3 text-[13px] leading-relaxed ${color}`}>{children}</div>;
}

// ---------------------------------------------------------------------------
// Dialogs and toasts

export function Dialog({ open, title, onClose, children, actions, wide }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode; actions?: React.ReactNode; wide?: boolean }) {
  const ref = React.useRef<HTMLDivElement>(null);
  useScrollLock(open);
  useFocusTrap(ref, open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/30 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="dialog-title" className={`flex max-h-[92svh] w-full flex-col bg-plaster shadow-2xl ${wide ? "sm:max-w-5xl" : "sm:max-w-md"}`}>
        <div className="flex items-center justify-between border-b border-ink/10 px-6 py-4">
          <h2 id="dialog-title" className="text-[15px] font-medium">{title}</h2>
          <button type="button" onClick={onClose} className="label text-muted-foreground hover:text-foreground" data-autofocus>
            Close
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {actions && <div className="flex flex-wrap justify-end gap-2 border-t border-ink/10 px-6 py-4">{actions}</div>}
      </div>
    </div>
  );
}

interface ConfirmOptions {
  title: string;
  body: React.ReactNode;
  confirm: string;
  danger?: boolean;
}

const ConfirmContext = React.createContext<(options: ConfirmOptions) => Promise<boolean>>(async () => false);
const ToastContext = React.createContext<(message: string, tone?: "neutral" | "negative") => void>(() => {});

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = React.useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const [toasts, setToasts] = React.useState<{ id: number; message: string; tone: "neutral" | "negative" }[]>([]);

  const confirm = React.useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...options, resolve })), []);
  const toast = React.useCallback((message: string, tone: "neutral" | "negative" = "neutral") => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), tone === "negative" ? 7000 : 3600);
  }, []);

  const settle = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      <ToastContext.Provider value={toast}>
        {children}
        <Dialog
          open={pending !== null}
          title={pending?.title ?? ""}
          onClose={() => settle(false)}
          actions={
            <>
              <Button variant="ghost" onClick={() => settle(false)}>Keep it</Button>
              <Button variant={pending?.danger ? "danger" : "primary"} onClick={() => settle(true)}>{pending?.confirm}</Button>
            </>
          }
        >
          <div className="text-[14px] leading-relaxed text-muted-foreground">{pending?.body}</div>
        </Dialog>
        <div aria-live="polite" className="pointer-events-none fixed bottom-5 left-1/2 z-[90] flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2">
          {toasts.map((t) => (
            <div key={t.id} role={t.tone === "negative" ? "alert" : "status"} className={`animate-in fade-in slide-in-from-bottom-2 px-4 py-3 text-[13px] shadow-lg ${t.tone === "negative" ? "bg-[#8a2f22] text-chalk" : "bg-ink text-chalk"}`}>
              {t.message}
            </div>
          ))}
        </div>
      </ToastContext.Provider>
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => React.useContext(ConfirmContext);
export const useToast = () => React.useContext(ToastContext);

