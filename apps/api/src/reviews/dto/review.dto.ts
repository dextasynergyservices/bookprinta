import {
  AdminDeleteReviewResponseSchema,
  AdminReviewsListQuerySchema,
  AdminReviewsListResponseSchema,
  AdminUpdateReviewResponseSchema,
  AdminUpdateReviewSchema,
  CreateReviewBodySchema,
  CreateReviewResponseSchema,
  MyReviewsResponseSchema,
} from "@bookprinta/shared";
import { createZodDto } from "nestjs-zod";

export class AdminReviewsListQueryDto extends createZodDto(AdminReviewsListQuerySchema) {}

export class AdminReviewsListResponseDto extends createZodDto(AdminReviewsListResponseSchema) {}

export class AdminUpdateReviewDto extends createZodDto(AdminUpdateReviewSchema) {}

export class AdminUpdateReviewResponseDto extends createZodDto(AdminUpdateReviewResponseSchema) {}

export class AdminDeleteReviewResponseDto extends createZodDto(AdminDeleteReviewResponseSchema) {}

export class CreateReviewBodyDto extends createZodDto(CreateReviewBodySchema) {}

export class CreateReviewResponseDto extends createZodDto(CreateReviewResponseSchema) {}

export class MyReviewsResponseZodDto extends createZodDto(MyReviewsResponseSchema) {}
