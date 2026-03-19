import {
  AdminCreateShowcaseCategorySchema,
  AdminDeleteShowcaseCategoryResponseSchema,
  AdminShowcaseCategoriesListResponseSchema,
  AdminShowcaseCategorySchema,
  AdminUpdateShowcaseCategorySchema,
} from "@bookprinta/shared";
import { createZodDto } from "nestjs-zod";

/** Response item for admin showcase categories */
export class AdminShowcaseCategoryDto extends createZodDto(AdminShowcaseCategorySchema) {}

/** GET /api/v1/admin/showcase-categories */
export class AdminShowcaseCategoriesListResponseDto extends createZodDto(
  AdminShowcaseCategoriesListResponseSchema
) {}

/** POST /api/v1/admin/showcase-categories */
export class AdminCreateShowcaseCategoryDto extends createZodDto(
  AdminCreateShowcaseCategorySchema
) {}

/** PATCH /api/v1/admin/showcase-categories/:id */
export class AdminUpdateShowcaseCategoryDto extends createZodDto(
  AdminUpdateShowcaseCategorySchema
) {}

/** DELETE /api/v1/admin/showcase-categories/:id */
export class AdminDeleteShowcaseCategoryResponseDto extends createZodDto(
  AdminDeleteShowcaseCategoryResponseSchema
) {}
