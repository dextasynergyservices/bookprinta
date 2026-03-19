"use client";

import type {
  AdminDashboardChartsQuery,
  AdminDashboardChartsResponse,
  AdminDashboardRangeKey,
  AdminDashboardStatsQuery,
  AdminDashboardStatsResponse,
} from "@bookprinta/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  type AdminAnalyticsErrorState,
  fetchAdminDashboardCharts,
  fetchAdminDashboardStats,
  normalizeAdminAnalyticsError,
} from "@/lib/api/admin-analytics";

const ANALYTICS_STALE_TIME_MS = 20_000;
const ANALYTICS_REFETCH_INTERVAL_MS = 45_000;

type ResolvedDashboardQuery = {
  range: AdminDashboardRangeKey;
  from: string;
  to: string;
};

type WidgetState<TData> = {
  key: "kpi" | "revenue-orders" | "payment-method" | "order-status" | "bank-transfer-sla";
  data: TData;
  isLoading: boolean;
  isRefreshing: boolean;
  isError: boolean;
  isEmpty: boolean;
  error: AdminAnalyticsErrorState | null;
};

export const adminAnalyticsQueryKeys = {
  all: ["admin", "analytics"] as const,
  kpiStats: (query: ResolvedDashboardQuery) =>
    ["admin", "analytics", "kpi", query.range, query.from, query.to] as const,
  chartDatasets: (query: ResolvedDashboardQuery) =>
    ["admin", "analytics", "charts", query.range, query.from, query.to] as const,
};

const defaultStatsData: AdminDashboardStatsResponse = {
  totalOrders: { value: 0, deltaPercent: 0 },
  totalRevenueNgn: { value: 0, deltaPercent: 0 },
  activeBooksInProduction: { value: 0, deltaPercent: 0 },
  pendingBankTransfers: { value: 0, deltaPercent: 0 },
  slaAtRiskCount: 0,
  range: {
    key: "30d",
    from: new Date(0).toISOString(),
    to: new Date(0).toISOString(),
    previousFrom: new Date(0).toISOString(),
    previousTo: new Date(0).toISOString(),
  },
  lastUpdatedAt: new Date(0).toISOString(),
};

const defaultChartsData: AdminDashboardChartsResponse = {
  revenueAndOrdersTrend: [],
  paymentMethodDistribution: [],
  orderStatusDistribution: [],
  bankTransferSlaTrend: [],
  range: {
    key: "30d",
    from: new Date(0).toISOString(),
    to: new Date(0).toISOString(),
    previousFrom: new Date(0).toISOString(),
    previousTo: new Date(0).toISOString(),
  },
  refreshedAt: new Date(0).toISOString(),
};

function resolveDashboardQuery(
  query: Partial<Pick<AdminDashboardStatsQuery, "range" | "from" | "to">>
): ResolvedDashboardQuery {
  return {
    range: query.range ?? "30d",
    from: query.from?.trim() ?? "",
    to: query.to?.trim() ?? "",
  };
}

function toStatsRequestQuery(query: ResolvedDashboardQuery): AdminDashboardStatsQuery {
  return {
    range: query.range,
    ...(query.from ? { from: query.from } : {}),
    ...(query.to ? { to: query.to } : {}),
  };
}

function toChartsRequestQuery(query: ResolvedDashboardQuery): AdminDashboardChartsQuery {
  return {
    range: query.range,
    ...(query.from ? { from: query.from } : {}),
    ...(query.to ? { to: query.to } : {}),
  };
}

function hasAnyPositiveValue(values: number[]): boolean {
  return values.some((value) => value > 0);
}

function isKpiDataEmpty(data: AdminDashboardStatsResponse): boolean {
  return !hasAnyPositiveValue([
    data.totalOrders.value,
    data.totalRevenueNgn.value,
    data.activeBooksInProduction.value,
    data.pendingBankTransfers.value,
    data.slaAtRiskCount,
  ]);
}

function isRevenueOrdersWidgetEmpty(data: AdminDashboardChartsResponse): boolean {
  if (data.revenueAndOrdersTrend.length === 0) {
    return true;
  }

  return !data.revenueAndOrdersTrend.some(
    (point) => point.orders > 0 || point.revenueNgn > 0 || point.pendingTransfers > 0
  );
}

function isDistributionWidgetEmpty(points: Array<{ label: string; value: number }>): boolean {
  if (points.length === 0) {
    return true;
  }

  return !points.some((point) => point.value > 0);
}

function isSlaWidgetEmpty(data: AdminDashboardChartsResponse): boolean {
  if (data.bankTransferSlaTrend.length === 0) {
    return true;
  }

  return !data.bankTransferSlaTrend.some(
    (point) => point.under15m > 0 || point.between15mAnd30m > 0 || point.over30m > 0
  );
}

export function useAdminAnalyticsKpiStatsQuery(
  queryInput: Partial<Pick<AdminDashboardStatsQuery, "range" | "from" | "to">>
) {
  const normalizedQuery = resolveDashboardQuery(queryInput);
  const requestQuery = toStatsRequestQuery(normalizedQuery);
  const isCustomRangeComplete =
    normalizedQuery.range !== "custom" ||
    (normalizedQuery.from.length > 0 && normalizedQuery.to.length > 0);

  const query = useQuery({
    queryKey: adminAnalyticsQueryKeys.kpiStats(normalizedQuery),
    meta: {
      sentryName: "fetchAdminDashboardStats",
      sentryEndpoint: "/api/v1/admin/system/dashboard/stats",
    },
    queryFn: ({ signal }) => fetchAdminDashboardStats(requestQuery, { signal }),
    placeholderData: keepPreviousData,
    staleTime: ANALYTICS_STALE_TIME_MS,
    gcTime: 1000 * 60 * 10,
    refetchInterval: ANALYTICS_REFETCH_INTERVAL_MS,
    refetchOnWindowFocus: true,
    retry: 1,
    enabled: isCustomRangeComplete,
  });

  const data = query.data ?? defaultStatsData;
  const isLoading = isCustomRangeComplete && query.isPending && !query.data;
  const isRefreshing = query.isFetching && !!query.data;
  const normalizedError = query.error ? normalizeAdminAnalyticsError(query.error) : null;

  const widget: WidgetState<AdminDashboardStatsResponse> = {
    key: "kpi",
    data,
    isLoading,
    isRefreshing,
    isError: query.isError,
    isEmpty: !query.isError && !isLoading && isKpiDataEmpty(data),
    error: normalizedError,
  };

  return {
    ...query,
    data,
    widget,
    isInitialLoading: isLoading,
    isStaleWhileRevalidate: isRefreshing,
  };
}

export function useAdminAnalyticsChartDatasetsQuery(
  queryInput: Partial<Pick<AdminDashboardChartsQuery, "range" | "from" | "to">>
) {
  const normalizedQuery = resolveDashboardQuery(queryInput);
  const requestQuery = toChartsRequestQuery(normalizedQuery);
  const isCustomRangeComplete =
    normalizedQuery.range !== "custom" ||
    (normalizedQuery.from.length > 0 && normalizedQuery.to.length > 0);

  const query = useQuery({
    queryKey: adminAnalyticsQueryKeys.chartDatasets(normalizedQuery),
    meta: {
      sentryName: "fetchAdminDashboardCharts",
      sentryEndpoint: "/api/v1/admin/system/dashboard/charts",
    },
    queryFn: ({ signal }) => fetchAdminDashboardCharts(requestQuery, { signal }),
    placeholderData: keepPreviousData,
    staleTime: ANALYTICS_STALE_TIME_MS,
    gcTime: 1000 * 60 * 10,
    refetchInterval: ANALYTICS_REFETCH_INTERVAL_MS,
    refetchOnWindowFocus: true,
    retry: 1,
    enabled: isCustomRangeComplete,
  });

  const data = query.data ?? defaultChartsData;
  const isLoading = isCustomRangeComplete && query.isPending && !query.data;
  const isRefreshing = query.isFetching && !!query.data;
  const normalizedError = query.error ? normalizeAdminAnalyticsError(query.error) : null;

  const widgets = {
    revenueAndOrdersTrend: {
      key: "revenue-orders",
      data: data.revenueAndOrdersTrend,
      isLoading,
      isRefreshing,
      isError: query.isError,
      isEmpty: !query.isError && !isLoading && isRevenueOrdersWidgetEmpty(data),
      error: normalizedError,
    } satisfies WidgetState<AdminDashboardChartsResponse["revenueAndOrdersTrend"]>,
    paymentMethodDistribution: {
      key: "payment-method",
      data: data.paymentMethodDistribution,
      isLoading,
      isRefreshing,
      isError: query.isError,
      isEmpty:
        !query.isError && !isLoading && isDistributionWidgetEmpty(data.paymentMethodDistribution),
      error: normalizedError,
    } satisfies WidgetState<AdminDashboardChartsResponse["paymentMethodDistribution"]>,
    orderStatusDistribution: {
      key: "order-status",
      data: data.orderStatusDistribution,
      isLoading,
      isRefreshing,
      isError: query.isError,
      isEmpty:
        !query.isError && !isLoading && isDistributionWidgetEmpty(data.orderStatusDistribution),
      error: normalizedError,
    } satisfies WidgetState<AdminDashboardChartsResponse["orderStatusDistribution"]>,
    bankTransferSlaTrend: {
      key: "bank-transfer-sla",
      data: data.bankTransferSlaTrend,
      isLoading,
      isRefreshing,
      isError: query.isError,
      isEmpty: !query.isError && !isLoading && isSlaWidgetEmpty(data),
      error: normalizedError,
    } satisfies WidgetState<AdminDashboardChartsResponse["bankTransferSlaTrend"]>,
  };

  return {
    ...query,
    data,
    widgets,
    isInitialLoading: isLoading,
    isStaleWhileRevalidate: isRefreshing,
  };
}

export { normalizeAdminAnalyticsError };
