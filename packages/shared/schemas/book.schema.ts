import { z } from "zod";
import { BookStatusSchema, OrderStatusSchema } from "./order.schema.ts";

// ==========================================
// Book Schemas — Source of Truth
// Shared between frontend & backend
// ==========================================

export const BookProgressStageSchema = z.enum([
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
]);
export type BookProgressStage = z.infer<typeof BookProgressStageSchema>;

export const BookProgressStateSchema = z.enum(["completed", "current", "upcoming", "rejected"]);
export type BookProgressState = z.infer<typeof BookProgressStateSchema>;

export const RolloutEnvironmentSchema = z.enum([
  "development",
  "test",
  "staging",
  "production",
  "unknown",
]);
export type RolloutEnvironment = z.infer<typeof RolloutEnvironmentSchema>;

export const RolloutAccessSchema = z.enum(["enabled", "grandfathered", "disabled"]);
export type RolloutAccess = z.infer<typeof RolloutAccessSchema>;

export const RolloutBlockedFeatureSchema = z.enum([
  "workspace",
  "manuscript_pipeline",
  "billing_gate",
  "final_pdf",
]);
export type RolloutBlockedFeature = z.infer<typeof RolloutBlockedFeatureSchema>;

export const BookRolloutFeatureStateSchema = z.object({
  enabled: z.boolean(),
  access: RolloutAccessSchema,
});
export type BookRolloutFeatureState = z.infer<typeof BookRolloutFeatureStateSchema>;

export const BookRolloutStateSchema = z.object({
  environment: RolloutEnvironmentSchema,
  allowInFlightAccess: z.boolean(),
  isGrandfathered: z.boolean(),
  blockedBy: RolloutBlockedFeatureSchema.nullable(),
  workspace: BookRolloutFeatureStateSchema,
  manuscriptPipeline: BookRolloutFeatureStateSchema,
  billingGate: BookRolloutFeatureStateSchema,
  finalPdf: BookRolloutFeatureStateSchema,
});
export type BookRolloutState = z.infer<typeof BookRolloutStateSchema>;

export const BookProcessingTriggerSchema = z.enum(["upload", "settings_change", "approval"]);
export type BookProcessingTrigger = z.infer<typeof BookProcessingTriggerSchema>;

export const BookProcessingStepSchema = z.enum([
  "AI_FORMATTING",
  "RENDERING_PREVIEW",
  "COUNTING_PAGES",
  "GENERATING_FINAL_PDF",
]);
export type BookProcessingStep = z.infer<typeof BookProcessingStepSchema>;

export const BookProcessingJobStatusSchema = z.enum(["queued", "processing"]);
export type BookProcessingJobStatus = z.infer<typeof BookProcessingJobStatusSchema>;

export const BookProcessingStateSchema = z.object({
  isActive: z.boolean(),
  currentStep: BookProcessingStepSchema.nullable(),
  jobStatus: BookProcessingJobStatusSchema.nullable(),
  trigger: BookProcessingTriggerSchema.nullable(),
  startedAt: z.string().datetime().nullable(),
  attempt: z.number().int().positive().nullable(),
  maxAttempts: z.number().int().positive().nullable(),
});
export type BookProcessingState = z.infer<typeof BookProcessingStateSchema>;

/**
 * Common path param for /books/:id routes
 */
export const BookParamsSchema = z.object({
  id: z.string().cuid(),
});
export type BookParamsInput = z.infer<typeof BookParamsSchema>;

export const BookPageSizeSchema = z.enum(["A4", "A5"]);
export type BookPageSize = z.infer<typeof BookPageSizeSchema>;

export const BookFontSizeSchema = z.union([z.literal(11), z.literal(12), z.literal(14)]);
export type BookFontSize = z.infer<typeof BookFontSizeSchema>;

export const BookTitleSchema = z
  .string()
  .trim()
  .min(1, "Title is required")
  .max(240, "Title must be at most 240 characters");
export type BookTitle = z.infer<typeof BookTitleSchema>;

/**
 * PATCH /api/v1/books/:id/settings
 * Stores the user's pre-upload formatting choices.
 */
export const UpdateBookSettingsSchema = z.object({
  title: BookTitleSchema.optional(),
  pageSize: BookPageSizeSchema,
  fontSize: BookFontSizeSchema,
});
export type UpdateBookSettingsInput = z.infer<typeof UpdateBookSettingsSchema>;

export const BookSettingsResponseSchema = z.object({
  id: z.string().cuid(),
  title: BookTitleSchema.nullable(),
  pageSize: BookPageSizeSchema,
  fontSize: BookFontSizeSchema,
  wordCount: z.number().int().nullable(),
  estimatedPages: z.number().int().nullable(),
  updatedAt: z.string().datetime(),
});
export type BookSettingsResponse = z.infer<typeof BookSettingsResponseSchema>;

/**
 * PATCH /api/v1/admin/books/:id/status
 * Updates the admin-controlled production tracker status.
 */
export const UpdateAdminBookProductionStatusSchema = z.object({
  productionStatus: BookProgressStageSchema,
});
export type UpdateAdminBookProductionStatusInput = z.infer<
  typeof UpdateAdminBookProductionStatusSchema
>;

export const AdminBookProductionStatusResponseSchema = z.object({
  bookId: z.string().cuid(),
  productionStatus: BookProgressStageSchema,
  updatedAt: z.string().datetime(),
});
export type AdminBookProductionStatusResponse = z.infer<
  typeof AdminBookProductionStatusResponseSchema
>;

/**
 * POST /api/v1/books/:id/upload
 * Result after malware scan + storage + manuscript metrics extraction.
 */
export const BookManuscriptUploadResponseSchema = z.object({
  bookId: z.string().cuid(),
  title: z.string().trim().min(1).max(240).nullable(),
  fileId: z.string().cuid(),
  fileUrl: z.string().url(),
  fileName: z.string().min(1),
  fileSize: z.number().int().positive(),
  mimeType: z.enum([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]),
  pageSize: BookPageSizeSchema,
  fontSize: BookFontSizeSchema,
  wordCount: z.number().int().positive(),
  estimatedPages: z.number().int().positive(),
});
export type BookManuscriptUploadResponse = z.infer<typeof BookManuscriptUploadResponseSchema>;

/**
 * POST /api/v1/books/:id/approve
 * Approve manuscript for production after billing gate checks.
 */
export const ApproveBookSchema = z.object({
  gateSnapshot: z.string().min(1).max(255).optional(),
});
export type ApproveBookInput = z.infer<typeof ApproveBookSchema>;

export const BookApproveResponseSchema = z.object({
  bookId: z.string().cuid(),
  bookStatus: BookStatusSchema,
  orderStatus: OrderStatusSchema,
  queuedJob: z.object({
    queue: z.literal("pdf-generation"),
    name: z.literal("generate-pdf"),
    jobId: z.string().nullable(),
  }),
});
export type BookApproveResponse = z.infer<typeof BookApproveResponseSchema>;

export const BookReprocessResponseSchema = z.object({
  bookId: z.string().cuid(),
  bookStatus: BookStatusSchema,
  orderStatus: OrderStatusSchema,
  queuedJob: z.object({
    queue: z.literal("ai-formatting"),
    name: z.literal("format-manuscript"),
    jobId: z.string().nullable(),
  }),
});
export type BookReprocessResponse = z.infer<typeof BookReprocessResponseSchema>;

export const BookPreviewResponseSchema = z.object({
  bookId: z.string().cuid(),
  previewPdfUrl: z.string().url(),
  status: BookStatusSchema,
  watermarked: z.boolean(),
});
export type BookPreviewResponse = z.infer<typeof BookPreviewResponseSchema>;

export const BookFileTypeSchema = z.enum([
  "RAW_MANUSCRIPT",
  "CLEANED_TEXT",
  "CLEANED_HTML",
  "FORMATTED_PDF",
  "PREVIEW_PDF",
  "FINAL_PDF",
  "ADMIN_GENERATED_DOCX",
  "COVER_DESIGN_DRAFT",
  "COVER_DESIGN_FINAL",
  "USER_UPLOADED_IMAGE",
]);
export type BookFileType = z.infer<typeof BookFileTypeSchema>;

export const BookFileVersionSchema = z.object({
  id: z.string().cuid(),
  fileType: BookFileTypeSchema,
  url: z.string().url(),
  fileName: z.string().nullable(),
  fileSize: z.number().int().nullable(),
  mimeType: z.string().nullable(),
  version: z.number().int().positive(),
  createdBy: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type BookFileVersion = z.infer<typeof BookFileVersionSchema>;

export const BookFilesResponseSchema = z.object({
  bookId: z.string().cuid(),
  files: z.array(BookFileVersionSchema),
});
export type BookFilesResponse = z.infer<typeof BookFilesResponseSchema>;

export const BookTimelineItemSchema = z.object({
  key: z.string(),
  label: z.string(),
  stage: BookProgressStageSchema,
  sourceStatus: BookStatusSchema.nullable(),
  state: BookProgressStateSchema,
  reachedAt: z.string().datetime().nullable(),
});
export type BookTimelineItem = z.infer<typeof BookTimelineItemSchema>;

/**
 * GET /api/v1/books/:id
 */
export const BookDetailResponseSchema = z.object({
  id: z.string().cuid(),
  orderId: z.string().cuid(),
  status: BookStatusSchema,
  productionStatus: BookStatusSchema,
  title: z.string().trim().min(1).max(240).nullable(),
  coverImageUrl: z.string().nullable(),
  latestProcessingError: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  rejectedAt: z.string().datetime().nullable(),
  pageCount: z.number().int().nullable(),
  wordCount: z.number().int().nullable(),
  estimatedPages: z.number().int().nullable(),
  fontFamily: z.string().nullable(),
  fontSize: z.number().int().nullable(),
  pageSize: z.string().nullable(),
  currentHtmlUrl: z.string().nullable(),
  previewPdfUrl: z.string().nullable(),
  finalPdfUrl: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  rollout: BookRolloutStateSchema,
  processing: BookProcessingStateSchema,
  timeline: z.array(BookTimelineItemSchema),
});
export type BookDetailResponse = z.infer<typeof BookDetailResponseSchema>;
