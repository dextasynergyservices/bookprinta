import type { BookStatus } from "../generated/prisma/enums.js";

// Excludes AWAITING_UPLOAD because the user still needs to provide manuscript files.
// Excludes PRINTED and later because the delay applies only before books reach printed output.
export const PRODUCTION_DELAY_ACTIVE_BACKLOG_BOOK_STATUSES = [
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
  "APPROVED",
  "IN_PRODUCTION",
  "PRINTING",
] as const satisfies readonly BookStatus[];

const PRODUCTION_DELAY_ACTIVE_BACKLOG_STATUS_SET = new Set<BookStatus>(
  PRODUCTION_DELAY_ACTIVE_BACKLOG_BOOK_STATUSES
);

export function resolveProductionDelayLifecycleStatus(params: {
  manuscriptStatus: BookStatus;
  productionStatus: BookStatus | null | undefined;
}): BookStatus {
  return params.productionStatus ?? params.manuscriptStatus;
}

export function isProductionDelayBacklogLifecycleStatus(status: BookStatus): boolean {
  return PRODUCTION_DELAY_ACTIVE_BACKLOG_STATUS_SET.has(status);
}
