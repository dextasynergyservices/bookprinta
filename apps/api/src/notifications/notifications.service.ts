import {
  ADMIN_ROLES,
  type NotificationAction,
  type NotificationData,
  NotificationDataSchema,
  type NotificationItem,
  type NotificationMarkAllReadResponse,
  type NotificationMarkReadResponse,
  type NotificationPresentation,
  type NotificationsListQueryInput,
  type NotificationsListResponse,
  type NotificationTemplateParams,
  type NotificationType,
  NotificationTypeSchema,
  type NotificationUnreadCountResponse,
} from "@bookprinta/shared";
import { Injectable, Logger, NotFoundException, Optional } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { RedisService } from "../redis/redis.service.js";
import { isUserNotificationChannelEnabled } from "./notification-preference-policy.js";

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
  preferenceKind?:
    | "bank_transfer_receipt"
    | "bank_transfer_rejected"
    | "book_status_update"
    | "order_status_update"
    | "production_delay"
    | "review_request"
    | "system";
  bypassPreference?: boolean;
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
  bypassPreference?: boolean;
};

type JobFailedNotificationParams = {
  queueName: string;
  jobId: string | undefined;
  bookId?: string;
  orderId?: string;
  errorMessage: string;
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

/**
 * TTL on the cached notification summary (unread count + delay banner flag).
 *
 * Only a backstop: every mutation invalidates the key explicitly, so this
 * bounds how long a *lost* invalidation can show a wrong badge or banner. It is
 * long on purpose: each re-seed is a database query, and Neon's free compute
 * suspends only after 5 minutes without one, so a short TTL kept the database
 * awake for every open dashboard tab.
 */
const SUMMARY_CACHE_TTL_SECONDS = 1800;

/**
 * Delay before the second invalidation for writes made inside a transaction.
 * The first invalidation runs before the transaction commits, so a poll in
 * between can re-cache the pre-commit count; the second one clears it.
 */
const POST_COMMIT_INVALIDATION_DELAY_MS = 2000;

type NotificationSummary = {
  unreadCount: number;
  hasProductionDelayBanner: boolean;
};

const DEFAULT_ADMIN_PAYMENTS_HREF = "/admin/payments";
const DEFAULT_DASHBOARD_HREF = "/dashboard";
const LEGACY_NOTIFICATION_TITLE_KEY = "notification_fallback_title";
const LEGACY_NOTIFICATION_MESSAGE_KEY = "notification_fallback_message";
const PRODUCTION_DELAY_FALLBACK_TITLE = "Production update";
const PRODUCTION_DELAY_FALLBACK_MESSAGE =
  "We're experiencing high demand. Printing may take longer than the usual 72 hours.";

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly redis?: RedisService
  ) {}

  // ─── Cached notification summary ──────────────────────────────────────────
  //
  // Key: `bp:notif:summary:{userId}` — a CACHE of what the dashboard polls every
  // 30 s: the unread count and whether the production-delay banner shows. The
  // DB is authoritative (`isRead`; ProductionDelayEventRecipient + event status).
  //
  // Mutations INVALIDATE (DEL) the key rather than adjusting it, so the next read
  // re-derives both values from the DB and is exactly right; a failed
  // invalidation degrades to staleness bounded by SUMMARY_CACHE_TTL_SECONDS.
  // (The counter used to be maintained by INCR/DECR on a key with no expiry,
  // which drifted permanently when one of those calls failed.)
  //
  // The banner state changes when a user is added to, or resolved out of, a
  // production delay event; ProductionDelayDeliveryService invalidates then.

  private summaryKey(userId: string): string {
    return `bp:notif:summary:${userId}`;
  }

  /** Drop cached summaries so the next read re-derives them from the DB. */
  async invalidateNotificationSummary(userIds: string[]): Promise<void> {
    const client = this.redis?.getClient();
    if (!client || userIds.length === 0) return;
    try {
      await client.del(...userIds.map((id) => this.summaryKey(id)));
    } catch (err) {
      // Safe to swallow: the TTL on the seeded value bounds how long a stale
      // summary can survive, and the DB remains correct either way.
      this.logger.warn(
        `Redis notification summary invalidation failed — may be stale for up to ` +
          `${SUMMARY_CACHE_TTL_SECONDS}s: ${err}`
      );
    }
  }

  /**
   * Invalidate after a write. A write made through a transaction client is not
   * visible until the caller commits, and a poll in between would re-cache the
   * old values, so those are invalidated again shortly after.
   */
  private async invalidateAfterWrite(
    userIds: string[],
    executor: NotificationWriteExecutor
  ): Promise<void> {
    await this.invalidateNotificationSummary(userIds);
    if (executor === this.prisma) return;
    const timer = setTimeout(() => {
      void this.invalidateNotificationSummary(userIds);
    }, POST_COMMIT_INVALIDATION_DELAY_MS);
    timer.unref?.();
  }

  private async getSummaryFromRedis(userId: string): Promise<NotificationSummary | null> {
    const client = this.redis?.getClient();
    if (!client) return null;
    try {
      const val = await client.get(this.summaryKey(userId));
      if (val === null) return null; // cache miss
      const parsed = JSON.parse(val) as Partial<NotificationSummary>;
      if (
        typeof parsed.unreadCount !== "number" ||
        !Number.isFinite(parsed.unreadCount) ||
        typeof parsed.hasProductionDelayBanner !== "boolean"
      ) {
        return null;
      }
      return {
        unreadCount: Math.max(0, Math.floor(parsed.unreadCount)),
        hasProductionDelayBanner: parsed.hasProductionDelayBanner,
      };
    } catch {
      return null; // degrade to DB on any Redis or parse error
    }
  }

  private async seedSummaryCache(userId: string): Promise<NotificationSummary> {
    const [unreadCount, hasProductionDelayBanner] = await Promise.all([
      this.prisma.notification.count({ where: { userId, isRead: false } }),
      this.hasProductionDelayBanner(userId),
    ]);
    const summary = { unreadCount, hasProductionDelayBanner };
    const client = this.redis?.getClient();
    if (client) {
      try {
        await client.set(
          this.summaryKey(userId),
          JSON.stringify(summary),
          "EX",
          SUMMARY_CACHE_TTL_SECONDS
        );
      } catch {
        // Non-critical — the DB values are still returned
      }
    }
    return summary;
  }
  // ───────────────────────────────────────────────────────────────────────────

  /** Unread count and production-delay banner flag (cached; see above). */
  async getUnreadCount(userId: string): Promise<NotificationUnreadCountResponse> {
    return (await this.getSummaryFromRedis(userId)) ?? this.seedSummaryCache(userId);
  }

  /**
   * Whether the user is affected by a production delay that is still active.
   *
   * The event, not the notification, decides: a delay notification stays in
   * the user's history after the delay is resolved, and older notifications
   * drop off any recent-items page while the delay is still on. Indexed lookup
   * (ProductionDelayEventRecipient @@unique([eventId, userId]) + event status).
   */
  async hasProductionDelayBanner(userId: string): Promise<boolean> {
    const found = await this.prisma.productionDelayEventRecipient.findFirst({
      where: { userId, event: { status: "ACTIVE" } },
      select: { id: true },
    });
    return found !== null;
  }

  async findUserNotifications(
    userId: string,
    query: NotificationsListQueryInput
  ): Promise<NotificationsListResponse> {
    const page = query.page ?? 1;
    const pageSize = query.limit ?? 20;
    const skip = (page - 1) * pageSize;

    const rows = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take: pageSize,
      select: NOTIFICATION_SELECT,
    });
    const totalItems = await this.prisma.notification.count({
      where: { userId },
    });

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

    await this.invalidateNotificationSummary([userId]);

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

    await this.invalidateNotificationSummary([userId]);

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
        role: { in: [...ADMIN_ROLES] },
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
        preferenceKind: "bank_transfer_receipt",
        bypassPreference: true,
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
          preferenceKind: "order_status_update",
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
          preferenceKind: "review_request",
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
          preferenceKind: "production_delay",
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
          preferenceKind: "system",
          bypassPreference: params.bypassPreference,
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

  async notifyAdminsJobFailed(params: JobFailedNotificationParams): Promise<void> {
    const admins = await this.prisma.user.findMany({
      where: { role: { in: [...ADMIN_ROLES] } },
      select: { id: true },
    });

    if (admins.length === 0) return;

    const jobLabel = params.bookId ?? params.jobId ?? "unknown";
    const actionHref = params.bookId ? `/admin/books/${params.bookId}` : "/admin/books";

    await this.persistNotifications(
      admins.map((admin) => ({
        userId: admin.id,
        type: "SYSTEM" as const,
        fallbackTitle: `Job failed: ${params.queueName}`,
        fallbackMessage: `Job for ${jobLabel} failed permanently in "${params.queueName}": ${params.errorMessage.slice(0, 200)}`,
        preferenceKind: "system" as const,
        bypassPreference: true,
        data: {
          titleKey: "notifications.job_failed.title",
          messageKey: "notifications.job_failed.message",
          params: {
            queueName: params.queueName,
            jobLabel,
            errorMessage: params.errorMessage.slice(0, 200),
          },
          entity:
            params.bookId || params.orderId
              ? {
                  ...(params.bookId ? { bookId: params.bookId } : {}),
                  ...(params.orderId ? { orderId: params.orderId } : {}),
                }
              : undefined,
          action: {
            kind: "navigate" as const,
            href: actionHref,
          },
        },
      })),
      this.prisma
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

    const uniqueUserIds = Array.from(new Set(records.map((record) => record.userId)));
    const preferenceRows =
      uniqueUserIds.length > 0
        ? await executor.user.findMany({
            where: {
              id: { in: uniqueUserIds },
            },
            select: {
              id: true,
              inAppNotificationsEnabled: true,
            },
          })
        : [];
    const preferenceMap = new Map(
      preferenceRows.map((row) => [row.id, row.inAppNotificationsEnabled])
    );
    const eligibleRecords = records.filter((record) =>
      isUserNotificationChannelEnabled({
        enabled: preferenceMap.get(record.userId),
        kind: record.preferenceKind ?? "system",
        bypassPreference: record.bypassPreference,
      })
    );

    if (eligibleRecords.length === 0) {
      return;
    }

    await executor.notification.createMany({
      data: eligibleRecords.map((record) => this.toNotificationCreateManyInput(record)),
    });

    await this.invalidateAfterWrite(
      Array.from(new Set(eligibleRecords.map((record) => record.userId))),
      executor
    );
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
