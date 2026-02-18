import { expect, test } from "@playwright/test";

test.describe("Dashboard", () => {
  // TODO: File upload with progress indicator
  // TODO: Book progress tracker
  // TODO: Notification center
  // TODO: Reprint flows
  // TODO: Profile management

  test.skip("placeholder — requires auth setup", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/login/);
  });
});
