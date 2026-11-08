import * as React from "react";
import { Outlet, ScrollRestoration, useLocation } from "react-router";
import { BagDrawer } from "@/components/BagDrawer";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

/** Scrolls to #anchors after navigation, which the router leaves to the app. */
function useHashScroll() {
  const { hash, pathname } = useLocation();
  React.useEffect(() => {
    if (!hash) return;
    const frame = requestAnimationFrame(() => document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView());
    return () => cancelAnimationFrame(frame);
  }, [hash, pathname]);
}

export function Layout() {
  useHashScroll();
  return (
    <>
      <a href="#main" className="label sr-only z-[70] bg-foreground px-4 py-3 text-background focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main">
        <Outlet />
      </main>
      <SiteFooter />
      <BagDrawer />
      <ScrollRestoration getKey={(location) => location.pathname} />
    </>
  );
}
