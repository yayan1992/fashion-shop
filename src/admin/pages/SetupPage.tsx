import { Link } from "react-router";
import { Wordmark } from "@/components/Wordmark";

/** Shown at /admin while the store runs in demo mode. */
export default function SetupPage() {
  const steps = [
    ["Create a Supabase project", "Free tier is enough. Note its project ref, the part before .supabase.co in the project URL."],
    ["Create a Turnstile widget", "In Cloudflare, Turnstile → Add widget, with your domain and localhost. It protects checkout from bots and is free."],
    ["Run the guided setup", "In a terminal: npx supabase login, then npm run setup. It sets up the database and demo collection, your keys, checkout protection and your owner account."],
    ["Turn off public sign-ups", "The setup links you to the right page in Supabase and checks it for you."],
    ["Restart and sign in", "Restart npm run dev, then sign in here with the email and password you chose."],
  ];
  return (
    <div className="min-h-svh bg-plaster px-6 py-16">
      <div className="mx-auto flex max-w-2xl flex-col gap-10">
        <Wordmark name="STILLFORM" className="text-[13px]" />
        <div className="flex flex-col gap-3">
          <p className="label text-muted-foreground">Studio</p>
          <h1 className="type-wide text-[clamp(2rem,4vw,3rem)] font-extralight leading-tight">Connect your store to open the dashboard.</h1>
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            The storefront is running on its demo collection. The dashboard needs a Supabase project to save products, photos and orders. It takes about twenty minutes.
          </p>
        </div>
        <ol className="flex flex-col divide-y divide-ink/10 border-y border-ink/10">
          {steps.map(([title, body], i) => (
            <li key={title} className="grid grid-cols-[2.5rem_1fr] gap-2 py-5">
              <span className="tabular text-[13px] text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <p className="text-[15px] font-medium">{title}</p>
                <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">{body}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="text-[14px] text-muted-foreground">
          Full instructions: <code className="text-ink">docs/SETUP.md</code>. <Link to="/" className="underline underline-offset-2">Back to the store</Link>
        </p>
      </div>
    </div>
  );
}
