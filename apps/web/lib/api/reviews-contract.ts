import {
  type CreateReviewResponse,
  CreateReviewResponseSchema,
  type MyReviewsResponse,
  MyReviewsResponseSchema,
  type ReviewBook,
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
    hasEligibleBooks: false,
    hasPendingReviews: false,
    books: [],
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

export function appendReviewToState(state: MyReviewsResponse, book: ReviewBook): MyReviewsResponse {
  const books = state.books.some((existingBook) => existingBook.bookId === book.bookId)
    ? state.books.map((existingBook) => (existingBook.bookId === book.bookId ? book : existingBook))
    : [book, ...state.books];

  return {
    hasEligibleBooks: books.length > 0,
    hasPendingReviews: books.some((existingBook) => existingBook.reviewStatus === "PENDING"),
    books,
  };
}
