# Deploying STILLFORM

Both kinds of site are static: the build output can go on any static host. Single-page routing is already configured: `public/_redirects` for Netlify and Cloudflare Pages, `vercel.json` for Vercel, and `public/.htaccess` for Apache and LiteSpeed hosts such as Hostinger.

| | Your store | The showroom (live demo) |
| --- | --- | --- |
| **What it is** | A real shop: your catalogue in Supabase, checkout, the Studio at `/admin` | The full storefront, rail, lookbook, product pages and bag on the built-in collection. Checkout shows "This is a preview of the store." and there is no real Studio: the Demo Studio at `/demo/admin` is a simulation on fictional, browser-local data |
| **Build command** | `npm run build` | `npm run build:demo` |
| **Output directory** | `dist` | `dist` |
| **Environment variables** | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_TURNSTILE_SITE_KEY` | None |
| **Needs** | A Supabase project, a Cloudflare Turnstile widget, a domain | Only a domain (or the host's free subdomain) |
| **Check first** | `npm run preflight` | `npm run preflight -- --demo` |

## The showroom

`npm run build:demo` builds the store on its built-in 8-piece collection and the images in `public/media`.

It's backend-free by construction: it reads no `.env` files and blanks every Supabase and Turnstile setting. So it can't connect to a database or take an order, even if such values are on the host by mistake. It leaves the real Studio out: `/admin` shows "not found", with no sign-in and no database calls. In its place the showroom carries the Demo Studio at `/demo/admin`: the same dashboard pages over fictional data kept in the visitor's browser (a **Reset demo** button restores it), which also drives the demo storefront. Nothing is sent anywhere. The bag works and is kept in the visitor's browser.

1. Run `npm run preflight -- --demo`. It builds the showroom and checks that the build contains:
   - no Supabase project, key or Turnstile key
   - no real Studio sign-in, and the Demo Studio present
   - every image
   - routing for the host
2. On the host, create a site from the repository with build command `npm run build:demo` and output directory `dist`. Add no environment variables.
3. After deploying, open a product page directly, refresh it, and open `/checkout` and `/admin`. You should see a preview message on `/checkout` and "not found" on `/admin`.

`npm run test:showroom` runs the same checks in a browser against the production demo build.

## Your store

A Cloudflare account is free, and your domain doesn't have to be on Cloudflare to use Turnstile. Each Turnstile widget gives you two keys:
- a **site key**, which is public and goes in the host's environment variables
- a **secret key**, which goes only into Supabase with `npx supabase secrets set`

### 1. Check before you deploy

```bash
npm run preflight                      # your store: .env.production.local, or .env.local
```

Preflight fails, and you shouldn't deploy, if any of these is true:
- the site key is a test key
- the function accepts a fake token
- `TURNSTILE_ALLOW_TEST_KEYS` is still set
- sign-ups are on
- orders can reach the database without the function

A production build also refuses to compile with a Cloudflare test site key.

### 2. Host settings

| Setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Output directory | `dist` |
| Node.js version | 20 or newer |
| Environment variables | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_TURNSTILE_SITE_KEY` |

Never add the Turnstile secret key, the Supabase secret key or the `service_role` key to the host. The site needs none of them.

### 3. Supabase settings for the domain

- **Authentication → URL Configuration:** set **Site URL** to `https://your-domain`, and add it to **Redirect URLs**.
- **Authentication → Sign In / Providers:** "Allow new users to sign up" stays **off**.
- **Edge Functions secrets:** `TURNSTILE_SECRET_KEY` set to your widget's secret, and no `TURNSTILE_ALLOW_TEST_KEYS`.

### 4. After the first deploy

1. Open the site, put a piece in the bag and open checkout. The Turnstile check should be invisible, or show a single tick box.
2. If checkout is open, place one order with your own details, then cancel it in the dashboard.
3. Sign in at `/admin` on your store (not the demo).

## Hostinger

### Recommended: a Node.js Web App imported from GitHub

Hostinger builds the site from your GitHub repository and redeploys it on every push. You need a plan with Node.js Web Apps, such as Business web hosting or Cloud.

1. **Create the app.** In hPanel, add a Node.js Web App and choose to import from GitHub. A popup asks you to install the Hostinger GitHub App; give it access to your store's repository.
2. **Review the build settings.** Hostinger detects Vite and pre-fills them. Check them against this table:

   | Setting | Your store | The showroom |
   | --- | --- | --- |
   | Framework | Vite | Vite |
   | Build script | `build` | `build:demo` |
   | Output directory | `dist` | `dist` |
   | Entry file | empty (a static site, no server) | empty |
   | Node.js version | 22 | 22 |

3. **Environment variables, before the first build (your store only).** Add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `VITE_TURNSTILE_SITE_KEY`, with the same values as in `.env.local`. Hostinger passes them into the build. Saving them later redeploys the site, which is what bakes new values in. The showroom needs no variables.
4. **Deploy.** Before the first deploy, run `npm run preflight` (or `npm run preflight -- --demo`) on your computer. After that, every push to the connected branch rebuilds the site.
5. **Domain, SSL and services.** Connect your domain and turn on SSL in hPanel. For your store, also update Supabase as in "Supabase settings for the domain" above, and add the domain to your Turnstile widget's hostnames.
6. **Check direct links once.** Hostinger publishes the build to `public_html` and manages an `.htaccess` file there itself; its documentation doesn't say how it handles paths that only exist in the app. The build includes this project's own `.htaccess`, which sends such paths to the app.

   After the first deploy:
   - open a product page directly (e.g. `/products/heavyweight-tee`) and refresh it
   - if Hostinger shows a 404, use the alternative below, where this project's `.htaccess` always applies

### Alternative: upload the built files

This works on every Hostinger web hosting plan, but you upload again after each change.

1. Put your store's three values in `.env.production.local`; the showroom needs none.
2. Check and build:

   ```bash
   npm run preflight && npm run build                 # your store
   npm run preflight -- --demo && npm run build:demo  # or the showroom
   ```

3. In hPanel, open **Files → File Manager → public_html**. Turn on **Show hidden files** and remove the placeholder `default.php` if there is one. Then upload everything inside `dist/`, including `.htaccess`, which makes direct links and refreshes work.
4. Turn on SSL, and point Supabase and Turnstile at the domain as above.
