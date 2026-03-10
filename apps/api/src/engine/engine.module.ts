import { Module } from "@nestjs/common";
import { GeminiFormattingService } from "./gemini-formatting.service.js";
import { GotenbergPageCountService } from "./gotenberg-page-count.service.js";
import { HtmlValidationService } from "./html-validation.service.js";

@Module({
  providers: [GeminiFormattingService, GotenbergPageCountService, HtmlValidationService],
  exports: [GeminiFormattingService, GotenbergPageCountService, HtmlValidationService],
})
export class EngineModule {}
