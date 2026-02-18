import { expect, test } from "@playwright/test";

test.describe("Custom Quote", () => {
  test("should display the quote wizard", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/BookPrinta/);
  });

  // TODO: Multi-step wizard form submission
  // TODO: Confirmation page after submission
});
