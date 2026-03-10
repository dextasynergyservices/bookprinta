import { z } from "zod";

const SlugSchema = z
  .string()
  .trim()
  .min(1, "Slug is required")
  .max(120, "Slug must be at most 120 characters")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: "Slug must be lowercase and use hyphens only",
  });

const NullableStringSchema = z.string().trim().min(1).max(2000).nullable();

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

export const PurchaseLinkSchema = z.object({
  label: z.string().trim().min(1).max(120),
  url: z.string().trim().url().max(2048),
});
export type PurchaseLink = z.infer<typeof PurchaseLinkSchema>;

export const SocialLinkSchema = z.object({
  platform: z.string().trim().min(1).max(80),
  url: z.string().trim().url().max(2048),
});
export type SocialLink = z.infer<typeof SocialLinkSchema>;

export const AuthorProfileSchema = z
  .object({
    bio: z.string().trim().min(1).max(5000).optional(),
    profileImageUrl: z.string().trim().url().max(2048).optional(),
    whatsAppNumber: z.string().trim().min(1).max(40).optional(),
    websiteUrl: z.string().trim().url().max(2048).optional(),
    purchaseLinks: z.array(PurchaseLinkSchema).min(1).optional(),
    socialLinks: z.array(SocialLinkSchema).min(1).optional(),
  })
  .strict();
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
