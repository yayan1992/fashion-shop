import * as React from "react";
import { Link } from "react-router";
import { Wordmark } from "@/components/Wordmark";
import { supabase } from "@/lib/supabase";
import { Button, Field, Input } from "../ui";

export default function LoginPage() {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error: failure } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (failure) setError(/invalid/i.test(failure.message) ? "That email and password don’t match an account." : "Sign-in failed. Check your connection and try again.");
  };

  return (
    <div className="grid min-h-svh bg-plaster md:grid-cols-2">
      <div className="tone-ink hidden flex-col justify-between p-12 md:flex">
        <Wordmark name="STILLFORM" className="text-[13px]" />
        <p className="type-wide max-w-[16ch] text-[clamp(2rem,3.4vw,3.25rem)] font-extralight leading-[1.05] tracking-[-0.02em]">The studio behind the rail.</p>
        <Link to="/" className="label text-muted-foreground hover:text-foreground">← Back to the store</Link>
      </div>
      <div className="flex items-center justify-center px-6 py-16">
        <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-6" noValidate>
          <div className="flex flex-col gap-2">
            <p className="label text-muted-foreground">Studio</p>
            <h1 className="type-wide text-3xl font-extralight">Sign in</h1>
            <p className="text-[14px] text-muted-foreground">For store administrators. There is no public sign-up.</p>
          </div>
          <Field label="Email" htmlFor="login-email">
            <Input id="login-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Password" htmlFor="login-password">
            <Input id="login-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <div aria-live="polite">{error && <p className="text-[13px] text-[#8a2f22]">{error}</p>}</div>
          <Button type="submit" variant="primary" loading={busy} disabled={!email || !password}>Sign in</Button>
        </form>
      </div>
    </div>
  );
}
