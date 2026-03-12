"use client";

import { isAdminRole, type NotificationUnreadCountResponse } from "@bookprinta/shared";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { normalizeNotificationUnreadCountPayload } from "@/lib/api/notifications-contract";
import { useAuthSession } from "./use-auth-session";

function getApiV1BaseUrl() {
  const base = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/+$/, "");

  if (base.endsWith("/api/v1")) return base;
  if (base.endsWith("/api")) return `${base}/v1`;
  return `${base}/api/v1`;
}

function isAbortError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("name" in error)) {
    return false;
  }

  return String((error as { name?: unknown }).name)
    .toLowerCase()
    .includes("abort");
}

type QueryDataWithFallback<TData> = TData & {
  isFallback: boolean;
};

const API_V1_BASE_URL = getApiV1BaseUrl();
export const ADMIN_NOTIFICATIONS_POLL_INTERVAL_MS = 30_000;

export const adminNotificationsQueryKeys = {
  all: ["admin", "notifications"] as const,
  unreadCount: () => ["admin", "notifications", "unread-count"] as const,
};

export const ADMIN_UNREAD_COUNT_QUERY_KEY = adminNotificationsQueryKeys.unreadCount();

async function fetchAdminNotificationUnreadCount({
  signal,
}: {
  signal?: AbortSignal;
} = {}): Promise<QueryDataWithFallback<NotificationUnreadCountResponse>> {
  try {
    const response = await fetch(`${API_V1_BASE_URL}/notifications/unread-count`, {
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

export function useAdminNotificationUnreadCount() {
  const { user, isAuthenticated } = useAuthSession();
  const isEnabled = isAuthenticated && isAdminRole(user?.role);

  const query = useQuery({
    queryKey: ADMIN_UNREAD_COUNT_QUERY_KEY,
    meta: {
      sentryName: "fetchAdminNotificationUnreadCount",
      sentryEndpoint: "/api/v1/notifications/unread-count",
    },
    queryFn: ({ signal }) => fetchAdminNotificationUnreadCount({ signal }),
    staleTime: 0,
    gcTime: 1000 * 60 * 10,
    retry: 1,
    enabled: isEnabled,
    refetchInterval: isEnabled ? ADMIN_NOTIFICATIONS_POLL_INTERVAL_MS : false,
    refetchIntervalInBackground: isEnabled,
    refetchOnWindowFocus: isEnabled,
    refetchOnMount: isEnabled ? "always" : false,
  });

  const unreadCount = query.data?.unreadCount ?? 0;

  return {
    ...query,
    unreadCount,
    hasUnread: unreadCount > 0,
    isFallback: query.data?.isFallback ?? true,
  };
}

export function useAdminNotificationBellState() {
  const unreadCountQuery = useAdminNotificationUnreadCount();
  const [badgeAnimationKey, setBadgeAnimationKey] = useState(0);
  const previousUnreadCountRef = useRef<number | null>(null);

  useEffect(() => {
    if (unreadCountQuery.isLoading || unreadCountQuery.isError || unreadCountQuery.isFallback) {
      return;
    }

    if (previousUnreadCountRef.current === null) {
      previousUnreadCountRef.current = unreadCountQuery.unreadCount;
      return;
    }

    if (unreadCountQuery.unreadCount > previousUnreadCountRef.current) {
      setBadgeAnimationKey((current) => current + 1);
    }

    previousUnreadCountRef.current = unreadCountQuery.unreadCount;
  }, [
    unreadCountQuery.isError,
    unreadCountQuery.isFallback,
    unreadCountQuery.isLoading,
    unreadCountQuery.unreadCount,
  ]);

  return {
    ...unreadCountQuery,
    badgeAnimationKey,
  };
}
