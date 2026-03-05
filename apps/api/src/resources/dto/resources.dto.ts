import {
  AdminCreateResourceCategorySchema,
  AdminCreateResourceSchema,
  AdminDeleteResourceCategoryResponseSchema,
  AdminDeleteResourceResponseSchema,
  AdminResourceCategoryResponseSchema,
  AdminResourceDetailSchema,
  AdminResourcesListQuerySchema,
  AdminResourcesListResponseSchema,
  AdminUpdateResourceCategorySchema,
  AdminUpdateResourceSchema,
  PublicResourceCategoriesResponseSchema,
  PublicResourceDetailResponseSchema,
  PublicResourcesListQuerySchema,
  PublicResourcesListResponseSchema,
} from "@bookprinta/shared";
import { createZodDto } from "nestjs-zod";

/** GET /api/v1/resources?category=&cursor=&limit= */
export class PublicResourcesListQueryDto extends createZodDto(PublicResourcesListQuerySchema) {}

/** Response for GET /api/v1/resources */
export class PublicResourcesListResponseDto extends createZodDto(
  PublicResourcesListResponseSchema
) {}

/** Response for GET /api/v1/resources/categories */
export class PublicResourceCategoriesResponseDto extends createZodDto(
  PublicResourceCategoriesResponseSchema
) {}

/** Response for GET /api/v1/resources/:slug */
export class PublicResourceDetailResponseDto extends createZodDto(
  PublicResourceDetailResponseSchema
) {}

/** GET /api/v1/admin/resources?cursor=&limit=&q=&categoryId=&isPublished= */
export class AdminResourcesListQueryDto extends createZodDto(AdminResourcesListQuerySchema) {}

/** Response for GET /api/v1/admin/resources */
export class AdminResourcesListResponseDto extends createZodDto(AdminResourcesListResponseSchema) {}

/** POST /api/v1/admin/resources */
export class AdminCreateResourceDto extends createZodDto(AdminCreateResourceSchema) {}

/** PATCH /api/v1/admin/resources/:id */
export class AdminUpdateResourceDto extends createZodDto(AdminUpdateResourceSchema) {}

/** Response for POST/PATCH /api/v1/admin/resources/:id */
export class AdminResourceDetailDto extends createZodDto(AdminResourceDetailSchema) {}

/** Response for DELETE /api/v1/admin/resources/:id */
export class AdminDeleteResourceResponseDto extends createZodDto(
  AdminDeleteResourceResponseSchema
) {}

/** POST /api/v1/admin/resource-categories */
export class AdminCreateResourceCategoryDto extends createZodDto(
  AdminCreateResourceCategorySchema
) {}

/** PATCH /api/v1/admin/resource-categories/:id */
export class AdminUpdateResourceCategoryDto extends createZodDto(
  AdminUpdateResourceCategorySchema
) {}

/** Response for GET/POST/PATCH /api/v1/admin/resource-categories */
export class AdminResourceCategoryResponseDto extends createZodDto(
  AdminResourceCategoryResponseSchema
) {}

/** Response for DELETE /api/v1/admin/resource-categories/:id */
export class AdminDeleteResourceCategoryResponseDto extends createZodDto(
  AdminDeleteResourceCategoryResponseSchema
) {}
