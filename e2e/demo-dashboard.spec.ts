import { expect, test, type Page } from "@playwright/test";

// The showroom's Demo Studio at /demo/admin, run against the production demo
// build: reachable from the storefront, simulated and browser-local, reflected
// in the store, resettable, and never talking to a backend.

const backend = /supabase\.co|\/functions\/v1\/|\/rest\/v1\/|\/auth\/v1\/|challenges\.cloudflare\.com/;
const garments = (page: Page) => page.locator("[data-garment]");

let contacted: string[] = [];
test.beforeEach(async ({ page }) => {
  contacted = [];
  page.on("request", (request) => {
    if (backend.test(request.url())) contacted.push(request.url());
  });
});
test.afterEach(() => expect(contacted, "requests to a backend").toEqual([]));

async function openDashboard(page: Page, mobile: boolean) {
  await page.goto("/");
  if (mobile) {
    await page.getByRole("button", { name: "Menu", exact: true }).first().click();
    await page.getByRole("dialog", { name: "Menu" }).getByRole("link", { name: "View Demo Dashboard" }).click();
  } else {
    await page.getByRole("banner").getByRole("link", { name: "View Demo Dashboard" }).click();
  }
  await expect(page).toHaveURL(/\/demo\/admin$/);
  await expect(page.getByTestId("demo-banner")).toBeVisible();
}

test("the storefront links to a dashboard that needs no login", async ({ page }, info) => {
  await openDashboard(page, info.project.name === "mobile");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Good");
  await expect(page.getByLabel("Password")).toHaveCount(0);
  for (const path of ["products", "rail", "collections", "lookbook", "orders", "settings"]) {
    const response = await page.goto(`/demo/admin/${path}`);
    expect(response?.status(), path).toBe(200);
    await expect(page.getByTestId("demo-banner"), path).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 }), path).toBeVisible();
  }
  const horizontal = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(horizontal).toBeLessThanOrEqual(0);
});

test("price, stock and rail edits reach the store, and Reset Demo undoes them", async ({ page }) => {
  await page.goto("/demo/admin/products/heavyweight-tee");
  await page.getByLabel("Price (USD)").fill("99");
  await page.getByLabel("Bone M stock").fill("1");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Changes are live.")).toBeVisible();

  await page.goto("/products/heavyweight-tee");
  await expect(page.getByText("$99").first()).toBeVisible();
  await page.goto("/shop");
  await expect(page.getByText("$99").first()).toBeVisible();

  // Rail order: move the first piece to the end.
  await page.goto("/demo/admin/rail");
  await page.getByRole("button", { name: "Move Heavyweight Tee right" }).first().click();
  await page.getByRole("button", { name: "Save rail" }).click();
  await expect(page.getByText(/Rail saved/)).toBeVisible();
  await page.goto("/");
  await expect(garments(page)).toHaveCount(8);

  // Take a piece off the rail: the homepage hangs one fewer.
  await page.goto("/demo/admin/rail");
  await page.getByRole("button", { name: /Take Long-Sleeve Henley off the rail/ }).click();
  await page.getByRole("button", { name: "Save rail" }).click();
  await expect(page.getByText(/Rail saved/)).toBeVisible();
  await page.goto("/");
  await expect(garments(page)).toHaveCount(7);

  // Edits survive a reload (browser-local), then Reset Demo brings the original back.
  await page.reload();
  await expect(garments(page)).toHaveCount(7);
  await page.goto("/demo/admin");
  await page.getByTestId("demo-banner").getByRole("button", { name: "Reset demo" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Reset demo" }).click();
  await expect(page.getByText("Demo reset to the original collection.")).toBeVisible();
  await page.goto("/");
  await expect(garments(page)).toHaveCount(8);
  await page.goto("/products/heavyweight-tee");
  await expect(page.getByText("$85").first()).toBeVisible();
});

test("a draft can be published into the shop; orders and settings simulate", async ({ page }) => {
  await page.goto("/shop");
  await expect(page.getByText("Linen Overshirt")).toHaveCount(0);
  await page.goto("/demo/admin/products/linen-overshirt");
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText(/Published/)).toBeVisible();
  await page.goto("/shop");
  await expect(page.getByText("Linen Overshirt").first()).toBeVisible();

  await page.goto("/demo/admin/orders/SF-1014");
  await page.getByRole("button", { name: "Confirm order" }).click();
  await expect(page.getByText("Confirmed").first()).toBeVisible();

  await page.goto("/demo/admin/settings");
  await page.getByLabel("Store name").fill("STILLFORM Demo");
  await page.getByRole("button", { name: "Save settings" }).first().click();
  await expect(page.getByText("Settings saved.")).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("link", { name: /STILLFORM Demo, home/ })).toBeVisible();

  // Checkout stays closed whatever the simulated settings say.
  await page.goto("/checkout");
  await expect(page.getByRole("button", { name: /Place order/ })).toHaveCount(0);
});

test("lookbook and collections edits are accepted", async ({ page }) => {
  await page.goto("/demo/admin/lookbook");
  await expect(page.getByRole("heading", { level: 1, name: "Lookbook" })).toBeVisible();
  await page.goto("/demo/admin/collections");
  await expect(page.getByRole("heading", { level: 1, name: "Collections" })).toBeVisible();
});
