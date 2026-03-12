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

export type BookRolloutEnvironment = "development" | "test" | "staging" | "production" | "unknown";

export type BookRolloutAccess = "enabled" | "grandfathered" | "disabled";

export type BookRolloutBlockedFeature =
  | "workspace"
  | "manuscript_pipeline"
  | "billing_gate"
  | "final_pdf";

export type BookProcessingTrigger = "upload" | "settings_change" | "approval";

export type BookProcessingStep =
  | "AI_FORMATTING"
  | "RENDERING_PREVIEW"
  | "COUNTING_PAGES"
  | "GENERATING_FINAL_PDF";

export type BookProcessingJobStatus = "queued" | "processing";

export interface BookRolloutFeatureState {
  enabled: boolean;
  access: BookRolloutAccess;
}

export interface BookRolloutState {
  environment: BookRolloutEnvironment;
  allowInFlightAccess: boolean;
  isGrandfathered: boolean;
  blockedBy: BookRolloutBlockedFeature | null;
  workspace: BookRolloutFeatureState;
  manuscriptPipeline: BookRolloutFeatureState;
  billingGate: BookRolloutFeatureState;
  finalPdf: BookRolloutFeatureState;
}

export interface BookProcessingState {
  isActive: boolean;
  currentStep: BookProcessingStep | null;
  jobStatus: BookProcessingJobStatus | null;
  trigger: BookProcessingTrigger | null;
  startedAt: string | null;
  attempt: number | null;
  maxAttempts: number | null;
}

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
  productionStatus: BookStatus | (string & {}) | null;
  latestProcessingError: string | null;
  rejectionReason: string | null;
  currentStage: BookProgressStage;
  isRejected: boolean;
  timeline: BookProgressTimelineStep[];
  title: string | null;
  coverImageUrl: string | null;
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
  rollout: BookRolloutState;
  processing: BookProcessingState;
}
