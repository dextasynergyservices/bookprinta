import { expect, test } from "@playwright/test";

test.describe("Authentication", () => {
  test("should display the login page", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveTitle(/BookPrinta/);
  });

  // TODO: Full signup flow
  // TODO: Login with credentials
  // TODO: Password reset
  // TODO: Email verification
  // TODO: Resend signup link
});
