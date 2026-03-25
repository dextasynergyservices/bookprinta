import {
  WebAnalyticsCustomEventsResponseSchema,
  WebAnalyticsDevicesResponseSchema,
  WebAnalyticsFunnelResponseSchema,
  WebAnalyticsGeographyResponseSchema,
  WebAnalyticsOverviewSchema,
  WebAnalyticsPagesQuerySchema,
  WebAnalyticsPagesResponseSchema,
  WebAnalyticsQuerySchema,
  WebAnalyticsReferrersResponseSchema,
  WebAnalyticsVisitorsResponseSchema,
  WebLiveVisitorsSchema,
} from "@bookprinta/shared";
import { createZodDto } from "nestjs-zod";

export class WebAnalyticsQueryDto extends createZodDto(WebAnalyticsQuerySchema) {}

export class WebAnalyticsPagesQueryDto extends createZodDto(WebAnalyticsPagesQuerySchema) {}

export class WebAnalyticsOverviewResponseDto extends createZodDto(WebAnalyticsOverviewSchema) {}

export class WebAnalyticsPagesResponseDto extends createZodDto(WebAnalyticsPagesResponseSchema) {}

export class WebAnalyticsVisitorsResponseDto extends createZodDto(
  WebAnalyticsVisitorsResponseSchema
) {}

export class WebAnalyticsReferrersResponseDto extends createZodDto(
  WebAnalyticsReferrersResponseSchema
) {}

export class WebAnalyticsGeographyResponseDto extends createZodDto(
  WebAnalyticsGeographyResponseSchema
) {}

export class WebAnalyticsDevicesResponseDto extends createZodDto(
  WebAnalyticsDevicesResponseSchema
) {}

export class WebAnalyticsFunnelResponseDto extends createZodDto(WebAnalyticsFunnelResponseSchema) {}

export class WebAnalyticsCustomEventsResponseDto extends createZodDto(
  WebAnalyticsCustomEventsResponseSchema
) {}

export class WebLiveVisitorsResponseDto extends createZodDto(WebLiveVisitorsSchema) {}
