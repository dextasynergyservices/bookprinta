import { Module } from "@nestjs/common";
import { RolloutModule } from "../rollout/rollout.module.js";
import { HealthController } from "./health.controller.js";
import { HealthService } from "./health.service.js";

@Module({
  imports: [RolloutModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
