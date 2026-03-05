import { Module } from "@nestjs/common";
import { AdminResourceCategoriesController } from "./admin-resource-categories.controller.js";
import { AdminResourcesController } from "./admin-resources.controller.js";
import { ResourcesController } from "./resources.controller.js";
import { ResourcesService } from "./resources.service.js";

@Module({
  controllers: [ResourcesController, AdminResourcesController, AdminResourceCategoriesController],
  providers: [ResourcesService],
  exports: [ResourcesService],
})
export class ResourcesModule {}
