import { expect, test } from "@playwright/test";
import { openSection, signInAsAdmin, toast } from "./helpers";

test("the owner edits and hides lookbook content, and the store follows", async ({ page }) => {
  await signInAsAdmin(page);
  await openSection(page, "Lookbook");
  await page.getByRole("textbox", { name: "Title" }).nth(1).fill("Moss, rust and wool");
  // Hide the second spread (the black tee portrait and its detail).
  await page.getByRole("switch", { name: "Visible" }).nth(2).click();
  await page.getByRole("button", { name: "Save lookbook" }).click();
  await toast(page, "Lookbook saved.");

  await page.goto("/#lookbook");
  const lookbook = page.locator("#lookbook");
  await expect(lookbook.getByText("Moss, rust and wool")).toBeVisible();
  await expect(lookbook.getByText("Black, side-lit")).toHaveCount(0);
  await expect(lookbook.locator("img").first()).toBeVisible();
});
