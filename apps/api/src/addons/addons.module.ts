import { Module } from "@nestjs/common";
import { RedisModule } from "../redis/redis.module.js";
import { AddonsController } from "./addons.controller.js";
import { AddonsService } from "./addons.service.js";
import { AdminAddonsController } from "./admin-addons.controller.js";

@Module({
  imports: [RedisModule],
  controllers: [AddonsController, AdminAddonsController],
  providers: [AddonsService],
  exports: [AddonsService],
})
export class AddonsModule {}
