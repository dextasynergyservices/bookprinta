import { AdminRefundRequestSchema, AdminRefundResponseSchema } from "@bookprinta/shared";
import { createZodDto } from "nestjs-zod";

/** POST /api/v1/admin/payments/:id/refund */
export class AdminRefundPaymentDto extends createZodDto(AdminRefundRequestSchema) {}

/** Response for POST /api/v1/admin/payments/:id/refund */
export class AdminRefundPaymentResponseDto extends createZodDto(AdminRefundResponseSchema) {}
