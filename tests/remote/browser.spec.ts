// The owner's and a shopper's journeys in a real browser against the real
// Supabase project: npx playwright test --config playwright.remote.config.ts
//
// Database checks run through `supabase db query --linked` (your Supabase
// login). Checkout needs the place-order function deployed with Cloudflare's
// Turnstile test secret (see docs/SETUP.md); each run uses 4 of the 5 order
// attempts a connection gets per 10 minutes. Demo products are only read and ordered from; every stock edit,
// sell-out and photo change happens on a throwaway product named for this run.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const env = (file: string): Record<string, string> => {
  try {
    return Object.fromEntries(readFileSync(file, "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
  } catch {
    return {};
  }
};
const { VITE_SUPABASE_URL: url = "", VITE_SUPABASE_ANON_KEY: key = "" } = env(".env.local");
const accounts = env(".env.test.local");
// The test project, named explicitly so these tests never run against a real store.
const PROJECT = accounts.STILLFORM_TEST_PROJECT_REF ?? "";
const ADMIN = { email: accounts.STILLFORM_TEST_ADMIN_EMAIL ?? "", password: accounts.STILLFORM_TEST_ADMIN_PASSWORD ?? "" };
const SHOPPER = { email: accounts.STILLFORM_TEST_SHOPPER_EMAIL ?? "", password: accounts.STILLFORM_TEST_SHOPPER_PASSWORD ?? "" };

const RUN = process.env.STILLFORM_REMOTE_RUN!;
const NAME = `Test Tee ${RUN}`;
const SLUG = `test-tee-${RUN}`;
const FIXTURE = "tests/fixtures/clay-tee-on-white.jpg";
const REPLACEMENT = "tests/fixtures/clay-tee-cutout.png";

/** Runs SQL as the database owner on the linked project. Values are constants from this file. */
function sql<T = Record<string, unknown>>(query: string): T[] {
  const out = execFileSync("npx", ["supabase", "db", "query", "--linked", "-o", "json", query], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return JSON.parse(out).rows as T[];
}
const stock = (size: string) => sql<{ stock: number }>(`select v.stock from public.variants v join public.products p on p.id = v.product_id where p.slug = '${SLUG}' and v.size = '${size}'`)[0]?.stock;
const sku = (size: string) => sql<{ sku: string }>(`select v.sku from public.variants v join public.products p on p.id = v.product_id where p.slug = '${SLUG}' and v.size = '${size}'`)[0]!.sku;
const orderCount = () => Number(sql<{ n: number }>("select count(*) as n from public.orders")[0]!.n);
const railOrder = () => sql<{ product_id: string }>("select product_id from public.rail_placements order by position").map((r) => r.product_id);
const checkoutSettings = () => sql<{ checkout: unknown }>("select checkout from public.store_settings")[0]!.checkout;
const frontPhoto = () => sql<{ id: string; src: string }>(`select m.id, m.src from public.colorway_media cm join public.media m on m.id = cm.media_id join public.products p on p.id = cm.product_id where p.slug = '${SLUG}' and cm.role = 'front'`)[0];

async function signIn(page: Page, who = ADMIN) {
  await page.goto("/admin");
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Sign in" }).click();
}
async function signInAsAdmin(page: Page) {
  await signIn(page);
  await expect(page.getByRole("navigation", { name: "Dashboard" })).toBeVisible();
}
const openSection = (page: Page, name: string) => page.getByRole("navigation", { name: "Dashboard" }).getByRole("link", { name, exact: true }).click();
const toast = (page: Page, text: string | RegExp) => expect(page.getByRole("status").filter({ hasText: text })).toBeVisible();

async function addToBag(page: Page, slug: string, size: string, times = 1) {
  await page.goto(`/products/${slug}`);
  await page.locator("label", { hasText: new RegExp(`^${size}$`) }).click();
  for (let i = 0; i < times; i++) await page.getByRole("button", { name: "Add to bag" }).click();
  await expect(page.getByText(/^Added /)).toBeVisible();
}
async function fillDetails(page: Page) {
  await page.getByLabel("Email").fill("ada.test@example.com");
  await page.getByLabel("Full name").fill("Ada Testperson");
  await page.getByLabel("Phone").fill("+44 20 7946 0000");
  await page.getByLabel("Address").fill("12 Fictional Row");
  await page.getByLabel("Town or city").fill("London");
  await page.getByLabel("Postal code").fill("E1 6AN");
  await page.getByLabel("Country").fill("United Kingdom");
  await page.getByRole("radio", { name: /Cash on delivery/ }).check();
}
const orderJson = (items: unknown[]) => ({
  paymentMethod: "cod",
  contact: { email: "api.test@example.com", name: "Api Testperson", phone: "+44 20 7946 0001" },
  address: { line1: "1 Fictional Lane", city: "London", postalCode: "E1 6AN", country: "United Kingdom" },
  items,
});

const before: { rail: string[]; checkout: unknown } = { rail: [], checkout: null };
const references: string[] = [];

test.describe.serial("real Supabase: owner and shopper journeys", () => {
  test.beforeAll(() => {
    expect(PROJECT, "STILLFORM_TEST_PROJECT_REF in .env.test.local").toMatch(/^[a-z0-9]{20}$/);
    expect(readFileSync("supabase/.temp/project-ref", "utf8").trim(), "linked project").toBe(PROJECT);
    expect(new URL(url).host, ".env.local project").toBe(`${PROJECT}.supabase.co`);
    expect(ADMIN.password && SHOPPER.password, "test accounts in .env.test.local").toBeTruthy();
    before.rail = railOrder();
    before.checkout = checkoutSettings();
  });

  test("sign-in: wrong password, non-administrator, administrator session and sign-out", async ({ page }) => {
    await page.goto("/admin");
    await page.getByLabel("Email").fill(ADMIN.email);
    await page.getByLabel("Password").fill("not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("That email and password don’t match an account.")).toBeVisible();

    await signIn(page, SHOPPER);
    await expect(page.getByRole("heading", { name: "This account isn’t an administrator." })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Dashboard" })).toHaveCount(0);
    await page.getByRole("button", { name: "Sign out" }).click();

    await signInAsAdmin(page);
    await page.reload();
    await expect(page.getByRole("navigation", { name: "Dashboard" }), "session survives a reload").toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("the owner adds a product from one front photo, previews it on the rail and publishes", async ({ page }) => {
    await signInAsAdmin(page);
    await page.getByRole("link", { name: "Add a product" }).first().click();
    await page.getByLabel("Name", { exact: true }).fill(NAME);
    await expect(page.getByLabel("Web address")).toHaveValue(SLUG);
    await page.getByLabel(/^Price/).fill("110");
    await page.getByLabel("Colour name").fill("Clay");

    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Add front photo" }).click();
    await (await chooser).setFiles(FIXTURE);
    const editor = page.getByRole("dialog", { name: /Front photo/ });
    await expect(editor.getByRole("switch", { name: /Remove the plain background/ })).toHaveAttribute("aria-checked", "true");
    await editor.getByRole("button", { name: "Use this photo" }).click();
    await expect(editor).toHaveCount(0);
    await expect(page.getByRole("img", { name: "Front photo" })).toBeVisible();

    for (const [size, count] of [["XS", "1"], ["S", "3"], ["M", "4"], ["L", "2"], ["XL", "0"]]) await page.getByLabel(`Clay ${size} stock`).fill(count!);
    await expect(page.locator(`[aria-label="Rail preview"] [data-garment][aria-label="${NAME}"]`)).toBeVisible();
    await expect(page.getByText("Ready to publish.")).toBeVisible();

    await page.getByRole("button", { name: "Publish" }).click();
    await toast(page, "Published. It’s in the store now.");
    await expect(page).toHaveURL(new RegExp(`/admin/products/${SLUG}$`));
    await expect(page.getByText("Live in the store.")).toBeVisible();

    expect(stock("M")).toBe(4);
    const photo = frontPhoto()!;
    expect(photo.src).toContain(`${PROJECT}.supabase.co/storage/v1/object/public/media/`);
    expect((await fetch(photo.src)).ok, "uploaded photo is served").toBe(true);
  });

  test("the owner replaces the front photo; the new file is stored and served", async ({ page }) => {
    const old = frontPhoto()!;
    await signInAsAdmin(page);
    await page.goto(`/admin/products/${SLUG}`);
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Replace", exact: true }).first().click();
    await (await chooser).setFiles(REPLACEMENT);
    await page.getByRole("dialog", { name: /Front photo/ }).getByRole("button", { name: "Use this photo" }).click();
    await page.getByRole("button", { name: "Save changes" }).click();
    await toast(page, "Changes are live.");
    const replaced = frontPhoto()!;
    expect(replaced.id).not.toBe(old.id);
    expect(replaced.src).not.toBe(old.src);
    const served = await fetch(replaced.src);
    expect(served.ok && /^image\//.test(served.headers.get("content-type") ?? "")).toBe(true);
  });

  test("it reaches the store: rail, close-up, shop and product page, front only", async ({ page }) => {
    await page.goto("/");
    const garment = page.locator(`[data-garment][aria-label="${NAME}"]`);
    await expect(garment).toBeVisible();
    await garment.focus();
    await page.keyboard.press("Enter");
    const closeUp = page.getByRole("dialog", { name: NAME });
    await expect(closeUp).toBeVisible();
    await expect(closeUp.getByRole("button", { name: "Back", exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");

    await page.goto("/shop");
    await expect(page.getByRole("heading", { name: NAME })).toBeVisible();
    await page.goto(`/products/${SLUG}`);
    await expect(page.getByRole("heading", { level: 1, name: NAME })).toBeVisible();
    await expect(page.getByRole("figure").filter({ hasText: "Back" })).toHaveCount(0);
  });

  test("a stock change in the dashboard reaches the database and the store", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto(`/admin/products/${SLUG}`);
    await page.getByLabel("Clay M stock").fill("0");
    await page.getByRole("button", { name: "Save changes" }).click();
    await toast(page, "Changes are live.");
    expect(stock("M")).toBe(0);
    await page.goto(`/products/${SLUG}`);
    await expect(page.getByRole("radio", { name: "M, sold out" })).toBeDisabled();
  });

  test("the owner moves it to the front of the rail and the store follows", async ({ page }) => {
    await signInAsAdmin(page);
    await openSection(page, "Rail");
    const left = page.getByRole("button", { name: `Move ${NAME} left` });
    while (await left.isEnabled()) await left.click();
    await page.getByRole("button", { name: "Save rail" }).click();
    await toast(page, "Rail saved.");
    expect(railOrder()).toEqual([SLUG, ...before.rail]);
    await page.goto("/");
    await expect(page.locator("[data-garment]").first()).toHaveAttribute("aria-label", NAME);
  });

  test("checkout opens only when the owner opens it", async ({ page }) => {
    await page.goto("/checkout");
    await expect(page.getByRole("heading", { name: "Checkout isn’t open yet." })).toBeVisible();
    await signInAsAdmin(page);
    await openSection(page, "Settings");
    await page.getByRole("switch", { name: /^Open checkout/ }).click();
    await page.getByRole("button", { name: "Save settings" }).click();
    await toast(page, "Settings saved.");
    expect((checkoutSettings() as { enabled: boolean }).enabled).toBe(true);
  });

  test("a shopper checks out with fictional details; the database prices it and takes the stock", async ({ page }) => {
    await addToBag(page, SLUG, "S");
    await page.getByRole("button", { name: /^Bag, / }).click();
    await page.getByRole("link", { name: "Checkout" }).click();
    await fillDetails(page);
    await page.getByRole("button", { name: /Place order/ }).click();
    await expect(page.getByRole("heading", { name: "Thank you." })).toBeVisible();
    const reference = (await page.locator("strong").first().innerText()).trim();
    expect(reference).toMatch(/^SF-\d+$/);
    references.push(reference);
    expect(stock("S")).toBe(2);
    expect(sql(`select total, subtotal, status, payment_status from public.orders where reference = '${reference}'`)[0]).toEqual({ total: 11000, subtotal: 11000, status: "pending", payment_status: "unpaid" });
  });

  test("orders only go through the checkout function, which lets the database set the price and check stock", async () => {
    const shop = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const direct = await shop.rpc("place_order", { p_order: orderJson([{ sku: sku("S"), quantity: 1 }]) });
    expect(direct.error?.message, "direct call refused").toMatch(/permission denied/);

    // Cloudflare's dummy token, accepted only while the project uses Cloudflare's test secret.
    const viaFunction = async (order: unknown) => {
      const response = await fetch(`${url}/functions/v1/place-order`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: "XXXX.DUMMY.TOKEN.XXXX", order }) });
      return { status: response.status, body: await response.json() };
    };
    const tampered = await viaFunction({ ...orderJson([{ sku: sku("S"), quantity: 1, price: 1, unitPrice: 1, unit_price: 1 }]), subtotal: 1, total: 1 });
    expect(tampered.status).toBe(200);
    expect(tampered.body.total).toBe(11000);
    references.push(tampered.body.reference);
    expect(stock("S")).toBe(1);

    const orders = orderCount();
    const tooMany = await viaFunction(orderJson([{ sku: sku("S"), quantity: 5 }]));
    expect([tooMany.status, tooMany.body.message]).toEqual([400, "insufficient_stock"]);
    expect(orderCount()).toBe(orders);
    expect(stock("S")).toBe(1);
  });

  test("when it sells out mid-checkout, no order is placed and the bag is corrected", async ({ page }) => {
    await addToBag(page, SLUG, "L", 2);
    await page.goto("/checkout");
    await fillDetails(page);
    // Someone else buys one while this shopper fills in the form.
    sql(`update public.variants set stock = 1 where sku = '${sku("L")}'`);
    const orders = orderCount();
    await page.getByRole("button", { name: /Place order/ }).click();
    await expect(page.getByText(/Some pieces sold out while you were checking out/)).toBeVisible();
    expect(orderCount()).toBe(orders);
    expect(stock("L")).toBe(1);
    await expect(page.getByText("Clay · L · × 1")).toBeVisible();
  });

  test("the owner confirms and cancels both orders; stock returns exactly once", async ({ page }) => {
    await signInAsAdmin(page);
    for (const reference of references) {
      await openSection(page, "Orders");
      await page.getByRole("link", { name: reference }).click();
      await page.getByRole("button", { name: "Confirm order" }).click();
      await toast(page, "Confirmed.");
      await page.getByRole("button", { name: "Cancel order" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Cancel order" }).click();
      await toast(page, "Order cancelled. Stock has been returned.");
      await expect(page.getByRole("button", { name: "Cancel order" })).toHaveCount(0);
    }
    expect(stock("S")).toBe(3);
    const rows = sql<{ status: string; restocked: boolean }>(`select status, restocked_at is not null as restocked from public.orders where reference in (${references.map((r) => `'${r}'`).join(",")})`);
    expect(rows).toEqual(references.map(() => ({ status: "cancelled", restocked: true })));
  });

  test("tidy up: checkout closed again, test product off the rail and unpublished", async ({ page }) => {
    await signInAsAdmin(page);
    await openSection(page, "Settings");
    await page.getByRole("switch", { name: /^Open checkout/ }).click();
    await page.getByRole("button", { name: "Save settings" }).click();
    await toast(page, "Settings saved.");
    expect(checkoutSettings()).toEqual(before.checkout);

    await openSection(page, "Rail");
    await page.getByRole("button", { name: `Take ${NAME} off the rail` }).click();
    await page.getByRole("button", { name: "Save rail" }).click();
    await toast(page, "Rail saved.");
    expect(railOrder()).toEqual(before.rail);

    await page.goto(`/admin/products/${SLUG}`);
    await page.getByRole("button", { name: "Unpublish" }).click();
    await toast(page, "Saved as a draft.");
    await page.goto(`/products/${SLUG}`);
    await expect(page.getByRole("heading", { name: "This page isn’t on the rail." })).toBeVisible();
    await page.goto("/");
    await expect(page.locator("[data-garment]").first()).toBeVisible();
    await expect(page.locator(`[data-garment][aria-label="${NAME}"]`)).toHaveCount(0);
  });
});
