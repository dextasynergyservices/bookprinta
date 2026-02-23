import { Module } from "@nestjs/common";
import { AddonsController } from "./addons.controller.js";
import { AddonsService } from "./addons.service.js";

@Module({
  controllers: [AddonsController],
  providers: [AddonsService],
  exports: [AddonsService],
})
export class AddonsModule {}
