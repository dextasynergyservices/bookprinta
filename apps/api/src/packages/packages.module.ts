import { Module } from "@nestjs/common";
import { PackageCategoriesController } from "./package-categories.controller.js";
import { PackagesController } from "./packages.controller.js";
import { PackagesService } from "./packages.service.js";

@Module({
  controllers: [PackageCategoriesController, PackagesController],
  providers: [PackagesService],
  exports: [PackagesService],
})
export class PackagesModule {}
