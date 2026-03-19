import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { AdminDashboardAnalyticsService } from "./admin-dashboard-analytics.service.js";
import { AdminSystemController } from "./admin-system.controller.js";
import { AdminSystemLogsService } from "./admin-system-logs.service.js";
import { AdminSystemSettingsService } from "./admin-system-settings.service.js";
import { ProductionDelayService } from "./production-delay.service.js";
import { ProductionDelayAdminService } from "./production-delay-admin.service.js";
import { ProductionDelayDeliveryService } from "./production-delay-delivery.service.js";
import { ProductionDelayMonitorService } from "./production-delay-monitor.service.js";
import { PublicSystemSettingsController } from "./public-system-settings.controller.js";

@Module({
  imports: [NotificationsModule],
  controllers: [AdminSystemController, PublicSystemSettingsController],
  providers: [
    ProductionDelayService,
    AdminSystemSettingsService,
    AdminSystemLogsService,
    AdminDashboardAnalyticsService,
    ProductionDelayAdminService,
    ProductionDelayDeliveryService,
    ProductionDelayMonitorService,
  ],
  exports: [
    ProductionDelayService,
    AdminSystemSettingsService,
    AdminSystemLogsService,
    AdminDashboardAnalyticsService,
    ProductionDelayAdminService,
    ProductionDelayDeliveryService,
    ProductionDelayMonitorService,
  ],
})
export class ProductionDelayModule {}
