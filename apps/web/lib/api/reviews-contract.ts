import {
  type CreateReviewResponse,
  CreateReviewResponseSchema,
  type MyReviewsResponse,
  MyReviewsResponseSchema,
  type ReviewedBook,
} from "@bookprinta/shared";
import type { ZodType } from "zod";

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function parseWithEnvelope<T>(payload: unknown, schema: ZodType<T>): T | null {
  const direct = schema.safeParse(payload);
  if (direct.success) return direct.data;

  const root = toRecord(payload);
  if (!root || !("data" in root)) return null;

  const enveloped = schema.safeParse(root.data);
  return enveloped.success ? enveloped.data : null;
}

export function createEmptyReviewState(): MyReviewsResponse {
  return {
    hasAnyPrintedBook: false,
    reviewedBooks: [],
    pendingBooks: [],
  };
}

export function normalizeMyReviewsPayload(payload: unknown): MyReviewsResponse {
  return parseWithEnvelope(payload, MyReviewsResponseSchema) ?? createEmptyReviewState();
}

export function normalizeCreateReviewPayload(payload: unknown): CreateReviewResponse {
  const parsed = parseWithEnvelope(payload, CreateReviewResponseSchema);
  if (parsed) return parsed;

  throw new Error("Unable to normalize review submission response");
}

export function appendReviewToState(
  state: MyReviewsResponse,
  review: ReviewedBook
): MyReviewsResponse {
  return {
    hasAnyPrintedBook: true,
    reviewedBooks: [
      review,
      ...state.reviewedBooks.filter((existingReview) => existingReview.bookId !== review.bookId),
    ],
    pendingBooks: state.pendingBooks.filter((book) => book.bookId !== review.bookId),
  };
}
