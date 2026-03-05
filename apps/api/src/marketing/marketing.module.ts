import { Module } from "@nestjs/common";
import { MarketingController } from "./marketing.controller.js";
import { MarketingService } from "./marketing.service.js";

@Module({
  controllers: [MarketingController],
  providers: [MarketingService],
  exports: [MarketingService],
})
export class MarketingModule {}
