/// <reference types="jest" />
import { ADMIN_ROLES } from "@bookprinta/shared";
import { NotFoundException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { PrismaService } from "../prisma/prisma.service.js";
import { NotificationsService } from "./notifications.service.js";

const mockPrismaService = {
  notification: {
    count: jest.fn(),
    createMany: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  user: {
    findMany: jest.fn(),
  },
};

describe("NotificationsService", () => {
  let service: NotificationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NotificationsService, { provide: PrismaService, useValue: mockPrismaService }],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    jest.resetAllMocks();
  });

  describe("getUnreadCount", () => {
    it("returns unread count for the authenticated user", async () => {
      mockPrismaService.notification.count.mockResolvedValue(3);

      await expect(service.getUnreadCount("user_1")).resolves.toEqual({ unreadCount: 3 });
      expect(mockPrismaService.notification.count).toHaveBeenCalledWith({
        where: {
          userId: "user_1",
          isRead: false,
        },
      });
    });
  });

  describe("findUserNotifications", () => {
    it("returns paginated notifications with normalized metadata", async () => {
      mockPrismaService.notification.findMany.mockResolvedValue([
        {
          id: "cm1111111111111111111111111",
          title: "Paid",
          message: "Order BP-2026-0001 has moved to printing.",
          type: "ORDER_STATUS",
          data: {
            titleKey: "notifications.order_status_title",
            messageKey: "notifications.order_status_message",
            params: {
              orderNumber: "BP-2026-0001",
            },
            entity: {
              orderId: "cm4444444444444444444444444",
            },
            action: {
              kind: "navigate",
              href: "/dashboard/orders/cm4444444444444444444444444",
            },
          },
          isRead: false,
          createdAt: new Date("2026-03-06T10:00:00.000Z"),
        },
        {
          id: "cm2222222222222222222222222",
          title: "Production delay",
          message: "Printing is taking longer than usual.",
          type: "PRODUCTION_DELAY",
          data: null,
          isRead: true,
          createdAt: new Date("2026-03-05T09:00:00.000Z"),
        },
      ]);
      mockPrismaService.notification.count.mockResolvedValue(2);

      const result = await service.findUserNotifications("user_1", {
        page: 1,
        limit: 20,
      });

      expect(mockPrismaService.notification.findMany).toHaveBeenCalledWith({
        where: { userId: "user_1" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: 0,
        take: 20,
        select: {
          id: true,
          title: true,
          message: true,
          type: true,
          data: true,
          isRead: true,
          createdAt: true,
        },
      });
      expect(result).toEqual({
        items: [
          {
            id: "cm1111111111111111111111111",
            type: "ORDER_STATUS",
            isRead: false,
            createdAt: "2026-03-06T10:00:00.000Z",
            data: {
              titleKey: "notifications.order_status_title",
              messageKey: "notifications.order_status_message",
              params: {
                orderNumber: "BP-2026-0001",
              },
              entity: {
                orderId: "cm4444444444444444444444444",
              },
              action: {
                kind: "navigate",
                href: "/dashboard/orders/cm4444444444444444444444444",
              },
            },
          },
          {
            id: "cm2222222222222222222222222",
            type: "PRODUCTION_DELAY",
            isRead: true,
            createdAt: "2026-03-05T09:00:00.000Z",
            data: {
              titleKey: "notification_fallback_title",
              messageKey: "notification_fallback_message",
              params: {
                title: "Production delay",
                message: "Printing is taking longer than usual.",
              },
              action: {
                kind: "none",
              },
              presentation: {
                tone: "warning",
                persistentBanner: "production_delay",
              },
            },
          },
        ],
        pagination: {
          page: 1,
          pageSize: 20,
          totalItems: 2,
          totalPages: 1,
          hasPreviousPage: false,
          hasNextPage: false,
        },
      });
    });

    it("falls back safely when legacy notification copy is missing", async () => {
      mockPrismaService.notification.findMany.mockResolvedValue([
        {
          id: "cm3333333333333333333333333",
          title: null,
          message: "",
          type: "UNKNOWN_TYPE",
          data: { unexpected: true },
          isRead: false,
          createdAt: new Date("2026-03-06T11:00:00.000Z"),
        },
      ]);
      mockPrismaService.notification.count.mockResolvedValue(1);

      const result = await service.findUserNotifications("user_1", {
        page: 1,
        limit: 50,
      });

      expect(result).toEqual({
        items: [
          {
            id: "cm3333333333333333333333333",
            type: "SYSTEM",
            isRead: false,
            createdAt: "2026-03-06T11:00:00.000Z",
            data: {
              titleKey: "notification_fallback_title",
              messageKey: "notification_fallback_message",
              params: {
                title: "Notification",
                message: "You have a new notification.",
              },
              action: {
                kind: "none",
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
    });
  });

  describe("markNotificationRead", () => {
    it("marks an unread notification as read and returns normalized payload", async () => {
      mockPrismaService.notification.findFirst.mockResolvedValue({
        id: "cm3333333333333333333333333",
        title: "Review requested",
        message: "Tell us about your experience.",
        type: "REVIEW_REQUEST",
        data: {
          titleKey: "notifications.review_request_title",
          messageKey: "notifications.review_request_message",
          action: {
            kind: "open_review_dialog",
            bookId: "cm5555555555555555555555555",
          },
          entity: {
            bookId: "cm5555555555555555555555555",
          },
        },
        isRead: false,
        createdAt: new Date("2026-03-06T12:30:00.000Z"),
      });
      mockPrismaService.notification.update.mockResolvedValue({
        id: "cm3333333333333333333333333",
        title: "Review requested",
        message: "Tell us about your experience.",
        type: "REVIEW_REQUEST",
        data: {
          titleKey: "notifications.review_request_title",
          messageKey: "notifications.review_request_message",
          action: {
            kind: "open_review_dialog",
            bookId: "cm5555555555555555555555555",
          },
          entity: {
            bookId: "cm5555555555555555555555555",
          },
        },
        isRead: true,
        createdAt: new Date("2026-03-06T12:30:00.000Z"),
      });

      await expect(
        service.markNotificationRead("user_1", "cm3333333333333333333333333")
      ).resolves.toEqual({
        notification: {
          id: "cm3333333333333333333333333",
          type: "REVIEW_REQUEST",
          isRead: true,
          createdAt: "2026-03-06T12:30:00.000Z",
          data: {
            titleKey: "notifications.review_request_title",
            messageKey: "notifications.review_request_message",
            action: {
              kind: "open_review_dialog",
              bookId: "cm5555555555555555555555555",
            },
            entity: {
              bookId: "cm5555555555555555555555555",
            },
          },
        },
      });
      expect(mockPrismaService.notification.update).toHaveBeenCalledWith({
        where: { id: "cm3333333333333333333333333" },
        data: { isRead: true },
        select: {
          id: true,
          title: true,
          message: true,
          type: true,
          data: true,
          isRead: true,
          createdAt: true,
        },
      });
    });

    it("throws NotFoundException when notification does not belong to user", async () => {
      mockPrismaService.notification.findFirst.mockResolvedValue(null);

      await expect(service.markNotificationRead("user_1", "cm_missing")).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe("markAllNotificationsRead", () => {
    it("returns the number of updated notifications", async () => {
      mockPrismaService.notification.updateMany.mockResolvedValue({ count: 4 });

      await expect(service.markAllNotificationsRead("user_1")).resolves.toEqual({
        updatedCount: 4,
      });
      expect(mockPrismaService.notification.updateMany).toHaveBeenCalledWith({
        where: {
          userId: "user_1",
          isRead: false,
        },
        data: {
          isRead: true,
        },
      });
    });
  });

  describe("notifyAdminsBankTransferReceived", () => {
    it("creates typed BANK_TRANSFER_RECEIVED notifications for all admins", async () => {
      mockPrismaService.user.findMany.mockResolvedValue([
        { id: "cmadmin11111111111111111111111" },
        { id: "cmadmin22222222222222222222222" },
      ]);
      mockPrismaService.notification.createMany.mockResolvedValue({ count: 2 });

      await service.notifyAdminsBankTransferReceived({
        reference: "BT-2026-0001",
        orderNumber: "BP-2026-0001",
        payerName: "Ada Okafor",
        amountLabel: "₦125,000",
      });

      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith({
        where: {
          role: { in: [...ADMIN_ROLES] },
        },
        select: { id: true },
      });
      expect(mockPrismaService.notification.createMany).toHaveBeenCalledWith({
        data: [
          {
            userId: "cmadmin11111111111111111111111",
            title: "Bank transfer received",
            message: "Ada Okafor submitted ₦125,000 for order BP-2026-0001. Ref: BT-2026-0001.",
            type: "BANK_TRANSFER_RECEIVED",
            data: {
              titleKey: "notifications.bank_transfer_received.title",
              messageKey: "notifications.bank_transfer_received.message",
              params: {
                payerName: "Ada Okafor",
                orderNumber: "BP-2026-0001",
                reference: "BT-2026-0001",
                amountLabel: "₦125,000",
              },
              action: {
                kind: "navigate",
                href: "/admin/payments",
              },
            },
            isRead: false,
          },
          {
            userId: "cmadmin22222222222222222222222",
            title: "Bank transfer received",
            message: "Ada Okafor submitted ₦125,000 for order BP-2026-0001. Ref: BT-2026-0001.",
            type: "BANK_TRANSFER_RECEIVED",
            data: {
              titleKey: "notifications.bank_transfer_received.title",
              messageKey: "notifications.bank_transfer_received.message",
              params: {
                payerName: "Ada Okafor",
                orderNumber: "BP-2026-0001",
                reference: "BT-2026-0001",
                amountLabel: "₦125,000",
              },
              action: {
                kind: "navigate",
                href: "/admin/payments",
              },
            },
            isRead: false,
          },
        ],
      });
    });
  });

  describe("createOrderStatusNotification", () => {
    it("creates a typed ORDER_STATUS notification with dashboard navigation", async () => {
      mockPrismaService.notification.createMany.mockResolvedValue({ count: 1 });

      await service.createOrderStatusNotification({
        userId: "cmuser111111111111111111111111",
        orderId: "cmorder11111111111111111111111",
        orderNumber: "BP-2026-0002",
        status: "PAID",
        source: "order",
        bookId: "cmbook111111111111111111111111",
      });

      expect(mockPrismaService.notification.createMany).toHaveBeenCalledWith({
        data: [
          {
            userId: "cmuser111111111111111111111111",
            title: "Order update",
            message: "Order BP-2026-0002 has a new status update.",
            type: "ORDER_STATUS",
            data: {
              titleKey: "notifications.order_status.title",
              messageKey: "notifications.order_status.message",
              params: {
                orderNumber: "BP-2026-0002",
                status: "PAID",
                source: "order",
              },
              entity: {
                orderId: "cmorder11111111111111111111111",
                bookId: "cmbook111111111111111111111111",
              },
              action: {
                kind: "navigate",
                href: "/dashboard/orders/cmorder11111111111111111111111",
              },
            },
            isRead: false,
          },
        ],
      });
    });
  });

  describe("createReviewRequestNotification", () => {
    it("creates a typed REVIEW_REQUEST notification with dialog action", async () => {
      mockPrismaService.notification.createMany.mockResolvedValue({ count: 1 });

      await service.createReviewRequestNotification({
        userId: "cmuser222222222222222222222222",
        orderId: "cmorder22222222222222222222222",
        bookId: "cmbook222222222222222222222222",
        bookTitle: "The Lagos Chronicle",
      });

      expect(mockPrismaService.notification.createMany).toHaveBeenCalledWith({
        data: [
          {
            userId: "cmuser222222222222222222222222",
            title: "Leave a review",
            message: '"The Lagos Chronicle" is printed and ready for your feedback.',
            type: "REVIEW_REQUEST",
            data: {
              titleKey: "notifications.review_request.title",
              messageKey: "notifications.review_request.message",
              params: {
                bookTitle: "The Lagos Chronicle",
              },
              entity: {
                orderId: "cmorder22222222222222222222222",
                bookId: "cmbook222222222222222222222222",
              },
              action: {
                kind: "open_review_dialog",
                bookId: "cmbook222222222222222222222222",
              },
            },
            isRead: false,
          },
        ],
      });
    });
  });

  describe("createProductionDelayNotifications", () => {
    it("creates typed PRODUCTION_DELAY notifications with persistent banner metadata", async () => {
      mockPrismaService.notification.createMany.mockResolvedValue({ count: 2 });

      await service.createProductionDelayNotifications({
        recipients: [
          {
            userId: "cmuser333333333333333333333333",
            orderId: "cmorder33333333333333333333333",
          },
          {
            userId: "cmuser444444444444444444444444",
          },
        ],
      });

      expect(mockPrismaService.notification.createMany).toHaveBeenCalledWith({
        data: [
          {
            userId: "cmuser333333333333333333333333",
            title: "Production update",
            message:
              "We're experiencing high demand. Printing may take longer than the usual 72 hours.",
            type: "PRODUCTION_DELAY",
            data: {
              titleKey: "notifications.production_delay.title",
              messageKey: "notifications.production_delay.message",
              entity: {
                orderId: "cmorder33333333333333333333333",
              },
              action: {
                kind: "navigate",
                href: "/dashboard/orders/cmorder33333333333333333333333",
              },
              presentation: {
                tone: "warning",
                persistentBanner: "production_delay",
              },
            },
            isRead: false,
          },
          {
            userId: "cmuser444444444444444444444444",
            title: "Production update",
            message:
              "We're experiencing high demand. Printing may take longer than the usual 72 hours.",
            type: "PRODUCTION_DELAY",
            data: {
              titleKey: "notifications.production_delay.title",
              messageKey: "notifications.production_delay.message",
              action: {
                kind: "navigate",
                href: "/dashboard",
              },
              presentation: {
                tone: "warning",
                persistentBanner: "production_delay",
              },
            },
            isRead: false,
          },
        ],
      });
    });
  });

  describe("createSystemNotification", () => {
    it("creates a typed SYSTEM notification with caller-supplied metadata", async () => {
      mockPrismaService.notification.createMany.mockResolvedValue({ count: 1 });

      await service.createSystemNotification({
        userId: "cmuser555555555555555555555555",
        titleKey: "notifications.system.title",
        messageKey: "notifications.system.message",
        params: {
          reference: "SYS-01",
        },
        fallbackTitle: "System update",
        fallbackMessage: "System update reference SYS-01.",
        action: {
          kind: "navigate",
          href: "/dashboard/settings",
        },
        presentation: {
          tone: "default",
        },
      });

      expect(mockPrismaService.notification.createMany).toHaveBeenCalledWith({
        data: [
          {
            userId: "cmuser555555555555555555555555",
            title: "System update",
            message: "System update reference SYS-01.",
            type: "SYSTEM",
            data: {
              titleKey: "notifications.system.title",
              messageKey: "notifications.system.message",
              params: {
                reference: "SYS-01",
              },
              action: {
                kind: "navigate",
                href: "/dashboard/settings",
              },
              presentation: {
                tone: "default",
              },
            },
            isRead: false,
          },
        ],
      });
    });
  });
});
