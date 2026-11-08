import { useCatalog } from "@/catalog/CatalogProvider";
import { Photo } from "@/components/Photo";
import { Reveal } from "@/components/Reveal";

export function Statement() {
  const { statement } = useCatalog().settings.home;
  return (
    <section aria-labelledby="statement-label" className="mx-auto max-w-[1600px] px-4 py-28 sm:px-6 md:py-40 lg:px-10">
      <div className="grid gap-x-5 gap-y-10 md:grid-cols-12">
        <p id="statement-label" className="label text-muted-foreground md:col-span-2 md:pt-4">
          {statement.label}
        </p>
        <Reveal className="md:col-span-9">
          <p className="type-wide text-balance text-[clamp(1.85rem,4.1vw,4.25rem)] font-extralight leading-[1.08] tracking-[-0.02em]">{statement.body}</p>
        </Reveal>
        {statement.mediaId && (
          <Reveal delay={120} className="md:col-span-4 md:col-start-3 md:mt-10">
            <Photo mediaId={statement.mediaId} ratio="4/5" sizes="(min-width: 768px) 30vw, 100vw" />
          </Reveal>
        )}
        <Reveal delay={200} className={`md:col-span-4 md:col-start-8 ${statement.mediaId ? "md:self-end" : ""}`}>
          <p className="border-t border-border pt-5 text-[15px] leading-relaxed text-muted-foreground">{statement.aside}</p>
        </Reveal>
      </div>
    </section>
  );
}
