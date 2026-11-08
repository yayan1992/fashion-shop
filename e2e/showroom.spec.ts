import { expect, test, type Page } from "@playwright/test";

// The hosted showroom: the full storefront on its built-in collection, a
// working bag, no checkout, no Studio and no backend requests at all.

const garments = (page: Page) => page.locator("[data-garment]");
const backend = /supabase\.co|\/functions\/v1\/|\/rest\/v1\/|\/auth\/v1\/|challenges\.cloudflare\.com/;

let contacted: string[] = [];
test.beforeEach(async ({ page }) => {
  contacted = [];
  page.on("request", (request) => {
    if (backend.test(request.url())) contacted.push(request.url());
  });
});
test.afterEach(() => expect(contacted, "requests to a backend").toEqual([]));

test("the storefront, rail and lookbook run on the built-in collection", async ({ page }) => {
  await page.goto("/");
  await expect(garments(page)).toHaveCount(8);
  await expect(garments(page).first()).toHaveCSS("opacity", "1");
  await expect(page.locator("#lookbook-title")).toBeAttached();
  await page.goto("/shop");
  await expect(page.locator("main h2, main h3").filter({ hasText: "Mariner Long Sleeve" }).first()).toBeVisible();
});

test("direct links and refreshes work on every route", async ({ page }) => {
  for (const path of ["/products/mariner-long-sleeve", "/shop?category=knitwear", "/info", "/checkout"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    await page.reload();
    await expect(page.locator("h1").first(), path).toBeVisible();
  }
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This is a preview of the store.");
});

test("the bag works and survives a refresh, but checkout stays a preview", async ({ page }) => {
  await page.goto("/products/heavyweight-tee");
  await page.locator("label", { hasText: /^M$/ }).click();
  await page.getByRole("button", { name: "Add to bag" }).click();
  await expect(page.getByText(/^Added /)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: /^Bag, 1 item/ })).toBeVisible();
  await page.goto("/checkout");
  await expect(page.getByRole("heading", { name: "This is a preview of the store." })).toBeVisible();
  await expect(page.getByRole("button", { name: /Place order/ })).toHaveCount(0);
});

test("the Studio isn't part of the showroom", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "This page isn’t on the rail." })).toBeVisible();
  await expect(page.getByLabel("Password")).toHaveCount(0);
});
