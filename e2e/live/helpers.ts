import { expect, type Page } from "@playwright/test";

export const ADMIN = { email: "admin@stillform.test", password: "studio-pass-1" };
export const SHOPPER = { email: "shopper@stillform.test", password: "shopper-pass-1" };

/** Runs SQL as the database owner on the test backend (test-only endpoint). */
export async function sql<T = Record<string, unknown>>(query: string, params: unknown[] = []): Promise<T[]> {
  const response = await fetch("http://localhost:54321/__harness/sql", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sql: query, params }) });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message);
  return body as T[];
}

export async function signIn(page: Page, who = ADMIN) {
  await page.goto("/admin");
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

export async function signInAsAdmin(page: Page) {
  await signIn(page);
  await expect(page.getByRole("navigation", { name: "Dashboard" })).toBeVisible();
}

/** Follows a link in the dashboard's sidebar. */
export const openSection = (page: Page, name: string) => page.getByRole("navigation", { name: "Dashboard" }).getByRole("link", { name, exact: true }).click();

export const toast = (page: Page, text: string | RegExp) => expect(page.getByRole("status").filter({ hasText: text })).toBeVisible();
