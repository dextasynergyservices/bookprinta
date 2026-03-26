import { expect, type Page, test } from "@playwright/test";

const DASHBOARD_PATH = "/dashboard";
const ACTIVE_BOOK_ID = "cmbook11111111111111111111111";
const ACTIVE_ORDER_ID = "cmorder1111111111111111111111";

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

function createProfileResponse(isProfileComplete: boolean) {
  return {
    bio: null,
    profileImageUrl: null,
    whatsAppNumber: null,
    websiteUrl: null,
    purchaseLinks: [],
    socialLinks: [],
    isProfileComplete,
    preferredLanguage: "en",
    notificationPreferences: {
      email: true,
      whatsApp: true,
      inApp: true,
    },
  };
}

function createActiveBook(overrides: Record<string, unknown> = {}) {
  return {
    id: ACTIVE_BOOK_ID,
    orderId: ACTIVE_ORDER_ID,
    title: "The Lagos Chronicle",
    status: "PREVIEW_READY",
    productionStatus: "REVIEW",
    orderStatus: "PREVIEW_READY",
    currentStage: "REVIEW",
    coverImageUrl: null,
    latestProcessingError: null,
    rejectionReason: null,
    pageCount: 180,
    wordCount: 52000,
    estimatedPages: 176,
    fontSize: 12,
    pageSize: "A5",
    previewPdfUrlPresent: true,
    finalPdfUrlPresent: false,
    createdAt: "2026-03-01T08:00:00.000Z",
    updatedAt: "2026-03-10T08:00:00.000Z",
    workspaceUrl: `/dashboard/books/${ACTIVE_BOOK_ID}`,
    trackingUrl: `/dashboard/orders/${ACTIVE_ORDER_ID}`,
    rollout: {
      environment: "staging",
      allowInFlightAccess: true,
      isGrandfathered: false,
      blockedBy: null,
      workspace: { enabled: true, access: "enabled" },
      manuscriptPipeline: { enabled: true, access: "enabled" },
      billingGate: { enabled: true, access: "enabled" },
      finalPdf: { enabled: true, access: "enabled" },
    },
    processing: {
      isActive: false,
      currentStep: null,
      jobStatus: null,
      trigger: null,
      startedAt: null,
      attempt: null,
      maxAttempts: null,
    },
    ...overrides,
  };
}

function createRecentOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: ACTIVE_ORDER_ID,
    orderNumber: "BP-2026-0001",
    orderType: "STANDARD",
    status: "PREVIEW_READY",
    createdAt: "2026-03-01T08:00:00.000Z",
    totalAmount: 125000,
    currency: "NGN",
    package: {
      id: "cmpackage1111111111111111111",
      name: "Author Launch",
      slug: "author-launch",
    },
    book: {
      id: ACTIVE_BOOK_ID,
      status: "PREVIEW_READY",
    },
    trackingUrl: `/dashboard/orders/${ACTIVE_ORDER_ID}`,
    ...overrides,
  };
}

function createOverviewResponse(overrides: Record<string, unknown> = {}) {
  return {
    activeBook: null,
    recentOrders: [],
    notifications: {
      unreadCount: 0,
      hasProductionDelayBanner: false,
    },
    profile: {
      isProfileComplete: true,
      preferredLanguage: "en",
    },
    pendingActions: {
      total: 0,
      items: [],
    },
    ...overrides,
  };
}

async function gotoDashboard(page: Page, path = DASHBOARD_PATH) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
}

async function waitForOverviewReady(page: Page) {
  await expect(page.getByText("Loading dashboard...")).toHaveCount(0, { timeout: 15_000 });
  await expect(
    page.getByRole("heading", { name: "Keep your publishing momentum moving." }).first()
  ).toBeVisible({
    timeout: 15_000,
  });
}

async function mockDashboardOverviewApis(
  page: Page,
  params: {
    overview: Record<string, unknown>;
    isProfileComplete: boolean;
    notificationItems?: Array<Record<string, unknown>>;
    reviewBooks?: Array<Record<string, unknown>>;
  }
) {
  const notifications = params.notificationItems ?? [];
  const reviewBooks = params.reviewBooks ?? [];

  await page.route("**/api/v1/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: createAuthUser(),
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

  await page.route("**/api/v1/dashboard/overview", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(params.overview),
    });
  });

  await page.route("**/api/v1/users/me/profile", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(createProfileResponse(params.isProfileComplete)),
    });
  });

  await page.route("**/api/v1/notifications/unread-count", async (route) => {
    const overviewNotifications = params.overview.notifications as
      | { unreadCount?: number }
      | undefined;

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        unreadCount: overviewNotifications?.unreadCount ?? 0,
      }),
    });
  });

  await page.route("**/api/v1/notifications?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: notifications,
        pagination: {
          page: 1,
          pageSize: notifications.length || 20,
          totalItems: notifications.length,
          totalPages: notifications.length > 0 ? 1 : 0,
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
        hasEligibleBooks: reviewBooks.length > 0,
        hasPendingReviews: reviewBooks.some((book) => book.reviewStatus === "PENDING"),
        books: reviewBooks,
      }),
    });
  });
}

test.describe("Dashboard overview action paths", () => {
  test("375px: incomplete-profile next action opens the profile workspace", async ({ page }) => {
    test.slow();
    await page.setViewportSize({ width: 375, height: 812 });
    await mockDashboardOverviewApis(page, {
      overview: createOverviewResponse({
        profile: {
          isProfileComplete: false,
          preferredLanguage: "en",
        },
      }),
      isProfileComplete: false,
    });

    await gotoDashboard(page);
    await waitForOverviewReady(page);

    await expect(page.getByRole("heading", { name: "Complete your author profile" })).toBeVisible();
    await Promise.all([
      page.waitForURL(/\/dashboard\/profile$/),
      page.getByRole("link", { name: "Complete Profile: Complete your author profile" }).click(),
    ]);
  });

  test("768px: active-production next action opens the book workspace", async ({ page }) => {
    test.slow();
    await page.setViewportSize({ width: 768, height: 1024 });
    await mockDashboardOverviewApis(page, {
      overview: createOverviewResponse({
        activeBook: createActiveBook(),
        recentOrders: [createRecentOrder()],
        notifications: {
          unreadCount: 2,
          hasProductionDelayBanner: false,
        },
        pendingActions: {
          total: 1,
          items: [
            {
              type: "REVIEW_PREVIEW",
              priority: "high",
              href: `/dashboard/books/${ACTIVE_BOOK_ID}`,
              bookId: ACTIVE_BOOK_ID,
              orderId: ACTIVE_ORDER_ID,
              bookTitle: "The Lagos Chronicle",
              bookStatus: "PREVIEW_READY",
              orderStatus: "PREVIEW_READY",
            },
          ],
        },
      }),
      isProfileComplete: true,
    });

    await gotoDashboard(page);
    await waitForOverviewReady(page);

    await expect(page.getByRole("heading", { name: "Review your preview" })).toBeVisible();
    await Promise.all([
      page.waitForURL(new RegExp(`/dashboard/books\\?bookId=${ACTIVE_BOOK_ID}`)),
      page.getByRole("link", { name: "Review Preview: Review your preview" }).click(),
    ]);
  });

  test("1280px: delivered reprint history keeps the reviews workspace one click away", async ({
    page,
  }) => {
    test.slow();
    await page.setViewportSize({ width: 1280, height: 900 });
    await mockDashboardOverviewApis(page, {
      overview: createOverviewResponse({
        recentOrders: [
          createRecentOrder({
            orderType: "REPRINT",
            status: "COMPLETED",
            book: {
              id: ACTIVE_BOOK_ID,
              status: "DELIVERED",
            },
          }),
        ],
      }),
      isProfileComplete: true,
    });

    await gotoDashboard(page);
    await waitForOverviewReady(page);

    await expect(page.locator('[data-order-type="REPRINT"]')).toContainText("REPRINT");
    await page
      .getByRole("link", {
        name: "Reviews. Check review-ready books and submit feedback on delivered projects.",
      })
      .click();
    await expect(page).toHaveURL(/\/dashboard\/reviews$/, { timeout: 15_000 });
  });
});
