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
 * Public category summary shared in package payloads.
 * Category-level `copies` is the fixed default copy count for that bundle family.
 */
export const PackageCategorySummarySchema = z.object({
  id: z.string().cuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  copies: z.number().int().positive(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
});

export type PackageCategorySummary = z.infer<typeof PackageCategorySummarySchema>;

/**
 * Package fields shared between list/detail endpoints.
 */
export const PackageBaseResponseSchema = z.object({
  id: z.string().cuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  basePrice: z.number().nonnegative(),
  pageLimit: z.number().int().positive(),
  includesISBN: z.boolean(),
  features: PackageFeaturesSchema,
  isActive: z.boolean(),
  sortOrder: z.number().int(),
});

export type PackageBaseResponse = z.infer<typeof PackageBaseResponseSchema>;

/**
 * Public package response shape returned by:
 *   GET /api/v1/packages
 *   GET /api/v1/packages/:id
 *
 * Includes category info so checkout can display bundle family details.
 */
export const PackageResponseSchema = PackageBaseResponseSchema.extend({
  category: PackageCategorySummarySchema,
});

export type PackageResponse = z.infer<typeof PackageResponseSchema>;

/**
 * Public package-category response shape returned by:
 *   GET /api/v1/package-categories
 *
 * Categories are returned with nested active packages for the pricing page.
 */
export const PackageCategoryResponseSchema = PackageCategorySummarySchema.extend({
  packages: z.array(PackageBaseResponseSchema),
});

export type PackageCategoryResponse = z.infer<typeof PackageCategoryResponseSchema>;

// ==========================================
// Admin Package Category Schemas
// ==========================================

export const AdminPackageCategorySchema = PackageCategorySummarySchema.extend({
  packageCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type AdminPackageCategory = z.infer<typeof AdminPackageCategorySchema>;

export const AdminCreatePackageCategorySchema = z.object({
  name: z.string().trim().min(1, "Category name is required").max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  copies: z.number().int().positive(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export type AdminCreatePackageCategoryInput = z.infer<typeof AdminCreatePackageCategorySchema>;

export const AdminUpdatePackageCategorySchema = AdminCreatePackageCategorySchema.partial().refine(
  (payload) => Object.keys(payload).length > 0,
  "Provide at least one field to update"
);

export type AdminUpdatePackageCategoryInput = z.infer<typeof AdminUpdatePackageCategorySchema>;

export const AdminDeletePackageCategoryResponseSchema = z.object({
  id: z.string().cuid(),
  deleted: z.literal(true),
});

export type AdminDeletePackageCategoryResponse = z.infer<
  typeof AdminDeletePackageCategoryResponseSchema
>;

export const AdminPackageCategoryLiteSchema = PackageCategorySummarySchema;
export type AdminPackageCategoryLite = z.infer<typeof AdminPackageCategoryLiteSchema>;

export const AdminPackageSchema = PackageBaseResponseSchema.extend({
  categoryId: z.string().cuid(),
  category: AdminPackageCategoryLiteSchema,
});

export type AdminPackage = z.infer<typeof AdminPackageSchema>;

export const AdminCreatePackageSchema = z.object({
  categoryId: z.string().cuid(),
  name: z.string().trim().min(1, "Package name is required").max(120),
  description: z.string().trim().max(2000).nullable().optional(),
  basePrice: z.number().nonnegative(),
  pageLimit: z.number().int().positive(),
  includesISBN: z.boolean(),
  features: PackageFeaturesSchema,
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export type AdminCreatePackageInput = z.infer<typeof AdminCreatePackageSchema>;

export const AdminUpdatePackageSchema = AdminCreatePackageSchema.partial().refine(
  (payload) => Object.keys(payload).length > 0,
  "Provide at least one field to update"
);

export type AdminUpdatePackageInput = z.infer<typeof AdminUpdatePackageSchema>;

export const AdminDeletePackageResponseSchema = z.object({
  id: z.string().cuid(),
  deleted: z.literal(true),
});

export type AdminDeletePackageResponse = z.infer<typeof AdminDeletePackageResponseSchema>;
