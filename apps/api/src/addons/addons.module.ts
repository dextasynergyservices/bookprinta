import { Module } from "@nestjs/common";
import { AddonsController } from "./addons.controller.js";
import { AddonsService } from "./addons.service.js";
import { AdminAddonsController } from "./admin-addons.controller.js";

@Module({
  controllers: [AddonsController, AdminAddonsController],
  providers: [AddonsService],
  exports: [AddonsService],
})
export class AddonsModule {}
