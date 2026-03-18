import { Module } from "@nestjs/common";
import { AdminPackageCategoriesController } from "./admin-package-categories.controller.js";
import { AdminPackagesController } from "./admin-packages.controller.js";
import { PackageCategoriesController } from "./package-categories.controller.js";
import { PackagesController } from "./packages.controller.js";
import { PackagesService } from "./packages.service.js";

@Module({
  controllers: [
    AdminPackageCategoriesController,
    AdminPackagesController,
    PackageCategoriesController,
    PackagesController,
  ],
  providers: [PackagesService],
  exports: [PackagesService],
})
export class PackagesModule {}
