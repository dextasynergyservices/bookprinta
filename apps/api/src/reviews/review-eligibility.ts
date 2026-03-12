import type { BookStatus } from "@bookprinta/shared";

export const REVIEW_ELIGIBLE_BOOK_STATUSES = [
  "DELIVERED",
  "COMPLETED",
] as const satisfies readonly BookStatus[];
const REVIEW_ELIGIBLE_BOOK_STATUS_SET = new Set<BookStatus>(REVIEW_ELIGIBLE_BOOK_STATUSES);

export function resolveReviewLifecycleStatus(params: {
  manuscriptStatus: BookStatus;
  productionStatus: BookStatus | null | undefined;
}): BookStatus {
  return params.productionStatus ?? params.manuscriptStatus;
}

export function isReviewEligibleLifecycleStatus(status: BookStatus): boolean {
  return REVIEW_ELIGIBLE_BOOK_STATUS_SET.has(status);
}
