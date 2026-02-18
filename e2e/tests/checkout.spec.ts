import { expect, test } from "@playwright/test";

test.describe("Checkout", () => {
  test("should display pricing tiers on the pricing page", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page).toHaveTitle(/BookPrinta/);
  });

  // TODO: Tier selection → configuration → addons → payment → confirmation
  // TODO: Bank transfer modal flow → receipt upload → waiting state → admin approval
  // TODO: Coupon code application
});
