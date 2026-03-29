/// <reference types="jest" />
import { Test, type TestingModule } from "@nestjs/testing";
import { BooksService } from "../books/books.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { OrdersService } from "../orders/orders.service.js";
import { ReviewsService } from "../reviews/reviews.service.js";
import { UsersService } from "../users/users.service.js";
import { DashboardService } from "./dashboard.service.js";

const booksServiceMock = {
  findUserBooks: jest.fn(),
};

const ordersServiceMock = {
  findUserOrders: jest.fn(),
};

const notificationsServiceMock = {
  getUnreadCount: jest.fn(),
  findUserNotifications: jest.fn(),
};

const usersServiceMock = {
  getMyProfile: jest.fn(),
};

const reviewsServiceMock = {
  getMyReviews: jest.fn(),
};

describe("DashboardService", () => {
  let service: DashboardService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: BooksService, useValue: booksServiceMock },
        { provide: OrdersService, useValue: ordersServiceMock },
        { provide: NotificationsService, useValue: notificationsServiceMock },
        { provide: UsersService, useValue: usersServiceMock },
        { provide: ReviewsService, useValue: reviewsServiceMock },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
    jest.clearAllMocks();
  });

  it("builds the dashboard overview from the reusable service surfaces", async () => {
    booksServiceMock.findUserBooks.mockResolvedValue({
      items: [
        {
          id: "cmbook11111111111111111111111",
          orderId: "cmorder1111111111111111111111",
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
          workspaceUrl: "/dashboard/books/cmbook11111111111111111111111",
          trackingUrl: "/dashboard/orders/cmorder1111111111111111111111",
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
        },
      ],
      pagination: {
        page: 1,
        pageSize: 10,
        totalItems: 1,
        totalPages: 1,
        hasPreviousPage: false,
        hasNextPage: false,
      },
    });
    ordersServiceMock.findUserOrders.mockResolvedValue({
      items: [
        {
          id: "cmorder1111111111111111111111",
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
            id: "cmbook11111111111111111111111",
            status: "PREVIEW_READY",
            productionStatus: null,
          },
          trackingUrl: "/dashboard/orders/cmorder1111111111111111111111",
        },
      ],
      pagination: {
        page: 1,
        pageSize: 3,
        totalItems: 1,
        totalPages: 1,
        hasPreviousPage: false,
        hasNextPage: false,
      },
    });
    notificationsServiceMock.getUnreadCount.mockResolvedValue({
      unreadCount: 4,
    });
    notificationsServiceMock.findUserNotifications.mockResolvedValue({
      items: [
        {
          id: "cmnotification1111111111111111",
          type: "PRODUCTION_DELAY",
          isRead: true,
          createdAt: "2026-03-11T10:00:00.000Z",
          data: {
            titleKey: "notifications.production_delay.title",
            messageKey: "notifications.production_delay.message",
            presentation: {
              persistentBanner: "production_delay",
            },
          },
        },
      ],
      pagination: {
        page: 1,
        pageSize: 50,
        totalItems: 1,
        totalPages: 1,
        hasPreviousPage: false,
        hasNextPage: false,
      },
    });
    usersServiceMock.getMyProfile.mockResolvedValue({
      bio: null,
      profileImageUrl: null,
      whatsAppNumber: null,
      websiteUrl: null,
      purchaseLinks: [],
      socialLinks: [],
      isProfileComplete: false,
      preferredLanguage: "en",
      notificationPreferences: {
        email: true,
        whatsApp: true,
        inApp: true,
      },
    });
    reviewsServiceMock.getMyReviews.mockResolvedValue({
      hasEligibleBooks: true,
      hasPendingReviews: true,
      books: [
        {
          bookId: "cmprinted1111111111111111111",
          title: "Already Printed",
          coverImageUrl: null,
          lifecycleStatus: "PRINTED",
          reviewStatus: "PENDING",
          review: null,
        },
      ],
    });

    const result = await service.getUserDashboardOverview("cmuser111111111111111111111111");

    expect(result.activeBook?.id).toBe("cmbook11111111111111111111111");
    expect(result.notifications).toEqual({
      unreadCount: 4,
      hasProductionDelayBanner: true,
    });
    expect(result.profile).toEqual({
      isProfileComplete: false,
      preferredLanguage: "en",
    });
    expect(result.pendingActions.items).toEqual([
      expect.objectContaining({
        type: "REVIEW_PREVIEW",
        priority: "high",
        bookId: "cmbook11111111111111111111111",
      }),
      expect.objectContaining({
        type: "COMPLETE_PROFILE",
        priority: "medium",
        href: "/dashboard/profile",
      }),
      expect.objectContaining({
        type: "REVIEW_BOOK",
        priority: "medium",
        bookId: "cmprinted1111111111111111111",
      }),
    ]);
  });

  it("falls back to the latest book when all books are terminal and still surfaces payment actions", async () => {
    booksServiceMock.findUserBooks.mockResolvedValue({
      items: [
        {
          id: "cmbook22222222222222222222222",
          orderId: "cmorder2222222222222222222222",
          title: "Delivered Book",
          status: "DELIVERED",
          productionStatus: "DELIVERED",
          orderStatus: "PENDING_EXTRA_PAYMENT",
          currentStage: "DELIVERED",
          coverImageUrl: null,
          latestProcessingError: null,
          rejectionReason: null,
          pageCount: 210,
          wordCount: 61000,
          estimatedPages: 205,
          fontSize: 12,
          pageSize: "A5",
          previewPdfUrlPresent: true,
          finalPdfUrlPresent: true,
          createdAt: "2026-03-01T08:00:00.000Z",
          updatedAt: "2026-03-12T08:00:00.000Z",
          workspaceUrl: "/dashboard/books/cmbook22222222222222222222222",
          trackingUrl: "/dashboard/orders/cmorder2222222222222222222222",
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
        },
      ],
      pagination: {
        page: 1,
        pageSize: 10,
        totalItems: 1,
        totalPages: 1,
        hasPreviousPage: false,
        hasNextPage: false,
      },
    });
    ordersServiceMock.findUserOrders.mockResolvedValue({
      items: [],
      pagination: {
        page: 1,
        pageSize: 3,
        totalItems: 0,
        totalPages: 0,
        hasPreviousPage: false,
        hasNextPage: false,
      },
    });
    notificationsServiceMock.getUnreadCount.mockResolvedValue({
      unreadCount: 0,
    });
    notificationsServiceMock.findUserNotifications.mockResolvedValue({
      items: [],
      pagination: {
        page: 1,
        pageSize: 50,
        totalItems: 0,
        totalPages: 0,
        hasPreviousPage: false,
        hasNextPage: false,
      },
    });
    usersServiceMock.getMyProfile.mockResolvedValue({
      bio: "Complete",
      profileImageUrl: "https://cdn.example.com/profile.jpg",
      whatsAppNumber: null,
      websiteUrl: null,
      purchaseLinks: [{ label: "Buy", url: "https://example.com" }],
      socialLinks: [],
      isProfileComplete: true,
      preferredLanguage: "en",
      notificationPreferences: {
        email: true,
        whatsApp: false,
        inApp: true,
      },
    });
    reviewsServiceMock.getMyReviews.mockResolvedValue({
      hasEligibleBooks: false,
      hasPendingReviews: false,
      books: [],
    });

    const result = await service.getUserDashboardOverview("cmuser111111111111111111111111");

    expect(result.activeBook?.id).toBe("cmbook22222222222222222222222");
    expect(result.pendingActions.items).toEqual([
      expect.objectContaining({
        type: "PAY_EXTRA_PAGES",
        priority: "high",
        bookId: "cmbook22222222222222222222222",
      }),
      expect.objectContaining({
        type: "REPRINT_AVAILABLE",
        priority: "low",
        bookId: "cmbook22222222222222222222222",
      }),
    ]);
  });
});
