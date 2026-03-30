import {
  DashboardNewBookBankTransferResponseSchema,
  DashboardNewBookOnlineResponseSchema,
  DashboardNewBookOrderSchema,
  DashboardNewBookPricingResponseSchema,
} from "@bookprinta/shared";
import { createZodDto } from "nestjs-zod";

/** Response for GET /api/v1/dashboard/new-book */
export class DashboardNewBookPricingResponseDto extends createZodDto(
  DashboardNewBookPricingResponseSchema
) {}

/** Request body for POST /api/v1/dashboard/new-book/order */
export class DashboardNewBookOrderDto extends createZodDto(DashboardNewBookOrderSchema) {}

/** Response variant: online payment redirect */
export class DashboardNewBookOnlineResponseDto extends createZodDto(
  DashboardNewBookOnlineResponseSchema
) {}

/** Response variant: bank transfer confirmation */
export class DashboardNewBookBankTransferResponseDto extends createZodDto(
  DashboardNewBookBankTransferResponseSchema
) {}
