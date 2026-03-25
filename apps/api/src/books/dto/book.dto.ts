import {
  ADMIN_BOOK_HTML_UPLOAD_MAX_BYTES,
  AdminBookDetailSchema,
  AdminBookDownloadParamsSchema,
  AdminBookHtmlFileNameSchema,
  AdminBookHtmlUploadMimeTypeSchema,
  AdminBookProductionStatusResponseSchema,
  AdminBooksListQuerySchema,
  AdminBooksListResponseSchema,
  AdminBookVersionFileDownloadParamsSchema,
  AdminCancelProcessingResponseSchema,
  AdminCancelProcessingSchema,
  AdminDecommissionBookResponseSchema,
  AdminDecommissionBookSchema,
  AdminRejectBookResponseSchema,
  AdminRejectBookSchema,
  AdminResetProcessingResponseSchema,
  AdminResetProcessingSchema,
  AdminUpdateBookStatusResponseSchema,
  AdminUpdateBookStatusSchema,
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
  UserBooksListQuerySchema,
  UserBooksListResponseSchema,
} from "@bookprinta/shared";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const AdminBookHtmlUploadBodyDtoSchema = z
  .object({
    action: z.enum(["authorize", "finalize"]),
    fileName: AdminBookHtmlFileNameSchema,
    fileSize: z.number().int().min(1).max(ADMIN_BOOK_HTML_UPLOAD_MAX_BYTES),
    mimeType: AdminBookHtmlUploadMimeTypeSchema,
    expectedVersion: z.number().int().min(1).optional(),
    secureUrl: z.string().url().optional(),
    publicId: z.string().trim().min(1).max(255).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.action !== "finalize") {
      return;
    }

    if (typeof value.expectedVersion !== "number") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expectedVersion"],
        message: "expectedVersion is required when action is finalize",
      });
    }

    if (typeof value.secureUrl !== "string") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["secureUrl"],
        message: "secureUrl is required when action is finalize",
      });
    }

    if (typeof value.publicId !== "string") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["publicId"],
        message: "publicId is required when action is finalize",
      });
    }
  });

const AdminBookHtmlUploadResponseDtoSchema = z
  .object({
    action: z.enum(["authorize", "finalize"]),
  })
  .passthrough();

/** :id route param for /books/:id */
export class BookParamsDto extends createZodDto(BookParamsSchema) {}

/** GET /api/v1/books query params */
export class UserBooksListQueryDto extends createZodDto(UserBooksListQuerySchema) {}

/** Response for GET /api/v1/books/:id */
export class BookDetailResponseDto extends createZodDto(BookDetailResponseSchema) {}

/** Response for GET /api/v1/books */
export class UserBooksListResponseDto extends createZodDto(UserBooksListResponseSchema) {}

/** Embedded rollout state returned inside GET /api/v1/books/:id */
export class BookRolloutStateDto extends createZodDto(BookRolloutStateSchema) {}

/** Body for PATCH /api/v1/books/:id/settings */
export class UpdateBookSettingsDto extends createZodDto(UpdateBookSettingsSchema) {}

/** Body for PATCH /api/v1/admin/books/:id/status */
export class UpdateAdminBookProductionStatusDto extends createZodDto(
  UpdateAdminBookProductionStatusSchema
) {}

/** Query for GET /api/v1/admin/books */
export class AdminBooksListQueryDto extends createZodDto(AdminBooksListQuerySchema) {}

/** Body for PATCH /api/v1/admin/books/:id/status */
export class AdminUpdateBookStatusDto extends createZodDto(AdminUpdateBookStatusSchema) {}

/** Body for POST /api/v1/admin/books/:id/reject */
export class AdminRejectBookDto extends createZodDto(AdminRejectBookSchema) {}

/** Body for POST /api/v1/admin/books/:id/upload-html */
export class AdminBookHtmlUploadBodyDto extends createZodDto(AdminBookHtmlUploadBodyDtoSchema) {}

/** Body for POST /api/v1/books/:id/approve */
export class ApproveBookDto extends createZodDto(ApproveBookSchema) {}

/** Response for PATCH /api/v1/books/:id/settings */
export class BookSettingsResponseDto extends createZodDto(BookSettingsResponseSchema) {}

/** Response for PATCH /api/v1/admin/books/:id/status */
export class AdminBookProductionStatusResponseDto extends createZodDto(
  AdminBookProductionStatusResponseSchema
) {}

/** Response for GET /api/v1/admin/books */
export class AdminBooksListResponseDto extends createZodDto(AdminBooksListResponseSchema) {}

/** Response for GET /api/v1/admin/books/:id */
export class AdminBookDetailResponseDto extends createZodDto(AdminBookDetailSchema) {}

/** Response for PATCH /api/v1/admin/books/:id/status */
export class AdminUpdateBookStatusResponseDto extends createZodDto(
  AdminUpdateBookStatusResponseSchema
) {}

/** Response for POST /api/v1/admin/books/:id/reject */
export class AdminRejectBookResponseDto extends createZodDto(AdminRejectBookResponseSchema) {}

/** Response for POST /api/v1/admin/books/:id/upload-html */
export class AdminBookHtmlUploadResponseDto extends createZodDto(
  AdminBookHtmlUploadResponseDtoSchema
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

/** Params for GET /api/v1/admin/books/:id/download/:fileType */
export class AdminBookDownloadParamsDto extends createZodDto(AdminBookDownloadParamsSchema) {}

/** Params for GET /api/v1/admin/books/:id/files/:fileId/download */
export class AdminBookVersionFileDownloadParamsDto extends createZodDto(
  AdminBookVersionFileDownloadParamsSchema
) {}

/** Response for GET /api/v1/books/:id/reprint-config */
export class BookReprintConfigResponseDto extends createZodDto(BookReprintConfigResponseSchema) {}

/** Body for POST /api/v1/admin/books/:id/reset-processing */
export class AdminResetProcessingDto extends createZodDto(AdminResetProcessingSchema) {}

/** Response for POST /api/v1/admin/books/:id/reset-processing */
export class AdminResetProcessingResponseDto extends createZodDto(
  AdminResetProcessingResponseSchema
) {}

/** Body for POST /api/v1/admin/books/:id/cancel-processing */
export class AdminCancelProcessingDto extends createZodDto(AdminCancelProcessingSchema) {}

/** Response for POST /api/v1/admin/books/:id/cancel-processing */
export class AdminCancelProcessingResponseDto extends createZodDto(
  AdminCancelProcessingResponseSchema
) {}

/** Body for POST /api/v1/admin/books/:id/decommission */
export class AdminDecommissionBookDto extends createZodDto(AdminDecommissionBookSchema) {}

/** Response for POST /api/v1/admin/books/:id/decommission */
export class AdminDecommissionBookResponseDto extends createZodDto(
  AdminDecommissionBookResponseSchema
) {}
