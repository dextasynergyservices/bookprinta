import { BookDetailResponseSchema, BookParamsSchema } from "@bookprinta/shared";
import { createZodDto } from "nestjs-zod";

/** :id route param for /books/:id */
export class BookParamsDto extends createZodDto(BookParamsSchema) {}

/** Response for GET /api/v1/books/:id */
export class BookDetailResponseDto extends createZodDto(BookDetailResponseSchema) {}
