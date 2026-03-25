import { Controller, Get, Header, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard, Roles, RolesGuard, UserRole } from "../auth/index.js";
import {
  WebAnalyticsCustomEventsResponseDto,
  WebAnalyticsDevicesResponseDto,
  WebAnalyticsFunnelResponseDto,
  WebAnalyticsGeographyResponseDto,
  WebAnalyticsOverviewResponseDto,
  WebAnalyticsPagesQueryDto,
  WebAnalyticsPagesResponseDto,
  WebAnalyticsQueryDto,
  WebAnalyticsReferrersResponseDto,
  WebAnalyticsVisitorsResponseDto,
  WebLiveVisitorsResponseDto,
} from "./dto/web-analytics.dto.js";
import { WebAnalyticsService } from "./web-analytics.service.js";

@ApiTags("Admin Analytics")
@Controller("admin/analytics")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@ApiBearerAuth("access-token")
export class WebAnalyticsController {
  constructor(private readonly analyticsService: WebAnalyticsService) {}

  @Get("website/overview")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({ summary: "Website overview KPIs (visitors, pageviews, sessions)" })
  @ApiResponse({ status: 200, type: WebAnalyticsOverviewResponseDto })
  async getOverview(@Query() query: WebAnalyticsQueryDto) {
    return this.analyticsService.getOverview(query);
  }

  @Get("website/pages")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({ summary: "Top pages by views" })
  @ApiResponse({ status: 200, type: WebAnalyticsPagesResponseDto })
  async getTopPages(@Query() query: WebAnalyticsPagesQueryDto) {
    return this.analyticsService.getTopPages(query);
  }

  @Get("website/visitors")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({ summary: "Visitor trend over time (daily or monthly)" })
  @ApiResponse({ status: 200, type: WebAnalyticsVisitorsResponseDto })
  async getVisitorTrend(@Query() query: WebAnalyticsQueryDto) {
    return this.analyticsService.getVisitorTrend(query);
  }

  @Get("website/referrers")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({ summary: "Traffic referrers breakdown" })
  @ApiResponse({ status: 200, type: WebAnalyticsReferrersResponseDto })
  async getReferrers(@Query() query: WebAnalyticsQueryDto) {
    return this.analyticsService.getReferrers(query);
  }

  @Get("website/geography")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({ summary: "Visitor geography breakdown by country" })
  @ApiResponse({ status: 200, type: WebAnalyticsGeographyResponseDto })
  async getGeography(@Query() query: WebAnalyticsQueryDto) {
    return this.analyticsService.getGeography(query);
  }

  @Get("website/devices")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({ summary: "Device types, browsers, and OS breakdown" })
  @ApiResponse({ status: 200, type: WebAnalyticsDevicesResponseDto })
  async getDevices(@Query() query: WebAnalyticsQueryDto) {
    return this.analyticsService.getDevices(query);
  }

  @Get("events/funnel")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({ summary: "Conversion funnel (Landing → Pricing → Checkout → Payment)" })
  @ApiResponse({ status: 200, type: WebAnalyticsFunnelResponseDto })
  async getFunnel(@Query() query: WebAnalyticsQueryDto) {
    return this.analyticsService.getFunnel(query);
  }

  @Get("events/custom")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({ summary: "Custom business event counts" })
  @ApiResponse({ status: 200, type: WebAnalyticsCustomEventsResponseDto })
  async getCustomEvents(@Query() query: WebAnalyticsQueryDto) {
    return this.analyticsService.getCustomEvents(query);
  }

  @Get("website/live")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({ summary: "Live visitors in the last 5 minutes" })
  @ApiResponse({ status: 200, type: WebLiveVisitorsResponseDto })
  async getLiveVisitors() {
    return this.analyticsService.getLiveVisitors();
  }
}
