import type {
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
import { fetchApiV1WithRefresh } from "@/lib/fetch-with-refresh";

function buildParams(query: WebAnalyticsQuery & { limit?: number }): URLSearchParams {
  const params = new URLSearchParams();
  if (query.range) params.set("range", query.range);
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (query.limit) params.set("limit", String(query.limit));
  return params;
}

async function fetchWebAnalytics<T>(
  path: string,
  query: WebAnalyticsQuery & { limit?: number },
  signal?: AbortSignal
): Promise<T> {
  const params = buildParams(query);
  const response = await fetchApiV1WithRefresh(`/admin/analytics${path}?${params.toString()}`, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message =
      typeof payload?.message === "string"
        ? payload.message
        : `Failed to load analytics (${response.status})`;
    throw new Error(message);
  }

  return (await response.json()) as T;
}

export function fetchWebOverview(query: WebAnalyticsQuery, signal?: AbortSignal) {
  return fetchWebAnalytics<WebAnalyticsOverview>("/website/overview", query, signal);
}

export function fetchWebPages(query: WebAnalyticsQuery & { limit?: number }, signal?: AbortSignal) {
  return fetchWebAnalytics<WebAnalyticsPagesResponse>("/website/pages", query, signal);
}

export function fetchWebVisitors(query: WebAnalyticsQuery, signal?: AbortSignal) {
  return fetchWebAnalytics<WebAnalyticsVisitorsResponse>("/website/visitors", query, signal);
}

export function fetchWebReferrers(query: WebAnalyticsQuery, signal?: AbortSignal) {
  return fetchWebAnalytics<WebAnalyticsReferrersResponse>("/website/referrers", query, signal);
}

export function fetchWebGeography(query: WebAnalyticsQuery, signal?: AbortSignal) {
  return fetchWebAnalytics<WebAnalyticsGeographyResponse>("/website/geography", query, signal);
}

export function fetchWebDevices(query: WebAnalyticsQuery, signal?: AbortSignal) {
  return fetchWebAnalytics<WebAnalyticsDevicesResponse>("/website/devices", query, signal);
}

export function fetchWebFunnel(query: WebAnalyticsQuery, signal?: AbortSignal) {
  return fetchWebAnalytics<WebAnalyticsFunnelResponse>("/events/funnel", query, signal);
}

export function fetchWebCustomEvents(query: WebAnalyticsQuery, signal?: AbortSignal) {
  return fetchWebAnalytics<WebAnalyticsCustomEventsResponse>("/events/custom", query, signal);
}

export async function fetchWebLiveVisitors(signal?: AbortSignal): Promise<WebLiveVisitors> {
  const response = await fetchApiV1WithRefresh("/admin/analytics/website/live", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message =
      typeof payload?.message === "string"
        ? payload.message
        : `Failed to load live visitors (${response.status})`;
    throw new Error(message);
  }

  return (await response.json()) as WebLiveVisitors;
}
