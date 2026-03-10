import {
  BOOK_PROGRESS_STAGES,
  type BookProcessingJobStatus,
  type BookProcessingState,
  type BookProcessingStep,
  type BookProcessingTrigger,
  type BookProgressNormalizedResponse,
  type BookProgressSource,
  type BookProgressStage,
  type BookProgressTimelineStep,
  type BookRolloutAccess,
  type BookRolloutBlockedFeature,
  type BookRolloutEnvironment,
  type BookRolloutState,
} from "@/types/book-progress";

/**
 * Phase 0 endpoint alignment:
 * - Current source: GET /api/v1/orders/:id/tracking
 * - Planned canonical source: GET /api/v1/books/:id (when BooksModule lands)
 */
export const BOOK_PROGRESS_TRACKER_SOURCE_ENDPOINT = "/api/v1/orders/:id/tracking";
export const BOOK_PROGRESS_TRACKER_TARGET_ENDPOINT = "/api/v1/books/:id";

const PRODUCTION_STATUS_TO_PROGRESS_STAGE: Record<string, BookProgressStage> = {
  PAYMENT_RECEIVED: "PAYMENT_RECEIVED",
  DESIGNING: "DESIGNING",
  DESIGNED: "DESIGNED",
  FORMATTING: "FORMATTING",
  FORMATTED: "FORMATTED",
  REVIEW: "REVIEW",
  APPROVED: "APPROVED",
  REJECTED: "REVIEW",
  IN_PRODUCTION: "PRINTING",
  PRINTING: "PRINTING",
  PRINTED: "PRINTED",
  SHIPPING: "SHIPPING",
  DELIVERED: "DELIVERED",
  COMPLETED: "DELIVERED",
  CANCELLED: "REVIEW",
};

function deriveLegacyProductionStatus(status: string | null): string | null {
  switch (status) {
    case "PAYMENT_RECEIVED":
    case "DESIGNING":
    case "DESIGNED":
    case "REVIEW":
    case "REJECTED":
    case "APPROVED":
    case "IN_PRODUCTION":
    case "PRINTING":
    case "PRINTED":
    case "SHIPPING":
    case "DELIVERED":
    case "COMPLETED":
    case "CANCELLED":
      return status;
    default:
      return "PAYMENT_RECEIVED";
  }
}

type TimelineRow = {
  status: string | null;
  state: string | null;
  reachedAt: string | null;
};

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function toArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function toStringValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function toNumberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  if (
    value &&
    typeof value === "object" &&
    "toNumber" in value &&
    typeof (value as { toNumber?: unknown }).toNumber === "function"
  ) {
    const parsed = (value as { toNumber: () => number }).toNumber();
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

function normalizeStatus(value: unknown): string | null {
  const raw = toStringValue(value);
  if (!raw) return null;
  return raw.replace(/[\s-]+/g, "_").toUpperCase();
}

function toIsoDatetime(value: unknown): string | null {
  const raw = toStringValue(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function toBooleanValue(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }

  return null;
}

function normalizeRolloutAccess(value: unknown): BookRolloutAccess | null {
  const normalized = normalizeStatus(value);
  if (normalized === "ENABLED") return "enabled";
  if (normalized === "GRANDFATHERED") return "grandfathered";
  if (normalized === "DISABLED") return "disabled";
  return null;
}

function normalizeRolloutEnvironment(value: unknown): BookRolloutEnvironment | null {
  const raw = toStringValue(value);
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "development") return "development";
  if (normalized === "test") return "test";
  if (normalized === "staging") return "staging";
  if (normalized === "production") return "production";
  if (normalized === "unknown") return "unknown";
  return null;
}

function normalizeBlockedFeature(value: unknown): BookRolloutBlockedFeature | null {
  const raw = toStringValue(value);
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  if (
    normalized === "workspace" ||
    normalized === "manuscript_pipeline" ||
    normalized === "billing_gate" ||
    normalized === "final_pdf"
  ) {
    return normalized;
  }

  return null;
}

function createFallbackRolloutState(): BookRolloutState {
  return {
    environment: "unknown",
    allowInFlightAccess: true,
    isGrandfathered: false,
    blockedBy: null,
    workspace: { enabled: true, access: "enabled" },
    manuscriptPipeline: { enabled: true, access: "enabled" },
    billingGate: { enabled: true, access: "enabled" },
    finalPdf: { enabled: true, access: "enabled" },
  };
}

function createFallbackProcessingState(): BookProcessingState {
  return {
    isActive: false,
    currentStep: null,
    jobStatus: null,
    trigger: null,
    startedAt: null,
    attempt: null,
    maxAttempts: null,
  };
}

function normalizeProcessingStep(value: unknown): BookProcessingStep | null {
  const raw = toStringValue(value);
  if (
    raw === "AI_FORMATTING" ||
    raw === "RENDERING_PREVIEW" ||
    raw === "COUNTING_PAGES" ||
    raw === "GENERATING_FINAL_PDF"
  ) {
    return raw;
  }

  return null;
}

function normalizeProcessingJobStatus(value: unknown): BookProcessingJobStatus | null {
  const raw = toStringValue(value)?.toLowerCase();
  return raw === "queued" || raw === "processing" ? raw : null;
}

function normalizeProcessingTrigger(value: unknown): BookProcessingTrigger | null {
  const raw = toStringValue(value);
  return raw === "upload" || raw === "settings_change" || raw === "approval" ? raw : null;
}

function resolveRolloutFeatureState(value: unknown): BookRolloutState["workspace"] | null {
  const record = toRecord(value);
  if (!record) return null;

  const enabled = toBooleanValue(record.enabled);
  const access = normalizeRolloutAccess(record.access);
  if (enabled === null || !access) return null;

  return { enabled, access };
}

function resolveRolloutState(payload: unknown): BookRolloutState {
  const root = toRecord(payload);
  const data = toRecord(root?.data);
  const book = toRecord(root?.book);
  const rolloutRecord =
    toRecord(root?.rollout) ?? toRecord(data?.rollout) ?? toRecord(book?.rollout) ?? null;
  const fallback = createFallbackRolloutState();

  if (!rolloutRecord) return fallback;

  return {
    environment: normalizeRolloutEnvironment(rolloutRecord.environment) ?? fallback.environment,
    allowInFlightAccess:
      toBooleanValue(rolloutRecord.allowInFlightAccess) ?? fallback.allowInFlightAccess,
    isGrandfathered: toBooleanValue(rolloutRecord.isGrandfathered) ?? fallback.isGrandfathered,
    blockedBy: normalizeBlockedFeature(rolloutRecord.blockedBy) ?? fallback.blockedBy,
    workspace: resolveRolloutFeatureState(rolloutRecord.workspace) ?? fallback.workspace,
    manuscriptPipeline:
      resolveRolloutFeatureState(rolloutRecord.manuscriptPipeline) ?? fallback.manuscriptPipeline,
    billingGate: resolveRolloutFeatureState(rolloutRecord.billingGate) ?? fallback.billingGate,
    finalPdf: resolveRolloutFeatureState(rolloutRecord.finalPdf) ?? fallback.finalPdf,
  };
}

function resolveProcessingState(payload: unknown): BookProcessingState {
  const root = toRecord(payload);
  const data = toRecord(root?.data);
  const book = toRecord(root?.book);
  const processingRecord =
    toRecord(root?.processing) ?? toRecord(data?.processing) ?? toRecord(book?.processing) ?? null;
  const fallback = createFallbackProcessingState();

  if (!processingRecord) return fallback;

  return {
    isActive: toBooleanValue(processingRecord.isActive) ?? fallback.isActive,
    currentStep: normalizeProcessingStep(processingRecord.currentStep) ?? fallback.currentStep,
    jobStatus: normalizeProcessingJobStatus(processingRecord.jobStatus) ?? fallback.jobStatus,
    trigger: normalizeProcessingTrigger(processingRecord.trigger) ?? fallback.trigger,
    startedAt: toIsoDatetime(processingRecord.startedAt),
    attempt: toNumberValue(processingRecord.attempt),
    maxAttempts: toNumberValue(processingRecord.maxAttempts),
  };
}

function resolveSource(payload: unknown): BookProgressSource {
  const root = toRecord(payload);
  const data = toRecord(root?.data);

  const orderSignal =
    root?.orderId ?? data?.orderId ?? root?.currentOrderStatus ?? data?.currentOrderStatus;
  return orderSignal ? "orders_tracking" : "books_detail";
}

function resolveTimelineRows(payload: unknown): TimelineRow[] {
  const root = toRecord(payload);
  const data = toRecord(root?.data);
  const book = toRecord(root?.book);
  const progress = toRecord(root?.progress);

  const candidates: unknown[] = [
    root?.timeline,
    data?.timeline,
    book?.timeline,
    progress?.timeline,
    root?.stages,
    data?.stages,
    progress?.stages,
  ];

  const timeline = candidates
    .map(toArray)
    .find((value): value is unknown[] => Array.isArray(value));

  if (!timeline) return [];

  return timeline
    .map((item) => {
      const row = toRecord(item);
      if (!row) return null;

      return {
        status: normalizeStatus(row.status),
        state: normalizeStatus(row.state),
        reachedAt: toIsoDatetime(row.reachedAt ?? row.timestamp ?? row.completedAt),
      };
    })
    .filter((row): row is TimelineRow => row !== null);
}

function resolveCurrentStatus(payload: unknown, timeline: TimelineRow[]): string | null {
  const root = toRecord(payload);
  const data = toRecord(root?.data);
  const book = toRecord(root?.book);
  const progress = toRecord(root?.progress);

  const currentTimelineStatus =
    timeline.find((entry) => entry.state === "CURRENT")?.status ??
    timeline[timeline.length - 1]?.status ??
    null;

  return (
    normalizeStatus(root?.currentBookStatus) ??
    normalizeStatus(data?.currentBookStatus) ??
    normalizeStatus(root?.status) ??
    normalizeStatus(data?.status) ??
    normalizeStatus(book?.status) ??
    normalizeStatus(progress?.currentStatus) ??
    normalizeStatus(root?.currentStatus) ??
    normalizeStatus(data?.currentStatus) ??
    currentTimelineStatus
  );
}

function resolveProductionStatus(payload: unknown, currentStatus: string | null): string | null {
  const root = toRecord(payload);
  const data = toRecord(root?.data);
  const book = toRecord(root?.book);
  const progress = toRecord(root?.progress);

  return (
    normalizeStatus(root?.productionStatus) ??
    normalizeStatus(data?.productionStatus) ??
    normalizeStatus(book?.productionStatus) ??
    normalizeStatus(progress?.productionStatus) ??
    deriveLegacyProductionStatus(currentStatus)
  );
}

function resolveBookId(payload: unknown): string | null {
  const root = toRecord(payload);
  const data = toRecord(root?.data);
  const book = toRecord(root?.book);

  return (
    toStringValue(root?.bookId) ??
    toStringValue(data?.bookId) ??
    toStringValue(book?.id) ??
    toStringValue(root?.id) ??
    toStringValue(data?.id) ??
    null
  );
}

function resolveOrderId(payload: unknown): string | null {
  const root = toRecord(payload);
  const data = toRecord(root?.data);
  const book = toRecord(root?.book);

  return (
    toStringValue(root?.orderId) ??
    toStringValue(data?.orderId) ??
    toStringValue(book?.orderId) ??
    null
  );
}

function resolveRejectionReason(payload: unknown): string | null {
  const root = toRecord(payload);
  const data = toRecord(root?.data);
  const book = toRecord(root?.book);

  return (
    toStringValue(root?.rejectionReason) ??
    toStringValue(data?.rejectionReason) ??
    toStringValue(book?.rejectionReason) ??
    null
  );
}

function resolveLatestProcessingError(payload: unknown): string | null {
  const root = toRecord(payload);
  const data = toRecord(root?.data);
  const book = toRecord(root?.book);

  return (
    toStringValue(root?.latestProcessingError) ??
    toStringValue(data?.latestProcessingError) ??
    toStringValue(book?.latestProcessingError) ??
    null
  );
}

function resolveBookMetadata(payload: unknown) {
  const root = toRecord(payload);
  const data = toRecord(root?.data);
  const book = toRecord(root?.book);

  return {
    pageCount:
      toNumberValue(root?.pageCount) ??
      toNumberValue(data?.pageCount) ??
      toNumberValue(book?.pageCount),
    wordCount:
      toNumberValue(root?.wordCount) ??
      toNumberValue(data?.wordCount) ??
      toNumberValue(book?.wordCount),
    estimatedPages:
      toNumberValue(root?.estimatedPages) ??
      toNumberValue(data?.estimatedPages) ??
      toNumberValue(book?.estimatedPages),
    fontFamily:
      toStringValue(root?.fontFamily) ??
      toStringValue(data?.fontFamily) ??
      toStringValue(book?.fontFamily),
    fontSize:
      toNumberValue(root?.fontSize) ??
      toNumberValue(data?.fontSize) ??
      toNumberValue(book?.fontSize),
    pageSize:
      toStringValue(root?.pageSize) ??
      toStringValue(data?.pageSize) ??
      toStringValue(book?.pageSize),
    currentHtmlUrl:
      toStringValue(root?.currentHtmlUrl) ??
      toStringValue(data?.currentHtmlUrl) ??
      toStringValue(book?.currentHtmlUrl),
    previewPdfUrl:
      toStringValue(root?.previewPdfUrl) ??
      toStringValue(data?.previewPdfUrl) ??
      toStringValue(book?.previewPdfUrl),
    finalPdfUrl:
      toStringValue(root?.finalPdfUrl) ??
      toStringValue(data?.finalPdfUrl) ??
      toStringValue(book?.finalPdfUrl),
    updatedAt: toIsoDatetime(root?.updatedAt ?? data?.updatedAt ?? book?.updatedAt),
  } as const;
}

export function mapBackendStatusToProgressStage(
  status: string | null | undefined
): BookProgressStage | null {
  const normalized = normalizeStatus(status);
  if (!normalized) return null;

  return PRODUCTION_STATUS_TO_PROGRESS_STAGE[normalized] ?? null;
}

function resolveCurrentStageIndex(status: string | null): number {
  const stage = mapBackendStatusToProgressStage(status) ?? BOOK_PROGRESS_STAGES[0];
  const index = BOOK_PROGRESS_STAGES.indexOf(stage);
  return index === -1 ? 0 : index;
}

function resolveReachedAtByStage(timeline: TimelineRow[]): Map<BookProgressStage, string> {
  const map = new Map<BookProgressStage, string>();

  for (const entry of timeline) {
    const stage = mapBackendStatusToProgressStage(entry.status);
    if (!stage || !entry.reachedAt) continue;

    const previous = map.get(stage);
    if (!previous || new Date(entry.reachedAt).getTime() > new Date(previous).getTime()) {
      map.set(stage, entry.reachedAt);
    }
  }

  return map;
}

function createTimeline(
  currentStageIndex: number,
  isRejected: boolean,
  reachedAtByStage: Map<BookProgressStage, string>,
  currentStatus: string | null
): BookProgressTimelineStep[] {
  const rejectedStageIndex = BOOK_PROGRESS_STAGES.indexOf("REVIEW");

  return BOOK_PROGRESS_STAGES.map((stage, index) => {
    let state: BookProgressTimelineStep["state"] = "upcoming";

    if (isRejected) {
      if (index < rejectedStageIndex) {
        state = "completed";
      } else if (index === rejectedStageIndex) {
        state = "rejected";
      }
    } else if (index < currentStageIndex) {
      state = "completed";
    } else if (index === currentStageIndex) {
      state = "current";
    }

    return {
      stage,
      state,
      reachedAt: reachedAtByStage.get(stage) ?? null,
      sourceStatus: index === currentStageIndex ? currentStatus : null,
    };
  });
}

export function normalizeBookProgressPayload(payload: unknown): BookProgressNormalizedResponse {
  const sourceEndpoint = resolveSource(payload);
  const timelineRows = resolveTimelineRows(payload);
  const currentStatus = resolveCurrentStatus(payload, timelineRows);
  const productionStatus = resolveProductionStatus(payload, currentStatus);
  const rejectionReason = resolveRejectionReason(payload);
  const isRejected = productionStatus === "REJECTED";
  const currentStageIndex = isRejected
    ? BOOK_PROGRESS_STAGES.indexOf("REVIEW")
    : resolveCurrentStageIndex(productionStatus);
  const reachedAtByStage = resolveReachedAtByStage(timelineRows);
  const timeline = createTimeline(
    currentStageIndex,
    isRejected,
    reachedAtByStage,
    productionStatus
  );
  const metadata = resolveBookMetadata(payload);
  const rollout = resolveRolloutState(payload);
  const processing = resolveProcessingState(payload);

  return {
    sourceEndpoint,
    bookId: resolveBookId(payload),
    orderId: resolveOrderId(payload),
    currentStatus,
    productionStatus,
    latestProcessingError: resolveLatestProcessingError(payload),
    rejectionReason,
    currentStage: timeline[currentStageIndex]?.stage ?? BOOK_PROGRESS_STAGES[0],
    isRejected,
    timeline,
    pageCount: metadata.pageCount,
    wordCount: metadata.wordCount,
    estimatedPages: metadata.estimatedPages,
    fontFamily: metadata.fontFamily,
    fontSize: metadata.fontSize,
    pageSize: metadata.pageSize,
    currentHtmlUrl: metadata.currentHtmlUrl,
    previewPdfUrl: metadata.previewPdfUrl,
    finalPdfUrl: metadata.finalPdfUrl,
    updatedAt: metadata.updatedAt,
    rollout,
    processing,
  };
}
