import {
  BankTransferSchema,
  ExtraPagesPaymentSchema,
  InitializePaymentSchema,
  ReprintPaymentSchema,
} from "@bookprinta/shared";
import { createZodDto } from "nestjs-zod";

// ──────────────────────────────────────────────
// Request DTOs — auto-generated from shared Zod schemas.
// nestjs-zod handles both validation and Swagger doc generation.
// ──────────────────────────────────────────────

/** POST /api/v1/payments/initialize */
export class InitializePaymentDto extends createZodDto(InitializePaymentSchema) {}

/** POST /api/v1/payments/bank-transfer */
export class BankTransferDto extends createZodDto(BankTransferSchema) {}

/** POST /api/v1/payments/extra-pages */
export class ExtraPagesPaymentDto extends createZodDto(ExtraPagesPaymentSchema) {}

/** POST /api/v1/payments/reprint */
export class ReprintPaymentDto extends createZodDto(ReprintPaymentSchema) {}
