import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard, UserRole } from "../auth/index.js";
import { AdminDashboardAnalyticsService } from "./admin-dashboard-analytics.service.js";
import { AdminSystemLogsService } from "./admin-system-logs.service.js";
import { AdminSystemSettingsService } from "./admin-system-settings.service.js";
import {
  AdminAuditLogsQueryDto,
  AdminAuditLogsResponseDto,
  AdminDashboardChartsQueryDto,
  AdminDashboardChartsResponseDto,
  AdminDashboardStatsQueryDto,
  AdminDashboardStatsResponseDto,
  AdminErrorLogActionBodyDto,
  AdminErrorLogActionResponseDto,
  AdminErrorLogsQueryDto,
  AdminErrorLogsResponseDto,
  AdminSystemPaymentGatewayDto,
  AdminSystemPaymentGatewayListResponseDto,
  AdminSystemSettingListItemDto,
  AdminSystemSettingsListResponseDto,
  AdminSystemUpdatePaymentGatewayBodyDto,
  AdminSystemUpdateSettingBodyDto,
} from "./dto/admin-system.dto.js";
import {
  ProductionDelayStatusResponseDto,
  UpdateProductionDelayBodyDto,
} from "./dto/production-delay.dto.js";
import { ProductionDelayAdminService } from "./production-delay-admin.service.js";

// ──────────────────────────────────────────────────────────────────────
// ADMIN_SETTINGS_MUTATION_THROTTLE
// Rate limits for critical admin operations (settings + payment gateways).
// Admin save flows can emit multiple PATCH requests in a short burst
// (for example, one request per setting field), so this allows operational
// batch saves while still enforcing abuse protection.
// ──────────────────────────────────────────────────────────────────────
const ADMIN_SETTINGS_MUTATION_THROTTLE = {
  short: { limit: 30, ttl: 60_000 },
  long: { limit: 180, ttl: 3_600_000 },
};

@ApiTags("Admin System")
@Controller("admin/system")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@ApiBearerAuth("access-token")
export class AdminSystemController {
  constructor(
    private readonly productionDelayAdminService: ProductionDelayAdminService,
    private readonly adminSystemSettingsService: AdminSystemSettingsService,
    private readonly adminSystemLogsService: AdminSystemLogsService,
    private readonly adminDashboardAnalyticsService: AdminDashboardAnalyticsService
  ) {}

  @Get("dashboard/stats")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Get admin dashboard KPI stats",
    description:
      "Returns KPI totals for orders, revenue, active production books, pending bank transfers, delta trends, and SLA-at-risk transfer counts.",
  })
  @ApiResponse({
    status: 200,
    description: "Dashboard stats retrieved successfully",
    type: AdminDashboardStatsResponseDto,
  })
  async getDashboardStats(
    @Query() query: AdminDashboardStatsQueryDto
  ): Promise<AdminDashboardStatsResponseDto> {
    return this.adminDashboardAnalyticsService.getDashboardStats(query);
  }

  @Get("dashboard/charts")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Get admin dashboard chart datasets",
    description:
      "Returns chart-ready datasets for revenue/orders trend, payment provider distribution, order status distribution, and bank-transfer SLA trend.",
  })
  @ApiResponse({
    status: 200,
    description: "Dashboard charts retrieved successfully",
    type: AdminDashboardChartsResponseDto,
  })
  async getDashboardCharts(
    @Query() query: AdminDashboardChartsQueryDto
  ): Promise<AdminDashboardChartsResponseDto> {
    return this.adminDashboardAnalyticsService.getDashboardCharts(query);
  }

  @Get("audit-logs")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "List admin audit logs",
    description:
      "Returns audited admin actions with filters for action, actor, entity scope, date range, and keyword search.",
  })
  @ApiResponse({
    status: 200,
    description: "Audit logs retrieved successfully",
    type: AdminAuditLogsResponseDto,
  })
  async getAuditLogs(@Query() query: AdminAuditLogsQueryDto): Promise<AdminAuditLogsResponseDto> {
    return this.adminSystemLogsService.listAuditLogs(query);
  }

  @Get("error-logs")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "List normalized system error logs",
    description:
      "Returns normalized error streams from local structured events and Sentry issue feeds with status/ownership overlays.",
  })
  @ApiResponse({
    status: 200,
    description: "Error logs retrieved successfully",
    type: AdminErrorLogsResponseDto,
  })
  async getErrorLogs(@Query() query: AdminErrorLogsQueryDto): Promise<AdminErrorLogsResponseDto> {
    return this.adminSystemLogsService.listErrorLogs(query);
  }

  @Patch("error-logs/:id")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Apply admin action to an error log",
    description:
      "Applies acknowledge, assign owner, resolve, or note actions and persists the operational state for the referenced fingerprint.",
  })
  @ApiResponse({
    status: 200,
    description: "Error-log action applied successfully",
    type: AdminErrorLogActionResponseDto,
  })
  async applyErrorLogAction(
    @Param("id") id: string,
    @Body() body: AdminErrorLogActionBodyDto,
    @CurrentUser("sub") adminId: string
  ): Promise<AdminErrorLogActionResponseDto> {
    return this.adminSystemLogsService.applyErrorLogAction(id, body, adminId);
  }

  @Get("payment-gateways")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "List payment gateways for admin system settings",
    description:
      "Returns all configured payment gateways with enabled/test mode states, priority, and masked credential metadata.",
  })
  @ApiResponse({
    status: 200,
    description: "Payment gateways retrieved successfully",
    type: AdminSystemPaymentGatewayListResponseDto,
  })
  async getPaymentGateways(): Promise<AdminSystemPaymentGatewayListResponseDto> {
    return this.adminSystemSettingsService.getPaymentGateways();
  }

  @Patch("payment-gateways/:id")
  @Throttle(ADMIN_SETTINGS_MUTATION_THROTTLE)
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Update payment gateway configuration",
    description:
      "Updates gateway enabled/test mode flags, priority, optional operational metadata, and credential values without exposing plaintext secrets in responses.",
  })
  @ApiResponse({
    status: 200,
    description: "Payment gateway updated successfully",
    type: AdminSystemPaymentGatewayDto,
  })
  @ApiResponse({ status: 400, description: "Invalid gateway update payload" })
  @ApiResponse({ status: 404, description: "Payment gateway not found" })
  async updatePaymentGateway(
    @Param("id") paymentGatewayId: string,
    @Body() body: AdminSystemUpdatePaymentGatewayBodyDto,
    @CurrentUser("sub") adminId: string,
    @CurrentUser("role") adminRole: string,
    @Req() request: Request
  ): Promise<AdminSystemPaymentGatewayDto> {
    return this.adminSystemSettingsService.updatePaymentGateway(paymentGatewayId, body, {
      adminId,
      adminRole,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"],
    });
  }

  @Get("settings")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "List admin system settings",
    description:
      "Returns all supported admin system settings grouped by category with typed values and role/sensitivity metadata.",
  })
  @ApiResponse({
    status: 200,
    description: "System settings retrieved successfully",
    type: AdminSystemSettingsListResponseDto,
  })
  async getSettings(): Promise<AdminSystemSettingsListResponseDto> {
    return this.adminSystemSettingsService.getSettings();
  }

  @Patch("settings/:key")
  @Throttle(ADMIN_SETTINGS_MUTATION_THROTTLE)
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Update a single admin system setting",
    description:
      "Updates one setting key with type-aware coercion and validation, role locks for high-risk keys, and audit logging for successful mutations.",
  })
  @ApiResponse({
    status: 200,
    description: "System setting updated successfully",
    type: AdminSystemSettingListItemDto,
  })
  @ApiResponse({ status: 400, description: "Invalid setting update payload" })
  @ApiResponse({ status: 403, description: "Forbidden — role cannot update this setting" })
  async updateSetting(
    @Param("key") key: string,
    @Body() body: AdminSystemUpdateSettingBodyDto,
    @CurrentUser("sub") adminId: string,
    @CurrentUser("role") adminRole: string,
    @Req() request: Request
  ): Promise<AdminSystemSettingListItemDto> {
    return this.adminSystemSettingsService.updateSetting(key, body, {
      adminId,
      adminRole,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"],
    });
  }

  @Get("production-status")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Get production delay status",
    description:
      "Returns the resolved production backlog status for admin tooling, including the " +
      "current threshold, backlog count, affected-user count, effective delay state, and active event snapshot.",
  })
  @ApiResponse({
    status: 200,
    description: "Production delay status retrieved successfully",
    type: ProductionDelayStatusResponseDto,
  })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  @ApiResponse({ status: 403, description: "Forbidden — admin role required" })
  async getProductionStatus(): Promise<ProductionDelayStatusResponseDto> {
    return this.productionDelayAdminService.getProductionStatus();
  }

  @Post("production-delay")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Set production delay override state",
    description:
      "Manually forces the production delay active, forces it inactive, or returns control " +
      "to automatic threshold evaluation using the shared production-delay monitor path.",
  })
  @ApiResponse({
    status: 200,
    description: "Production delay override applied successfully",
    type: ProductionDelayStatusResponseDto,
  })
  @ApiResponse({ status: 400, description: "Invalid override state or notes payload" })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  @ApiResponse({ status: 403, description: "Forbidden — admin role required" })
  async updateProductionDelay(
    @CurrentUser("sub") adminId: string,
    @Body() body: UpdateProductionDelayBodyDto
  ): Promise<ProductionDelayStatusResponseDto> {
    return this.productionDelayAdminService.updateProductionDelayOverride(adminId, body);
  }
}
