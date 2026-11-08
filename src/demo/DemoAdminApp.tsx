import * as React from "react";
import { useNavigate } from "react-router";
import { AdminDataProvider, AdminRoutes, Shell } from "@/admin/AdminApp";
import { ADMIN_BASE } from "@/admin/paths";
import { Button, FeedbackProvider, useConfirm, useToast } from "@/admin/ui";
import { useDocumentTitle } from "@/lib/hooks";
import { demoStore } from "./store";

/**
 * The showroom's Studio: the real dashboard pages over fictional, browser-local
 * data. No sign-in, no Supabase, no uploads leave the page.
 */
export default function DemoAdminApp() {
  useDocumentTitle("Demo Studio — STILLFORM");
  const [round, setRound] = React.useState(0);
  return (
    <FeedbackProvider>
      <Frame round={round} onReset={() => setRound((n) => n + 1)} />
    </FeedbackProvider>
  );
}

function Frame({ round, onReset }: { round: number; onReset: () => void }) {
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();
  const reset = async () => {
    const ok = await confirm({
      title: "Reset the demo?",
      body: "Every change you made in this browser is discarded and the original fictional collection, rail and orders come back.",
      confirm: "Reset demo",
      danger: true,
    });
    if (!ok) return;
    demoStore.reset();
    onReset();
    navigate(ADMIN_BASE, { replace: true });
    toast("Demo reset to the original collection.");
  };
  return (
    <AdminDataProvider key={round}>
      <Shell
        email="demo@stillform.example"
        account={
          <button type="button" onClick={reset} className="self-start text-ink/70 hover:text-ink">
            Reset demo
          </button>
        }
        banner={<DemoBanner onReset={reset} />}
      >
        <AdminRoutes />
      </Shell>
    </AdminDataProvider>
  );
}

function DemoBanner({ onReset }: { onReset: () => void }) {
  const stored = React.useSyncExternalStore(demoStore.subscribe, demoStore.persisted);
  return (
    <div role="note" data-testid="demo-banner" className="mb-8 flex flex-col gap-3 border border-ink/15 bg-bone px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:mb-10">
      <p className="text-[13px] leading-relaxed text-ink/80">
        <span className="label mr-2 text-ink">Demo Studio</span>
        Fictional data, saved only in this browser. Edit products, prices, stock, the rail, collections, the lookbook, orders and settings, and watch the store follow. No login, no database, no real checkout.
        {!stored && <span className="ml-1 text-[#8a2f22]"> Your browser would not store these changes, so they last until you close this page.</span>}
      </p>
      <Button onClick={onReset} className="shrink-0 self-start sm:self-auto">Reset demo</Button>
    </div>
  );
}
