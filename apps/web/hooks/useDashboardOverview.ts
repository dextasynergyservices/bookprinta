"use client";

import { useQuery } from "@tanstack/react-query";
import { normalizeDashboardOverviewPayload } from "@/lib/api/dashboard-overview-contract";
import { throwApiError } from "@/lib/api-error";
import { dashboardStatusPollingQueryOptions } from "@/lib/dashboard/query-defaults";
import { fetchApiV1WithRefresh } from "@/lib/fetch-with-refresh";

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
