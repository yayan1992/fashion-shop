# Setting up your STILLFORM store

About twenty minutes from a fresh download to a working store you can manage. You need:

- [Node.js 20+](https://nodejs.org)
- a free [Supabase](https://supabase.com) account
- a free [Cloudflare](https://dash.cloudflare.com/sign-up) account, for the bot check on checkout

You never edit code to manage products.

**Using Claude Code?** Claude can do most of the setup for you with the Supabase CLI, signed in as you:
- linking the project
- applying the database and demo collection
- writing `.env.local`
- deploying the checkout function
- making your account an administrator
- running the checks

Three things are yours to do, because they need your browser or a secret:
1. **Sign in to Supabase.** Run `npx supabase login` in your own terminal; it opens your browser.
2. **Create the free accounts:** a Supabase project and a Cloudflare Turnstile widget (step 4).
3. **Enter your secrets.** Run `npm run setup` in your own terminal, not through Claude: it asks for your Turnstile secret key and your owner password in hidden prompts, and skips everything Claude already did.

Never paste a secret key or password into the chat, or into a `!` command, which shares it with Claude.

## The quick way

```bash
npm install
npx supabase login        # once; opens your browser
npm run setup
```

`npm run setup` walks through steps 2 to 6 below, explaining and asking before each change:
- linking your project
- the database and demo collection
- `.env.local`
- the Turnstile keys and the checkout function
- your owner account
- checking that sign-ups are off

Secrets you type are hidden and never saved in the project. You can run it again at any time: what's already done is skipped. `npm run setup -- --check` only reports what's done and what isn't.

You still create a project in Supabase (step 1) and a Turnstile widget in Cloudflare (step 4) yourself, and turn off sign-ups in the Supabase dashboard (the setup links you to the right page). The steps below explain everything, if you'd rather do it by hand.

## What goes where

| | Where it lives | Secret? |
| --- | --- | --- |
| Project URL, publishable (anon) key, Turnstile **site** key | `.env.local` and your host's environment variables | No, the browser sees them |
| Turnstile **secret** key | Supabase, set with `npx supabase secrets set` | Yes, never in `.env.local` or code |
| Secret / `service_role` key | Stays in Supabase. Nothing in the store needs it | Yes |
| Test project and accounts (`.env.test.local`) | Only for the optional developer checks at the end | Yes, development only |

## 0. Try it first (optional)

```bash
npm install
npm run dev
```

Open http://localhost:5173. Without Supabase, the store runs on its demo collection. Everything works except checkout, and `/admin` explains how to connect.

## 1. Create a Supabase project

1. In Supabase, create a new project. Any region and the free plan are fine.
2. Save the database password somewhere safe.
3. Keep the **Data API** enabled. The "automatically expose new tables and functions" option can be on or off; the setup grants exactly the access the store needs either way.
4. Note the **project ref**: the part before `.supabase.co` in the Project URL. You'll find it in **Project Settings → General**.

## 2. Set up the database

### Recommended: the Supabase CLI

```bash
npx supabase login                               # opens your browser once
npx supabase link --project-ref <your-project-ref>
npx supabase db push --dry-run                   # shows what will be applied
npx supabase db push --include-seed              # applies it, with the demo collection
```

This applies the migrations in `supabase/migrations/` in order: the tables, the security rules, the image storage bucket and the checkout protection. `--include-seed` then loads `supabase/seed.sql`, the demo STILLFORM collection. The seed only adds the demo collection when the store has no products yet, so it never overwrites your own.

### Alternative: the SQL Editor

1. In Supabase, open the **SQL Editor** and choose **New query**.
2. Paste all of `supabase/setup.sql` and click **Run**.

It holds the same migrations and the seed in one file, and it's safe to run again. Use one method or the other, not both.

## 3. Connect the store

```bash
cp .env.example .env.local
```

From **Project Settings → API**, put the **Project URL** and the **publishable** key (older projects call it the **anon public** key) into `.env.local`. Never copy the secret or `service_role` key into this project.

Restart `npm run dev`. The storefront now loads its collection from your database.

## 4. Protect checkout

Orders don't go straight from the browser to the database. They go through a small Supabase Edge Function, `place-order`. It does three things before the database sees an order:

1. It limits each connection to 5 order attempts in 10 minutes and 20 a day.
2. It checks with Cloudflare that a person, not a script, placed the order. This uses Cloudflare Turnstile.
3. It hands the order to the database, which prices it and takes the stock.

The database refuses orders from anywhere else. Turnstile is free and usually invisible to shoppers.

1. **Create the Turnstile widget.**
   1. In the Cloudflare dashboard, open **Turnstile → Add widget**.
   2. Name it after your store.
   3. Under hostnames, add your shop's domain, and `localhost` for testing on your computer.
   4. Choose **Managed** mode.
   5. Copy the **site key** and the **secret key**.
2. **Add the site key to the store.** Put it in `.env.local` as `VITE_TURNSTILE_SITE_KEY=…`.
3. **Give the secret key to Supabase and deploy the function.** Run these yourself in the terminal:

   ```bash
   npx supabase secrets set TURNSTILE_SECRET_KEY=<your-secret-key>
   npx supabase functions deploy place-order --no-verify-jwt
   ```

   `--no-verify-jwt` is needed because shoppers don't have accounts. The function checks Turnstile instead of a sign-in.

Without the secret, the function keeps checkout closed and tells shoppers to try later. If you used the SQL Editor in step 2, you still need the CLI for this step: run `npx supabase login` and `npx supabase link` from step 2 first.

## 5. Create your account and make yourself an administrator

1. In Supabase, open **Authentication → Users → Add user → Create new user**. Enter your email and a strong password, and tick **Auto confirm user**.
2. Open **Authentication → Sign In / Providers** and turn **off** "Allow new users to sign up". The store has no public sign-up, and this keeps strangers from creating accounts at all.
3. Make yourself an administrator:

   ```bash
   npm run admin:grant -- you@example.com
   ```

   This uses your Supabase login through the CLI and adds you to the store's administrator list. It doesn't put your details into any file.

   Without the CLI, run this in the **SQL Editor** instead:

   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'you@example.com'
   on conflict do nothing;
   ```

Only someone with access to your Supabase project can do this. Being signed in isn't enough to manage the store: the database checks the administrator list on every change. To remove an administrator, run `delete from public.admins where user_id = (select id from auth.users where email = '…');`.

## 6. Check the setup

```bash
npm run verify:remote
```

This runs read-only checks against your project with the publishable key, as a visitor would. It checks that:

- the collection loads
- orders, customer details and private settings are closed to visitors
- visitors can't change prices or upload files
- sign-ups are off
- orders can't skip the checkout function

It expects the demo collection, so run it right after setup. It needs no test accounts.

## 7. Open the dashboard

Go to http://localhost:5173/admin and sign in. From the dashboard you can:

- **Products:** add a piece with just a name, a price, sizes and one front photo; align the photo on the rail and preview it; publish.
- **Rail:** choose and reorder the hangers on the homepage.
- **Collections:** group pieces and choose the homepage selection.
- **Lookbook:** replace the campaign photos, edit the words, reorder or hide spreads.
- **Orders:** confirm, ship, mark paid, cancel.
- **Settings:** store details, payment methods, shipping, policies and homepage text.

## 8. Open checkout

Checkout starts closed. To open it:

1. In **Settings → Checkout**, turn on at least one payment method: cash on delivery, bank transfer or pay at pickup.
2. Edit its instructions.
3. Turn on **Open checkout**.

Customers can then place orders, and you mark them paid when the money arrives. No card details are ever taken.

**Default policy:** shipping is free and prices include tax, until you set a flat rate (and optional free-shipping threshold) in **Settings → Shipping**.

## 9. Replace the demo collection

Add your own pieces from **Products → Add a product**, then archive or delete the demo pieces.

Photos you upload go to your Supabase storage. The demo photos are served from this project's `public/media` folder; once nothing uses them, you can delete that folder.

**For the best rail photos:**
- A transparent PNG cut-out with the hanger hook at the top works best.
- A photo against a plain, light wall also works; the photo editor removes plain backgrounds.
- Shoot the front, back and side views with the camera and hanger in the same place, so the garment keeps its size as it turns.

## 10. Deploy

Run `npm run preflight` first. It refuses to pass while anything would launch with test protection. Then follow [`docs/DEPLOY.md`](DEPLOY.md): host settings, Supabase URL settings and the Turnstile widget's domains. It also covers the backend-free showroom (`npm run build:demo`).

## If something goes wrong

| Symptom | Fix |
| --- | --- |
| "The collection couldn't be loaded." | Check the URL and publishable key in `.env.local` (or your host's environment variables). Make sure step 2 finished without errors. |
| "This account isn't an administrator." | Run step 5's `admin:grant` with exactly the email you signed in with. |
| Checkout says it isn't open | Turn on a payment method and **Open checkout** in Settings. |
| "Checkout isn't fully set up yet." | `VITE_TURNSTILE_SITE_KEY` is missing, the `place-order` function isn't deployed, or `TURNSTILE_SECRET_KEY` isn't set. Redo step 4. |
| "We couldn't confirm this order came from a person." | The site key and secret key come from different widgets, or this domain isn't in the widget's hostnames. A browser extension that blocks scripts from `challenges.cloudflare.com` also causes it. |
| "Too many order attempts from this connection." | The limit is 5 attempts per 10 minutes. Wait a few minutes. |
| Photo upload fails | Use JPEG, PNG, WebP or AVIF under 10 MB. Make sure step 2 created the `media` bucket (Storage in Supabase). |

---

## For developers: testing against a real project (optional)

None of this is needed to run a store. It creates throwaway accounts and test orders, so **use a separate test project, never a store with customers**.

Name the test project in `.env.test.local`, which is gitignored, so these tools refuse to run anywhere else:

```bash
echo "STILLFORM_TEST_PROJECT_REF=<your-test-project-ref>" >> .env.test.local && chmod 600 .env.test.local
```

| Command | What it does |
| --- | --- |
| `npm run remote:users` | Creates two test accounts, a future administrator and a shopper, with confirmed emails and random passwords. Saves them to `.env.test.local` (gitignored, permissions 600). Uses Supabase's admin API with the secret key, fetched through your CLI login and kept in memory only. |
| `npm run admin:grant -- <admin test email>` | Makes the test administrator an administrator. |
| `npm run verify:remote -- --users` | Adds sign-in checks for the shopper and the administrator: refused vs allowed, session refresh, sign-out, and uploading, replacing and deleting an image. |
| `npm run test:remote` | The owner's and a shopper's journeys in a real browser: add and publish a product from one photo, replace the photo, change stock, reorder the rail, check out, cancel with restock. At the end it closes checkout, takes the product off the rail and unpublishes it. |
| `npm run remote:cleanup` | Shows exactly what the tests created: the test product, its images and files, the cancelled test orders and the test accounts. Add `-- --apply` to delete them. |

For checkout in `test:remote`, the **test project** needs Cloudflare's always-pass test secret, plus an explicit opt-in:

```bash
npx supabase secrets set TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA TURNSTILE_ALLOW_TEST_KEYS=true
```

Test keys verify nothing, so they are never treated as protection by accident:
- Without `TURNSTILE_ALLOW_TEST_KEYS=true`, the function refuses Cloudflare's test secrets and keeps checkout closed.
- A production build of the store ignores Cloudflare's test site keys.

Never set the opt-in on a store with customers. To remove it, run `npx supabase secrets unset TURNSTILE_ALLOW_TEST_KEYS`.

Each run uses 4 of the 5 order attempts a connection gets per 10 minutes.
