"use client";

import type { BookStatus, DashboardOverviewResponse } from "@bookprinta/shared";
import { useQuery } from "@tanstack/react-query";
import { normalizeDashboardOverviewPayload } from "@/lib/api/dashboard-overview-contract";
import { throwApiError } from "@/lib/api-error";
import {
  DASHBOARD_HEARTBEAT_POLL_INTERVAL_MS,
  DASHBOARD_POLL_INTERVAL_MS,
  dashboardStatusPollingQueryOptions,
} from "@/lib/dashboard/query-defaults";
import { fetchApiV1WithRefresh } from "@/lib/fetch-with-refresh";

// ─── Polling backoff ──────────────────────────────────────────
//
// Book statuses that change on an admin/logistics timescale (hours–days).
// Polling at 30 s for a book that is IN_PRODUCTION for three days is wasteful.
// These states use DASHBOARD_HEARTBEAT_POLL_INTERVAL_MS (2 min) instead.
// The SSE processing pipeline also triggers this reduced rate — when
// processing.isActive is true the SSE stream is the primary real-time channel,
// so the dashboard poll only needs to act as a heartbeat/reconnect fallback.
const SLOW_POLLING_STATUSES = new Set<BookStatus>([
  "DESIGNING",
  "DESIGNED",
  "FORMATTING",
  "FORMATTED",
  "APPROVED",
  "IN_PRODUCTION",
  "PRINTING",
  "PRINTED",
  "SHIPPING",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
  "REJECTED",
]);

function computeRefetchInterval(data: DashboardOverviewResponse | undefined): number {
  if (!data) return DASHBOARD_POLL_INTERVAL_MS;

  // SSE is active for this book — it is the primary real-time channel.
  // Use heartbeat rate only; the processing-progress-stepper will invalidate
  // the query immediately when SSE fires a 'complete' event.
  if (data.activeBook?.processing.isActive) return DASHBOARD_HEARTBEAT_POLL_INTERVAL_MS;

  // Slow-changing logistics/admin state — no user action required imminently.
  const bookStatus = data.activeBook?.status;
  if (bookStatus && SLOW_POLLING_STATUSES.has(bookStatus)) {
    return DASHBOARD_HEARTBEAT_POLL_INTERVAL_MS;
  }

  // User-actionable or transitional state (AWAITING_UPLOAD, REVIEW, PREVIEW_READY…)
  return DASHBOARD_POLL_INTERVAL_MS;
}

// ─────────────────────────────────────────────────────────────

export const dashboardOverviewQueryKey = ["dashboard", "overview"] as const;

export async function fetchDashboardOverview({ signal }: { signal?: AbortSignal } = {}) {
  let response: Response;
  try {
    response = await fetchApiV1WithRefresh("/dashboard/overview", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal,
    });
  } catch (error) {
    const errorName =
      typeof error === "object" && error !== null && "name" in error
        ? String((error as { name?: unknown }).name)
        : "";

    if (errorName.toLowerCase().includes("abort")) {
      throw error;
    }

    throw new Error("Unable to load your dashboard overview right now");
  }

  if (!response.ok) {
    await throwApiError(response, "Unable to load your dashboard overview");
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  return normalizeDashboardOverviewPayload(payload);
}

export function useDashboardOverview({ enabled = true }: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: dashboardOverviewQueryKey,
    meta: {
      sentryName: "fetchDashboardOverview",
      sentryEndpoint: "/api/v1/dashboard/overview",
    },
    queryFn: ({ signal }) => fetchDashboardOverview({ signal }),
    ...dashboardStatusPollingQueryOptions,
    // Override with a status-aware interval: 30 s for user-actionable states,
    // 2 min (heartbeat) when SSE is active or the book is in a slow state.
    refetchInterval: (query) => computeRefetchInterval(query.state.data),
    enabled,
  });

  const data = query.data ?? normalizeDashboardOverviewPayload(null);
  const isInitialLoading = query.isPending && !query.data;

  return {
    ...query,
    data,
    activeBook: data.activeBook,
    recentOrders: data.recentOrders,
    notifications: data.notifications,
    profile: data.profile,
    pendingActions: data.pendingActions,
    isInitialLoading,
  };
}
