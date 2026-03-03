import {
  CouponSchema,
  CouponValidationErrorResponseSchema,
  CreateCouponSchema,
  UpdateCouponSchema,
  ValidateCouponResponseSchema,
  ValidateCouponSchema,
} from "@bookprinta/shared";
import { createZodDto } from "nestjs-zod";

/** POST /api/v1/coupons/validate */
export class ValidateCouponDto extends createZodDto(ValidateCouponSchema) {}

/** Response for POST /api/v1/coupons/validate */
export class ValidateCouponResponseDto extends createZodDto(ValidateCouponResponseSchema) {}

/** Standardized error response for coupon validation */
export class CouponValidationErrorResponseDto extends createZodDto(
  CouponValidationErrorResponseSchema
) {}

/** POST /api/v1/admin/coupons */
export class CreateCouponDto extends createZodDto(CreateCouponSchema) {}

/** PATCH /api/v1/admin/coupons/:id */
export class UpdateCouponDto extends createZodDto(UpdateCouponSchema) {}

/** Response for admin coupon endpoints */
export class CouponResponseDto extends createZodDto(CouponSchema) {}
