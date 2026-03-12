import {
  type NotificationAction,
  type NotificationData,
  NotificationDataSchema,
  type NotificationItem,
  type NotificationMarkAllReadResponse,
  type NotificationMarkReadResponse,
  type NotificationPresentation,
  type NotificationsListResponse,
  type NotificationTemplateParams,
  type NotificationType,
  NotificationTypeSchema,
  type NotificationUnreadCountResponse,
} from "@bookprinta/shared";
import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { NotificationsListQueryDto } from "./dto/notification.dto.js";

const NOTIFICATION_SELECT = {
  id: true,
  title: true,
  message: true,
  type: true,
  data: true,
  isRead: true,
  createdAt: true,
} as const;

type NotificationRow = Prisma.NotificationGetPayload<{
  select: typeof NOTIFICATION_SELECT;
}>;

type NotificationWriteExecutor = Pick<PrismaService, "notification" | "user">;

type NotificationEntityRefs = {
  orderId?: string | null;
  bookId?: string | null;
};

type NotificationWriteInput = {
  userId: string;
  type: NotificationType;
  fallbackTitle: string;
  fallbackMessage: string;
  data: NotificationData;
};

type BankTransferReceivedNotificationParams = {
  reference: string;
  orderNumber: string;
  payerName: string;
  amountLabel: string;
  actionHref?: string;
};

type OrderStatusNotificationParams = NotificationEntityRefs & {
  userId: string;
  orderId: string;
  orderNumber: string;
  status: string;
  source?: "order" | "book";
  actionHref?: string;
};

type ReviewRequestNotificationParams = NotificationEntityRefs & {
  userId: string;
  bookId: string;
  bookTitle: string;
};

type ProductionDelayNotificationRecipient = NotificationEntityRefs & {
  userId: string;
  actionHref?: string;
};

type ProductionDelayNotificationsParams = {
  recipients: ProductionDelayNotificationRecipient[];
};

type SystemNotificationParams = NotificationEntityRefs & {
  userId: string;
  titleKey: string;
  messageKey: string;
  params?: NotificationTemplateParams;
  action?: NotificationAction;
  presentation?: NotificationPresentation;
  fallbackTitle: string;
  fallbackMessage: string;
};

const NOTIFICATION_TRANSLATION_KEYS = {
  bankTransferReceived: {
    title: "notifications.bank_transfer_received.title",
    message: "notifications.bank_transfer_received.message",
  },
  orderStatus: {
    title: "notifications.order_status.title",
    message: "notifications.order_status.message",
  },
  reviewRequest: {
    title: "notifications.review_request.title",
    message: "notifications.review_request.message",
  },
  productionDelay: {
    title: "notifications.production_delay.title",
    message: "notifications.production_delay.message",
  },
} as const;

const DEFAULT_ADMIN_PAYMENTS_HREF = "/admin/payments";
const DEFAULT_DASHBOARD_HREF = "/dashboard";
const LEGACY_NOTIFICATION_TITLE_KEY = "notification_fallback_title";
const LEGACY_NOTIFICATION_MESSAGE_KEY = "notification_fallback_message";
const PRODUCTION_DELAY_FALLBACK_TITLE = "Production update";
const PRODUCTION_DELAY_FALLBACK_MESSAGE =
  "We're experiencing high demand. Printing may take longer than the usual 72 hours.";

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getUnreadCount(userId: string): Promise<NotificationUnreadCountResponse> {
    const unreadCount = await this.prisma.notification.count({
      where: {
        userId,
        isRead: false,
      },
    });

    return { unreadCount };
  }

  async findUserNotifications(
    userId: string,
    query: NotificationsListQueryDto
  ): Promise<NotificationsListResponse> {
    const page = query.page ?? 1;
    const pageSize = query.limit ?? 20;
    const skip = (page - 1) * pageSize;

    const [rows, totalItems] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: pageSize,
        select: NOTIFICATION_SELECT,
      }),
      this.prisma.notification.count({
        where: { userId },
      }),
    ]);

    const totalPages = totalItems > 0 ? Math.ceil(totalItems / pageSize) : 0;

    return {
      items: rows.map((row) => this.serializeNotification(row)),
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasPreviousPage: page > 1,
        hasNextPage: page < totalPages,
      },
    };
  }

  async markNotificationRead(
    userId: string,
    notificationId: string
  ): Promise<NotificationMarkReadResponse> {
    const existing = await this.prisma.notification.findFirst({
      where: {
        id: notificationId,
        userId,
      },
      select: NOTIFICATION_SELECT,
    });

    if (!existing) {
      throw new NotFoundException(`Notification "${notificationId}" not found`);
    }

    if (existing.isRead) {
      return {
        notification: this.serializeNotification(existing),
      };
    }

    const updated = await this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        isRead: true,
      },
      select: NOTIFICATION_SELECT,
    });

    return {
      notification: this.serializeNotification(updated),
    };
  }

  async markAllNotificationsRead(userId: string): Promise<NotificationMarkAllReadResponse> {
    const result = await this.prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
      },
    });

    return {
      updatedCount: result.count,
    };
  }

  async notifyAdminsBankTransferReceived(
    params: BankTransferReceivedNotificationParams,
    executor: NotificationWriteExecutor = this.prisma
  ): Promise<void> {
    const admins = await executor.user.findMany({
      where: {
        role: { in: ["ADMIN", "SUPER_ADMIN"] },
      },
      select: { id: true },
    });

    if (admins.length === 0) return;

    const orderNumber = params.orderNumber.trim() || params.reference;
    const actionHref = params.actionHref?.trim() || DEFAULT_ADMIN_PAYMENTS_HREF;

    await this.persistNotifications(
      admins.map((admin) => ({
        userId: admin.id,
        type: "BANK_TRANSFER_RECEIVED",
        fallbackTitle: "Bank transfer received",
        fallbackMessage: `${params.payerName} submitted ${params.amountLabel} for order ${orderNumber}. Ref: ${params.reference}.`,
        data: {
          titleKey: NOTIFICATION_TRANSLATION_KEYS.bankTransferReceived.title,
          messageKey: NOTIFICATION_TRANSLATION_KEYS.bankTransferReceived.message,
          params: {
            payerName: params.payerName,
            orderNumber,
            reference: params.reference,
            amountLabel: params.amountLabel,
          },
          action: {
            kind: "navigate",
            href: actionHref,
          },
        },
      })),
      executor
    );
  }

  async createOrderStatusNotification(
    params: OrderStatusNotificationParams,
    executor: NotificationWriteExecutor = this.prisma
  ): Promise<void> {
    const actionHref = params.actionHref?.trim() || `/dashboard/orders/${params.orderId}`;
    const entity = this.buildEntityRefs(params);

    await this.persistNotifications(
      [
        {
          userId: params.userId,
          type: "ORDER_STATUS",
          fallbackTitle: "Order update",
          fallbackMessage: `Order ${params.orderNumber} has a new status update.`,
          data: {
            titleKey: NOTIFICATION_TRANSLATION_KEYS.orderStatus.title,
            messageKey: NOTIFICATION_TRANSLATION_KEYS.orderStatus.message,
            params: {
              orderNumber: params.orderNumber,
              status: params.status,
              source: params.source ?? "order",
            },
            entity,
            action: {
              kind: "navigate",
              href: actionHref,
            },
          },
        },
      ],
      executor
    );
  }

  async createReviewRequestNotification(
    params: ReviewRequestNotificationParams,
    executor: NotificationWriteExecutor = this.prisma
  ): Promise<void> {
    const normalizedTitle = params.bookTitle.trim() || "Your book";
    const entity = this.buildEntityRefs({
      orderId: params.orderId,
      bookId: params.bookId,
    });

    await this.persistNotifications(
      [
        {
          userId: params.userId,
          type: "REVIEW_REQUEST",
          fallbackTitle: "Leave a review",
          fallbackMessage: `"${normalizedTitle}" has been delivered and is ready for your feedback.`,
          data: {
            titleKey: NOTIFICATION_TRANSLATION_KEYS.reviewRequest.title,
            messageKey: NOTIFICATION_TRANSLATION_KEYS.reviewRequest.message,
            params: {
              bookTitle: normalizedTitle,
            },
            entity,
            action: {
              kind: "open_review_dialog",
              bookId: params.bookId,
            },
          },
        },
      ],
      executor
    );
  }

  async createProductionDelayNotifications(
    params: ProductionDelayNotificationsParams,
    executor: NotificationWriteExecutor = this.prisma
  ): Promise<void> {
    if (params.recipients.length === 0) return;

    await this.persistNotifications(
      params.recipients.map((recipient) => {
        const actionHref =
          recipient.actionHref?.trim() ||
          (recipient.orderId ? `/dashboard/orders/${recipient.orderId}` : DEFAULT_DASHBOARD_HREF);

        return {
          userId: recipient.userId,
          type: "PRODUCTION_DELAY",
          fallbackTitle: PRODUCTION_DELAY_FALLBACK_TITLE,
          fallbackMessage: PRODUCTION_DELAY_FALLBACK_MESSAGE,
          data: {
            titleKey: NOTIFICATION_TRANSLATION_KEYS.productionDelay.title,
            messageKey: NOTIFICATION_TRANSLATION_KEYS.productionDelay.message,
            entity: this.buildEntityRefs(recipient),
            action: {
              kind: "navigate",
              href: actionHref,
            },
            presentation: {
              tone: "warning",
              persistentBanner: "production_delay",
            },
          },
        };
      }),
      executor
    );
  }

  async createSystemNotification(
    params: SystemNotificationParams,
    executor: NotificationWriteExecutor = this.prisma
  ): Promise<void> {
    await this.persistNotifications(
      [
        {
          userId: params.userId,
          type: "SYSTEM",
          fallbackTitle: params.fallbackTitle,
          fallbackMessage: params.fallbackMessage,
          data: {
            titleKey: params.titleKey,
            messageKey: params.messageKey,
            params: params.params,
            entity: this.buildEntityRefs(params),
            action: params.action ?? { kind: "none" },
            presentation: params.presentation,
          },
        },
      ],
      executor
    );
  }

  private serializeNotification(row: NotificationRow): NotificationItem {
    const type = this.normalizeNotificationType(row.type);
    const data = this.normalizeNotificationData(row, type);
    const createdAt = this.toIsoTimestamp(row.createdAt);

    return {
      id: row.id,
      type,
      isRead: row.isRead,
      createdAt,
      data,
    };
  }

  private normalizeNotificationType(value: string | null): NotificationType {
    const parsed = NotificationTypeSchema.safeParse(value);
    return parsed.success ? parsed.data : "SYSTEM";
  }

  private normalizeNotificationData(
    row: NotificationRow,
    type: NotificationType
  ): NotificationData {
    const parsed = NotificationDataSchema.safeParse(row.data);
    const base = parsed.success ? parsed.data : this.buildLegacyData(row);

    if (type !== "PRODUCTION_DELAY") {
      return base;
    }

    return {
      ...base,
      presentation: {
        tone: base.presentation?.tone ?? "warning",
        persistentBanner: base.presentation?.persistentBanner ?? "production_delay",
      },
    };
  }

  private buildLegacyData(row: NotificationRow): NotificationData {
    const title = this.coerceLegacyCopy(row.title, "Notification");
    const message = this.coerceLegacyCopy(row.message, "You have a new notification.");

    return {
      titleKey: LEGACY_NOTIFICATION_TITLE_KEY,
      messageKey: LEGACY_NOTIFICATION_MESSAGE_KEY,
      params: {
        title,
        message,
      },
      action: {
        kind: "none",
      },
    };
  }

  private coerceLegacyCopy(value: unknown, fallback: string): string {
    if (typeof value === "string") {
      const normalized = value.trim();
      if (normalized.length > 0) return normalized;
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }

    return fallback;
  }

  private toIsoTimestamp(value: unknown): string {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString();
    }

    return new Date(0).toISOString();
  }

  private async persistNotifications(
    records: NotificationWriteInput[],
    executor: NotificationWriteExecutor
  ): Promise<void> {
    if (records.length === 0) return;

    await executor.notification.createMany({
      data: records.map((record) => this.toNotificationCreateManyInput(record)),
    });
  }

  private toNotificationCreateManyInput(
    record: NotificationWriteInput
  ): Prisma.NotificationCreateManyInput {
    return {
      userId: record.userId,
      title: record.fallbackTitle,
      message: record.fallbackMessage,
      type: record.type,
      data: record.data as Prisma.InputJsonValue,
      isRead: false,
    };
  }

  private buildEntityRefs(params: NotificationEntityRefs) {
    const entity: NotificationData["entity"] = {};

    if (params.orderId) entity.orderId = params.orderId;
    if (params.bookId) entity.bookId = params.bookId;

    return Object.keys(entity).length > 0 ? entity : undefined;
  }
}
