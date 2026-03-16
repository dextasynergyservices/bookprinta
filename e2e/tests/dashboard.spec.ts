import { expect, type Page, test } from "@playwright/test";

type MockNotificationAction =
  | { kind: "none" }
  | { kind: "navigate"; href: string }
  | { kind: "open_review_dialog"; bookId: string };

type MockNotification = {
  id: string;
  type:
    | "ORDER_STATUS"
    | "BANK_TRANSFER_RECEIVED"
    | "PRODUCTION_DELAY"
    | "REVIEW_REQUEST"
    | "SYSTEM";
  isRead: boolean;
  createdAt: string;
  data: {
    titleKey: string;
    messageKey: string;
    params?: Record<string, string | number>;
    action?: MockNotificationAction;
    presentation?: {
      tone?: "default" | "warning";
      persistentBanner?: "production_delay";
    };
  };
};

type MockDashboardApiOptions = {
  notifications?: MockNotification[];
  unreadCountSequence?: number[];
  pendingReviewBookIds?: string[];
};

type MockDashboardApiState = {
  getSubmittedReviews: () => Array<{ bookId: string; rating: number; comment?: string }>;
};

const DASHBOARD_PATH = "/dashboard";
const REVIEW_BOOK_ID = "cm1111111111111111111111111";

async function gotoDashboard(page: Page, path = DASHBOARD_PATH) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
}

function createNotification(overrides: Partial<MockNotification>): MockNotification {
  const baseData: MockNotification["data"] = {
    titleKey: "notifications.order_status.title",
    messageKey: "notifications.order_status.message",
    params: {
      orderNumber: "BP-1042",
    },
    action: {
      kind: "none",
    },
  };

  return {
    id: "cm2000000000000000000000001",
    type: "SYSTEM",
    isRead: false,
    createdAt: "2026-03-07T09:00:00.000Z",
    ...overrides,
    data: {
      ...baseData,
      ...overrides.data,
    },
  };
}

function createDashboardOverviewResponse(params: {
  unreadCount: number;
  hasProductionDelayBanner: boolean;
}) {
  return {
    activeBook: null,
    recentOrders: [],
    notifications: {
      unreadCount: params.unreadCount,
      hasProductionDelayBanner: params.hasProductionDelayBanner,
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
  {
    notifications = [],
    unreadCountSequence,
    pendingReviewBookIds = [],
  }: MockDashboardApiOptions = {}
): Promise<MockDashboardApiState> {
  let currentNotifications = notifications.map((notification) => ({ ...notification }));
  const queuedUnreadCounts = [...(unreadCountSequence ?? [])];
  const submittedReviews: Array<{ bookId: string; rating: number; comment?: string }> = [];
  let reviewBooks = pendingReviewBookIds.map((bookId) => ({
    bookId,
    title: "The Lagos Chronicle",
    coverImageUrl: null,
    lifecycleStatus: "PRINTED",
    reviewStatus: "PENDING",
    review: null,
  }));

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
    const unreadCount =
      queuedUnreadCounts.length > 0
        ? (queuedUnreadCounts.shift() ?? 0)
        : currentNotifications.filter((notification) => !notification.isRead).length;

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
          unreadCount: currentNotifications.filter((notification) => !notification.isRead).length,
          hasProductionDelayBanner: currentNotifications.some(
            (notification) =>
              notification.data.presentation?.persistentBanner === "production_delay"
          ),
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
        items: currentNotifications,
        pagination: {
          page: 1,
          pageSize: currentNotifications.length || 20,
          totalItems: currentNotifications.length,
          totalPages: currentNotifications.length > 0 ? 1 : 0,
          hasPreviousPage: false,
          hasNextPage: false,
        },
      }),
    });
  });

  await page.route("**/api/v1/notifications/read-all", async (route) => {
    const updatedCount = currentNotifications.filter((notification) => !notification.isRead).length;
    currentNotifications = currentNotifications.map((notification) => ({
      ...notification,
      isRead: true,
    }));

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ updatedCount }),
    });
  });

  await page.route(/\/api\/v1\/notifications\/[^/]+\/read$/, async (route) => {
    const url = new URL(route.request().url());
    const notificationId = url.pathname.split("/").at(-2);

    const nextNotification =
      currentNotifications.find((notification) => notification.id === notificationId) ?? null;

    if (!nextNotification) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ message: "Notification not found" }),
      });
      return;
    }

    const updatedNotification = {
      ...nextNotification,
      isRead: true,
    };

    currentNotifications = currentNotifications.map((notification) =>
      notification.id === notificationId ? updatedNotification : notification
    );

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        notification: updatedNotification,
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

  await page.route("**/api/v1/reviews", async (route) => {
    const body = route.request().postDataJSON() as {
      bookId: string;
      rating: number;
      comment?: string;
    };

    submittedReviews.push(body);

    const currentBook =
      reviewBooks.find((book) => book.bookId === body.bookId) ??
      ({
        bookId: body.bookId,
        title: "The Lagos Chronicle",
        coverImageUrl: null,
        lifecycleStatus: "DELIVERED",
      } as const);

    const review = {
      bookId: body.bookId,
      title: currentBook.title,
      coverImageUrl: currentBook.coverImageUrl,
      lifecycleStatus: currentBook.lifecycleStatus,
      reviewStatus: "REVIEWED" as const,
      review: {
        rating: body.rating,
        comment: body.comment ?? null,
        isPublic: true,
        createdAt: "2026-03-07T11:00:00.000Z",
      },
    };

    reviewBooks = [
      review,
      ...reviewBooks.filter((existingReview) => existingReview.bookId !== body.bookId),
    ];

    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        book: review,
      }),
    });
  });

  return {
    getSubmittedReviews: () => submittedReviews,
  };
}

async function waitForDashboardReady(page: Page) {
  await expect(page.getByText("Loading dashboard...")).toHaveCount(0, { timeout: 15_000 });
  await expect(
    page.getByRole("button", { name: /Open notifications|Close notifications/ })
  ).toBeVisible({
    timeout: 15_000,
  });
}

async function openNotificationPanel(page: Page) {
  const trigger = page.getByRole("button", { name: /Open notifications|Close notifications/ });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await dismissAutoOpenedReviewDialogIfPresent(page, attempt === 0 ? 250 : 1_500);

    try {
      await trigger.click({ timeout: 5_000 });
      break;
    } catch (error) {
      if (attempt === 1) {
        throw error;
      }
    }
  }

  const panel = page.locator("[data-notification-panel-surface='true']");
  await expect(panel).toBeVisible({ timeout: 15_000 });

  return panel;
}

async function dismissAutoOpenedReviewDialogIfPresent(page: Page, timeout = 1_000) {
  const closeButton = page.getByRole("button", { name: "Close review dialog" });
  const isDialogVisible = await closeButton
    .waitFor({ state: "visible", timeout })
    .then(() => true)
    .catch(() => false);

  if (!isDialogVisible) {
    return;
  }

  await closeButton.click();
  await expect(closeButton).toBeHidden({ timeout: 15_000 });
}

test.describe("Dashboard notification center", () => {
  test("375px: badge accuracy, translated copy, and single-item read state", async ({ page }) => {
    test.slow();
    await page.setViewportSize({ width: 375, height: 812 });
    await mockDashboardApis(page, {
      notifications: [
        createNotification({
          id: "cm2000000000000000000000002",
          type: "ORDER_STATUS",
        }),
      ],
    });

    await gotoDashboard(page);
    await waitForDashboardReady(page);
    await dismissAutoOpenedReviewDialogIfPresent(page);
    await expect(page.locator("[data-notification-badge='true']")).toHaveText("1", {
      timeout: 15_000,
    });
    await expect(page.locator("[data-notification-badge='true']")).toHaveAttribute(
      "data-bounce-seq",
      "0"
    );

    const panel = await openNotificationPanel(page);
    await expect(panel.getByText("Order update")).toBeVisible();
    await expect(panel.getByText("Order BP-1042 has a new status update.")).toBeVisible();
    await expect(panel.getByText("notifications.order_status.title")).toHaveCount(0);

    const panelBox = await panel.boundingBox();
    expect(panelBox?.width ?? 0).toBeGreaterThanOrEqual(360);

    const notificationItem = page.locator("[data-notification-id='cm2000000000000000000000002']");
    const indicator = notificationItem.locator("[data-notification-indicator='true']");

    await expect(notificationItem).toHaveAttribute("data-read-state", "unread");
    await expect(indicator).toHaveCSS("opacity", "1");

    await notificationItem.focus();
    await page.keyboard.press("Enter");

    await expect(notificationItem).toHaveAttribute("data-read-state", "read");
    await expect(indicator).toHaveCSS("opacity", "0");
    await expect(page.locator("[data-notification-badge='true']")).toHaveCount(0);

    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
  });

  test("768px: production delay banner persists after mark-all-read", async ({ page }) => {
    test.slow();
    await page.setViewportSize({ width: 768, height: 1024 });
    await mockDashboardApis(page, {
      notifications: [
        createNotification({
          id: "cm2000000000000000000000003",
          type: "PRODUCTION_DELAY",
          data: {
            titleKey: "notifications.production_delay.title",
            messageKey: "notifications.production_delay.message",
            action: { kind: "none" },
            presentation: {
              tone: "warning",
              persistentBanner: "production_delay",
            },
          },
        }),
        createNotification({
          id: "cm2000000000000000000000004",
          type: "ORDER_STATUS",
          data: {
            titleKey: "notifications.order_status.title",
            messageKey: "notifications.order_status.message",
            params: {
              orderNumber: "BP-1058",
            },
            action: { kind: "none" },
          },
        }),
      ],
    });

    await gotoDashboard(page);
    await waitForDashboardReady(page);
    const productionDelayBanner = page.getByLabel("Production delay notice");
    await expect(productionDelayBanner).toBeVisible({ timeout: 15_000 });
    await expect(productionDelayBanner).toContainText("We're experiencing high demand.");

    const panel = await openNotificationPanel(page);
    await expect(panel.getByText("Production update")).toBeVisible();

    const warningItem = page.locator("[data-notification-id='cm2000000000000000000000003']");
    await expect(warningItem).toHaveCSS("background-color", "rgb(254, 243, 199)");

    await page.getByRole("button", { name: "Mark all notifications as read" }).click();

    await expect(page.locator("[data-notification-badge='true']")).toHaveCount(0);
    await expect(
      page.locator("[data-notification-id='cm2000000000000000000000003']")
    ).toHaveAttribute("data-read-state", "read");
    await expect(productionDelayBanner).toBeVisible();
    await expect(productionDelayBanner).toContainText("We're experiencing high demand.");

    await page.mouse.click(12, 12);
    await expect(panel).toHaveCount(0);
  });

  test("1280px: desktop dropdown opens review flow and submits a review", async ({ page }) => {
    test.slow();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.addInitScript((bookId: string) => {
      window.sessionStorage.setItem(`dashboard_review_dialog_dismissed:${bookId}`, "1");
    }, REVIEW_BOOK_ID);
    const apiState = await mockDashboardApis(page, {
      notifications: [
        createNotification({
          id: "cm2000000000000000000000005",
          type: "REVIEW_REQUEST",
          data: {
            titleKey: "notifications.review_request.title",
            messageKey: "notifications.review_request.message",
            params: {
              bookTitle: "The Lagos Chronicle",
            },
            action: {
              kind: "open_review_dialog",
              bookId: REVIEW_BOOK_ID,
            },
          },
        }),
      ],
      pendingReviewBookIds: [REVIEW_BOOK_ID],
    });

    await gotoDashboard(page);
    await waitForDashboardReady(page);
    await expect(page.locator("[data-notification-badge='true']")).toHaveText("1", {
      timeout: 15_000,
    });

    const panel = await openNotificationPanel(page);

    const panelBox = await panel.boundingBox();
    expect(panelBox?.width ?? 0).toBeLessThanOrEqual(460);
    expect(panelBox?.height ?? 0).toBeLessThan(760);

    const reviewNotification = page.locator("[data-notification-id='cm2000000000000000000000005']");
    await reviewNotification.focus();
    await page.keyboard.press("Enter");

    const reviewDialog = page.getByRole("dialog", { name: "How was your experience?" });
    await expect(reviewDialog).toBeVisible({ timeout: 15_000 });
    await expect(reviewDialog.getByText("The Lagos Chronicle", { exact: true })).toBeVisible();

    await page.getByRole("radio", { name: "5 star rating" }).click();
    await page
      .getByLabel("Tell us more (optional)")
      .fill("Sharp print quality and smooth updates.");
    await page.getByRole("button", { name: "Submit Review" }).click();

    const reviewSuccessHeading = page.getByRole("heading", {
      name: "Thank you for your feedback!",
    });
    await expect(reviewSuccessHeading).toBeVisible({ timeout: 15_000 });
    await expect(reviewSuccessHeading).toHaveCount(0, { timeout: 15_000 });
    await expect(page.locator("[data-notification-badge='true']")).toHaveCount(0);
    expect(apiState.getSubmittedReviews()).toEqual([
      {
        bookId: REVIEW_BOOK_ID,
        rating: 5,
        comment: "Sharp print quality and smooth updates.",
      },
    ]);
  });
});
