"use client";

import type {
  AdminDashboardRangeKey,
  WebAnalyticsCustomEventsResponse,
  WebAnalyticsDevicesResponse,
  WebAnalyticsFunnelResponse,
  WebAnalyticsGeographyResponse,
  WebAnalyticsOverview,
  WebAnalyticsPagesResponse,
  WebAnalyticsQuery,
  WebAnalyticsReferrersResponse,
  WebAnalyticsVisitorsResponse,
  WebLiveVisitors,
} from "@bookprinta/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  fetchWebCustomEvents,
  fetchWebDevices,
  fetchWebFunnel,
  fetchWebGeography,
  fetchWebLiveVisitors,
  fetchWebOverview,
  fetchWebPages,
  fetchWebReferrers,
  fetchWebVisitors,
} from "@/lib/api/web-analytics";

const STALE_MS = 30_000;
const REFETCH_MS = 60_000;

type ResolvedQuery = { range: AdminDashboardRangeKey; from: string; to: string };

function resolveQuery(
  input: Partial<Pick<WebAnalyticsQuery, "range" | "from" | "to">>
): ResolvedQuery {
  return {
    range: input.range ?? "30d",
    from: input.from?.trim() ?? "",
    to: input.to?.trim() ?? "",
  };
}

function toApiQuery(q: ResolvedQuery): WebAnalyticsQuery {
  return {
    range: q.range,
    ...(q.from ? { from: q.from } : {}),
    ...(q.to ? { to: q.to } : {}),
  };
}

function isEnabled(q: ResolvedQuery): boolean {
  return q.range !== "custom" || (q.from.length > 0 && q.to.length > 0);
}

const BASE_KEY = ["admin", "web-analytics"] as const;

const keys = {
  all: BASE_KEY,
  overview: (q: ResolvedQuery) => [...BASE_KEY, "overview", q.range, q.from, q.to] as const,
  pages: (q: ResolvedQuery, limit: number) =>
    [...BASE_KEY, "pages", q.range, q.from, q.to, limit] as const,
  visitors: (q: ResolvedQuery) => [...BASE_KEY, "visitors", q.range, q.from, q.to] as const,
  referrers: (q: ResolvedQuery) => [...BASE_KEY, "referrers", q.range, q.from, q.to] as const,
  geography: (q: ResolvedQuery) => [...BASE_KEY, "geography", q.range, q.from, q.to] as const,
  devices: (q: ResolvedQuery) => [...BASE_KEY, "devices", q.range, q.from, q.to] as const,
  funnel: (q: ResolvedQuery) => [...BASE_KEY, "funnel", q.range, q.from, q.to] as const,
  customEvents: (q: ResolvedQuery) =>
    [...BASE_KEY, "custom-events", q.range, q.from, q.to] as const,
  liveVisitors: [...BASE_KEY, "live"] as const,
};

const queryDefaults = {
  placeholderData: keepPreviousData,
  staleTime: STALE_MS,
  gcTime: 600_000,
  refetchInterval: REFETCH_MS,
  refetchOnWindowFocus: true,
  retry: 1,
} as const;

export function useWebOverview(input: Partial<Pick<WebAnalyticsQuery, "range" | "from" | "to">>) {
  const q = resolveQuery(input);
  const api = toApiQuery(q);
  return useQuery<WebAnalyticsOverview>({
    queryKey: keys.overview(q),
    queryFn: ({ signal }) => fetchWebOverview(api, signal),
    enabled: isEnabled(q),
    ...queryDefaults,
  });
}

export function useWebPages(
  input: Partial<Pick<WebAnalyticsQuery, "range" | "from" | "to">>,
  limit = 10
) {
  const q = resolveQuery(input);
  const api = toApiQuery(q);
  return useQuery<WebAnalyticsPagesResponse>({
    queryKey: keys.pages(q, limit),
    queryFn: ({ signal }) => fetchWebPages({ ...api, limit }, signal),
    enabled: isEnabled(q),
    ...queryDefaults,
  });
}

export function useWebVisitors(input: Partial<Pick<WebAnalyticsQuery, "range" | "from" | "to">>) {
  const q = resolveQuery(input);
  const api = toApiQuery(q);
  return useQuery<WebAnalyticsVisitorsResponse>({
    queryKey: keys.visitors(q),
    queryFn: ({ signal }) => fetchWebVisitors(api, signal),
    enabled: isEnabled(q),
    ...queryDefaults,
  });
}

export function useWebReferrers(input: Partial<Pick<WebAnalyticsQuery, "range" | "from" | "to">>) {
  const q = resolveQuery(input);
  const api = toApiQuery(q);
  return useQuery<WebAnalyticsReferrersResponse>({
    queryKey: keys.referrers(q),
    queryFn: ({ signal }) => fetchWebReferrers(api, signal),
    enabled: isEnabled(q),
    ...queryDefaults,
  });
}

export function useWebGeography(input: Partial<Pick<WebAnalyticsQuery, "range" | "from" | "to">>) {
  const q = resolveQuery(input);
  const api = toApiQuery(q);
  return useQuery<WebAnalyticsGeographyResponse>({
    queryKey: keys.geography(q),
    queryFn: ({ signal }) => fetchWebGeography(api, signal),
    enabled: isEnabled(q),
    ...queryDefaults,
  });
}

export function useWebDevices(input: Partial<Pick<WebAnalyticsQuery, "range" | "from" | "to">>) {
  const q = resolveQuery(input);
  const api = toApiQuery(q);
  return useQuery<WebAnalyticsDevicesResponse>({
    queryKey: keys.devices(q),
    queryFn: ({ signal }) => fetchWebDevices(api, signal),
    enabled: isEnabled(q),
    ...queryDefaults,
  });
}

export function useWebFunnel(input: Partial<Pick<WebAnalyticsQuery, "range" | "from" | "to">>) {
  const q = resolveQuery(input);
  const api = toApiQuery(q);
  return useQuery<WebAnalyticsFunnelResponse>({
    queryKey: keys.funnel(q),
    queryFn: ({ signal }) => fetchWebFunnel(api, signal),
    enabled: isEnabled(q),
    ...queryDefaults,
  });
}

export function useWebCustomEvents(
  input: Partial<Pick<WebAnalyticsQuery, "range" | "from" | "to">>
) {
  const q = resolveQuery(input);
  const api = toApiQuery(q);
  return useQuery<WebAnalyticsCustomEventsResponse>({
    queryKey: keys.customEvents(q),
    queryFn: ({ signal }) => fetchWebCustomEvents(api, signal),
    enabled: isEnabled(q),
    ...queryDefaults,
  });
}

export function useWebLiveVisitors() {
  return useQuery<WebLiveVisitors>({
    queryKey: keys.liveVisitors,
    queryFn: ({ signal }) => fetchWebLiveVisitors(signal),
    staleTime: 15_000,
    gcTime: 60_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}
