import { Link } from "react-router";
import { useDocumentTitle } from "@/lib/hooks";

export default function NotFoundPage() {
  useDocumentTitle("Page not found — STILLFORM");
  return (
    <div className="mx-auto flex min-h-[70svh] max-w-[1600px] flex-col justify-center gap-8 px-4 pt-16 sm:px-6 lg:px-10">
      <p className="label text-muted-foreground">Not found</p>
      <h1 className="type-wide max-w-[18ch] text-[clamp(2rem,5vw,4rem)] font-extralight leading-[1.05] tracking-[-0.02em]">This page isn&rsquo;t on the rail.</h1>
      <div className="flex gap-8">
        <Link to="/" className="label link-draw py-1">
          Go to the rail
        </Link>
        <Link to="/shop" className="label link-draw py-1">
          Shop all pieces
        </Link>
      </div>
    </div>
  );
}
