import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { AdminDashboardAnalyticsService } from "./admin-dashboard-analytics.service.js";
import { AdminQueueStatsService } from "./admin-queue-stats.service.js";
import { AdminSystemController } from "./admin-system.controller.js";
import { AdminSystemLogsService } from "./admin-system-logs.service.js";
import { AdminSystemSettingsService } from "./admin-system-settings.service.js";
import { ProductionDelayService } from "./production-delay.service.js";
import { ProductionDelayAdminService } from "./production-delay-admin.service.js";
import { ProductionDelayDeliveryService } from "./production-delay-delivery.service.js";
import { ProductionDelayMonitorService } from "./production-delay-monitor.service.js";
import { PublicSystemSettingsController } from "./public-system-settings.controller.js";
import { SystemSettingsCacheService } from "./system-settings-cache.service.js";

@Module({
  imports: [NotificationsModule],
  controllers: [AdminSystemController, PublicSystemSettingsController],
  providers: [
    SystemSettingsCacheService,
    ProductionDelayService,
    AdminSystemSettingsService,
    AdminSystemLogsService,
    AdminDashboardAnalyticsService,
    AdminQueueStatsService,
    ProductionDelayAdminService,
    ProductionDelayDeliveryService,
    ProductionDelayMonitorService,
  ],
  exports: [
    SystemSettingsCacheService,
    ProductionDelayService,
    AdminSystemSettingsService,
    AdminSystemLogsService,
    AdminDashboardAnalyticsService,
    AdminQueueStatsService,
    ProductionDelayAdminService,
    ProductionDelayDeliveryService,
    ProductionDelayMonitorService,
  ],
})
export class ProductionDelayModule {}
