import { z } from "zod";

// ==========================================
// Coupon Schemas — Source of Truth
// Shared between frontend & backend
// ==========================================

export const CouponDiscountTypeSchema = z.enum(["percentage", "fixed"]);
export type CouponDiscountType = z.infer<typeof CouponDiscountTypeSchema>;

export const CouponValidationErrorCodeSchema = z.enum([
  "INVALID_CODE",
  "CODE_EXPIRED",
  "CODE_INACTIVE",
  "CODE_MAXED_OUT",
  "CODE_NOT_APPLICABLE",
]);
export type CouponValidationErrorCode = z.infer<typeof CouponValidationErrorCodeSchema>;

export const CouponSchema = z.object({
  id: z.string().cuid(),
  code: z.string(),
  discountType: CouponDiscountTypeSchema,
  discountValue: z.number().nonnegative(),
  maxUses: z.number().int().positive().nullable(),
  currentUses: z.number().int().nonnegative(),
  expiresAt: z.string().datetime().nullable(),
  isActive: z.boolean(),
  appliesToAll: z.boolean(),
  eligiblePackageIds: z.array(z.string().cuid()),
  eligibleCategoryIds: z.array(z.string().cuid()),
  createdAt: z.string().datetime(),
});
export type Coupon = z.infer<typeof CouponSchema>;

export const ValidateCouponSchema = z.object({
  code: z.string().trim().min(1, "Coupon code is required").max(64, "Coupon code is too long"),
  amount: z
    .number()
    .positive("Amount must be greater than zero")
    .max(10_000_000, "Amount cannot exceed ₦10,000,000"),
  packageId: z.string().cuid().optional(),
  packageSlug: z.string().trim().min(1).max(100).optional(),
});
export type ValidateCouponInput = z.infer<typeof ValidateCouponSchema>;

export const ValidateCouponResponseSchema = CouponSchema.extend({
  discountAmount: z.number().nonnegative(),
});
export type ValidateCouponResponse = z.infer<typeof ValidateCouponResponseSchema>;

export const CouponValidationErrorResponseSchema = z.object({
  code: CouponValidationErrorCodeSchema,
  message: z.string(),
});
export type CouponValidationErrorResponse = z.infer<typeof CouponValidationErrorResponseSchema>;

export const CreateCouponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1, "Coupon code is required")
      .max(64, "Coupon code is too long")
      .regex(
        /^[a-zA-Z0-9_-]+$/,
        "Coupon code can only contain letters, numbers, hyphen, and underscore"
      ),
    discountType: CouponDiscountTypeSchema,
    discountValue: z.number().positive("Discount value must be greater than zero"),
    maxUses: z.number().int().positive().nullable().optional(),
    expiresAt: z.string().datetime().nullable().optional(),
    isActive: z.boolean().optional().default(true),
    appliesToAll: z.boolean().optional().default(true),
    eligiblePackageIds: z.array(z.string().cuid()).optional().default([]),
    eligibleCategoryIds: z.array(z.string().cuid()).optional().default([]),
  })
  .superRefine((value, ctx) => {
    const appliesToAll = value.appliesToAll ?? true;
    if (appliesToAll) return;

    const hasPackages = (value.eligiblePackageIds ?? []).length > 0;
    const hasCategories = (value.eligibleCategoryIds ?? []).length > 0;

    if (!hasPackages && !hasCategories) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one eligible package or category must be selected",
        path: ["eligiblePackageIds"],
      });
    }
  });
export type CreateCouponInput = z.infer<typeof CreateCouponSchema>;

export const UpdateCouponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1, "Coupon code is required")
      .max(64, "Coupon code is too long")
      .regex(
        /^[a-zA-Z0-9_-]+$/,
        "Coupon code can only contain letters, numbers, hyphen, and underscore"
      )
      .optional(),
    discountType: CouponDiscountTypeSchema.optional(),
    discountValue: z.number().positive("Discount value must be greater than zero").optional(),
    maxUses: z.number().int().positive().nullable().optional(),
    currentUses: z.number().int().nonnegative().optional(),
    expiresAt: z.string().datetime().nullable().optional(),
    isActive: z.boolean().optional(),
    appliesToAll: z.boolean().optional(),
    eligiblePackageIds: z.array(z.string().cuid()).optional(),
    eligibleCategoryIds: z.array(z.string().cuid()).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });
export type UpdateCouponInput = z.infer<typeof UpdateCouponSchema>;
