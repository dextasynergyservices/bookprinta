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
