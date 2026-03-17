import {
  CreateQuoteResponseSchema,
  CreateQuoteSchema,
  PayQuoteByTokenResponseSchema,
  PayQuoteByTokenSchema,
  QuoteEstimateResponseSchema,
  QuoteEstimateSchema,
  ResolveQuotePaymentTokenResponseSchema,
} from "@bookprinta/shared";
import { createZodDto } from "nestjs-zod";

/** POST /api/v1/quotes/estimate */
export class QuoteEstimateDto extends createZodDto(QuoteEstimateSchema) {}

/** Response for POST /api/v1/quotes/estimate */
export class QuoteEstimateResponseDto extends createZodDto(QuoteEstimateResponseSchema) {}

/** POST /api/v1/quotes */
export class CreateQuoteDto extends createZodDto(CreateQuoteSchema) {}

/** Response for POST /api/v1/quotes */
export class CreateQuoteResponseDto extends createZodDto(CreateQuoteResponseSchema) {}

/** GET /api/v1/pay/:token */
export class ResolveQuotePaymentTokenResponseDto extends createZodDto(
  ResolveQuotePaymentTokenResponseSchema
) {}

/** POST /api/v1/pay/:token */
export class PayQuoteByTokenDto extends createZodDto(PayQuoteByTokenSchema) {}

/** Response for POST /api/v1/pay/:token */
export class PayQuoteByTokenResponseDto extends createZodDto(PayQuoteByTokenResponseSchema) {}
