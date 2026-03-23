import { Module } from "@nestjs/common";
import { GeminiFormattingService } from "./gemini-formatting.service.js";
import { GotenbergPageCountService } from "./gotenberg-page-count.service.js";
import { HtmlValidationService } from "./html-validation.service.js";
import { ProcessingEventsService } from "./processing-events.service.js";

@Module({
  providers: [
    GeminiFormattingService,
    GotenbergPageCountService,
    HtmlValidationService,
    ProcessingEventsService,
  ],
  exports: [
    GeminiFormattingService,
    GotenbergPageCountService,
    HtmlValidationService,
    ProcessingEventsService,
  ],
})
export class EngineModule {}
