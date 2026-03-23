"use client";

import type {
  CreateReviewBodyInput,
  CreateReviewResponse,
  MyReviewsResponse,
  NotificationMarkAllReadResponse,
  NotificationMarkReadResponse,
  NotificationsListResponse,
  NotificationUnreadCountResponse,
} from "@bookprinta/shared";
import {
  keepPreviousData,
  type QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useMemo } from "react";
import {
  coerceNotificationsPage,
  coerceNotificationsPageSize,
  createEmptyNotificationsListResponse,
  DEFAULT_NOTIFICATIONS_PAGE,
  DEFAULT_NOTIFICATIONS_PAGE_SIZE,
  hasPersistentNotificationBanner,
  markAllNotificationsReadInListResponse,
  markNotificationReadInListResponse,
  normalizeNotificationMarkAllReadPayload,
  normalizeNotificationMarkReadPayload,
  normalizeNotificationsListPayload,
  normalizeNotificationUnreadCountPayload,
  replaceNotificationInListResponse,
} from "@/lib/api/notifications-contract";
import {
  appendReviewToState,
  createEmptyReviewState,
  normalizeCreateReviewPayload,
  normalizeMyReviewsPayload,
} from "@/lib/api/reviews-contract";
import { throwApiError } from "@/lib/api-error";
import {
  createDashboardConditionalRealtimeQueryOptions,
  dashboardLiveQueryOptions,
  dashboardRealtimeQueryOptions,
} from "@/lib/dashboard/query-defaults";
import { fetchApiV1WithRefresh } from "@/lib/fetch-with-refresh";

const DASHBOARD_NOTIFICATION_BANNER_PAGE_SIZE = 50;

export const dashboardNotificationsQueryKeys = {
  all: ["dashboard", "notifications"] as const,
  unreadCount: () => ["dashboard", "notifications", "unread-count"] as const,
  lists: () => ["dashboard", "notifications", "list"] as const,
  list: (page: number, pageSize: number) =>
    ["dashboard", "notifications", "list", page, pageSize] as const,
};

export const DASHBOARD_UNREAD_COUNT_QUERY_KEY = dashboardNotificationsQueryKeys.unreadCount();
export const DASHBOARD_REVIEW_ELIGIBILITY_QUERY_KEY = [
  "dashboard",
  "reviews",
  "eligibility",
] as const;

type QueryDataWithFallback<TData> = TData & {
  isFallback: boolean;
};

type ReviewStateQueryData = QueryDataWithFallback<MyReviewsResponse>;

type NotificationReadMutationInput = {
  notificationId: string;
};

type NotificationReadMutationContext = {
  unreadCountSnapshot: QueryDataWithFallback<NotificationUnreadCountResponse> | undefined;
  listSnapshots: Array<[QueryKey, NotificationsListResponse | undefined]>;
  targetState: "missing" | "read" | "unread";
};

type NotificationMarkAllReadMutationContext = {
  unreadCountSnapshot: QueryDataWithFallback<NotificationUnreadCountResponse> | undefined;
  listSnapshots: Array<[QueryKey, NotificationsListResponse | undefined]>;
};

export type ReviewEligibilityContract = {
  hasAnyEligibleBook: boolean;
};

function isAbortError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("name" in error)) {
    return false;
  }

  return String((error as { name?: unknown }).name)
    .toLowerCase()
    .includes("abort");
}

async function fetchNotificationUnreadCount({
  signal,
}: {
  signal?: AbortSignal;
} = {}): Promise<QueryDataWithFallback<NotificationUnreadCountResponse>> {
  try {
    const response = await fetchApiV1WithRefresh("/notifications/unread-count", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal,
    });

    if (!response.ok) {
      throw new Error(`Unread count endpoint failed with status ${response.status}`);
    }

    const payload = (await response.json().catch(() => null)) as unknown;

    return {
      ...normalizeNotificationUnreadCountPayload(payload),
      isFallback: false,
    };
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    return {
      unreadCount: 0,
      isFallback: true,
    };
  }
}

type FetchNotificationsPageParams = {
  page?: number;
  pageSize?: number;
  signal?: AbortSignal;
};

export async function fetchNotificationsPage({
  page: requestedPage,
  pageSize: requestedPageSize,
  signal,
}: FetchNotificationsPageParams = {}): Promise<NotificationsListResponse> {
  const page = coerceNotificationsPage(requestedPage);
  const pageSize = coerceNotificationsPageSize(requestedPageSize);
  const params = new URLSearchParams({
    page: String(page),
    limit: String(pageSize),
  });

  let response: Response;
  try {
    response = await fetchApiV1WithRefresh(`/notifications?${params.toString()}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    throw new Error("Unable to load notifications right now");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to load notifications");
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  return normalizeNotificationsListPayload(payload, {
    requestedPage: page,
    requestedPageSize: pageSize,
  });
}

async function markNotificationReadRequest({
  notificationId,
}: NotificationReadMutationInput): Promise<NotificationMarkReadResponse> {
  const response = await fetchApiV1WithRefresh(`/notifications/${notificationId}/read`, {
    method: "PATCH",
    credentials: "include",
    cache: "no-store",
  });

  if (!response.ok) {
    await throwApiError(response, "Unable to mark this notification as read");
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  return normalizeNotificationMarkReadPayload(payload);
}

async function markAllNotificationsReadRequest(): Promise<NotificationMarkAllReadResponse> {
  const response = await fetchApiV1WithRefresh("/notifications/read-all", {
    method: "PATCH",
    credentials: "include",
    cache: "no-store",
  });

  if (!response.ok) {
    await throwApiError(response, "Unable to mark all notifications as read");
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  return normalizeNotificationMarkAllReadPayload(payload);
}

async function fetchReviewState({
  signal,
}: {
  signal?: AbortSignal;
} = {}): Promise<ReviewStateQueryData> {
  try {
    const response = await fetchApiV1WithRefresh("/reviews/my", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal,
    });

    if (!response.ok) {
      throw new Error(`Review state endpoint failed with status ${response.status}`);
    }

    const payload = (await response.json().catch(() => null)) as unknown;

    return {
      ...normalizeMyReviewsPayload(payload),
      isFallback: false,
    };
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    return {
      ...createEmptyReviewState(),
      isFallback: true,
    };
  }
}

async function createReviewRequest(input: CreateReviewBodyInput): Promise<CreateReviewResponse> {
  const response = await fetchApiV1WithRefresh("/reviews", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    await throwApiError(response, "Unable to submit your review");
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  return normalizeCreateReviewPayload(payload);
}

function buildOptimisticReviewBook(
  current: ReviewStateQueryData | undefined,
  input: CreateReviewBodyInput
): MyReviewsResponse["books"][number] {
  const existingBook = current?.books.find((book) => book.bookId === input.bookId) ?? null;
  const trimmedComment = input.comment?.trim() || null;

  return {
    bookId: input.bookId,
    title: existingBook?.title ?? null,
    coverImageUrl: existingBook?.coverImageUrl ?? null,
    lifecycleStatus: existingBook?.lifecycleStatus ?? "DELIVERED",
    reviewStatus: "REVIEWED",
    review: {
      rating: input.rating,
      comment: trimmedComment,
      isPublic: true,
      createdAt: new Date().toISOString(),
    },
  };
}

function getNotificationsListSnapshots(
  queryClient: ReturnType<typeof useQueryClient>
): Array<[QueryKey, NotificationsListResponse | undefined]> {
  return queryClient.getQueriesData<NotificationsListResponse>({
    queryKey: dashboardNotificationsQueryKeys.lists(),
  });
}

function restoreNotificationCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  context: NotificationReadMutationContext | NotificationMarkAllReadMutationContext | undefined
) {
  if (!context) return;

  queryClient.setQueryData(DASHBOARD_UNREAD_COUNT_QUERY_KEY, context.unreadCountSnapshot);

  for (const [queryKey, snapshot] of context.listSnapshots) {
    queryClient.setQueryData(queryKey, snapshot);
  }
}

function findNotificationStateInSnapshots(
  snapshots: Array<[QueryKey, NotificationsListResponse | undefined]>,
  notificationId: string
): NotificationReadMutationContext["targetState"] {
  for (const [, response] of snapshots) {
    const item = response?.items.find((notification) => notification.id === notificationId);

    if (!item) {
      continue;
    }

    return item.isRead ? "read" : "unread";
  }

  return "missing";
}

function updateUnreadCountCache(
  queryClient: ReturnType<typeof useQueryClient>,
  updater: (
    current: QueryDataWithFallback<NotificationUnreadCountResponse>
  ) => QueryDataWithFallback<NotificationUnreadCountResponse>
) {
  queryClient.setQueryData<QueryDataWithFallback<NotificationUnreadCountResponse>>(
    DASHBOARD_UNREAD_COUNT_QUERY_KEY,
    (current) => updater(current ?? { unreadCount: 0, isFallback: true })
  );
}

function optimisticallyMarkNotificationReadInCache(
  queryClient: ReturnType<typeof useQueryClient>,
  notificationId: string
) {
  queryClient.setQueriesData<NotificationsListResponse>(
    {
      queryKey: dashboardNotificationsQueryKeys.lists(),
    },
    (current) => {
      if (!current) {
        return current;
      }

      return markNotificationReadInListResponse(current, notificationId);
    }
  );
}

function replaceNotificationAcrossCachedLists(
  queryClient: ReturnType<typeof useQueryClient>,
  result: NotificationMarkReadResponse
) {
  let didReplace = false;

  for (const [queryKey, response] of getNotificationsListSnapshots(queryClient)) {
    if (!response) {
      continue;
    }

    const next = replaceNotificationInListResponse(response, result.notification);
    if (next === response) {
      continue;
    }

    didReplace = true;
    queryClient.setQueryData(queryKey, next);
  }

  return didReplace;
}

function optimisticallyMarkAllNotificationsReadInCache(
  queryClient: ReturnType<typeof useQueryClient>
) {
  queryClient.setQueriesData<NotificationsListResponse>(
    {
      queryKey: dashboardNotificationsQueryKeys.lists(),
    },
    (current) => {
      if (!current) {
        return current;
      }

      return markAllNotificationsReadInListResponse(current);
    }
  );
}

export function useNotificationUnreadCount() {
  const query = useQuery({
    queryKey: DASHBOARD_UNREAD_COUNT_QUERY_KEY,
    meta: {
      sentryName: "fetchNotificationUnreadCount",
      sentryEndpoint: "/api/v1/notifications/unread-count",
    },
    queryFn: ({ signal }) => fetchNotificationUnreadCount({ signal }),
    ...dashboardRealtimeQueryOptions,
  });

  const unreadCount = query.data?.unreadCount ?? 0;

  return {
    ...query,
    unreadCount,
    hasUnread: unreadCount > 0,
    isFallback: query.data?.isFallback ?? true,
  };
}

type UseNotificationsListParams = {
  page?: number;
  pageSize?: number;
  isOpen?: boolean;
};

export function useNotificationsList({
  page,
  pageSize,
  isOpen = false,
}: UseNotificationsListParams = {}) {
  const resolvedPage = coerceNotificationsPage(page ?? DEFAULT_NOTIFICATIONS_PAGE);
  const resolvedPageSize = coerceNotificationsPageSize(pageSize ?? DEFAULT_NOTIFICATIONS_PAGE_SIZE);

  const query = useQuery({
    queryKey: dashboardNotificationsQueryKeys.list(resolvedPage, resolvedPageSize),
    meta: {
      sentryName: "fetchNotificationsList",
      sentryEndpoint: "/api/v1/notifications",
    },
    queryFn: ({ signal }) =>
      fetchNotificationsPage({
        page: resolvedPage,
        pageSize: resolvedPageSize,
        signal,
      }),
    placeholderData: keepPreviousData,
    ...createDashboardConditionalRealtimeQueryOptions(isOpen),
    enabled: isOpen,
  });

  const data = query.data ?? createEmptyNotificationsListResponse(resolvedPage, resolvedPageSize);
  const isInitialLoading = query.isPending && !query.data;
  const isRefreshing = query.isFetching && !isInitialLoading;

  return {
    ...query,
    data,
    items: data.items,
    pagination: data.pagination,
    page: resolvedPage,
    pageSize: resolvedPageSize,
    isInitialLoading,
    isRefreshing,
    hasUnreadItems: data.items.some((item) => !item.isRead),
    hasProductionDelayBanner: hasPersistentNotificationBanner(data.items, "production_delay"),
  };
}

export function useNotifications(params: UseNotificationsListParams = {}) {
  return useNotificationsList(params);
}

export function useNotificationBannerState() {
  const query = useQuery({
    queryKey: dashboardNotificationsQueryKeys.list(1, DASHBOARD_NOTIFICATION_BANNER_PAGE_SIZE),
    meta: {
      sentryName: "fetchNotificationBannerState",
      sentryEndpoint: "/api/v1/notifications",
    },
    queryFn: ({ signal }) =>
      fetchNotificationsPage({
        page: 1,
        pageSize: DASHBOARD_NOTIFICATION_BANNER_PAGE_SIZE,
        signal,
      }),
    ...dashboardRealtimeQueryOptions,
  });

  const data =
    query.data ?? createEmptyNotificationsListResponse(1, DASHBOARD_NOTIFICATION_BANNER_PAGE_SIZE);

  return {
    ...query,
    data,
    items: data.items,
    hasProductionDelayBanner: hasPersistentNotificationBanner(data.items, "production_delay"),
  };
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: markNotificationReadRequest,
    meta: {
      sentryName: "markNotificationRead",
      sentryEndpoint: "/api/v1/notifications/:id/read",
    },
    onMutate: async ({ notificationId }) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: DASHBOARD_UNREAD_COUNT_QUERY_KEY, exact: true }),
        queryClient.cancelQueries({ queryKey: dashboardNotificationsQueryKeys.lists() }),
      ]);

      const unreadCountSnapshot = queryClient.getQueryData<
        QueryDataWithFallback<NotificationUnreadCountResponse>
      >(DASHBOARD_UNREAD_COUNT_QUERY_KEY);
      const listSnapshots = getNotificationsListSnapshots(queryClient);
      const targetState = findNotificationStateInSnapshots(listSnapshots, notificationId);

      if (targetState === "unread") {
        optimisticallyMarkNotificationReadInCache(queryClient, notificationId);
        updateUnreadCountCache(queryClient, (current) => ({
          ...current,
          unreadCount: Math.max(0, current.unreadCount - 1),
        }));
      }

      return {
        unreadCountSnapshot,
        listSnapshots,
        targetState,
      };
    },
    onError: (_error, _variables, context) => {
      restoreNotificationCaches(queryClient, context);
    },
    onSuccess: (result, _variables, context) => {
      const didReplace = replaceNotificationAcrossCachedLists(queryClient, result);

      if (context?.targetState === "missing" && !didReplace) {
        void queryClient.invalidateQueries({
          queryKey: DASHBOARD_UNREAD_COUNT_QUERY_KEY,
          exact: true,
        });
      }
    },
  });

  return {
    ...mutation,
    markAsRead: mutation.mutateAsync,
  };
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: markAllNotificationsReadRequest,
    meta: {
      sentryName: "markAllNotificationsRead",
      sentryEndpoint: "/api/v1/notifications/read-all",
    },
    onMutate: async () => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: DASHBOARD_UNREAD_COUNT_QUERY_KEY, exact: true }),
        queryClient.cancelQueries({ queryKey: dashboardNotificationsQueryKeys.lists() }),
      ]);

      const unreadCountSnapshot = queryClient.getQueryData<
        QueryDataWithFallback<NotificationUnreadCountResponse>
      >(DASHBOARD_UNREAD_COUNT_QUERY_KEY);
      const listSnapshots = getNotificationsListSnapshots(queryClient);

      updateUnreadCountCache(queryClient, (current) => ({
        ...current,
        unreadCount: 0,
      }));
      optimisticallyMarkAllNotificationsReadInCache(queryClient);

      return {
        unreadCountSnapshot,
        listSnapshots,
      };
    },
    onError: (_error, _variables, context) => {
      restoreNotificationCaches(queryClient, context);
    },
  });

  return {
    ...mutation,
    markAllAsRead: mutation.mutateAsync,
  };
}

export function useReviewState() {
  const query = useQuery({
    queryKey: DASHBOARD_REVIEW_ELIGIBILITY_QUERY_KEY,
    meta: {
      sentryName: "fetchReviewState",
      sentryEndpoint: "/api/v1/reviews/my",
    },
    queryFn: ({ signal }) => fetchReviewState({ signal }),
    ...dashboardLiveQueryOptions,
  });

  const emptyReviewState = useMemo(
    () => ({
      ...createEmptyReviewState(),
      isFallback: true,
    }),
    []
  );
  const data = query.data ?? emptyReviewState;
  const pendingBooks = useMemo(
    () => data.books.filter((book) => book.reviewStatus === "PENDING"),
    [data.books]
  );
  const reviewedBooks = useMemo(
    () =>
      data.books.flatMap((book) =>
        book.review
          ? [
              {
                bookId: book.bookId,
                rating: book.review.rating,
                comment: book.review.comment,
                isPublic: book.review.isPublic,
                createdAt: book.review.createdAt,
              },
            ]
          : []
      ),
    [data.books]
  );

  return {
    ...query,
    hasAnyEligibleBook: data.hasEligibleBooks,
    hasPendingReviews: data.hasPendingReviews,
    books: data.books,
    pendingBooks,
    reviewedBooks,
    isFallback: data.isFallback,
  };
}

export function useCreateReview() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: createReviewRequest,
    meta: {
      sentryName: "createReview",
      sentryEndpoint: "/api/v1/reviews",
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({
        queryKey: DASHBOARD_REVIEW_ELIGIBILITY_QUERY_KEY,
        exact: true,
      });

      const reviewStateSnapshot = queryClient.getQueryData<ReviewStateQueryData>(
        DASHBOARD_REVIEW_ELIGIBILITY_QUERY_KEY
      );

      queryClient.setQueryData<ReviewStateQueryData>(
        DASHBOARD_REVIEW_ELIGIBILITY_QUERY_KEY,
        (current) => ({
          ...appendReviewToState(
            current
              ? {
                  hasEligibleBooks: current.hasEligibleBooks,
                  hasPendingReviews: current.hasPendingReviews,
                  books: current.books,
                }
              : createEmptyReviewState(),
            buildOptimisticReviewBook(current, input)
          ),
          isFallback: current?.isFallback ?? false,
        })
      );

      return {
        reviewStateSnapshot,
      };
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(
        DASHBOARD_REVIEW_ELIGIBILITY_QUERY_KEY,
        context?.reviewStateSnapshot
      );
    },
    onSuccess: async (result) => {
      queryClient.setQueryData<ReviewStateQueryData>(
        DASHBOARD_REVIEW_ELIGIBILITY_QUERY_KEY,
        (current) => ({
          ...appendReviewToState(
            current
              ? {
                  hasEligibleBooks: current.hasEligibleBooks,
                  hasPendingReviews: current.hasPendingReviews,
                  books: current.books,
                }
              : createEmptyReviewState(),
            result.book
          ),
          isFallback: false,
        })
      );

      await queryClient.invalidateQueries({
        queryKey: DASHBOARD_REVIEW_ELIGIBILITY_QUERY_KEY,
        exact: true,
      });
    },
  });

  return {
    ...mutation,
    submitReview: mutation.mutateAsync,
  };
}

export function useReviewEligibility() {
  const query = useReviewState();

  return {
    ...query,
    hasAnyEligibleBook: query.hasAnyEligibleBook,
    isFallback: query.isFallback,
  };
}

export function useHasAnyEligibleBook() {
  return useReviewEligibility();
}

export function useHasAnyPrintedBook() {
  return useReviewEligibility();
}
