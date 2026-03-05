import { z } from "zod";

// ==========================================
// Resources / Blog Schemas — Source of Truth
// Shared between frontend & backend
// ==========================================

const SlugSchema = z
  .string()
  .trim()
  .min(1, "Slug is required")
  .max(120, "Slug must be at most 120 characters")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: "Slug must be lowercase and use hyphens only",
  });

const NullableStringSchema = z.string().trim().min(1).max(2000).nullable();

const OptionalNullableStringSchema = z
  .union([z.string().trim().min(1).max(2000), z.null()])
  .optional();

const OptionalNullableUrlSchema = z
  .union([z.string().trim().url("Cover image URL must be a valid URL").max(2048), z.null()])
  .optional();

const ResourceCategoryCoreSchema = z.object({
  id: z.string().cuid(),
  name: z.string().trim().min(1).max(120),
  slug: SlugSchema,
  description: NullableStringSchema,
  sortOrder: z.number().int().min(0),
  isActive: z.boolean(),
});

const ResourceCategoryBriefSchema = ResourceCategoryCoreSchema.pick({
  id: true,
  name: true,
  slug: true,
});

/**
 * Category shape for public listing filters.
 * Includes count of published articles in each active category.
 */
export const PublicResourceCategorySchema = ResourceCategoryCoreSchema.extend({
  articleCount: z.number().int().min(0),
});
export type PublicResourceCategory = z.infer<typeof PublicResourceCategorySchema>;

/**
 * GET /api/v1/resources/categories
 */
export const PublicResourceCategoriesResponseSchema = z.object({
  categories: z.array(PublicResourceCategorySchema),
});
export type PublicResourceCategoriesResponse = z.infer<
  typeof PublicResourceCategoriesResponseSchema
>;

/**
 * Public resource card shape used on listing/category pages.
 */
export const PublicResourceListItemSchema = z.object({
  id: z.string().cuid(),
  title: z.string().trim().min(1).max(240),
  slug: SlugSchema,
  excerpt: NullableStringSchema,
  coverImageUrl: z.string().trim().url().max(2048).nullable(),
  category: ResourceCategoryBriefSchema.nullable(),
  publishedAt: z.string().datetime(),
});
export type PublicResourceListItem = z.infer<typeof PublicResourceListItemSchema>;

/**
 * GET /api/v1/resources?category=&cursor=&limit=
 */
export const PublicResourcesListQuerySchema = z.object({
  category: SlugSchema.optional(),
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(30).default(9),
});
export type PublicResourcesListQuery = z.infer<typeof PublicResourcesListQuerySchema>;

/**
 * Cursor-paginated public resources listing response.
 */
export const PublicResourcesListResponseSchema = z.object({
  items: z.array(PublicResourceListItemSchema),
  nextCursor: z.string().cuid().nullable(),
  hasMore: z.boolean(),
});
export type PublicResourcesListResponse = z.infer<typeof PublicResourcesListResponseSchema>;

/**
 * Full public article shape for detail page.
 */
export const PublicResourceDetailSchema = z.object({
  id: z.string().cuid(),
  title: z.string().trim().min(1).max(240),
  slug: SlugSchema,
  excerpt: NullableStringSchema,
  content: z.string().min(1),
  coverImageUrl: z.string().trim().url().max(2048).nullable(),
  category: ResourceCategoryBriefSchema.nullable(),
  authorName: z.string().trim().min(1).max(180),
  publishedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type PublicResourceDetail = z.infer<typeof PublicResourceDetailSchema>;

/**
 * GET /api/v1/resources/:slug
 */
export const PublicResourceDetailResponseSchema = PublicResourceDetailSchema;
export type PublicResourceDetailResponse = z.infer<typeof PublicResourceDetailResponseSchema>;

/**
 * GET /api/v1/admin/resources?cursor=&limit=&q=&categoryId=&isPublished=
 */
export const AdminResourcesListQuerySchema = z.object({
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  q: z.string().trim().max(200).optional(),
  categoryId: z.string().cuid().optional(),
  isPublished: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((value) => (typeof value === "boolean" ? value : value === "true"))
    .optional(),
});
export type AdminResourcesListQuery = z.infer<typeof AdminResourcesListQuerySchema>;

const AdminResourceCategorySchema = ResourceCategoryCoreSchema.extend({
  articleCount: z.number().int().min(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type AdminResourceCategory = z.infer<typeof AdminResourceCategorySchema>;

export const AdminResourcesListItemSchema = z.object({
  id: z.string().cuid(),
  title: z.string().trim().min(1).max(240),
  slug: SlugSchema,
  excerpt: NullableStringSchema,
  coverImageUrl: z.string().trim().url().max(2048).nullable(),
  category: ResourceCategoryBriefSchema.nullable(),
  isPublished: z.boolean(),
  publishedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type AdminResourcesListItem = z.infer<typeof AdminResourcesListItemSchema>;

/**
 * Cursor-paginated admin resources listing response.
 */
export const AdminResourcesListResponseSchema = z.object({
  items: z.array(AdminResourcesListItemSchema),
  nextCursor: z.string().cuid().nullable(),
  hasMore: z.boolean(),
});
export type AdminResourcesListResponse = z.infer<typeof AdminResourcesListResponseSchema>;

/**
 * Full admin article response shape for create/update/read.
 */
export const AdminResourceDetailSchema = z.object({
  id: z.string().cuid(),
  title: z.string().trim().min(1).max(240),
  slug: SlugSchema,
  excerpt: NullableStringSchema,
  content: z.string().min(1),
  coverImageUrl: z.string().trim().url().max(2048).nullable(),
  categoryId: z.string().cuid().nullable(),
  category: ResourceCategoryBriefSchema.nullable(),
  isPublished: z.boolean(),
  publishedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type AdminResourceDetail = z.infer<typeof AdminResourceDetailSchema>;

/**
 * POST /api/v1/admin/resources
 */
export const AdminCreateResourceSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(240),
  slug: SlugSchema,
  excerpt: OptionalNullableStringSchema,
  content: z.string().min(1, "Content is required"),
  coverImageUrl: OptionalNullableUrlSchema,
  categoryId: z.union([z.string().cuid(), z.null()]).optional(),
  isPublished: z.boolean().optional(),
  publishedAt: z.union([z.string().datetime(), z.null()]).optional(),
});
export type AdminCreateResourceInput = z.infer<typeof AdminCreateResourceSchema>;

/**
 * PATCH /api/v1/admin/resources/:id
 */
export const AdminUpdateResourceSchema = AdminCreateResourceSchema.partial().refine(
  (payload) => Object.keys(payload).length > 0,
  "Provide at least one field to update"
);
export type AdminUpdateResourceInput = z.infer<typeof AdminUpdateResourceSchema>;

/**
 * GET/POST/PATCH /api/v1/admin/resource-categories
 */
export const AdminResourceCategoryResponseSchema = AdminResourceCategorySchema;
export type AdminResourceCategoryResponse = z.infer<typeof AdminResourceCategoryResponseSchema>;

export const AdminCreateResourceCategorySchema = z.object({
  name: z.string().trim().min(1, "Category name is required").max(120),
  slug: SlugSchema,
  description: OptionalNullableStringSchema,
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});
export type AdminCreateResourceCategoryInput = z.infer<typeof AdminCreateResourceCategorySchema>;

export const AdminUpdateResourceCategorySchema = AdminCreateResourceCategorySchema.partial().refine(
  (payload) => Object.keys(payload).length > 0,
  "Provide at least one field to update"
);
export type AdminUpdateResourceCategoryInput = z.infer<typeof AdminUpdateResourceCategorySchema>;

/**
 * Standard admin delete responses.
 */
export const AdminDeleteResourceResponseSchema = z.object({
  id: z.string().cuid(),
  deleted: z.literal(true),
});
export type AdminDeleteResourceResponse = z.infer<typeof AdminDeleteResourceResponseSchema>;

export const AdminDeleteResourceCategoryResponseSchema = z.object({
  id: z.string().cuid(),
  deleted: z.literal(true),
});
export type AdminDeleteResourceCategoryResponse = z.infer<
  typeof AdminDeleteResourceCategoryResponseSchema
>;
