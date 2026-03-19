import { z } from "zod";
import { BookTitleSchema } from "./book.schema.ts";
import { BookStatusSchema } from "./order.schema.ts";

// ==========================================
// Review Schemas — Source of Truth
// Shared between frontend & backend
// ==========================================

export const ReviewSummarySchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().nullable(),
  isPublic: z.boolean(),
  createdAt: z.string().datetime(),
});
export type ReviewSummary = z.infer<typeof ReviewSummarySchema>;

export const ReviewBookStatusSchema = z.enum(["PENDING", "REVIEWED"]);
export type ReviewBookStatus = z.infer<typeof ReviewBookStatusSchema>;

export const ReviewBookSchema = z.object({
  bookId: z.string().cuid(),
  title: BookTitleSchema.nullable(),
  coverImageUrl: z.string().nullable(),
  lifecycleStatus: BookStatusSchema,
  reviewStatus: ReviewBookStatusSchema,
  review: ReviewSummarySchema.nullable(),
});
export type ReviewBook = z.infer<typeof ReviewBookSchema>;

/**
 * GET /api/v1/reviews/my
 */
export const MyReviewsResponseSchema = z.object({
  hasEligibleBooks: z.boolean(),
  hasPendingReviews: z.boolean(),
  books: z.array(ReviewBookSchema),
});
export type MyReviewsResponse = z.infer<typeof MyReviewsResponseSchema>;

/**
 * POST /api/v1/reviews
 */
export const CreateReviewBodySchema = z.object({
  bookId: z.string().cuid(),
  rating: z.number().int().min(1).max(5),
  comment: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
});
export type CreateReviewBodyInput = z.infer<typeof CreateReviewBodySchema>;

export const CreateReviewResponseSchema = z.object({
  book: ReviewBookSchema,
});
export type CreateReviewResponse = z.infer<typeof CreateReviewResponseSchema>;

const AdminReviewQueryBooleanSchema = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .transform((value) => (typeof value === "boolean" ? value : value === "true"));

const AdminReviewQueryRatingSchema = z
  .union([z.number().int().min(1).max(5), z.enum(["1", "2", "3", "4", "5"])])
  .transform((value) => (typeof value === "number" ? value : Number(value)));

/**
 * GET /api/v1/admin/reviews?cursor=&limit=&q=&isPublic=&rating=
 */
export const AdminReviewsListQuerySchema = z.object({
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  q: z.string().trim().max(200).optional(),
  isPublic: AdminReviewQueryBooleanSchema.optional(),
  rating: AdminReviewQueryRatingSchema.optional(),
});
export type AdminReviewsListQuery = z.infer<typeof AdminReviewsListQuerySchema>;

export const AdminReviewItemSchema = z.object({
  id: z.string().cuid(),
  bookId: z.string().cuid(),
  bookTitle: BookTitleSchema.nullable(),
  authorName: z.string().trim().min(1).max(200),
  authorEmail: z.string().email(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().nullable(),
  isPublic: z.boolean(),
  createdAt: z.string().datetime(),
});
export type AdminReviewItem = z.infer<typeof AdminReviewItemSchema>;

/**
 * GET /api/v1/admin/reviews
 */
export const AdminReviewsListResponseSchema = z.object({
  items: z.array(AdminReviewItemSchema),
  nextCursor: z.string().cuid().nullable(),
  hasMore: z.boolean(),
});
export type AdminReviewsListResponse = z.infer<typeof AdminReviewsListResponseSchema>;

const AdminModerationCommentSchema = z
  .union([z.string().trim().max(2000), z.null()])
  .optional()
  .transform((value) => {
    if (value === undefined || value === null) {
      return value;
    }

    return value.length > 0 ? value : null;
  });

/**
 * PATCH /api/v1/admin/reviews/:id
 */
export const AdminUpdateReviewSchema = z
  .object({
    isPublic: z.boolean().optional(),
    comment: AdminModerationCommentSchema,
  })
  .refine((payload) => payload.isPublic !== undefined || payload.comment !== undefined, {
    message: "Provide at least one field to update",
  });
export type AdminUpdateReviewInput = z.infer<typeof AdminUpdateReviewSchema>;

/**
 * Response for PATCH /api/v1/admin/reviews/:id
 */
export const AdminUpdateReviewResponseSchema = AdminReviewItemSchema;
export type AdminUpdateReviewResponse = z.infer<typeof AdminUpdateReviewResponseSchema>;

/**
 * Response for DELETE /api/v1/admin/reviews/:id
 */
export const AdminDeleteReviewResponseSchema = z.object({
  id: z.string().cuid(),
  deleted: z.literal(true),
});
export type AdminDeleteReviewResponse = z.infer<typeof AdminDeleteReviewResponseSchema>;
