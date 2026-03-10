import { Module } from "@nestjs/common";
import { RolloutModule } from "../rollout/rollout.module.js";
import { HealthController } from "./health.controller.js";
import { HealthService } from "./health.service.js";
import { QueueAdminService } from "./queue-admin.service.js";
import { RuntimeTelemetryService } from "./runtime-telemetry.service.js";

@Module({
  imports: [RolloutModule],
  controllers: [HealthController],
  providers: [HealthService, QueueAdminService, RuntimeTelemetryService],
  exports: [RuntimeTelemetryService],
})
export class HealthModule {}
