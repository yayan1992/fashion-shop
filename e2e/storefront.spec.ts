import { expect, test, type Page } from "@playwright/test";

const garments = (page: Page) => page.locator("[data-garment]");
const detail = (page: Page) => page.locator("[role=dialog][aria-modal=true]:not(#site-menu):not([aria-labelledby=bag-title])");

async function railReady(page: Page) {
  await page.goto("/");
  await expect(garments(page)).toHaveCount(8);
  await expect(garments(page).first()).toHaveCSS("opacity", "1");
}

test("hovering a hanger turns it to the front", async ({ page }) => {
  await railReady(page);
  const box = (await garments(page).nth(1).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator("[data-garment][data-front]")).toHaveAttribute("aria-label", "Mariner Long Sleeve");
  await expect(page.getByText("Yarn-dyed ink and bone stripe")).toBeVisible();
});

test("a dragged hanger follows the pointer and springs back", async ({ page }) => {
  await railReady(page);
  const piece = garments(page).nth(6);
  const box = (await piece.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 150);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + box.width / 2 - i * 20, box.y + 150);
  const dragged = (await piece.boundingBox())!.x;
  expect(dragged).toBeLessThan(box.x - 120);
  await page.mouse.move(0, 0);
  await page.mouse.up();
  await expect.poll(async () => Math.abs((await piece.boundingBox())!.x - box.x), { timeout: 15_000 }).toBeLessThan(4);
});

test("a piece taken off the rail can be added to the bag", async ({ page }) => {
  await railReady(page);
  await garments(page).nth(3).focus();
  await page.keyboard.press("Enter");
  const dialog = detail(page);
  await expect(dialog.getByRole("heading", { name: "Lambswool Cardigan" })).toBeVisible();

  await dialog.getByRole("button", { name: "Add to bag" }).click();
  await expect(dialog.getByText("Choose a size first.")).toBeVisible();
  await expect(dialog.getByRole("radio", { name: "XL, sold out" })).toBeDisabled();

  await dialog.locator("label", { hasText: /^L$/ }).click();
  await expect(dialog.getByText("Only 1 left in L.")).toBeVisible();
  await dialog.getByRole("button", { name: "Add to bag" }).click();
  await expect(dialog.getByRole("button", { name: "Add to bag" })).toBeDisabled();

  await dialog.getByRole("button", { name: "View bag (1)" }).click();
  await expect(detail(page)).toHaveCount(0);
  const bag = page.getByRole("dialog", { name: /Bag/ });
  await expect(bag.getByText("Moss · L")).toBeVisible();
  await expect(bag.getByRole("button", { name: "Checkout" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Bag, 1 item" })).toBeAttached();

  await page.reload();
  await expect(page.getByRole("button", { name: "Bag, 1 item" })).toBeAttached();
});

test("the detail view closes with Escape and returns focus to the hanger", async ({ page }) => {
  await railReady(page);
  await garments(page).nth(2).focus();
  await page.keyboard.press("Enter");
  await expect(detail(page)).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(detail(page)).toHaveCount(0);
  await expect(garments(page).nth(2)).toBeFocused();
});

test("the product page switches colourway, images and stock together", async ({ page }) => {
  await page.goto("/products/heavyweight-tee");
  await expect(page.getByRole("heading", { level: 1, name: "Heavyweight Tee" })).toBeVisible();
  await page.getByRole("radio", { name: "Black" }).click();
  await expect(page).toHaveURL(/colour=black/);
  await expect(page.locator("figure img").first()).toHaveAttribute("src", /black-front/);
  await expect(page.getByRole("radio", { name: "M, sold out" })).toBeDisabled();
});

test("the shop filters by category", async ({ page }) => {
  await page.goto("/shop");
  await page.getByRole("button", { name: /^Knitwear/ }).click();
  await expect(page).toHaveURL(/category=knitwear/);
  await expect(page.locator("main ul > li")).toHaveCount(1);
});

test("reduced motion skips the physics and the lift animation", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await railReady(page);
  const box = (await garments(page).nth(2).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator("[data-garment][data-front] [data-turn]")).toHaveCSS("transform", /matrix3d|none/);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(detail(page)).toHaveCount(1);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  await context.close();
});

test("the caption's Take it down opens the piece turned to the front", async ({ page }) => {
  await railReady(page);
  const box = (await garments(page).nth(4).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator("[data-garment][data-front]")).toHaveAttribute("aria-label", "Long-Sleeve Henley");
  const take = page.getByRole("button", { name: "Take it down" });
  await take.hover();
  await take.click();
  await expect(detail(page).getByRole("heading", { name: "Long-Sleeve Henley" })).toBeVisible();
});

test("lookbook photographs are never shown larger than their source", async ({ page }) => {
  await page.goto("/#lookbook");
  const photos = page.locator("#lookbook img");
  await expect(photos).toHaveCount(8);
  for (let i = 0; i < 8; i++) {
    await photos.nth(i).scrollIntoViewIfNeeded();
    await expect.poll(() => photos.nth(i).evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    const { natural, shown } = await photos.nth(i).evaluate((img: HTMLImageElement) => ({ natural: img.naturalWidth, shown: img.getBoundingClientRect().width * devicePixelRatio }));
    expect(natural, `photo ${i}`).toBeGreaterThanOrEqual(Math.min(shown * 0.98, 2048));
  }
});

test("the product page shows each photograph once and tells the story of the cloth", async ({ page }) => {
  await page.goto("/products/lambswool-cardigan");
  const sources = await page.locator("main img").evaluateAll((imgs) => imgs.map((img) => (img as HTMLImageElement).getAttribute("src")));
  const editorial = sources.filter((src) => src?.includes("/editorial/"));
  expect(new Set(editorial).size).toBe(editorial.length);
  await expect(page.getByRole("figure").filter({ hasText: "Worn" })).toBeVisible();
  await expect(page.getByText("The cloth")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Wear it with" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Look 01/ })).toBeVisible();
});

test("products without photography show no empty placeholders", async ({ page }) => {
  await page.goto("/products/pique-polo");
  await expect(page.getByRole("heading", { level: 1, name: "Piqué Polo" })).toBeVisible();
  await expect(page.getByText("Fabric close-up")).toHaveCount(0);
  await expect(page.getByText("Worn photograph")).toHaveCount(0);
});

test("the showroom's Demo Studio isn't part of a regular build", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "View Demo Dashboard" })).toHaveCount(0);
  await page.goto("/demo/admin");
  await expect(page.getByRole("heading", { name: "This page isn’t on the rail." })).toBeVisible();
  await expect(page.getByTestId("demo-banner")).toHaveCount(0);
});
