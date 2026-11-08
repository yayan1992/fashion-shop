import * as React from "react";
import { Link, useLocation } from "react-router";
import { useBag } from "@/bag/BagProvider";
import { useCatalog } from "@/catalog/CatalogProvider";
import { useFocusTrap, useScrollLock } from "@/lib/hooks";
import { Wordmark } from "./Wordmark";

const NAV = [
  { label: "Shop", to: "/shop" },
  { label: "Collection", to: "/#collection" },
  { label: "Lookbook", to: "/#lookbook" },
];

export function SiteHeader() {
  const catalog = useCatalog();
  const bag = useBag();
  const location = useLocation();
  const [scrolled, setScrolled] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Any navigation closes the menu.
  const [menuLocation, setMenuLocation] = React.useState(location);
  if (menuLocation !== location) {
    setMenuLocation(location);
    setMenuOpen(false);
  }
  useScrollLock(menuOpen);
  useFocusTrap(menuRef, menuOpen, () => setMenuOpen(false));

  const solid = scrolled || location.pathname !== "/";

  return (
    <header className={`fixed inset-x-0 top-0 z-40 transition-[background-color,border-color,backdrop-filter] duration-500 ${solid ? "border-b border-border/70 bg-background/85 backdrop-blur-md" : "border-b border-transparent"}`}>
      <div className="mx-auto grid h-16 max-w-[1600px] grid-cols-[1fr_auto_1fr] items-center px-4 sm:px-6 lg:px-10">
        <nav aria-label="Main" className="hidden items-center gap-8 md:flex">
          {NAV.map((item) => (
            <Link key={item.label} to={item.to} className="label link-draw py-1" aria-current={location.pathname === item.to ? "page" : undefined}>
              {item.label}
            </Link>
          ))}
        </nav>
        <button type="button" className="label -ml-1 justify-self-start px-1 py-2 md:hidden" aria-expanded={menuOpen} aria-controls="site-menu" onClick={() => setMenuOpen(true)}>
          Menu
        </button>

        <Link to="/" className="justify-self-center px-2 py-2 text-[13px] sm:text-sm" aria-label={`${catalog.settings.name}, home`}>
          <Wordmark name={catalog.settings.name} />
        </Link>

        <div className="flex items-center gap-5 justify-self-end lg:gap-8">
          {__DEMO_DASHBOARD__ && (
            <Link to="/demo/admin" className="label link-draw hidden whitespace-nowrap py-1 md:inline-block">
              View Demo Dashboard
            </Link>
          )}
          <button type="button" onClick={() => bag.setOpen(true)} className="label link-draw py-1" aria-label={`Bag, ${bag.count} ${bag.count === 1 ? "item" : "items"}`}>
            Bag <span className="tabular ml-1 inline-block min-w-[1ch]">{bag.count}</span>
          </button>
        </div>
      </div>

      <div
        ref={menuRef}
        id="site-menu"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        inert={!menuOpen}
        className={`fixed inset-0 z-50 flex flex-col bg-background px-4 transition-[opacity,visibility] duration-500 sm:px-6 md:hidden ${menuOpen ? "visible opacity-100" : "invisible opacity-0"}`}
      >
        <div className="flex h-16 items-center justify-between">
          <span className="text-[13px]">
            <Wordmark name={catalog.settings.name} />
          </span>
          <button type="button" className="label px-1 py-2" onClick={() => setMenuOpen(false)} data-autofocus>
            Close
          </button>
        </div>
        <nav aria-label="Mobile" className="mt-10 flex flex-col">
          {NAV.map((item, i) => (
            <Link
              key={item.label}
              to={item.to}
              onClick={() => setMenuOpen(false)}
              className={`type-wide border-b border-border py-5 text-[2rem] font-extralight tracking-[-0.01em] transition-[opacity,translate] duration-700 ease-(--ease-settle) motion-reduce:transition-none ${menuOpen ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"}`}
              style={{ transitionDelay: menuOpen ? `${120 + i * 60}ms` : "0ms" }}
            >
              {item.label}
            </Link>
          ))}
          {__DEMO_DASHBOARD__ && (
            <Link
              to="/demo/admin"
              onClick={() => setMenuOpen(false)}
              className={`type-wide border-b border-border py-5 text-[2rem] font-extralight tracking-[-0.01em] transition-[opacity,translate] duration-700 ease-(--ease-settle) motion-reduce:transition-none ${menuOpen ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"}`}
              style={{ transitionDelay: menuOpen ? `${120 + NAV.length * 60}ms` : "0ms" }}
            >
              View Demo Dashboard
            </Link>
          )}
        </nav>
        <p className="mt-auto pb-8 text-[13px] text-muted-foreground">{catalog.settings.rail.eyebrow}</p>
      </div>
    </header>
  );
}
