import { z } from "zod";
import { BookStatusSchema } from "./order.schema.ts";

// ==========================================
// Review Schemas — Source of Truth
// Shared between frontend & backend
// ==========================================

export const ReviewedBookSchema = z.object({
  bookId: z.string().cuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().nullable(),
  isPublic: z.boolean(),
  createdAt: z.string().datetime(),
});
export type ReviewedBook = z.infer<typeof ReviewedBookSchema>;

export const PendingReviewBookSchema = z.object({
  bookId: z.string().cuid(),
  status: BookStatusSchema,
});
export type PendingReviewBook = z.infer<typeof PendingReviewBookSchema>;

/**
 * GET /api/v1/reviews/my
 */
export const MyReviewsResponseSchema = z.object({
  hasAnyPrintedBook: z.boolean(),
  reviewedBooks: z.array(ReviewedBookSchema),
  pendingBooks: z.array(PendingReviewBookSchema),
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
  review: ReviewedBookSchema,
});
export type CreateReviewResponse = z.infer<typeof CreateReviewResponseSchema>;
