import { z } from "zod";
import { BookStatusSchema } from "./order.schema.ts";

// ==========================================
// Book Schemas — Source of Truth
// Shared between frontend & backend
// ==========================================

export const BookProgressStageSchema = z.enum([
  "PAYMENT_RECEIVED",
  "DESIGNING",
  "DESIGNED",
  "FORMATTING",
  "FORMATTED",
  "REVIEW",
  "APPROVED",
  "PRINTING",
  "PRINTED",
  "SHIPPING",
  "DELIVERED",
]);
export type BookProgressStage = z.infer<typeof BookProgressStageSchema>;

export const BookProgressStateSchema = z.enum(["completed", "current", "upcoming", "rejected"]);
export type BookProgressState = z.infer<typeof BookProgressStateSchema>;

/**
 * Common path param for /books/:id routes
 */
export const BookParamsSchema = z.object({
  id: z.string().cuid(),
});
export type BookParamsInput = z.infer<typeof BookParamsSchema>;

export const BookTimelineItemSchema = z.object({
  key: z.string(),
  label: z.string(),
  stage: BookProgressStageSchema,
  sourceStatus: BookStatusSchema.nullable(),
  state: BookProgressStateSchema,
  reachedAt: z.string().datetime().nullable(),
});
export type BookTimelineItem = z.infer<typeof BookTimelineItemSchema>;

/**
 * GET /api/v1/books/:id
 */
export const BookDetailResponseSchema = z.object({
  id: z.string().cuid(),
  orderId: z.string().cuid(),
  status: BookStatusSchema,
  rejectionReason: z.string().nullable(),
  rejectedAt: z.string().datetime().nullable(),
  pageCount: z.number().int().nullable(),
  wordCount: z.number().int().nullable(),
  estimatedPages: z.number().int().nullable(),
  fontFamily: z.string().nullable(),
  fontSize: z.number().int().nullable(),
  pageSize: z.string().nullable(),
  currentHtmlUrl: z.string().nullable(),
  previewPdfUrl: z.string().nullable(),
  finalPdfUrl: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  timeline: z.array(BookTimelineItemSchema),
});
export type BookDetailResponse = z.infer<typeof BookDetailResponseSchema>;
