"use client";

import { useQuery } from "@tanstack/react-query";
import { normalizeDashboardOverviewPayload } from "@/lib/api/dashboard-overview-contract";
import { throwApiError } from "@/lib/api-error";
import { dashboardStatusPollingQueryOptions } from "@/lib/dashboard/query-defaults";

function getApiV1BaseUrl() {
  const base = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/+$/, "");

  if (base.endsWith("/api/v1")) return base;
  if (base.endsWith("/api")) return `${base}/v1`;
  return `${base}/api/v1`;
}

const API_V1_BASE_URL = getApiV1BaseUrl();

export const dashboardOverviewQueryKey = ["dashboard", "overview"] as const;

export async function fetchDashboardOverview({ signal }: { signal?: AbortSignal } = {}) {
  let response: Response;
  try {
    response = await fetch(`${API_V1_BASE_URL}/dashboard/overview`, {
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
