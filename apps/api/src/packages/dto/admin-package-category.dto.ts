import {
  AdminCreatePackageCategorySchema,
  AdminDeletePackageCategoryResponseSchema,
  AdminPackageCategorySchema,
  AdminUpdatePackageCategorySchema,
} from "@bookprinta/shared";
import { createZodDto } from "nestjs-zod";

/** GET /api/v1/admin/package-categories */
export class AdminPackageCategoryDto extends createZodDto(AdminPackageCategorySchema) {}

/** POST /api/v1/admin/package-categories */
export class AdminCreatePackageCategoryDto extends createZodDto(AdminCreatePackageCategorySchema) {}

/** PATCH /api/v1/admin/package-categories/:id */
export class AdminUpdatePackageCategoryDto extends createZodDto(AdminUpdatePackageCategorySchema) {}

/** DELETE /api/v1/admin/package-categories/:id */
export class AdminDeletePackageCategoryResponseDto extends createZodDto(
  AdminDeletePackageCategoryResponseSchema
) {}
