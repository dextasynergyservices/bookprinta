import {
  createEmptyNotificationsListResponse,
  hasPersistentNotificationBanner,
  markAllNotificationsReadInListResponse,
  normalizeNotificationMarkReadPayload,
  normalizeNotificationsListPayload,
  normalizeNotificationUnreadCountPayload,
  replaceNotificationInListResponse,
} from "./notifications-contract";

const baseNotification = {
  id: "cm1111111111111111111111111",
  type: "ORDER_STATUS" as const,
  isRead: false,
  createdAt: "2026-03-01T10:00:00.000Z",
  data: {
    titleKey: "notifications.order_status.title",
    messageKey: "notifications.order_status.message",
    params: {
      orderNumber: "BP-2026-0001",
    },
    action: {
      kind: "navigate" as const,
      href: "/dashboard/orders/cm2222222222222222222222222",
    },
  },
};

describe("notifications contract helpers", () => {
  it("normalizes notifications list payloads from a data envelope", () => {
    const payload = {
      data: {
        items: [baseNotification],
        pagination: {
          page: 2,
          pageSize: 5,
          totalItems: 8,
          totalPages: 2,
          hasPreviousPage: true,
          hasNextPage: false,
        },
      },
    };

    const normalized = normalizeNotificationsListPayload(payload, {
      requestedPage: 2,
      requestedPageSize: 5,
    });

    expect(normalized.items).toHaveLength(1);
    expect(normalized.items[0]?.id).toBe(baseNotification.id);
    expect(normalized.pagination).toMatchObject({
      page: 2,
      pageSize: 5,
      totalItems: 8,
      totalPages: 2,
      hasPreviousPage: true,
      hasNextPage: false,
    });
  });

  it("falls back to an empty notifications response when payload is invalid", () => {
    const normalized = normalizeNotificationsListPayload(
      { items: "nope" },
      { requestedPage: 3, requestedPageSize: 10 }
    );

    expect(normalized).toEqual(createEmptyNotificationsListResponse(3, 10));
  });

  it("normalizes unread count payloads with legacy wrappers", () => {
    expect(normalizeNotificationUnreadCountPayload({ unreadCount: 4 })).toEqual({
      unreadCount: 4,
    });

    expect(normalizeNotificationUnreadCountPayload({ data: { count: "7" } })).toEqual({
      unreadCount: 7,
    });
  });

  it("accepts mark-read payloads that return a raw notification item", () => {
    const normalized = normalizeNotificationMarkReadPayload(baseNotification);

    expect(normalized.notification.id).toBe(baseNotification.id);
  });

  it("replaces a notification item in list responses", () => {
    const response = {
      items: [baseNotification],
      pagination: {
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
        hasPreviousPage: false,
        hasNextPage: false,
      },
    };
    const replacement = {
      ...baseNotification,
      isRead: true,
    };

    const updated = replaceNotificationInListResponse(response, replacement);

    expect(updated.items[0]?.isRead).toBe(true);
    expect(updated).not.toBe(response);
  });

  it("marks all notifications as read without removing persistent banners", () => {
    const response = {
      items: [
        {
          ...baseNotification,
          type: "PRODUCTION_DELAY" as const,
          data: {
            ...baseNotification.data,
            presentation: {
              tone: "warning" as const,
              persistentBanner: "production_delay" as const,
            },
          },
        },
        {
          ...baseNotification,
          id: "cm3333333333333333333333333",
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
    };

    const updated = markAllNotificationsReadInListResponse(response);

    expect(updated.items.every((item) => item.isRead)).toBe(true);
    expect(hasPersistentNotificationBanner(updated.items, "production_delay")).toBe(true);
  });
});
