import { expect, test, type Page } from "@playwright/test";

async function swipe(page: Page, x: number, y: number, dx: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let i = 1; i <= 10; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + (dx * i) / 10, y }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

test("the rail becomes a swipeable carousel and opens on tap", async ({ page }) => {
  await page.goto("/");
  const rail = page.locator("[data-slot=clothing-rail-hero]");
  await expect(rail).toHaveAttribute("data-mode", "carousel");
  await expect(page.locator("[data-garment]").first()).toHaveCSS("opacity", "1");

  await swipe(page, 300, 420, -180);
  await expect(rail).toHaveAttribute("data-active", "1");

  const box = (await page.locator('[data-garment="1"]').boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  const dialog = page.locator("[role=dialog][aria-modal=true]:not(#site-menu):not([aria-labelledby=bag-title])");
  await expect(dialog.getByRole("heading", { name: "Mariner Long Sleeve" })).toBeVisible();
  await dialog.locator("label", { hasText: /^M$/ }).tap();
  await dialog.getByRole("button", { name: "Add to bag" }).tap();
  await expect(dialog.getByText(/^Added Mariner Long Sleeve/)).toBeVisible();
});

test("the page never scrolls sideways", async ({ page }) => {
  for (const path of ["/", "/shop", "/products/fleece-hoodie"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), path).toBeLessThanOrEqual(0);
  }
});

test("the menu opens, navigates and closes", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Menu" }).tap();
  const menu = page.getByRole("dialog", { name: "Menu" });
  await expect(menu).toBeVisible();
  await menu.getByRole("link", { name: "Shop" }).tap();
  await expect(page).toHaveURL(/\/shop$/);
  await expect(menu).toBeHidden();
});

test("the product page keeps size selection one tap away", async ({ page }) => {
  await page.goto("/products/fleece-hoodie");
  const bar = page.getByRole("button", { name: "Choose a size" });
  await expect(bar).toBeHidden();
  await page.evaluate(() => window.scrollTo(0, 1800));
  await expect(bar).toBeVisible();
  await bar.tap();
  await expect(page.getByRole("radio", { name: "XS" })).toBeFocused();
});
