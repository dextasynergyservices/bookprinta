import { expect, type Page, test } from "@playwright/test";

type MockDashboardApiOptions = {
  unreadCount?: number;
  hasAnyPrintedBook?: boolean;
};

const DASHBOARD_PATH = "/dashboard";

async function mockDashboardApis(
  page: Page,
  { unreadCount = 3, hasAnyPrintedBook = false }: MockDashboardApiOptions = {}
) {
  await page.route("**/api/v1/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: "test-user-id",
          email: "author@example.com",
          role: "USER",
        },
      }),
    });
  });

  await page.route("**/api/v1/auth/refresh", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  await page.route("**/api/v1/notifications/unread-count", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ unreadCount }),
    });
  });

  await page.route("**/api/v1/reviews/my", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ hasAnyPrintedBook }),
    });
  });
}

function parseRgb(color: string): [number, number, number] {
  const parts = color.match(/\d+(\.\d+)?/g) ?? [];
  const [r = "0", g = "0", b = "0"] = parts;
  return [Number(r), Number(g), Number(b)];
}

function toLinear(channel: number) {
  const normalized = channel / 255;
  if (normalized <= 0.03928) {
    return normalized / 12.92;
  }

  return ((normalized + 0.055) / 1.055) ** 2.4;
}

function contrastRatio(foreground: [number, number, number], background: [number, number, number]) {
  const fgLuminance =
    0.2126 * toLinear(foreground[0]) +
    0.7152 * toLinear(foreground[1]) +
    0.0722 * toLinear(foreground[2]);
  const bgLuminance =
    0.2126 * toLinear(background[0]) +
    0.7152 * toLinear(background[1]) +
    0.0722 * toLinear(background[2]);

  const light = Math.max(fgLuminance, bgLuminance);
  const dark = Math.min(fgLuminance, bgLuminance);

  return (light + 0.05) / (dark + 0.05);
}

test.describe("Dashboard Quality Gates", () => {
  test("375px: mobile drawer, skip link, and keyboard controls", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mockDashboardApis(page);

    await page.goto(DASHBOARD_PATH);
    await expect(
      page.getByRole("banner").getByRole("heading", { name: "Dashboard" })
    ).toBeVisible();

    const menuButton = page.getByRole("button", { name: "Open sidebar menu" });
    await expect(menuButton).toBeVisible();

    await page.keyboard.press("Tab");
    const skipLink = page.getByRole("link", { name: "Skip to main content" });
    await expect(skipLink).toBeVisible();

    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();

    await menuButton.focus();
    await page.keyboard.press("Enter");

    const drawer = page.getByRole("dialog", { name: "Dashboard navigation" });
    await expect(drawer).toBeVisible();

    const closeButton = page.getByRole("button", { name: "Close sidebar menu" }).last();
    await expect(closeButton).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
  });

  test("768px: tablet keeps drawer pattern and no horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await mockDashboardApis(page);

    await page.goto(DASHBOARD_PATH);
    await expect(
      page.getByRole("banner").getByRole("heading", { name: "Dashboard" })
    ).toBeVisible();

    const menuButton = page.getByRole("button", { name: "Open sidebar menu" });
    await expect(menuButton).toBeVisible();

    await menuButton.click();
    const drawer = page.getByRole("dialog", { name: "Dashboard navigation" });
    await expect(drawer).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);

    const viewportWidth = page.viewportSize()?.width ?? 768;
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(viewportWidth + 1);
  });

  test("1280px: desktop keyboard nav, focus visibility, contrast, and noindex", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await mockDashboardApis(page, { hasAnyPrintedBook: false, unreadCount: 8 });

    await page.goto(`${DASHBOARD_PATH}/books`);
    await expect(
      page.locator("#main-content").getByRole("heading", { name: "My Books", level: 2 })
    ).toBeVisible();

    await expect(page.getByRole("button", { name: "Open sidebar menu" })).toHaveCount(0);

    await page.keyboard.press("Tab");
    const skipLink = page.getByRole("link", { name: "Skip to main content" });
    await expect(skipLink).toBeVisible();

    await page.keyboard.press("Tab");
    const myBooksLink = page.getByRole("link", { name: "My Books" }).first();
    await expect(myBooksLink).toBeFocused();

    const focusOutlineWidth = await myBooksLink.evaluate((node) =>
      Number.parseFloat(getComputedStyle(node).outlineWidth)
    );
    expect(focusOutlineWidth).toBeGreaterThanOrEqual(1);

    const activeLinkColors = await myBooksLink.evaluate((node) => {
      const styles = getComputedStyle(node);
      return {
        foreground: styles.color,
        background: styles.backgroundColor,
      };
    });

    const activeRatio = contrastRatio(
      parseRgb(activeLinkColors.foreground),
      parseRgb(activeLinkColors.background)
    );
    expect(activeRatio).toBeGreaterThanOrEqual(4.5);

    const reviewsLink = page.getByRole("link", { name: "Reviews" }).first();
    const disabledReviewColors = await reviewsLink.evaluate((node) => {
      const styles = getComputedStyle(node);
      return {
        foreground: styles.color,
        background: styles.backgroundColor,
      };
    });

    const disabledRatio = contrastRatio(
      parseRgb(disabledReviewColors.foreground),
      parseRgb(disabledReviewColors.background)
    );
    expect(disabledRatio).toBeGreaterThanOrEqual(4.5);

    const robotsMeta = page.locator('meta[name="robots"]');
    await expect(robotsMeta).toHaveAttribute("content", /noindex/i);
    await expect(robotsMeta).toHaveAttribute("content", /nofollow/i);
  });
});
