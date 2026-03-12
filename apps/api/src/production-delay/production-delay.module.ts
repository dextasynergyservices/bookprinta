import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { AdminSystemController } from "./admin-system.controller.js";
import { ProductionDelayService } from "./production-delay.service.js";
import { ProductionDelayAdminService } from "./production-delay-admin.service.js";
import { ProductionDelayDeliveryService } from "./production-delay-delivery.service.js";
import { ProductionDelayMonitorService } from "./production-delay-monitor.service.js";

@Module({
  imports: [NotificationsModule],
  controllers: [AdminSystemController],
  providers: [
    ProductionDelayService,
    ProductionDelayAdminService,
    ProductionDelayDeliveryService,
    ProductionDelayMonitorService,
  ],
  exports: [
    ProductionDelayService,
    ProductionDelayAdminService,
    ProductionDelayDeliveryService,
    ProductionDelayMonitorService,
  ],
})
export class ProductionDelayModule {}
