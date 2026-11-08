import { expect, test, type Page } from "@playwright/test";
import { openSection, signInAsAdmin, sql, toast } from "./helpers";

const SKU = "HENLEY-RUST-L";
const stock = async (sku = SKU) => (await sql<{ stock: number }>("select stock from public.variants where sku = $1", [sku]))[0]!.stock;

async function addToBag(page: Page, slug: string, size: string) {
  await page.goto(`/products/${slug}`);
  await page.locator("label", { hasText: new RegExp(`^${size}$`) }).click();
  await page.getByRole("button", { name: "Add to bag" }).click();
  await expect(page.getByText(/^Added /)).toBeVisible();
}

async function fillDetails(page: Page, email = "ada@example.com") {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Full name").fill("Ada Lovelace");
  await page.getByLabel("Phone").fill("+44 20 7946 0000");
  await page.getByLabel("Address").fill("12 Plaster Row");
  await page.getByLabel("Town or city").fill("London");
  await page.getByLabel("Postal code").fill("E1 6AN");
  await page.getByLabel("Country").fill("United Kingdom");
}

test.describe.serial("checkout and orders", () => {
  test("checkout stays closed until the owner opens it", async ({ page }) => {
    await page.goto("/checkout");
    await expect(page.getByRole("heading", { name: "Checkout isn’t open yet." })).toBeVisible();
    await signInAsAdmin(page);
    await openSection(page, "Settings");
    await page.getByRole("switch", { name: /^Open checkout/ }).click();
    await page.getByRole("button", { name: "Save settings" }).click();
    await toast(page, "Settings saved.");
  });

  test("a shopper places a cash-on-delivery order; prices and stock are settled by the database", async ({ page }) => {
    const before = await stock();
    await addToBag(page, "henley", "L");
    await page.getByRole("button", { name: /^Bag, / }).click();
    await page.getByRole("link", { name: "Checkout" }).click();

    await fillDetails(page, "not-an-email");
    await page.getByRole("button", { name: /Place order/ }).click();
    await expect(page.getByText("Enter an email address, like name@example.com.")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeFocused();

    await page.getByLabel("Email").fill("ada@example.com");
    await page.getByRole("button", { name: /Place order/ }).click();
    await expect(page.getByRole("heading", { name: "Thank you." })).toBeVisible();
    const reference = (await page.locator("strong").first().innerText()).trim();
    expect(reference).toMatch(/^SF-\d+$/);
    await expect(page.getByText("Cash on delivery · not yet paid")).toBeVisible();
    expect(await stock()).toBe(before - 1);
    const [order] = await sql<{ total: number; status: string }>("select total, status from public.orders where reference = $1", [reference]);
    expect(order).toEqual({ total: 12000, status: "pending" });
    await expect(page.getByRole("button", { name: "Bag, 0 items" })).toBeAttached();

    // The owner confirms, then cancels: stock comes back exactly once.
    await signInAsAdmin(page);
    await openSection(page, "Orders");
    await page.getByRole("link", { name: reference }).click();
    await expect(page.getByText("12 Plaster Row")).toBeVisible();
    await page.getByRole("button", { name: "Confirm order" }).click();
    await toast(page, "Confirmed.");
    await page.getByRole("button", { name: "Cancel order" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel order" }).click();
    await toast(page, "Order cancelled. Stock has been returned.");
    expect(await stock()).toBe(before);
    await expect(page.getByRole("button", { name: "Cancel order" })).toHaveCount(0);
  });

  test("when a piece sells out mid-checkout, nothing is charged and the bag is corrected", async ({ page }) => {
    await sql("update public.variants set stock = 2 where sku = 'MARINER-LONG-SLEEVE-INK-STRIPE-S'");
    await addToBag(page, "mariner-long-sleeve", "S");
    await page.getByRole("button", { name: "Add to bag" }).click();
    await page.goto("/checkout");
    await fillDetails(page);
    await page.getByRole("radio", { name: /Cash on delivery/ }).check();
    // Someone else buys one while this shopper fills in the form.
    await sql("update public.variants set stock = 1 where sku = 'MARINER-LONG-SLEEVE-INK-STRIPE-S'");
    const orders = (await sql<{ n: string }>("select count(*) n from public.orders"))[0]!.n;
    await page.getByRole("button", { name: /Place order/ }).click();
    await expect(page.getByText(/Some pieces sold out while you were checking out/)).toBeVisible();
    expect((await sql<{ n: string }>("select count(*) n from public.orders"))[0]!.n).toBe(orders);
    expect(await stock("MARINER-LONG-SLEEVE-INK-STRIPE-S")).toBe(1);
    await expect(page.getByText("Ink stripe · S · × 1")).toBeVisible();
  });
});
