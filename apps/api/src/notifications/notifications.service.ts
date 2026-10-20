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
 * TTL on the cached unread counter.
 *
 * Only a backstop — mutations invalidate the key explicitly, so this bounds how
 * long a *lost* invalidation can show a wrong badge. Five minutes keeps the
 * badge honest without re-counting on every poll.
 */
const UNREAD_CACHE_TTL_SECONDS = 300;

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

  // ─── Redis unread counter helpers ──────────────────────────────────────────
  //
  // Key: `bp:notif:unread:{userId}` — a CACHE of the DB count, never the source
  // of truth. The DB (`isRead`) is authoritative.
  //
  // This was previously maintained by arithmetic (INCR on create, DECRBY on
  // read) on a key with no expiry, which could drift permanently:
  //
  //   mark-as-read -> DB row updated -> Redis DECRBY fails (Upstash
  //   rate-limited, or the client is unavailable) -> the helper only warns ->
  //   the key still EXISTS holding the old value -> getUnreadCount() treats a
  //   present key as a cache hit and never re-reads the DB -> the badge stays
  //   too high forever.
  //
  // The visible symptom is a notification that will not clear: the frontend
  // optimistically shows count-1, then the next poll returns the stale Redis
  // value and the badge jumps back up.
  //
  // Two changes make that self-correcting:
  //   1. Mutations INVALIDATE (DEL) the key instead of adjusting it, so the next
  //      read re-seeds from the DB and is exactly right.
  //   2. Seeded values carry a TTL, so even a failed invalidation only causes
  //      staleness bounded by UNREAD_CACHE_TTL_SECONDS rather than forever.
  //
  // The cache still absorbs the repeated badge polling that motivated it — it is
  // only re-seeded after an actual change, or once per TTL window.

  private unreadKey(userId: string): string {
    return `bp:notif:unread:${userId}`;
  }

  /**
   * Drop the cached counter so the next read re-derives it from the DB.
   *
   * Used for every mutation (create, mark read, mark all read). Correct by
   * construction: there is no arithmetic to get out of step, and a failure to
   * invalidate degrades to TTL-bounded staleness instead of permanent drift.
   */
  private async invalidateUnread(userIds: string[]): Promise<void> {
    const client = this.redis?.getClient();
    if (!client || userIds.length === 0) return;
    try {
      await client.del(...userIds.map((id) => this.unreadKey(id)));
    } catch (err) {
      // Safe to swallow: the TTL on the seeded value bounds how long a stale
      // count can survive, and the DB remains correct either way.
      this.logger.warn(
        `Redis unread invalidation failed — counter may be stale for up to ` +
          `${UNREAD_CACHE_TTL_SECONDS}s: ${err}`
      );
    }
  }

  private async incrUnread(userIds: string[]): Promise<void> {
    // Creating a notification invalidates rather than increments: an INCR on a
    // key that failed to be created elsewhere compounds the drift, whereas a
    // DEL always leaves the cache in a state the DB can correct.
    await this.invalidateUnread(userIds);
  }

  private async decrUnread(userId: string): Promise<void> {
    await this.invalidateUnread([userId]);
  }

  private async resetUnread(userId: string): Promise<void> {
    await this.invalidateUnread([userId]);
  }

  private async getUnreadFromRedis(userId: string): Promise<number | null> {
    const client = this.redis?.getClient();
    if (!client) return null;
    try {
      const val = await client.get(this.unreadKey(userId));
      if (val === null) return null; // cache miss
      const parsed = Number.parseInt(val, 10);
      return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
    } catch {
      return null; // degrade to DB on any Redis error
    }
  }

  private async seedUnreadCache(userId: string): Promise<number> {
    const count = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });
    const client = this.redis?.getClient();
    if (client) {
      try {
        // TTL is the backstop: if an invalidation is ever lost (Redis briefly
        // unavailable or rate-limited at exactly the wrong moment), staleness is
        // bounded by this window instead of lasting until the key is evicted.
        await client.set(this.unreadKey(userId), count, "EX", UNREAD_CACHE_TTL_SECONDS);
      } catch {
        // Non-critical — DB count is still returned
      }
    }
    return count;
  }
  // ───────────────────────────────────────────────────────────────────────────

  async getUnreadCount(userId: string): Promise<NotificationUnreadCountResponse> {
    const cached = await this.getUnreadFromRedis(userId);
    if (cached !== null) {
      return { unreadCount: cached };
    }
    // Cache miss — query DB and re-seed Redis
    const unreadCount = await this.seedUnreadCache(userId);
    return { unreadCount };
  }

  /**
   * Fix 1.5 — cheap banner flag for the dashboard overview.
   *
   * Replaces the old `findUserNotifications(limit: 50)` fan-out which fetched a full
   * 50-row notification list just to derive a single boolean.  This issues one
   * `SELECT id … WHERE userId=$1 AND type='PRODUCTION_DELAY' LIMIT 1` — covered by
   * the `@@index([userId, type])` composite index so it's an O(1) index seek.
   */
  async hasProductionDelayBanner(userId: string): Promise<boolean> {
    const found = await this.prisma.notification.findFirst({
      where: { userId, type: "PRODUCTION_DELAY" },
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

    // Decrement Redis counter by 1
    await this.decrUnread(userId);

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

    // Reset Redis counter to 0
    await this.resetUnread(userId);

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

    // Increment Redis unread counters for every user that received a notification
    const recipientIds = eligibleRecords.map((r) => r.userId);
    await this.incrUnread(recipientIds);
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
