import type { BookProgressStage } from "@/types/book-progress";

export const BOOK_PROGRESS_STAGE_LABEL_KEYS: Record<BookProgressStage, string> = {
  PAYMENT_RECEIVED: "book_progress_stage_payment_received",
  DESIGNING: "book_progress_stage_designing",
  DESIGNED: "book_progress_stage_designed",
  FORMATTING: "book_progress_stage_formatting",
  FORMATTED: "book_progress_stage_formatted",
  REVIEW: "book_progress_stage_review",
  APPROVED: "book_progress_stage_approved",
  PRINTING: "book_progress_stage_printing",
  PRINTED: "book_progress_stage_printed",
  SHIPPING: "book_progress_stage_shipping",
  DELIVERED: "book_progress_stage_delivered",
};

const WORKSPACE_DELIVERED_BOOK_STATUSES = new Set(["DELIVERED", "COMPLETED"]);
const WORKSPACE_APPROVED_BOOK_STATUSES = new Set([
  "APPROVED",
  "IN_PRODUCTION",
  "PRINTING",
  "PRINTED",
  "SHIPPING",
]);
const WORKSPACE_ACTION_REQUIRED_BOOK_STATUSES = new Set(["FORMATTING_REVIEW", "REJECTED"]);

export type DashboardTranslationValues = Record<string, string | number | Date>;
export type DashboardTranslator = (key: string, values?: DashboardTranslationValues) => string;

export type WorkspaceState =
  | "processing"
  | "blocked"
  | "payment_pending"
  | "unlocked"
  | "approved"
  | "delivered"
  | "action_required";

export function normalizeWorkspaceStatusToken(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized.toUpperCase() : null;
}

export function resolveWorkspaceState(params: {
  orderStatus: string | null;
  bookStatus: string | null;
  pageCount: number | null;
  isOrderLoading: boolean;
  latestExtraPaymentStatus: string | null;
  forceProcessing?: boolean;
}): WorkspaceState {
  const {
    orderStatus,
    bookStatus,
    pageCount,
    isOrderLoading,
    latestExtraPaymentStatus,
    forceProcessing,
  } = params;
  const normalizedOrderStatus = normalizeWorkspaceStatusToken(orderStatus);
  const normalizedBookStatus = normalizeWorkspaceStatusToken(bookStatus);
  const normalizedExtraPaymentStatus = normalizeWorkspaceStatusToken(latestExtraPaymentStatus);

  if (forceProcessing) return "processing";
  if (normalizedBookStatus && WORKSPACE_DELIVERED_BOOK_STATUSES.has(normalizedBookStatus)) {
    return "delivered";
  }
  if (normalizedBookStatus && WORKSPACE_APPROVED_BOOK_STATUSES.has(normalizedBookStatus)) {
    return "approved";
  }
  if (normalizedBookStatus && WORKSPACE_ACTION_REQUIRED_BOOK_STATUSES.has(normalizedBookStatus)) {
    return "action_required";
  }
  if (typeof pageCount !== "number") return "processing";
  if (isOrderLoading) return "processing";
  if (normalizedOrderStatus === "PENDING_EXTRA_PAYMENT") {
    if (
      normalizedExtraPaymentStatus === "PENDING" ||
      normalizedExtraPaymentStatus === "PROCESSING" ||
      normalizedExtraPaymentStatus === "INITIATED" ||
      normalizedExtraPaymentStatus === "SUCCESS"
    ) {
      return "payment_pending";
    }

    return "blocked";
  }
  if (normalizedBookStatus === "PREVIEW_READY") return "unlocked";
  return "processing";
}

export function resolveBillingGateState(params: {
  orderStatus: string | null;
  bookStatus: string | null;
  pageCount: number | null;
  isOrderLoading: boolean;
  latestExtraPaymentStatus: string | null;
  forceProcessing?: boolean;
}): "processing" | "payment_required" | "ready" | "approved" | "action_required" {
  const workspaceState = resolveWorkspaceState(params);

  if (workspaceState === "approved" || workspaceState === "delivered") return "approved";
  if (workspaceState === "unlocked") return "ready";
  if (workspaceState === "action_required") return "action_required";
  if (workspaceState === "blocked" || workspaceState === "payment_pending") {
    return "payment_required";
  }
  return "processing";
}

export function resolveFormattingSnapshotLabel(params: {
  tDashboard: DashboardTranslator;
  bookStatus: string | null;
  currentHtmlUrl: string | null;
  processingActive: boolean;
  forceProcessing?: boolean;
}): string {
  const normalizedBookStatus = normalizeWorkspaceStatusToken(params.bookStatus);

  if (normalizedBookStatus && WORKSPACE_DELIVERED_BOOK_STATUSES.has(normalizedBookStatus)) {
    return params.tDashboard("book_progress_meta_state_complete");
  }

  if (params.forceProcessing || params.processingActive) {
    return params.tDashboard("book_progress_meta_state_processing");
  }

  if (normalizedBookStatus && WORKSPACE_ACTION_REQUIRED_BOOK_STATUSES.has(normalizedBookStatus)) {
    return params.tDashboard("book_progress_meta_state_action_required");
  }

  if (params.currentHtmlUrl) {
    return params.tDashboard("book_progress_meta_state_ready");
  }

  return params.tDashboard("book_progress_meta_state_pending");
}

export function resolveReviewSnapshotLabel(params: {
  tDashboard: DashboardTranslator;
  bookStatus: string | null;
  pageCount: number | null;
  forceProcessing?: boolean;
}): string {
  const normalizedBookStatus = normalizeWorkspaceStatusToken(params.bookStatus);

  if (normalizedBookStatus && WORKSPACE_DELIVERED_BOOK_STATUSES.has(normalizedBookStatus)) {
    return params.tDashboard("book_progress_meta_state_complete");
  }

  if (params.forceProcessing) {
    return params.tDashboard("book_progress_meta_state_processing");
  }

  if (normalizedBookStatus && WORKSPACE_ACTION_REQUIRED_BOOK_STATUSES.has(normalizedBookStatus)) {
    return params.tDashboard("book_progress_meta_state_action_required");
  }

  if (
    typeof params.pageCount === "number" ||
    normalizedBookStatus === "PREVIEW_READY" ||
    (normalizedBookStatus && WORKSPACE_APPROVED_BOOK_STATUSES.has(normalizedBookStatus))
  ) {
    return params.tDashboard("book_progress_meta_state_ready");
  }

  return params.tDashboard("book_progress_meta_state_pending");
}

export function resolveWorkspaceSummary(params: {
  orderStatus: string | null;
  bookStatus: string | null;
  pageCount: number | null;
  isOrderLoading: boolean;
  latestExtraPaymentStatus: string | null;
  forceProcessing?: boolean;
}) {
  const workspaceState = resolveWorkspaceState(params);

  return {
    state: workspaceState,
    stateBadgeClassName:
      workspaceState === "blocked"
        ? "border-[#ef4444]/50 bg-[#2a1111] text-[#f3b2b2]"
        : workspaceState === "action_required"
          ? "border-[#f97316]/45 bg-[#2a1609] text-[#f8caa6]"
          : workspaceState === "payment_pending"
            ? "border-[#f59e0b]/45 bg-[#2b1b08] text-[#f8d7a0]"
            : workspaceState === "unlocked"
              ? "border-[#007eff]/40 bg-[#0d1f34] text-[#d7e8ff]"
              : workspaceState === "delivered"
                ? "border-[#16a34a]/40 bg-[#0d2015] text-[#c8f1d6]"
                : workspaceState === "approved"
                  ? "border-[#16a34a]/35 bg-[#0d2015] text-[#c8f1d6]"
                  : "border-[#2A2A2A] bg-[#0A0A0A] text-[#d0d0d0]",
    panelClassName:
      workspaceState === "blocked"
        ? "border-[#ef4444]/45 bg-[#160d0d]"
        : workspaceState === "action_required"
          ? "border-[#f97316]/35 bg-[#181007]"
          : workspaceState === "payment_pending"
            ? "border-[#f59e0b]/40 bg-[#171106]"
            : workspaceState === "unlocked"
              ? "border-[#007eff]/30 bg-[#0b1320]"
              : workspaceState === "delivered"
                ? "border-[#16a34a]/30 bg-[#0d1610]"
                : workspaceState === "approved"
                  ? "border-[#16a34a]/30 bg-[#0d1610]"
                  : "border-[#2A2A2A] bg-[#111111]",
    badgeKey:
      workspaceState === "blocked"
        ? "book_progress_workspace_badge_blocked"
        : workspaceState === "action_required"
          ? "book_progress_workspace_badge_action_required"
          : workspaceState === "payment_pending"
            ? "book_progress_workspace_badge_payment_pending"
            : workspaceState === "unlocked"
              ? "book_progress_workspace_badge_unlocked"
              : workspaceState === "delivered"
                ? "book_progress_workspace_badge_delivered"
                : workspaceState === "approved"
                  ? "book_progress_workspace_badge_approved"
                  : "book_progress_workspace_badge_processing",
    headingKey:
      workspaceState === "blocked"
        ? "book_progress_workspace_heading_blocked"
        : workspaceState === "action_required"
          ? "book_progress_workspace_heading_action_required"
          : workspaceState === "payment_pending"
            ? "book_progress_workspace_heading_payment_pending"
            : workspaceState === "unlocked"
              ? "book_progress_workspace_heading_unlocked"
              : workspaceState === "delivered"
                ? "book_progress_workspace_heading_delivered"
                : workspaceState === "approved"
                  ? "book_progress_workspace_heading_approved"
                  : "book_progress_workspace_heading_processing",
    descriptionKey:
      workspaceState === "blocked"
        ? "book_progress_workspace_desc_blocked"
        : workspaceState === "action_required"
          ? "book_progress_workspace_desc_action_required"
          : workspaceState === "payment_pending"
            ? "book_progress_workspace_desc_payment_pending"
            : workspaceState === "unlocked"
              ? "book_progress_workspace_desc_unlocked"
              : workspaceState === "delivered"
                ? "book_progress_workspace_desc_delivered"
                : workspaceState === "approved"
                  ? "book_progress_workspace_desc_approved"
                  : "book_progress_workspace_desc_processing",
  };
}
