import { expect, test } from "@playwright/test";
import { openSection, SHOPPER, signIn, signInAsAdmin, sql, toast } from "./helpers";

const FIXTURE = "tests/fixtures/clay-tee-on-white.jpg";

test("the dashboard is closed to visitors and to accounts that aren't administrators", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByText("There is no public sign-up.")).toBeVisible();

  await page.getByLabel("Email").fill(SHOPPER.email);
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("That email and password don’t match an account.")).toBeVisible();

  await signIn(page, SHOPPER);
  await expect(page.getByRole("heading", { name: "This account isn’t an administrator." })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Dashboard" })).toHaveCount(0);
});

test("storage refuses uploads from visitors and shoppers", async () => {
  const token = async (email: string, password: string) =>
    (await (await fetch("http://localhost:54321/auth/v1/token?grant_type=password", { method: "POST", body: JSON.stringify({ email, password }) })).json()).access_token as string;
  const upload = (bearer: string) =>
    fetch(`http://localhost:54321/storage/v1/object/media/rail/${crypto.randomUUID()}.webp`, { method: "POST", headers: { authorization: `Bearer ${bearer}`, "content-type": "image/webp" }, body: new Uint8Array([1, 2, 3]) });
  expect((await upload("harness-anon-key")).status).toBe(403);
  expect((await upload(await token(SHOPPER.email, SHOPPER.password))).status).toBe(403);
  const admin = await upload(await token("admin@stillform.test", "studio-pass-1"));
  expect(admin.status).toBe(200);
  const wrongType = await fetch(`http://localhost:54321/storage/v1/object/media/rail/${crypto.randomUUID()}.svg`, { method: "POST", headers: { authorization: `Bearer ${await token("admin@stillform.test", "studio-pass-1")}`, "content-type": "image/svg+xml" }, body: "<svg/>" });
  expect(wrongType.status).toBe(415);
});

test.describe.serial("adding a product with one front photo", () => {
  test("the owner creates, previews and publishes it", async ({ page }) => {
    await signInAsAdmin(page);
    await page.getByRole("link", { name: "Add a product" }).first().click();
    await page.getByLabel("Name", { exact: true }).fill("Clay Tee");
    await expect(page.getByLabel("Web address")).toHaveValue("clay-tee");
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
    // The live preview hangs it among the real rail.
    await expect(page.locator('[aria-label="Rail preview"] [data-garment][aria-label="Clay Tee"]')).toBeVisible();
    await expect(page.getByText("Ready to publish.")).toBeVisible();

    await page.getByRole("button", { name: "Publish" }).click();
    await toast(page, "Published. It’s in the store now.");
    await expect(page).toHaveURL(/\/admin\/products\/clay-tee$/);
    // The editor now shows the saved, live product rather than a new one.
    await expect(page.getByRole("button", { name: "Unpublish" })).toBeVisible();
    await expect(page.getByText("Live in the store.")).toBeVisible();
    expect(await sql("select stock from public.variants where sku = 'CLAY-TEE-CLAY-M'")).toEqual([{ stock: 4 }]);
  });

  test("it appears in the store: rail, shop and product page, front only", async ({ page }) => {
    await page.goto("/");
    const garment = page.locator('[data-garment][aria-label="Clay Tee"]');
    await expect(garment).toBeVisible();
    await garment.focus();
    await page.keyboard.press("Enter");
    const closeUp = page.getByRole("dialog", { name: "Clay Tee" });
    await expect(closeUp).toBeVisible();
    // Only a front photo: no invented back view.
    await expect(closeUp.getByRole("button", { name: "Back", exact: true })).toHaveCount(0);
    await closeUp.locator("label", { hasText: /^M$/ }).click();
    await closeUp.getByRole("button", { name: "Add to bag" }).click();
    await expect(closeUp.getByText("Added Clay Tee, Clay, size M.")).toBeVisible();
    await page.keyboard.press("Escape");

    await page.goto("/shop");
    await expect(page.getByRole("heading", { name: "Clay Tee" })).toBeVisible();
    await page.goto("/products/clay-tee");
    await expect(page.getByRole("heading", { level: 1, name: "Clay Tee" })).toBeVisible();
    await expect(page.getByRole("figure").filter({ hasText: "Front" })).toBeVisible();
    await expect(page.getByRole("figure").filter({ hasText: "Back" })).toHaveCount(0);
  });

  test("stock changes in the dashboard reach the store", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/admin/products/clay-tee");
    await page.getByLabel("Clay M stock").fill("0");
    await page.getByRole("button", { name: "Save changes" }).click();
    await toast(page, "Changes are live.");
    await page.goto("/products/clay-tee");
    await expect(page.getByRole("radio", { name: "M, sold out" })).toBeDisabled();
  });

  test("the owner reorders the rail and the store follows", async ({ page }) => {
    await signInAsAdmin(page);
    await openSection(page, "Rail");
    const left = page.getByRole("button", { name: "Move Clay Tee left" });
    while (await left.isEnabled()) await left.click();
    await page.getByRole("button", { name: "Save rail" }).click();
    await toast(page, "Rail saved.");
    await page.goto("/");
    await expect(page.locator("[data-garment]").first()).toHaveAttribute("aria-label", "Clay Tee");
  });

  test("unpublishing takes it out of the store", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/admin/products/clay-tee");
    await page.getByRole("button", { name: "Unpublish" }).click();
    await toast(page, "Saved as a draft.");
    await page.goto("/");
    await expect(page.locator("[data-garment]").first()).toBeVisible();
    await expect(page.locator('[data-garment][aria-label="Clay Tee"]')).toHaveCount(0);
    await page.goto("/products/clay-tee");
    await expect(page.getByRole("heading", { name: "This page isn’t on the rail." })).toBeVisible();
  });
});
