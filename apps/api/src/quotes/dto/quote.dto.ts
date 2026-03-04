import {
  CreateQuoteResponseSchema,
  CreateQuoteSchema,
  QuoteEstimateResponseSchema,
  QuoteEstimateSchema,
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
