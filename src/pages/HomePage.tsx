import { useCatalog } from "@/catalog/CatalogProvider";
import { useDocumentTitle } from "@/lib/hooks";
import { FeaturedCollection } from "@/sections/FeaturedCollection";
import { Lookbook } from "@/sections/Lookbook";
import { RailHero } from "@/sections/RailHero";
import { Statement } from "@/sections/Statement";

export default function HomePage() {
  const { settings } = useCatalog();
  useDocumentTitle(`${settings.name} — ${settings.rail.eyebrow}`);
  return (
    <>
      <RailHero />
      <Statement />
      <FeaturedCollection />
      <Lookbook />
    </>
  );
}
