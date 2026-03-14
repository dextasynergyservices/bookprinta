import {
  AdminPaymentsListQuerySchema,
  AdminPaymentsListResponseSchema,
  AdminPendingBankTransfersResponseSchema,
  AdminRefundRequestSchema,
  AdminRefundResponseSchema,
} from "@bookprinta/shared";
import { createZodDto } from "nestjs-zod";

/** GET /api/v1/admin/payments?cursor=&limit=&status=&provider=&dateFrom=&dateTo=&q=&sortBy=&sortDirection= */
export class AdminPaymentsListQueryDto extends createZodDto(AdminPaymentsListQuerySchema) {}

/** Response for GET /api/v1/admin/payments */
export class AdminPaymentsListResponseDto extends createZodDto(AdminPaymentsListResponseSchema) {}

/** Response for GET /api/v1/payments/bank-transfer/pending */
export class AdminPendingBankTransfersResponseDto extends createZodDto(
  AdminPendingBankTransfersResponseSchema
) {}

/** POST /api/v1/admin/payments/:id/refund */
export class AdminRefundPaymentDto extends createZodDto(AdminRefundRequestSchema) {}

/** Response for POST /api/v1/admin/payments/:id/refund */
export class AdminRefundPaymentResponseDto extends createZodDto(AdminRefundResponseSchema) {}
