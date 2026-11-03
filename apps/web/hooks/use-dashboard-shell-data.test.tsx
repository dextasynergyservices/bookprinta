import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  DASHBOARD_REVIEW_ELIGIBILITY_QUERY_KEY,
  DASHBOARD_UNREAD_COUNT_QUERY_KEY,
  dashboardNotificationsQueryKeys,
  useCreateReview,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationBannerState,
  useNotificationUnreadCount,
  useOlderNotificationPages,
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

const pendingReviewBook = {
  bookId: "cmreviewbook11111111111111111",
  title: "The Lagos Chronicle",
  coverImageUrl: null,
  lifecycleStatus: "DELIVERED" as const,
  reviewStatus: "PENDING" as const,
  review: null,
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

  it("optimistically marks a pending review as submitted before the API resolves", async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    client.setQueryData(DASHBOARD_REVIEW_ELIGIBILITY_QUERY_KEY, {
      hasEligibleBooks: true,
      hasPendingReviews: true,
      books: [pendingReviewBook],
      isFallback: false,
    });

    let resolveFetch: ((value: Response) => void) | null = null;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        })
    );

    const { result } = renderHook(() => useCreateReview(), {
      wrapper: createWrapper(client),
    });

    let submissionPromise: Promise<unknown> | null = null;
    act(() => {
      submissionPromise = result.current.submitReview({
        bookId: pendingReviewBook.bookId,
        rating: 5,
        comment: "Sharp print quality and smooth updates.",
      });
    });

    await waitFor(() => {
      expect(
        client.getQueryData<{
          hasPendingReviews: boolean;
          books: Array<{
            bookId: string;
            reviewStatus: string;
            review: { rating: number; comment: string | null } | null;
          }>;
        }>(DASHBOARD_REVIEW_ELIGIBILITY_QUERY_KEY)
      ).toMatchObject({
        hasPendingReviews: false,
        books: [
          {
            bookId: pendingReviewBook.bookId,
            reviewStatus: "REVIEWED",
            review: {
              rating: 5,
              comment: "Sharp print quality and smooth updates.",
            },
          },
        ],
      });
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/reviews"),
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      })
    );

    await act(async () => {
      resolveFetch?.({
        ok: true,
        json: jest.fn().mockResolvedValue({
          book: {
            ...pendingReviewBook,
            reviewStatus: "REVIEWED",
            review: {
              rating: 5,
              comment: "Sharp print quality and smooth updates.",
              isPublic: true,
              createdAt: "2026-03-04T12:00:00.000Z",
            },
          },
        }),
      } as unknown as Response);
      await submissionPromise;
    });

    expect(
      client.getQueryData<{
        hasPendingReviews: boolean;
        books: Array<{
          bookId: string;
          reviewStatus: string;
          review: { createdAt: string } | null;
        }>;
      }>(DASHBOARD_REVIEW_ELIGIBILITY_QUERY_KEY)
    ).toMatchObject({
      hasPendingReviews: false,
      books: [
        {
          bookId: pendingReviewBook.bookId,
          reviewStatus: "REVIEWED",
          review: {
            createdAt: "2026-03-04T12:00:00.000Z",
          },
        },
      ],
    });
  });

  it("rolls back the optimistic review update when submission fails", async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    client.setQueryData(DASHBOARD_REVIEW_ELIGIBILITY_QUERY_KEY, {
      hasEligibleBooks: true,
      hasPendingReviews: true,
      books: [pendingReviewBook],
      isFallback: false,
    });

    let rejectFetch: ((reason?: unknown) => void) | null = null;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((_resolve, reject) => {
          rejectFetch = reject;
        })
    );

    const { result } = renderHook(() => useCreateReview(), {
      wrapper: createWrapper(client),
    });

    let submissionPromise: Promise<unknown> | null = null;
    act(() => {
      submissionPromise = result.current.submitReview({
        bookId: pendingReviewBook.bookId,
        rating: 4,
        comment: "Lovely finish.",
      });
    });

    await waitFor(() => {
      expect(
        client.getQueryData<{
          hasPendingReviews: boolean;
          books: Array<{
            bookId: string;
            reviewStatus: string;
          }>;
        }>(DASHBOARD_REVIEW_ELIGIBILITY_QUERY_KEY)
      ).toMatchObject({
        hasPendingReviews: false,
        books: [
          {
            bookId: pendingReviewBook.bookId,
            reviewStatus: "REVIEWED",
          },
        ],
      });
    });

    await act(async () => {
      rejectFetch?.(new Error("Network down"));
      await expect(submissionPromise).rejects.toThrow("Network down");
    });

    expect(
      client.getQueryData<{
        hasPendingReviews: boolean;
        books: Array<{
          bookId: string;
          reviewStatus: string;
          review: unknown;
        }>;
      }>(DASHBOARD_REVIEW_ELIGIBILITY_QUERY_KEY)
    ).toMatchObject({
      hasPendingReviews: true,
      books: [
        {
          bookId: pendingReviewBook.bookId,
          reviewStatus: "PENDING",
          review: null,
        },
      ],
    });
  });
});

describe("useNotificationBannerState", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  function renderBannerState() {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    return renderHook(() => useNotificationBannerState(), {
      wrapper: createWrapper(client),
    });
  }

  it("shows the banner when the server says the user has an active production delay", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ unreadCount: 2, hasProductionDelayBanner: true }),
    } as unknown as Response);

    const { result } = renderBannerState();

    await waitFor(() => {
      expect(result.current.hasProductionDelayBanner).toBe(true);
    });
    // One cached request shared with the unread badge; the notification list
    // (previously 50 rows every 30 s) is no longer fetched for the banner.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/notifications/unread-count"),
      expect.objectContaining({ method: "GET", credentials: "include" })
    );
  });

  it("hides the banner once the delay is resolved, whatever the notification history", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ unreadCount: 0, hasProductionDelayBanner: false }),
    } as unknown as Response);

    const { result } = renderBannerState();

    await waitFor(() => {
      expect(result.current.isFallback).toBe(false);
    });
    expect(result.current.hasProductionDelayBanner).toBe(false);
  });

  it("treats a response without the flag as no banner", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ unreadCount: 1 }),
    } as unknown as Response);

    const { result } = renderBannerState();

    await waitFor(() => {
      expect(result.current.isFallback).toBe(false);
    });
    expect(result.current.hasProductionDelayBanner).toBe(false);
  });
});

describe("useOlderNotificationPages", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  function listPage(page: number, hasNextPage: boolean) {
    return {
      ok: true,
      json: jest.fn().mockResolvedValue({
        items: [{ ...unreadNotification, id: `cmpage${page}notification00000000` }],
        pagination: {
          page,
          pageSize: 20,
          totalItems: 60,
          totalPages: 3,
          hasPreviousPage: page > 1,
          hasNextPage,
        },
      }),
    } as unknown as Response;
  }

  function renderOlderPages(props: { isOpen: boolean; pageCount: number }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return renderHook(() => useOlderNotificationPages(props), {
      wrapper: createWrapper(client),
    });
  }

  it("loads pages 2..pageCount and reports whether more remain", async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(url.includes("page=2") ? listPage(2, true) : listPage(3, false))
    );

    const { result } = renderOlderPages({ isOpen: true, pageCount: 3 });

    await waitFor(() => {
      expect(result.current.items).toHaveLength(2);
    });
    expect(fetchMock.mock.calls.map(([url]) => String(url).match(/page=(\d+)/)?.[1])).toEqual([
      "2",
      "3",
    ]);
    expect(result.current.lastPagination?.hasNextPage).toBe(false);
  });

  it("fetches nothing while the panel is closed or only the first page is shown", () => {
    renderOlderPages({ isOpen: false, pageCount: 3 });
    renderOlderPages({ isOpen: true, pageCount: 1 });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("useMarkNotificationRead rollback", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("restores original unread count and list item state on mark-read API failure", async () => {
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
      items: [unreadNotification],
      pagination: {
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
        hasPreviousPage: false,
        hasNextPage: false,
      },
    });

    let rejectFetch: ((reason?: unknown) => void) | null = null;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((_resolve, reject) => {
          rejectFetch = reject;
        })
    );

    const { result } = renderHook(() => useMarkNotificationRead(), {
      wrapper: createWrapper(client),
    });

    let markPromise: Promise<unknown> | null = null;
    act(() => {
      markPromise = result.current.markAsRead({
        notificationId: unreadNotification.id,
      });
    });

    // Optimistic: count dropped by 1
    await waitFor(() => {
      expect(client.getQueryData(DASHBOARD_UNREAD_COUNT_QUERY_KEY)).toMatchObject({
        unreadCount: 2,
      });
    });

    // Fail the request
    await act(async () => {
      rejectFetch?.(new Error("500 Internal Server Error"));
      try {
        await markPromise;
      } catch {
        /* expected */
      }
    });

    // Rollback: count restored
    await waitFor(() => {
      expect(client.getQueryData(DASHBOARD_UNREAD_COUNT_QUERY_KEY)).toMatchObject({
        unreadCount: 3,
      });
    });

    // List item rolled back to unread
    const cachedList = client.getQueryData<{
      items: Array<{ id: string; isRead: boolean }>;
    }>(dashboardNotificationsQueryKeys.list(1, 20));
    expect(cachedList?.items[0]?.isRead).toBe(false);
  });
});

describe("useNotificationUnreadCount graceful degradation", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("degrades to zero unread count with isFallback=true on network failure", async () => {
    fetchMock.mockRejectedValue(new Error("Network down"));

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(() => useNotificationUnreadCount(), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => {
      expect(result.current.isFallback).toBe(true);
    });

    expect(result.current.unreadCount).toBe(0);
    expect(result.current.hasUnread).toBe(false);
  });
});
