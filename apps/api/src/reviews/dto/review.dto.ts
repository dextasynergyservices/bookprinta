import {
  CreateReviewBodySchema,
  CreateReviewResponseSchema,
  MyReviewsResponseSchema,
} from "@bookprinta/shared";
import { createZodDto } from "nestjs-zod";

export class CreateReviewBodyDto extends createZodDto(CreateReviewBodySchema) {}

export class CreateReviewResponseDto extends createZodDto(CreateReviewResponseSchema) {}

export class MyReviewsResponseZodDto extends createZodDto(MyReviewsResponseSchema) {}
