import { useQuery } from "@tanstack/react-query";

function getApiV1BaseUrl() {
  const base = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/+$/, "");

  if (base.endsWith("/api/v1")) return base;
  if (base.endsWith("/api")) return `${base}/v1`;
  return `${base}/api/v1`;
}

const API_V1_BASE_URL = getApiV1BaseUrl();

export const DASHBOARD_UNREAD_COUNT_QUERY_KEY = [
  "dashboard",
  "notifications",
  "unread-count",
] as const;
export const DASHBOARD_REVIEW_ELIGIBILITY_QUERY_KEY = [
  "dashboard",
  "reviews",
  "eligibility",
] as const;

type QueryDataWithFallback<TData> = TData & {
  isFallback: boolean;
};

/**
 * Frontend contract for GET /api/v1/notifications/unread-count.
 */
export type NotificationUnreadCountContract = {
  unreadCount: number;
};

/**
 * Frontend contract for reviews sidebar eligibility.
 * Source endpoint: GET /api/v1/reviews/my
 */
export type ReviewEligibilityContract = {
  hasAnyPrintedBook: boolean;
};

function toRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
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

function toBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  return null;
}

function resolveUnreadCount(payload: unknown): number {
  const root = toRecord(payload);
  const data = toRecord(root?.data);

  const candidates = [
    toInt(root?.unreadCount),
    toInt(root?.count),
    toInt(data?.unreadCount),
    toInt(data?.count),
  ];

  return candidates.find((candidate): candidate is number => candidate !== null) ?? 0;
}

function resolveHasAnyPrintedBook(payload: unknown): boolean {
  const root = toRecord(payload);
  const data = toRecord(root?.data);

  const booleanCandidates = [
    toBoolean(root?.hasAnyPrintedBook),
    toBoolean(data?.hasAnyPrintedBook),
  ];

  const explicitBoolean = booleanCandidates.find(
    (candidate): candidate is boolean => candidate !== null
  );
  if (typeof explicitBoolean === "boolean") {
    return explicitBoolean;
  }

  const possibleArrays: unknown[] = [
    root?.printedBooks,
    root?.pendingBooks,
    root?.reviews,
    root?.items,
    data?.printedBooks,
    data?.pendingBooks,
    data?.reviews,
    data?.items,
    payload,
    root?.data,
  ];

  for (const list of possibleArrays) {
    if (Array.isArray(list) && list.length > 0) {
      return true;
    }
  }

  const countCandidates = [
    toInt(root?.printedCount),
    toInt(root?.pendingCount),
    toInt(root?.reviewableCount),
    toInt(data?.printedCount),
    toInt(data?.pendingCount),
    toInt(data?.reviewableCount),
  ];

  return countCandidates.some((count) => typeof count === "number" && count > 0);
}

async function fetchNotificationUnreadCount(): Promise<
  QueryDataWithFallback<NotificationUnreadCountContract>
> {
  try {
    const response = await fetch(`${API_V1_BASE_URL}/notifications/unread-count`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Unread count endpoint failed with status ${response.status}`);
    }

    const payload = (await response.json().catch(() => null)) as unknown;

    return {
      unreadCount: resolveUnreadCount(payload),
      isFallback: false,
    };
  } catch {
    return {
      unreadCount: 0,
      isFallback: true,
    };
  }
}

async function fetchReviewEligibility(): Promise<QueryDataWithFallback<ReviewEligibilityContract>> {
  try {
    const response = await fetch(`${API_V1_BASE_URL}/reviews/my`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Review eligibility endpoint failed with status ${response.status}`);
    }

    const payload = (await response.json().catch(() => null)) as unknown;

    return {
      hasAnyPrintedBook: resolveHasAnyPrintedBook(payload),
      isFallback: false,
    };
  } catch {
    return {
      hasAnyPrintedBook: false,
      isFallback: true,
    };
  }
}

export function useNotificationUnreadCount() {
  const query = useQuery({
    queryKey: DASHBOARD_UNREAD_COUNT_QUERY_KEY,
    meta: {
      sentryName: "fetchNotificationUnreadCount",
      sentryEndpoint: "/api/v1/notifications/unread-count",
    },
    queryFn: fetchNotificationUnreadCount,
    staleTime: 0,
    gcTime: 1000 * 60 * 10,
    retry: 1,
    refetchInterval: 45_000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
  });

  const unreadCount = query.data?.unreadCount ?? 0;

  return {
    ...query,
    unreadCount,
    hasUnread: unreadCount > 0,
    isFallback: query.data?.isFallback ?? true,
  };
}

export function useReviewEligibility() {
  const query = useQuery({
    queryKey: DASHBOARD_REVIEW_ELIGIBILITY_QUERY_KEY,
    meta: {
      sentryName: "fetchReviewEligibility",
      sentryEndpoint: "/api/v1/reviews/my",
    },
    queryFn: fetchReviewEligibility,
    staleTime: 0,
    gcTime: 1000 * 60 * 10,
    retry: 1,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
  });

  return {
    ...query,
    hasAnyPrintedBook: query.data?.hasAnyPrintedBook ?? false,
    isFallback: query.data?.isFallback ?? true,
  };
}

export function useHasAnyPrintedBook() {
  return useReviewEligibility();
}
