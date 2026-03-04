import { z } from "zod";

// ==========================================
// Custom Quote Schemas — Source of Truth
// Shared between frontend & backend
// ==========================================

/**
 * Supported print sizes for custom quotes (Path B).
 */
export const QuoteBookSizeSchema = z.enum(["A4", "A5", "A6"]);
export type QuoteBookSize = z.infer<typeof QuoteBookSizeSchema>;

/**
 * Current custom quote cover type.
 * Path B only supports paperback at this stage.
 */
export const QuoteCoverTypeSchema = z.enum(["paperback"]);
export type QuoteCoverType = z.infer<typeof QuoteCoverTypeSchema>;

/**
 * Allowed special-requirement options from Step 3.
 */
export const QuoteSpecialRequirementSchema = z.enum([
  "hardback",
  "embossing",
  "gold_foil",
  "special_size",
  "full_color_interior",
  "special_paper",
  "other",
]);
export type QuoteSpecialRequirement = z.infer<typeof QuoteSpecialRequirementSchema>;

/**
 * Quote lifecycle status values aligned with Prisma `QuoteStatus`.
 */
export const QuoteStatusSchema = z.enum([
  "PENDING",
  "REVIEWING",
  "PAYMENT_LINK_SENT",
  "PAID",
  "COMPLETED",
  "REJECTED",
]);
export type QuoteStatus = z.infer<typeof QuoteStatusSchema>;

/**
 * POST /api/v1/quotes/estimate
 */
export const QuoteEstimateSchema = z.object({
  estimatedWordCount: z
    .number()
    .int("Estimated word count must be an integer")
    .min(1, "Estimated word count must be at least 1"),
  bookSize: QuoteBookSizeSchema,
  quantity: z.number().int("Quantity must be an integer").min(1, "Quantity must be at least 1"),
});
export type QuoteEstimateInput = z.infer<typeof QuoteEstimateSchema>;

/**
 * Response for POST /api/v1/quotes/estimate
 */
export const QuoteEstimateResponseSchema = z.object({
  estimatedPriceLow: z.number().int().min(0),
  estimatedPriceHigh: z.number().int().min(0),
});
export type QuoteEstimateResponse = z.infer<typeof QuoteEstimateResponseSchema>;

const QuoteSpecialRequirementsArraySchema = z
  .array(QuoteSpecialRequirementSchema)
  .max(7, "Too many special requirements selected")
  .default([]);

/**
 * POST /api/v1/quotes
 * Final payload submitted from the 4-step custom quote wizard.
 */
export const CreateQuoteSchema = z
  .object({
    // Step 1
    workingTitle: z
      .string()
      .trim()
      .min(1, "Working title is required")
      .max(200, "Working title must be at most 200 characters"),
    estimatedWordCount: z
      .number()
      .int("Estimated word count must be an integer")
      .min(1, "Estimated word count must be at least 1"),

    // Step 2
    bookSize: QuoteBookSizeSchema,
    quantity: z.number().int("Quantity must be an integer").min(1, "Quantity must be at least 1"),
    coverType: QuoteCoverTypeSchema.default("paperback"),

    // Step 3
    hasSpecialReqs: z.boolean(),
    specialRequirements: QuoteSpecialRequirementsArraySchema,
    specialRequirementsOther: z
      .string()
      .trim()
      .max(2000, "Special requirements details are too long")
      .optional()
      .or(z.literal("")),

    // Step 4
    fullName: z
      .string()
      .trim()
      .min(2, "Full name must be at least 2 characters")
      .max(120, "Full name must be at most 120 characters"),
    email: z.string().trim().email("Please enter a valid email address"),
    phone: z
      .string()
      .trim()
      .min(7, "Phone number must be at least 7 characters")
      .max(30, "Phone number is too long")
      .refine((value) => value.replace(/\D/g, "").length >= 7, {
        message: "Phone number must contain at least 7 digits",
      }),

    // Estimator
    estimatedPriceLow: z.number().int().min(0).nullable().optional(),
    estimatedPriceHigh: z.number().int().min(0).nullable().optional(),

    // Public-form security
    recaptchaToken: z.string().min(1, "reCAPTCHA verification failed").optional(),
  })
  .superRefine((data, ctx) => {
    const specialRequirements = data.specialRequirements ?? [];
    const specialRequirementsOther = (data.specialRequirementsOther ?? "").trim();
    const hasOtherSelected = specialRequirements.includes("other");
    const hasDuplicateSpecialRequirements =
      new Set(specialRequirements).size !== specialRequirements.length;

    if (hasDuplicateSpecialRequirements) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["specialRequirements"],
        message: "Special requirements cannot contain duplicates",
      });
    }

    if (data.hasSpecialReqs && specialRequirements.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["specialRequirements"],
        message: "Select at least one special requirement",
      });
    }

    if (!data.hasSpecialReqs && specialRequirements.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["specialRequirements"],
        message: "Special requirements must be empty when hasSpecialReqs is false",
      });
    }

    if (hasOtherSelected && specialRequirementsOther.length < 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["specialRequirementsOther"],
        message: "Please describe your other special requirements",
      });
    }

    if (!hasOtherSelected && specialRequirementsOther.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["specialRequirementsOther"],
        message: "Only provide other details when 'other' is selected",
      });
    }

    if (data.hasSpecialReqs) {
      if (data.estimatedPriceLow != null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["estimatedPriceLow"],
          message: "Estimated price must be null when special requirements are selected",
        });
      }
      if (data.estimatedPriceHigh != null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["estimatedPriceHigh"],
          message: "Estimated price must be null when special requirements are selected",
        });
      }
      return;
    }

    if (data.estimatedPriceLow == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["estimatedPriceLow"],
        message: "Estimated low price is required when no special requirements are selected",
      });
    }

    if (data.estimatedPriceHigh == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["estimatedPriceHigh"],
        message: "Estimated high price is required when no special requirements are selected",
      });
    }

    if (
      data.estimatedPriceLow != null &&
      data.estimatedPriceHigh != null &&
      data.estimatedPriceHigh < data.estimatedPriceLow
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["estimatedPriceHigh"],
        message: "Estimated high price must be greater than or equal to estimated low price",
      });
    }
  });
export type CreateQuoteInput = z.infer<typeof CreateQuoteSchema>;

/**
 * Minimal response for successful quote submission.
 */
export const CreateQuoteResponseSchema = z.object({
  id: z.string().cuid(),
  status: QuoteStatusSchema,
  message: z.string(),
});
export type CreateQuoteResponse = z.infer<typeof CreateQuoteResponseSchema>;
