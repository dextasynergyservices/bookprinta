import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  DASHBOARD_UNREAD_COUNT_QUERY_KEY,
  dashboardNotificationsQueryKeys,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationBannerState,
} from "./use-dashboard-shell-data";

const unreadNotification = {
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

const productionDelayNotification = {
  id: "cm3333333333333333333333333",
  type: "PRODUCTION_DELAY" as const,
  isRead: false,
  createdAt: "2026-03-02T08:30:00.000Z",
  data: {
    titleKey: "notifications.production_delay.title",
    messageKey: "notifications.production_delay.message",
    action: {
      kind: "navigate" as const,
      href: "/dashboard",
    },
    presentation: {
      tone: "warning" as const,
      persistentBanner: "production_delay" as const,
    },
  },
};

const resolvedSystemNotification = {
  id: "cm4444444444444444444444444",
  type: "SYSTEM" as const,
  isRead: false,
  createdAt: "2026-03-03T11:00:00.000Z",
  data: {
    titleKey: "notifications.production_delay_resolved.title",
    messageKey: "notifications.production_delay_resolved.message",
    action: {
      kind: "navigate" as const,
      href: "/dashboard",
    },
    presentation: {
      tone: "default" as const,
    },
  },
};

function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("use-dashboard-shell-data mutations", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("marks a single notification as read and keeps unread count in sync", async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    client.setQueryData(DASHBOARD_UNREAD_COUNT_QUERY_KEY, {
      unreadCount: 2,
      isFallback: false,
    });
    client.setQueryData(dashboardNotificationsQueryKeys.list(1, 20), {
      items: [unreadNotification, productionDelayNotification],
      pagination: {
        page: 1,
        pageSize: 20,
        totalItems: 2,
        totalPages: 1,
        hasPreviousPage: false,
        hasNextPage: false,
      },
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({
        notification: {
          ...unreadNotification,
          isRead: true,
        },
      }),
    } as unknown as Response);

    const { result } = renderHook(() => useMarkNotificationRead(), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await result.current.markAsRead({ notificationId: unreadNotification.id });
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/notifications/${unreadNotification.id}/read`),
      expect.objectContaining({
        method: "PATCH",
        credentials: "include",
      })
    );

    expect(client.getQueryData(DASHBOARD_UNREAD_COUNT_QUERY_KEY)).toMatchObject({
      unreadCount: 1,
      isFallback: false,
    });

    expect(
      client.getQueryData<{
        items: Array<{ id: string; isRead: boolean }>;
      }>(dashboardNotificationsQueryKeys.list(1, 20))
    ).toMatchObject({
      items: [
        {
          id: unreadNotification.id,
          isRead: true,
        },
        {
          id: productionDelayNotification.id,
          isRead: false,
        },
      ],
    });
  });

  it("marks all cached notifications as read and zeros unread count", async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    client.setQueryData(DASHBOARD_UNREAD_COUNT_QUERY_KEY, {
      unreadCount: 3,
      isFallback: false,
    });
    client.setQueryData(dashboardNotificationsQueryKeys.list(1, 20), {
      items: [unreadNotification, productionDelayNotification],
      pagination: {
        page: 1,
        pageSize: 20,
        totalItems: 2,
        totalPages: 1,
        hasPreviousPage: false,
        hasNextPage: false,
      },
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({
        updatedCount: 2,
      }),
    } as unknown as Response);

    const { result } = renderHook(() => useMarkAllNotificationsRead(), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await result.current.markAllAsRead();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/notifications/read-all"),
      expect.objectContaining({
        method: "PATCH",
        credentials: "include",
      })
    );

    expect(client.getQueryData(DASHBOARD_UNREAD_COUNT_QUERY_KEY)).toMatchObject({
      unreadCount: 0,
      isFallback: false,
    });

    const cachedList = client.getQueryData<{
      items: Array<{ isRead: boolean }>;
    }>(dashboardNotificationsQueryKeys.list(1, 20));

    expect(cachedList?.items.every((item) => item.isRead)).toBe(true);
  });
});

describe("useNotificationBannerState", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("derives the production delay banner from notification presentation metadata", async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        items: [productionDelayNotification],
        pagination: {
          page: 1,
          pageSize: 50,
          totalItems: 1,
          totalPages: 1,
          hasPreviousPage: false,
          hasNextPage: false,
        },
      }),
    } as unknown as Response);

    const { result } = renderHook(() => useNotificationBannerState(), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => {
      expect(result.current.items).toHaveLength(1);
    });

    expect(result.current.hasProductionDelayBanner).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/notifications?page=1&limit=50"),
      expect.objectContaining({
        method: "GET",
        credentials: "include",
      })
    );
  });

  it("does not show the banner when notifications do not carry the persistent banner marker", async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        items: [resolvedSystemNotification],
        pagination: {
          page: 1,
          pageSize: 50,
          totalItems: 1,
          totalPages: 1,
          hasPreviousPage: false,
          hasNextPage: false,
        },
      }),
    } as unknown as Response);

    const { result } = renderHook(() => useNotificationBannerState(), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => {
      expect(result.current.items).toHaveLength(1);
    });

    expect(result.current.hasProductionDelayBanner).toBe(false);
  });
});
