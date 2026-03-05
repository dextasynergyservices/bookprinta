import type { BookStatus } from "./orders";

export const BOOK_PROGRESS_STAGES = [
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
] as const;

export type BookProgressStage = (typeof BOOK_PROGRESS_STAGES)[number];

export type BookProgressStepState = "completed" | "current" | "upcoming" | "rejected";

export type BookProgressSource = "orders_tracking" | "books_detail";

export interface BookProgressTimelineStep {
  stage: BookProgressStage;
  state: BookProgressStepState;
  reachedAt: string | null;
  sourceStatus: string | null;
}

export interface BookProgressNormalizedResponse {
  sourceEndpoint: BookProgressSource;
  bookId: string | null;
  orderId: string | null;
  currentStatus: BookStatus | (string & {}) | null;
  rejectionReason: string | null;
  currentStage: BookProgressStage;
  isRejected: boolean;
  timeline: BookProgressTimelineStep[];
  pageCount: number | null;
  wordCount: number | null;
  estimatedPages: number | null;
  fontFamily: string | null;
  fontSize: number | null;
  pageSize: string | null;
  currentHtmlUrl: string | null;
  previewPdfUrl: string | null;
  finalPdfUrl: string | null;
  updatedAt: string | null;
}
