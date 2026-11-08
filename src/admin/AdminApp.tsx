import * as React from "react";
import type { Session } from "@supabase/supabase-js";
import { Link, NavLink, Navigate, Route, Routes, useLocation } from "react-router";
import { useCatalogState } from "@/catalog/CatalogProvider";
import { Wordmark } from "@/components/Wordmark";
import { useDocumentTitle } from "@/lib/hooks";
import { supabase } from "@/lib/supabase";
import { api, describeError, type AdminCatalog } from "./api";
import CollectionsPage from "./pages/CollectionsPage";
import LoginPage from "./pages/LoginPage";
import LookbookPage from "./pages/LookbookPage";
import OrderPage from "./pages/OrderPage";
import OrdersPage from "./pages/OrdersPage";
import OverviewPage from "./pages/OverviewPage";
import ProductEditorPage from "./pages/ProductEditorPage";
import ProductsPage from "./pages/ProductsPage";
import RailPage from "./pages/RailPage";
import SettingsPage from "./pages/SettingsPage";
import SetupPage from "./pages/SetupPage";
import { Button, FeedbackProvider, Skeleton } from "./ui";
import { ADMIN_BASE } from "@/admin/paths";

// ---------------------------------------------------------------------------
// Session: signed in with Supabase Auth AND listed in public.admins. The second
// check happens in the database (is_admin()); every admin function repeats it.

type SessionState = { status: "loading" } | { status: "signed-out" } | { status: "not-admin"; email: string } | { status: "admin"; session: Session };

function useAdminSession(): SessionState {
  const [state, setState] = React.useState<SessionState>({ status: "loading" });
  React.useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    const resolve = async (session: Session | null) => {
      if (!session) return !cancelled && setState({ status: "signed-out" });
      const admin = await api.isAdmin().catch(() => false);
      if (!cancelled) setState(admin ? { status: "admin", session } : { status: "not-admin", email: session.user.email ?? "" });
    };
    supabase.auth.getSession().then(({ data }) => resolve(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") void resolve(session);
    });
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);
  return state;
}

// ---------------------------------------------------------------------------
// Admin data: the full catalogue including drafts, loaded once and refreshed
// after every save. Saves also refresh the storefront so changes show at once.

interface AdminData {
  data: AdminCatalog;
  refresh: () => Promise<void>;
}

const AdminDataContext = React.createContext<AdminData | null>(null);

export function useAdminData(): AdminData {
  const value = React.useContext(AdminDataContext);
  if (!value) throw new Error("useAdminData must be used inside the dashboard");
  return value;
}

export function AdminDataProvider({ children }: { children: React.ReactNode }) {
  const { reload } = useCatalogState();
  const [data, setData] = React.useState<AdminCatalog | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const refresh = React.useCallback(async () => {
    const [next] = await Promise.all([api.catalog(), reload().catch(() => undefined)]);
    setData(next);
  }, [reload]);
  React.useEffect(() => {
    api.catalog().then(setData, (e) => setError(describeError(e)));
  }, []);
  const value = React.useMemo(() => (data ? { data, refresh } : null), [data, refresh]);
  if (error) {
    return (
      <div className="p-10">
        <p className="text-[14px]">{error}</p>
      </div>
    );
  }
  if (!value) {
    return (
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  return <AdminDataContext.Provider value={value}>{children}</AdminDataContext.Provider>;
}

// ---------------------------------------------------------------------------

const NAV = [
  { to: `${ADMIN_BASE}`, label: "Overview", end: true },
  { to: `${ADMIN_BASE}/products`, label: "Products" },
  { to: `${ADMIN_BASE}/rail`, label: "Rail" },
  { to: `${ADMIN_BASE}/collections`, label: "Collections" },
  { to: `${ADMIN_BASE}/lookbook`, label: "Lookbook" },
  { to: `${ADMIN_BASE}/orders`, label: "Orders" },
  { to: `${ADMIN_BASE}/settings`, label: "Settings" },
];

export function Shell({ email, children, account, banner }: { email: string; children: React.ReactNode; account?: React.ReactNode; banner?: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const location = useLocation();
  const [lastPath, setLastPath] = React.useState(location.pathname);
  if (lastPath !== location.pathname) {
    setLastPath(location.pathname);
    setOpen(false);
  }
  const nav = (
    <nav aria-label="Dashboard" className="flex flex-col gap-0.5">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => `px-3 py-2 text-[14px] transition-colors ${isActive ? "bg-ink text-chalk" : "text-ink/70 hover:bg-ink/5 hover:text-ink"}`}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
  const footer = (
    <div className="flex flex-col gap-3 border-t border-ink/10 pt-4 text-[13px]">
      <Link to="/" target="_blank" className="text-ink/70 hover:text-ink">View store ↗</Link>
      <p className="truncate text-muted-foreground" title={email}>{email}</p>
      {account ?? <button type="button" onClick={() => supabase?.auth.signOut()} className="self-start text-ink/70 hover:text-ink">Sign out</button>}
    </div>
  );
  return (
    <div className="min-h-svh bg-plaster text-ink md:grid md:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="tone-bone sticky top-0 hidden h-svh flex-col gap-8 px-4 py-6 md:flex">
        <Link to={`${ADMIN_BASE}`} className="px-3 text-[12px]">
          <Wordmark name="STILLFORM" />
          <span className="label mt-1 block text-muted-foreground">Studio</span>
        </Link>
        {nav}
        <div className="mt-auto px-3">{footer}</div>
      </aside>
      <div className="tone-bone sticky top-0 z-30 flex h-14 items-center justify-between px-4 md:hidden">
        <Link to={`${ADMIN_BASE}`} className="text-[12px]"><Wordmark name="STILLFORM" /></Link>
        <button type="button" className="label" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? "Close" : "Menu"}</button>
      </div>
      {open && (
        <div className="tone-bone fixed inset-x-0 top-14 z-30 flex flex-col gap-6 border-b border-ink/10 px-4 pb-6 pt-2 shadow-lg md:hidden">
          {nav}
          {footer}
        </div>
      )}
      <main className="min-w-0 px-4 py-6 sm:px-6 md:px-10 md:py-10">
        {banner}
        {children}
      </main>
    </div>
  );
}

export function AdminRoutes() {
  return (
    <Routes>
      <Route index element={<OverviewPage />} />
      <Route path="products" element={<ProductsPage />} />
      <Route path="products/new" element={<ProductEditorPage />} />
      <Route path="products/:id" element={<ProductEditorPage />} />
      <Route path="rail" element={<RailPage />} />
      <Route path="collections" element={<CollectionsPage />} />
      <Route path="lookbook" element={<LookbookPage />} />
      <Route path="orders" element={<OrdersPage />} />
      <Route path="orders/:reference" element={<OrderPage />} />
      <Route path="settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to={`${ADMIN_BASE}`} replace />} />
    </Routes>
  );
}

export default function AdminApp() {
  useDocumentTitle("Studio — STILLFORM");
  const session = useAdminSession();
  if (!supabase) return <SetupPage />;
  if (session.status === "loading") {
    return (
      <div role="status" aria-label="Checking your session" className="grid min-h-svh place-items-center bg-plaster">
        <span className="label animate-pulse text-muted-foreground motion-reduce:animate-none">Studio</span>
      </div>
    );
  }
  if (session.status === "signed-out") return <LoginPage />;
  if (session.status === "not-admin") {
    return (
      <div className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-5 px-6">
        <p className="label text-muted-foreground">Studio</p>
        <h1 className="type-wide text-3xl font-extralight">This account isn&rsquo;t an administrator.</h1>
        <p className="text-[14px] leading-relaxed text-muted-foreground">
          You&rsquo;re signed in as {session.email}. Store owners grant dashboard access in the database; see “Make yourself an administrator” in docs/SETUP.md.
        </p>
        <Button className="self-start" onClick={() => supabase?.auth.signOut()}>Sign out</Button>
      </div>
    );
  }
  return (
    <FeedbackProvider>
      <AdminDataProvider>
        <Shell email={session.session.user.email ?? ""}>
          <AdminRoutes />
        </Shell>
      </AdminDataProvider>
    </FeedbackProvider>
  );
}
