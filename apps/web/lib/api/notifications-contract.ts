import {
  type NotificationItem,
  NotificationItemSchema,
  type NotificationMarkAllReadResponse,
  NotificationMarkAllReadResponseSchema,
  type NotificationMarkReadResponse,
  NotificationMarkReadResponseSchema,
  type NotificationsListResponse,
  NotificationsListResponseSchema,
  type NotificationUnreadCountResponse,
  NotificationUnreadCountResponseSchema,
} from "@bookprinta/shared";
import type { ZodType } from "zod";

export const DEFAULT_NOTIFICATIONS_PAGE = 1;
export const DEFAULT_NOTIFICATIONS_PAGE_SIZE = 20;
export const MAX_NOTIFICATIONS_PAGE_SIZE = 50;

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function toInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return Math.max(0, parsed);
  }

  return null;
}

function parseWithEnvelope<T>(payload: unknown, schema: ZodType<T>): T | null {
  const direct = schema.safeParse(payload);
  if (direct.success) return direct.data;

  const root = toRecord(payload);
  if (!root || !("data" in root)) return null;

  const enveloped = schema.safeParse(root.data);
  return enveloped.success ? enveloped.data : null;
}

export function coerceNotificationsPage(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_NOTIFICATIONS_PAGE;
  }

  return Math.max(DEFAULT_NOTIFICATIONS_PAGE, Math.trunc(value));
}

export function coerceNotificationsPageSize(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_NOTIFICATIONS_PAGE_SIZE;
  }

  return Math.max(1, Math.min(MAX_NOTIFICATIONS_PAGE_SIZE, Math.trunc(value)));
}

export function createEmptyNotificationsListResponse(
  page: number,
  pageSize: number
): NotificationsListResponse {
  return {
    items: [],
    pagination: {
      page,
      pageSize,
      totalItems: 0,
      totalPages: 0,
      hasPreviousPage: page > 1,
      hasNextPage: false,
    },
  };
}

export function normalizeNotificationsListPayload(
  payload: unknown,
  options: { requestedPage?: number; requestedPageSize?: number } = {}
): NotificationsListResponse {
  const requestedPage = coerceNotificationsPage(options.requestedPage);
  const requestedPageSize = coerceNotificationsPageSize(options.requestedPageSize);
  const parsed = parseWithEnvelope(payload, NotificationsListResponseSchema);

  return parsed ?? createEmptyNotificationsListResponse(requestedPage, requestedPageSize);
}

export function normalizeNotificationUnreadCountPayload(
  payload: unknown
): NotificationUnreadCountResponse {
  const parsed = parseWithEnvelope(payload, NotificationUnreadCountResponseSchema);
  if (parsed) return parsed;

  const root = toRecord(payload);
  const data = toRecord(root?.data);
  const unreadCount =
    toInt(root?.unreadCount) ??
    toInt(root?.count) ??
    toInt(data?.unreadCount) ??
    toInt(data?.count);

  return {
    unreadCount: unreadCount ?? 0,
  };
}

export function normalizeNotificationMarkReadPayload(
  payload: unknown
): NotificationMarkReadResponse {
  const parsed = parseWithEnvelope(payload, NotificationMarkReadResponseSchema);
  if (parsed) return parsed;

  const notification = parseWithEnvelope(payload, NotificationItemSchema);
  if (notification) {
    return { notification };
  }

  throw new Error("Unable to normalize notification read response");
}

export function normalizeNotificationMarkAllReadPayload(
  payload: unknown
): NotificationMarkAllReadResponse {
  const parsed = parseWithEnvelope(payload, NotificationMarkAllReadResponseSchema);
  if (parsed) return parsed;

  const root = toRecord(payload);
  const data = toRecord(root?.data);
  const updatedCount = toInt(root?.updatedCount) ?? toInt(root?.count) ?? toInt(data?.updatedCount);

  return {
    updatedCount: updatedCount ?? 0,
  };
}

export function replaceNotificationInListResponse(
  response: NotificationsListResponse,
  notification: NotificationItem
): NotificationsListResponse {
  let didReplace = false;

  const items = response.items.map((item) => {
    if (item.id !== notification.id) {
      return item;
    }

    didReplace = true;
    return notification;
  });

  return didReplace ? { ...response, items } : response;
}

export function markNotificationReadInListResponse(
  response: NotificationsListResponse,
  notificationId: string
): NotificationsListResponse {
  let didChange = false;

  const items = response.items.map((item) => {
    if (item.id !== notificationId || item.isRead) {
      return item;
    }

    didChange = true;
    return {
      ...item,
      isRead: true,
    };
  });

  return didChange ? { ...response, items } : response;
}

export function markAllNotificationsReadInListResponse(
  response: NotificationsListResponse
): NotificationsListResponse {
  let didChange = false;

  const items = response.items.map((item) => {
    if (item.isRead) {
      return item;
    }

    didChange = true;
    return {
      ...item,
      isRead: true,
    };
  });

  return didChange ? { ...response, items } : response;
}

export function hasPersistentNotificationBanner(
  items: NotificationItem[],
  banner: "production_delay"
): boolean {
  return items.some((item) => item.data.presentation?.persistentBanner === banner);
}
