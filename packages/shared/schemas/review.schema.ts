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
