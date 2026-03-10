import {
  AuthorProfileResponseSchema,
  ShowcaseCategoriesResponseSchema,
  ShowcaseListQuerySchema,
  ShowcaseListResponseSchema,
} from "@bookprinta/shared";
import { createZodDto } from "nestjs-zod";

/** GET /api/v1/showcase?q=&category=&sort=&year=&cursor=&limit=&isFeatured= */
export class ShowcaseListQueryDto extends createZodDto(ShowcaseListQuerySchema) {}

/** Response for GET /api/v1/showcase */
export class ShowcaseListResponseDto extends createZodDto(ShowcaseListResponseSchema) {}

/** Response for GET /api/v1/showcase/categories */
export class ShowcaseCategoriesResponseDto extends createZodDto(ShowcaseCategoriesResponseSchema) {}

/** Response for GET /api/v1/showcase/:id/author */
export class AuthorProfileResponseDto extends createZodDto(AuthorProfileResponseSchema) {}
