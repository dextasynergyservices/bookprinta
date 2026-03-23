import type { AdminBookStatusSource, BookStatus } from "@bookprinta/shared";

type AdminBookStatusInput = {
  status: BookStatus;
  productionStatus: BookStatus | null;
};

const ADMIN_BOOK_STATUS_TRANSITIONS: Record<BookStatus, BookStatus[]> = {
  AWAITING_UPLOAD: ["PAYMENT_RECEIVED"],
  UPLOADED: ["DESIGNING"],
  PAYMENT_RECEIVED: ["DESIGNING"],
  AI_PROCESSING: ["DESIGNING"],
  DESIGNING: ["DESIGNED"],
  DESIGNED: ["FORMATTING"],
  FORMATTING: ["FORMATTED"],
  FORMATTED: ["FORMATTING_REVIEW"],
  FORMATTING_REVIEW: ["PREVIEW_READY"],
  PREVIEW_READY: ["APPROVED"],
  REVIEW: ["APPROVED"],
  APPROVED: ["IN_PRODUCTION"],
  REJECTED: [],
  IN_PRODUCTION: ["PRINTING"],
  PRINTING: ["PRINTED"],
  PRINTED: ["SHIPPING"],
  SHIPPING: ["DELIVERED"],
  DELIVERED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

const REJECTABLE_STATUSES = new Set<BookStatus>([
  "AWAITING_UPLOAD",
  "UPLOADED",
  "PAYMENT_RECEIVED",
  "AI_PROCESSING",
  "DESIGNING",
  "DESIGNED",
  "FORMATTING",
  "FORMATTED",
  "FORMATTING_REVIEW",
  "PREVIEW_READY",
  "REVIEW",
]);

const HTML_FALLBACK_ALLOWED_STATUSES = new Set<BookStatus>([
  "UPLOADED",
  "PAYMENT_RECEIVED",
  "AI_PROCESSING",
  "DESIGNING",
  "DESIGNED",
  "FORMATTING",
  "FORMATTED",
  "FORMATTING_REVIEW",
  "PREVIEW_READY",
  "REVIEW",
]);

/**
 * Statuses where an admin can reset the manuscript-processing pipeline
 * to re-enqueue AI formatting from scratch.
 */
const RESET_PROCESSING_ALLOWED_STATUSES = new Set<BookStatus>([
  "UPLOADED",
  "AI_PROCESSING",
  "FORMATTING",
  "FORMATTED",
  "FORMATTING_REVIEW",
]);

/**
 * Statuses where an admin can cancel processing entirely,
 * reverting the book back to UPLOADED without re-queuing any jobs.
 */
const CANCEL_PROCESSING_ALLOWED_STATUSES = new Set<BookStatus>([
  "UPLOADED",
  "AI_PROCESSING",
  "FORMATTING",
  "FORMATTED",
  "FORMATTING_REVIEW",
]);

export type AdminBookStatusProjection = {
  displayStatus: BookStatus;
  statusSource: AdminBookStatusSource;
};

export function resolveAdminBookStatusProjection(
  book: AdminBookStatusInput
): AdminBookStatusProjection {
  if (book.productionStatus) {
    return {
      displayStatus: book.productionStatus,
      statusSource: "production",
    };
  }

  return {
    displayStatus: book.status,
    statusSource: "manuscript",
  };
}

export function resolveNextAllowedBookStatuses(currentStatus: BookStatus): BookStatus[] {
  return ADMIN_BOOK_STATUS_TRANSITIONS[currentStatus] ?? [];
}

export function canRejectAdminBook(book: AdminBookStatusInput): boolean {
  const { displayStatus } = resolveAdminBookStatusProjection(book);
  return REJECTABLE_STATUSES.has(displayStatus) && book.status !== "REJECTED";
}

export function canUploadAdminHtmlFallback(book: AdminBookStatusInput): boolean {
  const { displayStatus } = resolveAdminBookStatusProjection(book);
  return HTML_FALLBACK_ALLOWED_STATUSES.has(displayStatus) && book.status !== "REJECTED";
}

export function canResetProcessingPipeline(book: AdminBookStatusInput): boolean {
  return RESET_PROCESSING_ALLOWED_STATUSES.has(book.status) && book.status !== "REJECTED";
}

export function canCancelProcessing(book: AdminBookStatusInput): boolean {
  return CANCEL_PROCESSING_ALLOWED_STATUSES.has(book.status) && book.status !== "REJECTED";
}

export function humanizeAdminBookStatus(status: string): string {
  return status
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}
