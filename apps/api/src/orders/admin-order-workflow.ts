import type {
  AdminOrderDisplayStatus,
  AdminOrderStatusSource,
  AdminRefundType,
  BookStatus,
  OrderStatus,
  RefundPolicySnapshot,
} from "@bookprinta/shared";

type AdminBookStageInput = {
  status: BookStatus;
  productionStatus: BookStatus | null;
} | null;

type RefundPolicyStage = {
  decision: RefundPolicySnapshot["policyDecision"];
  allowedRefundTypes: AdminRefundType[];
  recommendedRefundType: AdminRefundType | null;
  policyPercent: number;
  policyMessage: string;
};

const ORDER_SOURCE_STATUSES = new Set<OrderStatus>([
  "PENDING_PAYMENT",
  "PENDING_PAYMENT_APPROVAL",
  "PAID",
  "PROCESSING",
  "ACTION_REQUIRED",
  "PENDING_EXTRA_PAYMENT",
  "APPROVED",
  "IN_PRODUCTION",
  "COMPLETED",
  "CANCELLED",
  "REFUNDED",
]);

const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ["PENDING_PAYMENT_APPROVAL", "PAID", "CANCELLED"],
  PENDING_PAYMENT_APPROVAL: ["PAID", "CANCELLED"],
  PAID: ["PROCESSING", "AWAITING_UPLOAD", "CANCELLED"],
  PROCESSING: ["AWAITING_UPLOAD", "FORMATTING", "ACTION_REQUIRED", "CANCELLED"],
  AWAITING_UPLOAD: ["FORMATTING", "ACTION_REQUIRED", "CANCELLED"],
  FORMATTING: ["PREVIEW_READY", "ACTION_REQUIRED", "CANCELLED"],
  ACTION_REQUIRED: ["PROCESSING", "AWAITING_UPLOAD", "FORMATTING", "PREVIEW_READY", "CANCELLED"],
  PREVIEW_READY: ["PENDING_EXTRA_PAYMENT", "APPROVED", "ACTION_REQUIRED", "CANCELLED"],
  PENDING_EXTRA_PAYMENT: ["PREVIEW_READY", "CANCELLED"],
  APPROVED: ["IN_PRODUCTION"],
  IN_PRODUCTION: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
  REFUNDED: [],
};

const FULL_REFUND_STAGES = new Set<AdminOrderDisplayStatus>([
  "PAID",
  "PROCESSING",
  "AWAITING_UPLOAD",
  "PAYMENT_RECEIVED",
  "UPLOADED",
]);

const PARTIAL_REFUND_STAGES = new Set<AdminOrderDisplayStatus>([
  "AI_PROCESSING",
  "DESIGNING",
  "DESIGNED",
  "FORMATTING",
  "FORMATTED",
  "FORMATTING_REVIEW",
  "PREVIEW_READY",
  "REVIEW",
  "ACTION_REQUIRED",
  "PENDING_EXTRA_PAYMENT",
  "REJECTED",
]);

export type AdminStatusProjection = {
  bookStatus: BookStatus | null;
  displayStatus: AdminOrderDisplayStatus;
  statusSource: AdminOrderStatusSource;
};

export function resolveAdminBookStatus(book: AdminBookStageInput): BookStatus | null {
  if (!book) return null;
  return book.productionStatus ?? book.status;
}

export function resolveAdminStatusProjection(params: {
  orderStatus: OrderStatus;
  book: AdminBookStageInput;
}): AdminStatusProjection {
  const bookStatus = resolveAdminBookStatus(params.book);
  if (!bookStatus || ORDER_SOURCE_STATUSES.has(params.orderStatus)) {
    return {
      bookStatus,
      displayStatus: params.orderStatus as AdminOrderDisplayStatus,
      statusSource: "order",
    };
  }

  return {
    bookStatus,
    displayStatus: bookStatus as AdminOrderDisplayStatus,
    statusSource: "book",
  };
}

export function resolveNextAllowedOrderStatuses(currentStatus: OrderStatus): OrderStatus[] {
  return ORDER_STATUS_TRANSITIONS[currentStatus] ?? [];
}

export function buildRefundPolicySnapshot(params: {
  orderTotalAmount: number;
  orderStatus: OrderStatus;
  book: AdminBookStageInput;
  calculatedAt?: Date;
}): RefundPolicySnapshot {
  const projection = resolveAdminStatusProjection({
    orderStatus: params.orderStatus,
    book: params.book,
  });
  const stagePolicy = resolveRefundPolicyStage(projection.displayStatus);
  const maxRefundAmount = roundCurrency(
    (params.orderTotalAmount * stagePolicy.policyPercent) / 100
  );
  const recommendedAmount = stagePolicy.recommendedRefundType === null ? 0 : maxRefundAmount;

  return {
    calculatedAt: (params.calculatedAt ?? new Date()).toISOString(),
    statusSource: projection.statusSource,
    stage: projection.displayStatus,
    stageLabel: humanizeAdminStatus(projection.displayStatus),
    eligible: stagePolicy.policyPercent > 0 && params.orderTotalAmount > 0,
    policyDecision: stagePolicy.decision,
    allowedRefundTypes: stagePolicy.allowedRefundTypes,
    recommendedRefundType: stagePolicy.recommendedRefundType,
    orderTotalAmount: roundCurrency(params.orderTotalAmount),
    recommendedAmount,
    maxRefundAmount,
    policyPercent: stagePolicy.policyPercent,
    policyMessage: stagePolicy.policyMessage,
  };
}

export function humanizeAdminStatus(status: string): string {
  return status
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function resolveRefundPolicyStage(stage: AdminOrderDisplayStatus): RefundPolicyStage {
  if (FULL_REFUND_STAGES.has(stage)) {
    return {
      decision: "FULL",
      allowedRefundTypes: ["FULL", "CUSTOM"],
      recommendedRefundType: "FULL",
      policyPercent: 100,
      policyMessage: "Eligible for a full refund because processing has not started.",
    };
  }

  if (PARTIAL_REFUND_STAGES.has(stage)) {
    return {
      decision: "PARTIAL",
      allowedRefundTypes: ["PARTIAL", "CUSTOM"],
      recommendedRefundType: "PARTIAL",
      policyPercent: 70,
      policyMessage:
        "Eligible for up to 70% refund because production work has started but the order is not yet approved.",
    };
  }

  return {
    decision: "NONE",
    allowedRefundTypes: [],
    recommendedRefundType: null,
    policyPercent: 0,
    policyMessage: "This order is not eligible for a refund at its current stage.",
  };
}

function roundCurrency(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(2));
}
