import { expect, type Page, test } from "@playwright/test";

type MockDashboardApiOptions = {
  unreadCount?: number;
  hasAnyPrintedBook?: boolean;
};

const DASHBOARD_PATH = "/dashboard";

async function gotoDashboard(page: Page, path = DASHBOARD_PATH) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
}

function createDashboardOverviewResponse(params: {
  unreadCount: number;
  hasProductionDelayBanner?: boolean;
}) {
  return {
    activeBook: null,
    recentOrders: [],
    notifications: {
      unreadCount: params.unreadCount,
      hasProductionDelayBanner: params.hasProductionDelayBanner ?? false,
    },
    profile: {
      isProfileComplete: true,
      preferredLanguage: "en",
    },
    pendingActions: {
      total: 0,
      items: [],
    },
  };
}

function createProfileResponse() {
  return {
    bio: null,
    profileImageUrl: null,
    whatsAppNumber: null,
    websiteUrl: null,
    purchaseLinks: [],
    socialLinks: [],
    isProfileComplete: true,
    preferredLanguage: "en",
    notificationPreferences: {
      email: true,
      whatsApp: true,
      inApp: true,
    },
  };
}

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
          firstName: "Amina",
          lastName: "Yusuf",
          role: "USER",
          displayName: "Amina Yusuf",
          initials: "AY",
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

  await page.route("**/api/v1/dashboard/overview", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        createDashboardOverviewResponse({
          unreadCount,
        })
      ),
    });
  });

  await page.route("**/api/v1/users/me/profile", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(createProfileResponse()),
    });
  });

  await page.route("**/api/v1/notifications?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [],
        pagination: {
          page: 1,
          pageSize: 20,
          totalItems: 0,
          totalPages: 0,
          hasPreviousPage: false,
          hasNextPage: false,
        },
      }),
    });
  });

  await page.route("**/api/v1/reviews/my", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        hasEligibleBooks: hasAnyPrintedBook,
        hasPendingReviews: false,
        books: [],
      }),
    });
  });
}

async function waitForDashboardReady(
  page: Page,
  options: { expectMobileMenu?: boolean; expectDesktopNav?: boolean } = {}
) {
  await expect(page.getByText("Loading dashboard...")).toHaveCount(0, { timeout: 15_000 });

  if (options.expectMobileMenu) {
    await expect(page.getByRole("button", { name: "Open sidebar menu" })).toBeVisible({
      timeout: 15_000,
    });
  }

  if (options.expectDesktopNav) {
    await expect(page.getByRole("link", { name: "Dashboard" }).first()).toBeVisible({
      timeout: 15_000,
    });
  }

  await expect(page.locator("#main-content")).toBeVisible({ timeout: 15_000 });
}

async function isFocused(locator: ReturnType<Page["locator"]>) {
  try {
    return await locator.evaluate((node) => node === document.activeElement);
  } catch {
    return false;
  }
}

async function tabUntilFocused(page: Page, locator: ReturnType<Page["locator"]>, maxTabs = 12) {
  for (let index = 0; index < maxTabs; index += 1) {
    await page.keyboard.press("Tab");
    if (await isFocused(locator)) {
      return;
    }
  }

  throw new Error("Unable to focus target element with keyboard navigation");
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
    test.slow();
    await page.setViewportSize({ width: 375, height: 812 });
    await mockDashboardApis(page);

    await gotoDashboard(page);
    await waitForDashboardReady(page, { expectMobileMenu: true });

    const menuButton = page.getByRole("button", { name: "Open sidebar menu" });
    await expect(menuButton).toBeVisible();

    await page.keyboard.press("Tab");
    const skipLink = page.getByRole("link", { name: "Skip to main content" });
    await expect(skipLink).toBeVisible();
    await expect(skipLink).toHaveAttribute("href", "#main-content");

    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeVisible();

    await menuButton.focus();
    await page.keyboard.press("Enter");

    const drawer = page.getByRole("dialog", { name: "Dashboard navigation" });
    await expect(drawer).toBeVisible({ timeout: 10_000 });

    const closeButton = page.getByRole("button", { name: "Close sidebar menu" }).last();
    await expect(closeButton).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
  });

  test("768px: tablet keeps drawer pattern and no horizontal overflow", async ({ page }) => {
    test.slow();
    await page.setViewportSize({ width: 768, height: 1024 });
    await mockDashboardApis(page);

    await gotoDashboard(page);
    await waitForDashboardReady(page, { expectMobileMenu: true });

    const menuButton = page.getByRole("button", { name: "Open sidebar menu" });
    await expect(menuButton).toBeVisible();

    await menuButton.click();
    const drawer = page.getByRole("dialog", { name: "Dashboard navigation" });
    await expect(drawer).toBeVisible({ timeout: 10_000 });

    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);

    const viewportWidth = page.viewportSize()?.width ?? 768;
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(viewportWidth + 1);
  });

  test("1280px: desktop keyboard nav, focus visibility, contrast, and noindex", async ({
    page,
    browserName,
  }) => {
    test.slow();
    await page.setViewportSize({ width: 1280, height: 900 });
    await mockDashboardApis(page, { hasAnyPrintedBook: false, unreadCount: 8 });

    await gotoDashboard(page);
    await waitForDashboardReady(page, { expectDesktopNav: true });

    await expect(page.getByRole("button", { name: "Open sidebar menu" })).toHaveCount(0);

    await page.keyboard.press("Tab");
    const skipLink = page.getByRole("link", { name: "Skip to main content" });
    await expect(skipLink).toBeVisible();

    const dashboardLink = page.getByRole("link", { name: "Dashboard" }).first();
    if (browserName === "webkit") {
      await dashboardLink.focus();
    } else {
      await tabUntilFocused(page, dashboardLink);
    }
    await expect(dashboardLink).toBeFocused();
    await expect(dashboardLink).toHaveClass(/focus-visible:outline-2/);

    const activeLinkColors = await dashboardLink.evaluate((node) => {
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
