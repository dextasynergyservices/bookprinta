import { z } from "zod";

// ==========================================
// Addon Response Schema — Source of Truth
// Shared between frontend & backend
// ==========================================

/**
 * Allowed pricing type values for addons.
 * - "fixed"    → flat price (Cover Design, ISBN Registration)
 * - "per_word" → variable pricing (Formatting: wordCount × pricePerWord)
 */
export const AddonPricingTypeSchema = z.enum(["fixed", "per_word"]);

export type AddonPricingType = z.infer<typeof AddonPricingTypeSchema>;

/**
 * Public addon response shape returned by:
 *   GET /api/v1/addons
 *   GET /api/v1/addons/:id
 *
 * Pricing convention:
 *   - Fixed addons:    `price` is set, `pricePerWord` is null
 *   - Per-word addons: `pricePerWord` is set, `price` is null
 */
export const AddonResponseSchema = z.object({
  id: z.string().cuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  pricingType: AddonPricingTypeSchema,
  price: z.number().nonnegative().nullable(),
  pricePerWord: z.number().nonnegative().nullable(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
});

export type AddonResponse = z.infer<typeof AddonResponseSchema>;

const AddonDescriptionSchema = z
  .string()
  .trim()
  .max(500, "Description must be 500 characters or fewer")
  .nullable();

const AddonPriceSchema = z.number().nonnegative();

const AddonNameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(120, "Name must be 120 characters or fewer");

function validateAddonPricing(
  data: {
    pricingType: AddonPricingType;
    price?: number | null;
    pricePerWord?: number | null;
  },
  ctx: z.RefinementCtx
) {
  if (data.pricingType === "fixed") {
    if (data.price === undefined || data.price === null || data.price < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["price"],
        message: "price is required when pricingType is fixed",
      });
    }
  }

  if (data.pricingType === "per_word") {
    if (data.pricePerWord === undefined || data.pricePerWord === null || data.pricePerWord < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pricePerWord"],
        message: "pricePerWord is required when pricingType is per_word",
      });
    }
  }
}

/** Admin addon row shape for /api/v1/admin/addons. */
export const AdminAddonSchema = AddonResponseSchema;

/** Admin create payload for POST /api/v1/admin/addons. */
export const AdminCreateAddonSchema = z
  .object({
    name: AddonNameSchema,
    description: AddonDescriptionSchema.optional(),
    pricingType: AddonPricingTypeSchema,
    price: AddonPriceSchema.nullable().optional(),
    pricePerWord: AddonPriceSchema.nullable().optional(),
    sortOrder: z.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine(validateAddonPricing);

/** Admin patch payload for PATCH /api/v1/admin/addons/:id. */
export const AdminUpdateAddonSchema = z
  .object({
    name: AddonNameSchema.optional(),
    description: AddonDescriptionSchema.optional(),
    pricingType: AddonPricingTypeSchema.optional(),
    price: AddonPriceSchema.nullable().optional(),
    pricePerWord: AddonPriceSchema.nullable().optional(),
    sortOrder: z.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export type AdminAddon = z.infer<typeof AdminAddonSchema>;
export type AdminCreateAddonInput = z.infer<typeof AdminCreateAddonSchema>;
export type AdminUpdateAddonInput = z.infer<typeof AdminUpdateAddonSchema>;

export const AdminDeleteAddonResponseSchema = z.object({
  id: z.string().cuid(),
  deleted: z.literal(true),
});

export type AdminDeleteAddonResponse = z.infer<typeof AdminDeleteAddonResponseSchema>;
