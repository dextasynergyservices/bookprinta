import { Module } from "@nestjs/common";
import { ShowcaseController } from "./showcase.controller.js";
import { ShowcaseService } from "./showcase.service.js";

@Module({
  controllers: [ShowcaseController],
  providers: [ShowcaseService],
  exports: [ShowcaseService],
})
export class ShowcaseModule {}
