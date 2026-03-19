import { Module } from "@nestjs/common";
import { AdminShowcaseController } from "./admin-showcase.controller.js";
import { AdminShowcaseService } from "./admin-showcase.service.js";
import { AdminShowcaseCategoriesController } from "./admin-showcase-categories.controller.js";
import { AdminShowcaseUploadService } from "./admin-showcase-upload.service.js";
import { PublicShowcaseService } from "./public-showcase.service.js";
import { ShowcaseController } from "./showcase.controller.js";
import { ShowcaseService } from "./showcase.service.js";

@Module({
  controllers: [ShowcaseController, AdminShowcaseCategoriesController, AdminShowcaseController],
  providers: [
    PublicShowcaseService,
    AdminShowcaseService,
    AdminShowcaseUploadService,
    ShowcaseService,
  ],
  exports: [
    PublicShowcaseService,
    AdminShowcaseService,
    AdminShowcaseUploadService,
    ShowcaseService,
  ],
})
export class ShowcaseModule {}
