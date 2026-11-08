import { Link } from "react-router";
import { useCatalog } from "@/catalog/CatalogProvider";
import { WordmarkBanner } from "./Wordmark";

export function SiteFooter() {
  const catalog = useCatalog();
  const { settings, collections } = catalog;
  const collection = collections.find((candidate) => candidate.id === settings.home.featuredCollectionId);
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-[1600px] px-4 pt-16 sm:px-6 lg:px-10">
        <div className="grid gap-12 md:grid-cols-12">
          <div className="md:col-span-5">
            <p className="type-wide max-w-[24ch] text-xl font-extralight leading-snug">{settings.rail.heading}</p>
          </div>
          <nav aria-label="Footer" className="md:col-span-3 md:col-start-7">
            <p className="label mb-4 text-muted-foreground">Store</p>
            <ul className="flex flex-col gap-2.5 text-[14px]">
              {settings.footer.links.map((link) => (
                <li key={link.href}>
                  <Link to={link.href} className="link-draw">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="md:col-span-3">
            <p className="label mb-4 text-muted-foreground">Now showing</p>
            {collection && (
              <p className="text-[14px] leading-relaxed">
                {collection.title}
                <br />
                <span className="text-muted-foreground">{collection.season}</span>
              </p>
            )}
          </div>
        </div>
        <WordmarkBanner name={settings.name} className="mt-20 text-foreground" />
        <div className="flex flex-col gap-2 border-t border-border py-6 text-[12px] text-muted-foreground sm:flex-row sm:justify-between">
          <p>{settings.footer.note}</p>
          <p className="tabular">© {new Date().getFullYear()} {settings.name}</p>
        </div>
      </div>
    </footer>
  );
}
