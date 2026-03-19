import {
  AdminAuditLogsQuerySchema,
  AdminAuditLogsResponseSchema,
  AdminDashboardChartsQuerySchema,
  AdminDashboardChartsResponseSchema,
  AdminDashboardStatsQuerySchema,
  AdminDashboardStatsResponseSchema,
  AdminErrorLogActionBodySchema,
  AdminErrorLogActionResponseSchema,
  AdminErrorLogsQuerySchema,
  AdminErrorLogsResponseSchema,
  AdminPublicMarketingSettingsResponseSchema,
  AdminSystemPaymentGatewayListResponseSchema,
  AdminSystemPaymentGatewaySchema,
  AdminSystemSettingListItemSchema,
  AdminSystemSettingsListResponseSchema,
  AdminSystemUpdatePaymentGatewayBodySchema,
  AdminSystemUpdateSettingBodySchema,
} from "@bookprinta/shared";
import { createZodDto } from "nestjs-zod";

export class AdminSystemPaymentGatewayListResponseDto extends createZodDto(
  AdminSystemPaymentGatewayListResponseSchema
) {}

export class AdminSystemPaymentGatewayDto extends createZodDto(AdminSystemPaymentGatewaySchema) {}

export class AdminSystemUpdatePaymentGatewayBodyDto extends createZodDto(
  AdminSystemUpdatePaymentGatewayBodySchema
) {}

export class AdminSystemSettingsListResponseDto extends createZodDto(
  AdminSystemSettingsListResponseSchema
) {}

export class AdminSystemSettingListItemDto extends createZodDto(AdminSystemSettingListItemSchema) {}

export class AdminSystemUpdateSettingBodyDto extends createZodDto(
  AdminSystemUpdateSettingBodySchema
) {}

export class AdminPublicMarketingSettingsResponseDto extends createZodDto(
  AdminPublicMarketingSettingsResponseSchema
) {}

export class AdminAuditLogsQueryDto extends createZodDto(AdminAuditLogsQuerySchema) {}

export class AdminAuditLogsResponseDto extends createZodDto(AdminAuditLogsResponseSchema) {}

export class AdminErrorLogsQueryDto extends createZodDto(AdminErrorLogsQuerySchema) {}

export class AdminErrorLogsResponseDto extends createZodDto(AdminErrorLogsResponseSchema) {}

export class AdminErrorLogActionBodyDto extends createZodDto(AdminErrorLogActionBodySchema) {}

export class AdminErrorLogActionResponseDto extends createZodDto(
  AdminErrorLogActionResponseSchema
) {}

export class AdminDashboardStatsQueryDto extends createZodDto(AdminDashboardStatsQuerySchema) {}

export class AdminDashboardStatsResponseDto extends createZodDto(
  AdminDashboardStatsResponseSchema
) {}

export class AdminDashboardChartsQueryDto extends createZodDto(AdminDashboardChartsQuerySchema) {}

export class AdminDashboardChartsResponseDto extends createZodDto(
  AdminDashboardChartsResponseSchema
) {}
