import {
  AdminArchiveQuoteSchema,
  AdminDeleteQuoteResponseSchema,
  AdminDeleteQuoteSchema,
  AdminQuoteActionResponseSchema,
  AdminQuoteDetailSchema,
  AdminQuoteListStatusSchema,
  AdminQuotePatchResponseSchema,
  AdminQuotePatchSchema,
  AdminQuoteSortDirectionSchema,
  AdminQuoteSortFieldSchema,
  AdminQuotesListQuerySchema,
  AdminQuotesListResponseSchema,
  AdminRejectQuoteSchema,
  AdminRevokeQuotePaymentLinkSchema,
  GenerateQuotePaymentLinkResponseSchema,
  GenerateQuotePaymentLinkSchema,
  RevokeQuotePaymentLinkResponseSchema,
} from "@bookprinta/shared";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

const AdminQuoteParamsSchema = z.object({
  id: z.string().cuid(),
});

// Guard against runtime schema drift by coercing URL query strings at the API boundary.
const AdminQuotesListQueryDtoSchema = AdminQuotesListQuerySchema.extend({
  cursor: z.preprocess(
    (value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value),
    z.string().trim().optional()
  ),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.preprocess(
    (value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value),
    AdminQuoteListStatusSchema.optional()
  ),
  q: z.preprocess(
    (value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value),
    z.string().trim().max(200).optional()
  ),
  sortBy: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    AdminQuoteSortFieldSchema.default("createdAt")
  ),
  sortDirection: z.preprocess(
    (value) => (typeof value === "string" ? value.trim().toLowerCase() : value),
    AdminQuoteSortDirectionSchema.default("desc")
  ),
});

/** GET /api/v1/admin/quotes?cursor=&limit=&status=&q=&sortBy=&sortDirection= */
export class AdminQuotesListQueryDto extends createZodDto(AdminQuotesListQueryDtoSchema) {}

/** Response for GET /api/v1/admin/quotes */
export class AdminQuotesListResponseDto extends createZodDto(AdminQuotesListResponseSchema) {}

/** Params for /api/v1/admin/quotes/:id */
export class AdminQuoteParamsDto extends createZodDto(AdminQuoteParamsSchema) {}

/** Response for GET /api/v1/admin/quotes/:id */
export class AdminQuoteDetailDto extends createZodDto(AdminQuoteDetailSchema) {}

/** PATCH /api/v1/admin/quotes/:id */
export class AdminQuotePatchDto extends createZodDto(AdminQuotePatchSchema) {}

/** Response for PATCH /api/v1/admin/quotes/:id */
export class AdminQuotePatchResponseDto extends createZodDto(AdminQuotePatchResponseSchema) {}

/** POST /api/v1/admin/quotes/:id/payment-link */
export class GenerateQuotePaymentLinkDto extends createZodDto(GenerateQuotePaymentLinkSchema) {}

/** Response for POST /api/v1/admin/quotes/:id/payment-link */
export class GenerateQuotePaymentLinkResponseDto extends createZodDto(
  GenerateQuotePaymentLinkResponseSchema
) {}

/** Response for DELETE /api/v1/admin/quotes/:id/payment-link */
export class RevokeQuotePaymentLinkResponseDto extends createZodDto(
  RevokeQuotePaymentLinkResponseSchema
) {}

/** DELETE /api/v1/admin/quotes/:id/payment-link */
export class AdminRevokeQuotePaymentLinkDto extends createZodDto(
  AdminRevokeQuotePaymentLinkSchema
) {}

/** PATCH /api/v1/admin/quotes/:id/reject */
export class AdminRejectQuoteDto extends createZodDto(AdminRejectQuoteSchema) {}

/** PATCH /api/v1/admin/quotes/:id/archive */
export class AdminArchiveQuoteDto extends createZodDto(AdminArchiveQuoteSchema) {}

/** Common response for reject/archive quote actions */
export class AdminQuoteActionResponseDto extends createZodDto(AdminQuoteActionResponseSchema) {}

/** DELETE /api/v1/admin/quotes/:id */
export class AdminDeleteQuoteDto extends createZodDto(AdminDeleteQuoteSchema) {}

/** Response for DELETE /api/v1/admin/quotes/:id */
export class AdminDeleteQuoteResponseDto extends createZodDto(AdminDeleteQuoteResponseSchema) {}
