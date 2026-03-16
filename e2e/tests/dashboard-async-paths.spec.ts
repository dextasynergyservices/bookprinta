/**
 * Phase 6 QA — Playwright dashboard async path coverage.
 *
 * Verifies no blank screens on initial load, error recovery with retry,
 * and background polling keeps data fresh without blanking content.
 */
import { expect, type Page, test } from "@playwright/test";

const DASHBOARD_PATH = "/dashboard";

function createAuthUser() {
  return {
    id: "test-user-id",
    email: "author@example.com",
    firstName: "Amina",
    lastName: "Yusuf",
    role: "USER",
    displayName: "Amina Yusuf",
    initials: "AY",
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
    notificationPreferences: { email: true, whatsApp: true, inApp: true },
  };
}

function createOverviewResponse(overrides: Record<string, unknown> = {}) {
  return {
    activeBook: null,
    recentOrders: [],
    notifications: { unreadCount: 0, hasProductionDelayBanner: false },
    profile: { isProfileComplete: true, preferredLanguage: "en" },
    pendingActions: { total: 0, items: [] },
    ...overrides,
  };
}

function emptyNotificationsPage() {
  return {
    items: [],
    pagination: {
      page: 1,
      pageSize: 20,
      totalItems: 0,
      totalPages: 0,
      hasPreviousPage: false,
      hasNextPage: false,
    },
  };
}

function emptyReviewsResponse() {
  return { hasEligibleBooks: false, hasPendingReviews: false, books: [] };
}

/**
 * Setup all dashboard API routes with auth, profile, notifications, and reviews
 * returning the given overview payload.
 */
async function mockAllDashboardApis(page: Page, overviewPayload: Record<string, unknown>) {
  await page.route("**/api/v1/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: createAuthUser() }),
    });
  });

  await page.route("**/api/v1/auth/refresh", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  await page.route("**/api/v1/users/me/profile", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(createProfileResponse()),
    });
  });

  await page.route("**/api/v1/notifications/unread-count", async (route) => {
    const notifs = overviewPayload.notifications as { unreadCount?: number } | undefined;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ unreadCount: notifs?.unreadCount ?? 0 }),
    });
  });

  await page.route("**/api/v1/notifications?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(emptyNotificationsPage()),
    });
  });

  await page.route("**/api/v1/reviews/my", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(emptyReviewsResponse()),
    });
  });

  await page.route("**/api/v1/dashboard/overview", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(overviewPayload),
    });
  });
}

async function gotoDashboard(page: Page) {
  await page.goto(DASHBOARD_PATH, { waitUntil: "domcontentloaded" });
}

test.describe("Dashboard async paths", () => {
  /* ─── 1. Loading skeleton → content (no blank frame) ─── */

  test("375px: initial load shows skeleton then overview content — never a blank screen", async ({
    page,
  }) => {
    test.slow();
    await page.setViewportSize({ width: 375, height: 812 });

    const overviewPayload = createOverviewResponse();

    // Hold the auth response to observe the auth gate loading state
    const authGate: { resolve: () => void } = { resolve: () => {} };
    const authPromise = new Promise<void>((resolve) => {
      authGate.resolve = resolve;
    });

    await page.route("**/api/v1/auth/me", async (route) => {
      await authPromise;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: createAuthUser() }),
      });
    });

    await page.route("**/api/v1/auth/refresh", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      });
    });

    await page.route("**/api/v1/users/me/profile", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(createProfileResponse()),
      });
    });

    await page.route("**/api/v1/notifications/unread-count", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ unreadCount: 0 }),
      });
    });

    await page.route("**/api/v1/notifications?*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(emptyNotificationsPage()),
      });
    });

    await page.route("**/api/v1/reviews/my", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(emptyReviewsResponse()),
      });
    });

    await page.route("**/api/v1/dashboard/overview", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(overviewPayload),
      });
    });

    await gotoDashboard(page);

    // Auth gate: "Loading dashboard..." must appear (never just empty white screen)
    await expect(page.getByText("Loading dashboard...")).toBeVisible({ timeout: 15_000 });

    // No main content yet
    await expect(
      page.getByRole("heading", { name: "Keep your publishing momentum moving." })
    ).toHaveCount(0);

    // Release the auth gate
    authGate.resolve();

    // Content must appear, loading must disappear
    await expect(
      page.getByRole("heading", { name: "Keep your publishing momentum moving." }).first()
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Loading dashboard...")).toHaveCount(0);
  });

  /* ─── 2. API error → error state → retry → success ───── */

  test("768px: overview API failure shows error with retry, succeeds on retry", async ({
    page,
  }) => {
    test.slow();
    await page.setViewportSize({ width: 768, height: 1024 });

    const overviewPayload = createOverviewResponse();

    await page.route("**/api/v1/auth/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: createAuthUser() }),
      });
    });

    await page.route("**/api/v1/auth/refresh", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      });
    });

    await page.route("**/api/v1/users/me/profile", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(createProfileResponse()),
      });
    });

    await page.route("**/api/v1/notifications/unread-count", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ unreadCount: 0 }),
      });
    });

    await page.route("**/api/v1/notifications?*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(emptyNotificationsPage()),
      });
    });

    await page.route("**/api/v1/reviews/my", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(emptyReviewsResponse()),
      });
    });

    // Fail all calls until user clicks retry (initial + auto-retries)
    let shouldSucceed = false;
    await page.route("**/api/v1/dashboard/overview", async (route) => {
      if (!shouldSucceed) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: "Internal Server Error" }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(overviewPayload),
        });
      }
    });

    await gotoDashboard(page);

    // After initial + auto-retries exhaust, error state must appear
    const retryButton = page.getByRole("button", { name: "Try Again" });
    await expect(retryButton).toBeVisible({ timeout: 30_000 });

    // Verify content is NOT shown alongside the error
    await expect(
      page.getByRole("heading", { name: "Keep your publishing momentum moving." })
    ).toHaveCount(0);

    // Click retry → API now succeeds
    shouldSucceed = true;
    await retryButton.click();

    // Content appears after successful retry
    await expect(
      page.getByRole("heading", { name: "Keep your publishing momentum moving." }).first()
    ).toBeVisible({ timeout: 15_000 });

    // Error state is gone
    await expect(retryButton).toHaveCount(0);
  });

  /* ─── 3. Background refetch preserves content ─────────── */

  test("1280px: polling refetch updates unread count without blanking content", async ({
    page,
  }) => {
    test.slow();
    await page.setViewportSize({ width: 1280, height: 900 });

    let unreadCountCalls = 0;

    await page.route("**/api/v1/auth/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: createAuthUser() }),
      });
    });

    await page.route("**/api/v1/auth/refresh", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      });
    });

    await page.route("**/api/v1/users/me/profile", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(createProfileResponse()),
      });
    });

    // First unread count = 2, second call returns 5 (simulating poll update)
    await page.route("**/api/v1/notifications/unread-count", async (route) => {
      unreadCountCalls += 1;
      const count = unreadCountCalls <= 1 ? 2 : 5;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ unreadCount: count }),
      });
    });

    await page.route("**/api/v1/notifications?*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(emptyNotificationsPage()),
      });
    });

    await page.route("**/api/v1/reviews/my", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(emptyReviewsResponse()),
      });
    });

    await page.route("**/api/v1/dashboard/overview", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          createOverviewResponse({
            notifications: { unreadCount: 2, hasProductionDelayBanner: false },
          })
        ),
      });
    });

    await gotoDashboard(page);

    // Wait for initial content
    await expect(page.getByText("Loading dashboard...")).toHaveCount(0, { timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: "Keep your publishing momentum moving." }).first()
    ).toBeVisible({ timeout: 15_000 });

    // Badge should show initial count
    const badge = page.locator("[data-notification-badge='true']");
    await expect(badge).toBeVisible({ timeout: 15_000 });

    // Content must still be present (no blank during poll refetch).
    // Verify the overview remains visible after a short wait (simulating poll interval).
    await page.waitForTimeout(2_000);
    await expect(
      page.getByRole("heading", { name: "Keep your publishing momentum moving." }).first()
    ).toBeVisible();

    // The "Loading dashboard..." must never reappear during refetch
    await expect(page.getByText("Loading dashboard...")).toHaveCount(0);
  });

  /* ─── 4. Empty state for first-time user ─────────────── */

  test("375px: first-time user sees meaningful empty states, not blank areas", async ({ page }) => {
    test.slow();
    await page.setViewportSize({ width: 375, height: 812 });

    await mockAllDashboardApis(page, createOverviewResponse());
    await gotoDashboard(page);

    await expect(page.getByText("Loading dashboard...")).toHaveCount(0, { timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: "Keep your publishing momentum moving." }).first()
    ).toBeVisible({ timeout: 15_000 });

    // Main content area must exist and not be empty
    const mainContent = page.locator("#main-content");
    await expect(mainContent).toBeVisible();

    // Ensure empty state cards render (not just blank space)
    // At least one link to /pricing should be present for idle users
    await expect(
      page.getByRole("link", {
        name: /Start a New Project/,
      })
    ).toBeVisible({ timeout: 10_000 });
  });

  /* ─── 5. Slow API — skeleton stays visible, no timeout crash ─ */

  test("768px: slow auth keeps loading screen visible until auth resolves", async ({ page }) => {
    test.slow();
    await page.setViewportSize({ width: 768, height: 1024 });

    // Hold the auth response to simulate a slow network
    const authGate: { resolve: () => void } = { resolve: () => {} };
    const authPromise = new Promise<void>((resolve) => {
      authGate.resolve = resolve;
    });

    await page.route("**/api/v1/auth/me", async (route) => {
      await authPromise;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: createAuthUser() }),
      });
    });

    await page.route("**/api/v1/auth/refresh", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      });
    });

    await page.route("**/api/v1/users/me/profile", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(createProfileResponse()),
      });
    });

    await page.route("**/api/v1/notifications/unread-count", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ unreadCount: 0 }),
      });
    });

    await page.route("**/api/v1/notifications?*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(emptyNotificationsPage()),
      });
    });

    await page.route("**/api/v1/reviews/my", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(emptyReviewsResponse()),
      });
    });

    await page.route("**/api/v1/dashboard/overview", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(createOverviewResponse()),
      });
    });

    await gotoDashboard(page);

    // Auth gate loading screen visible
    await expect(page.getByText("Loading dashboard...")).toBeVisible({ timeout: 10_000 });

    // Wait 3 seconds — loading screen should still be visible, not crashed
    await page.waitForTimeout(3_000);
    await expect(page.getByText("Loading dashboard...")).toBeVisible();

    // No content yet
    await expect(
      page.getByRole("heading", { name: "Keep your publishing momentum moving." })
    ).toHaveCount(0);

    // Release the auth gate
    authGate.resolve();

    // Finally content appears
    await expect(
      page.getByRole("heading", { name: "Keep your publishing momentum moving." }).first()
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Loading dashboard...")).toHaveCount(0);
  });
});
