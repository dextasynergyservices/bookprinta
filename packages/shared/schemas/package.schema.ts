import { z } from "zod";

// ==========================================
// Package Response Schema — Source of Truth
// Shared between frontend & backend
// ==========================================

/**
 * Shape of the `features` JSON column on the Package model.
 * Contains a list of feature strings and per-size copy counts.
 */
export const PackageFeaturesSchema = z.object({
  items: z.array(z.string()),
  copies: z.object({
    A4: z.number().int().nonnegative(),
    A5: z.number().int().nonnegative(),
    A6: z.number().int().nonnegative(),
  }),
});

export type PackageFeatures = z.infer<typeof PackageFeaturesSchema>;

/**
 * Public package response shape returned by:
 *   GET /api/v1/packages
 *   GET /api/v1/packages/:id
 */
export const PackageResponseSchema = z.object({
  id: z.string().cuid(),
  name: z.string(),
  description: z.string().nullable(),
  basePrice: z.number().nonnegative(),
  pageLimit: z.number().int().positive(),
  includesISBN: z.boolean(),
  features: PackageFeaturesSchema,
  isActive: z.boolean(),
  sortOrder: z.number().int(),
});

export type PackageResponse = z.infer<typeof PackageResponseSchema>;
