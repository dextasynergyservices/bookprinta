import { HttpModule } from "@nestjs/axios";
import { Module } from "@nestjs/common";
import { WebAnalyticsController } from "./web-analytics.controller.js";
import { WebAnalyticsService } from "./web-analytics.service.js";

@Module({
  imports: [
    HttpModule.register({
      timeout: 20_000,
      maxRedirects: 0,
    }),
  ],
  controllers: [WebAnalyticsController],
  providers: [WebAnalyticsService],
})
export class AnalyticsModule {}
