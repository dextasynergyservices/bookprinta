import { z } from "zod";
import { PublicAuthorProfileSchema } from "./user.schema.ts";

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
const OptionalNullableCuidSchema = z.union([z.string().cuid(), z.null()]).optional();

export const ADMIN_SHOWCASE_COVER_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export const AdminShowcaseCoverUploadMimeTypeSchema = z.enum(["image/jpeg", "image/png"]);
export type AdminShowcaseCoverUploadMimeType = z.infer<
  typeof AdminShowcaseCoverUploadMimeTypeSchema
>;

export const ShowcaseSortOptionSchema = z.enum([
  "date_desc",
  "date_asc",
  "title_asc",
  "title_desc",
]);
export type ShowcaseSortOption = z.infer<typeof ShowcaseSortOptionSchema>;

export const ShowcaseCategorySchema = z.object({
  id: z.string().cuid(),
  name: z.string().trim().min(1).max(120),
  slug: SlugSchema,
  description: NullableStringSchema,
  sortOrder: z.number().int().min(0),
});
export type ShowcaseCategory = z.infer<typeof ShowcaseCategorySchema>;

export const AuthorProfileSchema = PublicAuthorProfileSchema;
export type AuthorProfile = z.infer<typeof AuthorProfileSchema>;

export const ShowcaseEntrySchema = z.object({
  id: z.string().cuid(),
  authorName: z.string().trim().min(1).max(180),
  bookTitle: z.string().trim().min(1).max(240),
  bookCoverUrl: z.string().trim().url().max(2048),
  aboutBook: NullableStringSchema,
  testimonial: NullableStringSchema,
  categoryId: z.string().cuid().nullable(),
  category: ShowcaseCategorySchema.nullable(),
  publishedYear: z.number().int().min(1900).max(9999).nullable(),
  publishedAt: z.string().datetime().nullable(),
  userId: z.string().cuid().nullable(),
  isFeatured: z.boolean(),
  isProfileComplete: z.boolean(),
});
export type ShowcaseEntry = z.infer<typeof ShowcaseEntrySchema>;

export const ShowcaseListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  category: SlugSchema.optional(),
  sort: ShowcaseSortOptionSchema.default("date_desc"),
  year: z
    .union([z.coerce.number().int().min(1900).max(9999), z.literal("")])
    .transform((value) => (value === "" ? undefined : value))
    .optional(),
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(30).default(6),
  isFeatured: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((value) => (typeof value === "boolean" ? value : value === "true"))
    .optional(),
});
export type ShowcaseListQuery = z.infer<typeof ShowcaseListQuerySchema>;

export const ShowcaseListResponseSchema = z.object({
  items: z.array(ShowcaseEntrySchema),
  nextCursor: z.string().cuid().nullable(),
  hasMore: z.boolean(),
});
export type ShowcaseListResponse = z.infer<typeof ShowcaseListResponseSchema>;

export const ShowcaseCategoriesResponseSchema = z.object({
  categories: z.array(ShowcaseCategorySchema),
});
export type ShowcaseCategoriesResponse = z.infer<typeof ShowcaseCategoriesResponseSchema>;

export const AuthorProfileResponseSchema = AuthorProfileSchema;
export type AuthorProfileResponse = z.infer<typeof AuthorProfileResponseSchema>;

// ==========================================
// Admin Showcase Category Schemas
// ==========================================

export const AdminShowcaseCategorySchema = ShowcaseCategorySchema.extend({
  isActive: z.boolean(),
  showcaseCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type AdminShowcaseCategory = z.infer<typeof AdminShowcaseCategorySchema>;

export const AdminShowcaseCategoriesListResponseSchema = z.object({
  categories: z.array(AdminShowcaseCategorySchema),
});
export type AdminShowcaseCategoriesListResponse = z.infer<
  typeof AdminShowcaseCategoriesListResponseSchema
>;

export const AdminCreateShowcaseCategorySchema = z.object({
  name: z.string().trim().min(1, "Category name is required").max(120),
  description: OptionalNullableStringSchema,
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});
export type AdminCreateShowcaseCategoryInput = z.infer<typeof AdminCreateShowcaseCategorySchema>;

export const AdminUpdateShowcaseCategorySchema = AdminCreateShowcaseCategorySchema.partial().refine(
  (payload) => Object.keys(payload).length > 0,
  "Provide at least one field to update"
);
export type AdminUpdateShowcaseCategoryInput = z.infer<typeof AdminUpdateShowcaseCategorySchema>;

export const AdminDeleteShowcaseCategoryResponseSchema = z.object({
  id: z.string().cuid(),
  deleted: z.literal(true),
});
export type AdminDeleteShowcaseCategoryResponse = z.infer<
  typeof AdminDeleteShowcaseCategoryResponseSchema
>;

// ==========================================
// Admin Showcase Entry Schemas
// ==========================================

export const AdminShowcaseLinkedUserSchema = z.object({
  id: z.string().cuid(),
  displayName: z.string().trim().min(1).max(180),
  email: z.string().trim().email().max(320),
  profileComplete: z.boolean(),
});
export type AdminShowcaseLinkedUser = z.infer<typeof AdminShowcaseLinkedUserSchema>;

export const AdminShowcaseEntrySchema = z.object({
  id: z.string().cuid(),
  authorName: z.string().trim().min(1).max(180),
  bookTitle: z.string().trim().min(1).max(240),
  bookCoverUrl: z.string().trim().url().max(2048),
  aboutBook: NullableStringSchema,
  testimonial: NullableStringSchema,
  categoryId: z.string().cuid().nullable(),
  category: ShowcaseCategorySchema.nullable(),
  publishedYear: z.number().int().min(1900).max(9999).nullable(),
  publishedAt: z.string().datetime().nullable(),
  userId: z.string().cuid().nullable(),
  user: AdminShowcaseLinkedUserSchema.nullable(),
  bookId: z.string().cuid().nullable(),
  isFeatured: z.boolean(),
  sortOrder: z.number().int().min(0),
  previewPath: z.string().trim().min(1).max(512),
  createdAt: z.string().datetime(),
});
export type AdminShowcaseEntry = z.infer<typeof AdminShowcaseEntrySchema>;

export const AdminAuthorizeShowcaseCoverUploadBodySchema = z
  .object({
    action: z.literal("authorize"),
    fileName: z.string().trim().min(1).max(255),
    fileSize: z.number().int().min(1).max(ADMIN_SHOWCASE_COVER_UPLOAD_MAX_BYTES),
    mimeType: AdminShowcaseCoverUploadMimeTypeSchema,
  })
  .strict();
export type AdminAuthorizeShowcaseCoverUploadBodyInput = z.infer<
  typeof AdminAuthorizeShowcaseCoverUploadBodySchema
>;

export const AdminFinalizeShowcaseCoverUploadBodySchema = z
  .object({
    action: z.literal("finalize"),
    secureUrl: z.string().trim().url().max(2048),
    publicId: z.string().trim().min(1).max(255),
    entryId: z.string().cuid().optional(),
  })
  .strict();
export type AdminFinalizeShowcaseCoverUploadBodyInput = z.infer<
  typeof AdminFinalizeShowcaseCoverUploadBodySchema
>;

export const AdminShowcaseCoverUploadBodySchema = z
  .object({
    action: z.enum(["authorize", "finalize"]),
    fileName: z.string().trim().min(1).max(255).optional(),
    fileSize: z.number().int().min(1).max(ADMIN_SHOWCASE_COVER_UPLOAD_MAX_BYTES).optional(),
    mimeType: AdminShowcaseCoverUploadMimeTypeSchema.optional(),
    secureUrl: z.string().trim().url().max(2048).optional(),
    publicId: z.string().trim().min(1).max(255).optional(),
    entryId: z.string().cuid().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.action === "authorize") {
      if (!value.fileName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fileName"],
          message: "fileName is required when action is authorize",
        });
      }

      if (typeof value.fileSize !== "number") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fileSize"],
          message: "fileSize is required when action is authorize",
        });
      }

      if (!value.mimeType) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["mimeType"],
          message: "mimeType is required when action is authorize",
        });
      }

      return;
    }

    if (!value.secureUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["secureUrl"],
        message: "secureUrl is required when action is finalize",
      });
    }

    if (!value.publicId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["publicId"],
        message: "publicId is required when action is finalize",
      });
    }
  });
export type AdminShowcaseCoverUploadBodyInput = z.infer<typeof AdminShowcaseCoverUploadBodySchema>;

export const AdminAuthorizeShowcaseCoverUploadResponseSchema = z
  .object({
    action: z.literal("authorize"),
    upload: z
      .object({
        signature: z.string().min(1),
        timestamp: z.number().int().positive(),
        cloudName: z.string().min(1),
        apiKey: z.string().min(1),
        folder: z.string().min(1),
        eager: z.string().min(1).optional(),
        resourceType: z.literal("image"),
        publicId: z.string().min(1),
        tags: z.array(z.string().min(1)).optional(),
      })
      .strict(),
  })
  .strict();
export type AdminAuthorizeShowcaseCoverUploadResponse = z.infer<
  typeof AdminAuthorizeShowcaseCoverUploadResponseSchema
>;

export const AdminFinalizeShowcaseCoverUploadResponseSchema = z
  .object({
    action: z.literal("finalize"),
    secureUrl: z.string().trim().url().max(2048),
    publicId: z.string().trim().min(1).max(255),
    entry: AdminShowcaseEntrySchema.optional(),
  })
  .strict();
export type AdminFinalizeShowcaseCoverUploadResponse = z.infer<
  typeof AdminFinalizeShowcaseCoverUploadResponseSchema
>;

export const AdminShowcaseCoverUploadResponseSchema = z
  .object({
    action: z.enum(["authorize", "finalize"]),
    upload: AdminAuthorizeShowcaseCoverUploadResponseSchema.shape.upload.optional(),
    secureUrl: z.string().trim().url().max(2048).optional(),
    publicId: z.string().trim().min(1).max(255).optional(),
    entry: AdminShowcaseEntrySchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.action === "authorize") {
      if (!value.upload) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["upload"],
          message: "upload is required when action is authorize",
        });
      }

      return;
    }

    if (!value.secureUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["secureUrl"],
        message: "secureUrl is required when action is finalize",
      });
    }

    if (!value.publicId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["publicId"],
        message: "publicId is required when action is finalize",
      });
    }
  });
export type AdminShowcaseCoverUploadResponse = z.infer<
  typeof AdminShowcaseCoverUploadResponseSchema
>;

export const AdminShowcaseEntriesListQuerySchema = z.object({
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  q: z.string().trim().max(200).optional(),
  categoryId: z.string().cuid().optional(),
  isFeatured: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((value) => (typeof value === "boolean" ? value : value === "true"))
    .optional(),
  sort: z
    .enum([
      "sort_order_asc",
      "sort_order_desc",
      "published_at_desc",
      "published_at_asc",
      "created_at_desc",
      "created_at_asc",
    ])
    .default("sort_order_asc"),
});
export type AdminShowcaseEntriesListQuery = z.infer<typeof AdminShowcaseEntriesListQuerySchema>;

export const AdminShowcaseEntriesListResponseSchema = z.object({
  items: z.array(AdminShowcaseEntrySchema),
  nextCursor: z.string().cuid().nullable(),
  hasMore: z.boolean(),
});
export type AdminShowcaseEntriesListResponse = z.infer<
  typeof AdminShowcaseEntriesListResponseSchema
>;

export const AdminCreateShowcaseEntrySchema = z.object({
  authorName: z.string().trim().min(1, "Author name is required").max(180),
  bookTitle: z.string().trim().min(1, "Book title is required").max(240),
  coverImageUrl: z.string().trim().url("Cover image URL must be a valid URL").max(2048),
  aboutBook: OptionalNullableStringSchema,
  testimonial: OptionalNullableStringSchema,
  categoryId: OptionalNullableCuidSchema,
  publishedYear: z.union([z.number().int().min(1900).max(9999), z.null()]).optional(),
  publishedAt: z.union([z.string().datetime(), z.null()]).optional(),
  userId: OptionalNullableCuidSchema,
  bookId: OptionalNullableCuidSchema,
  isFeatured: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});
export type AdminCreateShowcaseEntryInput = z.infer<typeof AdminCreateShowcaseEntrySchema>;

export const AdminUpdateShowcaseEntrySchema = AdminCreateShowcaseEntrySchema.partial().refine(
  (payload) => Object.keys(payload).length > 0,
  "Provide at least one field to update"
);
export type AdminUpdateShowcaseEntryInput = z.infer<typeof AdminUpdateShowcaseEntrySchema>;

export const AdminDeleteShowcaseEntryResponseSchema = z.object({
  id: z.string().cuid(),
  deleted: z.literal(true),
});
export type AdminDeleteShowcaseEntryResponse = z.infer<
  typeof AdminDeleteShowcaseEntryResponseSchema
>;

// ==========================================
// Admin User Link Search Schemas
// ==========================================

export const AdminShowcaseUserSearchQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(30).default(10),
});
export type AdminShowcaseUserSearchQuery = z.infer<typeof AdminShowcaseUserSearchQuerySchema>;

export const AdminShowcaseUserSearchResponseSchema = z.object({
  items: z.array(AdminShowcaseLinkedUserSchema),
  nextCursor: z.string().cuid().nullable(),
  hasMore: z.boolean(),
});
export type AdminShowcaseUserSearchResponse = z.infer<typeof AdminShowcaseUserSearchResponseSchema>;
