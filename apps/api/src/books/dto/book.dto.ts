import {
  AdminBookProductionStatusResponseSchema,
  ApproveBookSchema,
  BookApproveResponseSchema,
  BookDetailResponseSchema,
  BookFilesResponseSchema,
  BookManuscriptUploadResponseSchema,
  BookParamsSchema,
  BookPreviewResponseSchema,
  BookReprintConfigResponseSchema,
  BookReprocessResponseSchema,
  BookRolloutStateSchema,
  BookSettingsResponseSchema,
  UpdateAdminBookProductionStatusSchema,
  UpdateBookSettingsSchema,
} from "@bookprinta/shared";
import { createZodDto } from "nestjs-zod";

/** :id route param for /books/:id */
export class BookParamsDto extends createZodDto(BookParamsSchema) {}

/** Response for GET /api/v1/books/:id */
export class BookDetailResponseDto extends createZodDto(BookDetailResponseSchema) {}

/** Embedded rollout state returned inside GET /api/v1/books/:id */
export class BookRolloutStateDto extends createZodDto(BookRolloutStateSchema) {}

/** Body for PATCH /api/v1/books/:id/settings */
export class UpdateBookSettingsDto extends createZodDto(UpdateBookSettingsSchema) {}

/** Body for PATCH /api/v1/admin/books/:id/status */
export class UpdateAdminBookProductionStatusDto extends createZodDto(
  UpdateAdminBookProductionStatusSchema
) {}

/** Body for POST /api/v1/books/:id/approve */
export class ApproveBookDto extends createZodDto(ApproveBookSchema) {}

/** Response for PATCH /api/v1/books/:id/settings */
export class BookSettingsResponseDto extends createZodDto(BookSettingsResponseSchema) {}

/** Response for PATCH /api/v1/admin/books/:id/status */
export class AdminBookProductionStatusResponseDto extends createZodDto(
  AdminBookProductionStatusResponseSchema
) {}

/** Response for POST /api/v1/books/:id/upload */
export class BookManuscriptUploadResponseDto extends createZodDto(
  BookManuscriptUploadResponseSchema
) {}

/** Response for POST /api/v1/books/:id/approve */
export class BookApproveResponseDto extends createZodDto(BookApproveResponseSchema) {}

/** Response for POST /api/v1/books/:id/reprocess */
export class BookReprocessResponseDto extends createZodDto(BookReprocessResponseSchema) {}

/** Response for GET /api/v1/books/:id/preview */
export class BookPreviewResponseDto extends createZodDto(BookPreviewResponseSchema) {}

/** Response for GET /api/v1/books/:id/files */
export class BookFilesResponseDto extends createZodDto(BookFilesResponseSchema) {}

/** Response for GET /api/v1/books/:id/reprint-config */
export class BookReprintConfigResponseDto extends createZodDto(BookReprintConfigResponseSchema) {}
