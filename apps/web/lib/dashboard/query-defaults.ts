"use client";

export const DASHBOARD_QUERY_GC_TIME_MS = 1000 * 60 * 10;
export const DASHBOARD_QUERY_RETRY_COUNT = 1;
export const DASHBOARD_SUMMARY_STALE_TIME_MS = 30_000;
export const DASHBOARD_HISTORY_STALE_TIME_MS = 60_000;
export const DASHBOARD_STATUS_STALE_TIME_MS = 15_000;
export const DASHBOARD_LIVE_STALE_TIME_MS = 0;
export const DASHBOARD_POLL_INTERVAL_MS = 30_000;

export const dashboardBaseQueryOptions = {
  gcTime: DASHBOARD_QUERY_GC_TIME_MS,
  retry: DASHBOARD_QUERY_RETRY_COUNT,
} as const;

export const dashboardSummaryQueryOptions = {
  ...dashboardBaseQueryOptions,
  staleTime: DASHBOARD_SUMMARY_STALE_TIME_MS,
} as const;

export const dashboardHistoryQueryOptions = {
  ...dashboardBaseQueryOptions,
  staleTime: DASHBOARD_HISTORY_STALE_TIME_MS,
} as const;

export const dashboardLiveQueryOptions = {
  ...dashboardBaseQueryOptions,
  staleTime: DASHBOARD_LIVE_STALE_TIME_MS,
  refetchOnWindowFocus: true,
  refetchOnMount: "always" as const,
} as const;

export const dashboardRealtimeQueryOptions = {
  ...dashboardLiveQueryOptions,
  refetchInterval: DASHBOARD_POLL_INTERVAL_MS,
  refetchIntervalInBackground: true,
} as const;

export const dashboardStatusPollingQueryOptions = {
  ...dashboardBaseQueryOptions,
  staleTime: DASHBOARD_STATUS_STALE_TIME_MS,
  refetchInterval: DASHBOARD_POLL_INTERVAL_MS,
  refetchOnWindowFocus: true,
} as const;

export function createDashboardConditionalRealtimeQueryOptions(isActive: boolean) {
  return {
    ...dashboardBaseQueryOptions,
    staleTime: DASHBOARD_LIVE_STALE_TIME_MS,
    refetchInterval: isActive ? DASHBOARD_POLL_INTERVAL_MS : false,
    refetchIntervalInBackground: isActive,
    refetchOnWindowFocus: isActive,
    refetchOnMount: isActive ? ("always" as const) : false,
  } as const;
}
