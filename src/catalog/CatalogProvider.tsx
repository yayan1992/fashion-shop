import * as React from "react";
import { backendConfigured, call } from "@/lib/supabase";
import { demoStore } from "@/demo/store";
import { localCatalog } from "./local";
import type { Catalog } from "./types";

// The storefront reads all content through this context. Without Supabase
// configured it shows the local demo collection; with Supabase it loads the
// published catalogue from the database, which is then the only source of
// truth for products and stock. A failed load is shown as an error, never
// papered over with demo data.

export type CatalogSource = "demo" | "live";

interface CatalogState {
  catalog: Catalog;
  source: CatalogSource;
  /** Fetches the catalogue again (after an order, or a change in the dashboard). */
  reload: () => Promise<void>;
}

const CatalogContext = React.createContext<CatalogState | null>(null);

const noSubscribe = () => () => undefined;
const noSnapshot = () => null;

const fetchCatalog = () => call<Catalog>("storefront_catalog");

export function CatalogProvider({ children, catalog: fixed }: { children: React.ReactNode; catalog?: Catalog }) {
  const live = !fixed && backendConfigured;
  // The showroom's catalogue is the browser-local demo, so edits made in the
  // Demo Studio show up in the store. Other builds never take this branch.
  const demo = __DEMO_DASHBOARD__ && !fixed;
  const demoCatalog = React.useSyncExternalStore(
    demo ? demoStore.subscribe : noSubscribe,
    demo ? demoStore.storefront : noSnapshot,
  );
  const [stored, setCatalog] = React.useState<Catalog | null>(fixed ?? (live ? null : localCatalog));
  const catalog = demo ? demoCatalog : stored;
  const [failed, setFailed] = React.useState(false);

  const reload = React.useCallback(async () => {
    if (!live) return;
    setCatalog(await fetchCatalog());
  }, [live]);

  React.useEffect(() => {
    if (!live) return;
    let cancelled = false;
    fetchCatalog().then(
      (loaded) => !cancelled && setCatalog(loaded),
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, [live, failed]);

  const value = React.useMemo(() => (catalog ? { catalog, source: (live ? "live" : "demo") as CatalogSource, reload } : null), [catalog, live, reload]);

  if (failed && !catalog) return <StoreUnavailable onRetry={() => setFailed(false)} />;
  if (!value) return <StoreLoading />;
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

function StoreLoading() {
  return (
    <div role="status" aria-label="Loading the store" className="grid min-h-svh place-items-center">
      <span className="type-wide animate-pulse text-[13px] tracking-[0.34em] text-muted-foreground motion-reduce:animate-none">STILLFORM</span>
    </div>
  );
}

function StoreUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-6 px-6">
      <p className="label text-muted-foreground">Store unavailable</p>
      <h1 className="type-wide text-3xl font-extralight leading-tight">The collection couldn&rsquo;t be loaded.</h1>
      <p className="text-[15px] leading-relaxed text-muted-foreground">Check your connection and try again. If you run this store, check that the Supabase URL and key in your environment are correct.</p>
      <button type="button" onClick={onRetry} className="label link-draw self-start py-1">
        Try again
      </button>
    </div>
  );
}

export function useCatalog(): Catalog {
  const state = React.useContext(CatalogContext);
  if (!state) throw new Error("useCatalog must be used inside <CatalogProvider>");
  return state.catalog;
}

export function useCatalogState(): CatalogState {
  const state = React.useContext(CatalogContext);
  if (!state) throw new Error("useCatalogState must be used inside <CatalogProvider>");
  return state;
}
