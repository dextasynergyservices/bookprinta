import { z } from "zod";
import { AdminDashboardRangeKeySchema } from "./admin-system.schema.ts";

// ─── Query Params ────────────────────────────────────────────────────────────

export const WebAnalyticsQuerySchema = z.object({
  range: AdminDashboardRangeKeySchema.default("30d"),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type WebAnalyticsQuery = z.infer<typeof WebAnalyticsQuerySchema>;

export const WebAnalyticsPagesQuerySchema = WebAnalyticsQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type WebAnalyticsPagesQuery = z.infer<typeof WebAnalyticsPagesQuerySchema>;

// ─── Response Schemas ────────────────────────────────────────────────────────

export const WebAnalyticsOverviewSchema = z.object({
  uniqueVisitors: z.number().min(0),
  totalPageviews: z.number().min(0),
  totalSessions: z.number().min(0),
  avgSessionDuration: z.number().nullable(),
  bounceRate: z.number().nullable(),
  deltaVisitors: z.number().finite().nullable(),
  deltaPageviews: z.number().finite().nullable(),
});
export type WebAnalyticsOverview = z.infer<typeof WebAnalyticsOverviewSchema>;

export const WebPageViewEntrySchema = z.object({
  page: z.string(),
  views: z.number().min(0),
  uniqueVisitors: z.number().min(0),
});
export type WebPageViewEntry = z.infer<typeof WebPageViewEntrySchema>;

export const WebAnalyticsPagesResponseSchema = z.object({
  items: z.array(WebPageViewEntrySchema),
  total: z.number().min(0),
});
export type WebAnalyticsPagesResponse = z.infer<typeof WebAnalyticsPagesResponseSchema>;

export const WebVisitorTrendPointSchema = z.object({
  date: z.string(),
  visitors: z.number().min(0),
  pageviews: z.number().min(0),
  sessions: z.number().min(0),
});
export type WebVisitorTrendPoint = z.infer<typeof WebVisitorTrendPointSchema>;

export const WebAnalyticsVisitorsResponseSchema = z.object({
  points: z.array(WebVisitorTrendPointSchema),
});
export type WebAnalyticsVisitorsResponse = z.infer<typeof WebAnalyticsVisitorsResponseSchema>;

export const WebReferrerEntrySchema = z.object({
  source: z.string(),
  visitors: z.number().min(0),
  percentage: z.number().min(0).max(100),
});
export type WebReferrerEntry = z.infer<typeof WebReferrerEntrySchema>;

export const WebAnalyticsReferrersResponseSchema = z.object({
  items: z.array(WebReferrerEntrySchema),
});
export type WebAnalyticsReferrersResponse = z.infer<typeof WebAnalyticsReferrersResponseSchema>;

export const WebGeoEntrySchema = z.object({
  country: z.string(),
  countryCode: z.string(),
  visitors: z.number().min(0),
  percentage: z.number().min(0).max(100),
});
export type WebGeoEntry = z.infer<typeof WebGeoEntrySchema>;

export const WebAnalyticsGeographyResponseSchema = z.object({
  items: z.array(WebGeoEntrySchema),
});
export type WebAnalyticsGeographyResponse = z.infer<typeof WebAnalyticsGeographyResponseSchema>;

export const WebDeviceEntrySchema = z.object({
  category: z.string(),
  count: z.number().min(0),
  percentage: z.number().min(0).max(100),
});
export type WebDeviceEntry = z.infer<typeof WebDeviceEntrySchema>;

export const WebAnalyticsDevicesResponseSchema = z.object({
  deviceTypes: z.array(WebDeviceEntrySchema),
  browsers: z.array(WebDeviceEntrySchema),
  operatingSystems: z.array(WebDeviceEntrySchema),
});
export type WebAnalyticsDevicesResponse = z.infer<typeof WebAnalyticsDevicesResponseSchema>;

export const WebFunnelStepSchema = z.object({
  step: z.string(),
  count: z.number().min(0),
  percentage: z.number().min(0).max(100),
  dropoff: z.number().min(0).max(100),
});
export type WebFunnelStep = z.infer<typeof WebFunnelStepSchema>;

export const WebAnalyticsFunnelResponseSchema = z.object({
  steps: z.array(WebFunnelStepSchema),
});
export type WebAnalyticsFunnelResponse = z.infer<typeof WebAnalyticsFunnelResponseSchema>;

export const WebCustomEventEntrySchema = z.object({
  event: z.string(),
  count: z.number().min(0),
  uniqueUsers: z.number().min(0),
});
export type WebCustomEventEntry = z.infer<typeof WebCustomEventEntrySchema>;

export const WebAnalyticsCustomEventsResponseSchema = z.object({
  items: z.array(WebCustomEventEntrySchema),
});
export type WebAnalyticsCustomEventsResponse = z.infer<
  typeof WebAnalyticsCustomEventsResponseSchema
>;

// ─── Live Visitors ───────────────────────────────────────────────────────────

export const WebLiveVisitorsSchema = z.object({
  activeVisitors: z.number().min(0),
  queriedAt: z.string().datetime(),
});
export type WebLiveVisitors = z.infer<typeof WebLiveVisitorsSchema>;
