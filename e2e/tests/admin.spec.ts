import { expect, test } from "@playwright/test";

test.describe("Admin Panel", () => {
  // TODO: Order management
  // TODO: Payment approval (SLA timer)
  // TODO: Status transitions
  // TODO: Refund workflow
  // TODO: Manuscript rejection
  // TODO: User management

  test.skip("placeholder — requires admin auth setup", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/login/);
  });
});
