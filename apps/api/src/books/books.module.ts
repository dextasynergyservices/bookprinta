import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { MulterModule } from "@nestjs/platform-express";
import { MAX_FILE_SIZE_BYTES } from "../cloudinary/cloudinary.service.js";
import { FilesModule } from "../files/files.module.js";
import {
  QUEUE_AI_FORMATTING,
  QUEUE_PAGE_COUNT,
  QUEUE_PDF_GENERATION,
} from "../jobs/jobs.constants.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { RolloutModule } from "../rollout/rollout.module.js";
import { AdminBooksController } from "./admin-books.controller.js";
import { BooksController } from "./books.controller.js";
import { BooksService } from "./books.service.js";
import { BooksPipelineService } from "./books-pipeline.service.js";
import { ManuscriptAnalysisService } from "./manuscript-analysis.service.js";

@Module({
  imports: [
    MulterModule.register({
      limits: {
        fileSize: MAX_FILE_SIZE_BYTES,
      },
    }),
    BullModule.registerQueue(
      { name: QUEUE_AI_FORMATTING },
      { name: QUEUE_PAGE_COUNT },
      { name: QUEUE_PDF_GENERATION }
    ),
    FilesModule,
    NotificationsModule,
    RolloutModule,
  ],
  controllers: [BooksController, AdminBooksController],
  providers: [BooksService, BooksPipelineService, ManuscriptAnalysisService],
  exports: [BooksService, BooksPipelineService, ManuscriptAnalysisService],
})
export class BooksModule {}
