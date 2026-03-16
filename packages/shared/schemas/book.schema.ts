import { z } from "zod";
import { AdminAuditEntrySchema, AdminSortDirectionSchema } from "./admin.schema.ts";
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

export const ReprintBookSizeSchema = z.enum(["A4", "A5", "A6"]);
export type ReprintBookSize = z.infer<typeof ReprintBookSizeSchema>;

export const PaperColorSchema = z.enum(["white", "cream"]);
export type PaperColor = z.infer<typeof PaperColorSchema>;

export const LaminationSchema = z.enum(["matt", "gloss"]);
export type Lamination = z.infer<typeof LaminationSchema>;

export const ReprintPaymentProviderSchema = z.enum(["PAYSTACK", "STRIPE"]);
export type ReprintPaymentProvider = z.infer<typeof ReprintPaymentProviderSchema>;

export const ReprintUnavailableReasonSchema = z.enum([
  "BOOK_NOT_ELIGIBLE",
  "FINAL_PDF_MISSING",
  "PAGE_COUNT_UNAVAILABLE",
  "BOOK_SIZE_UNSUPPORTED",
  "PAYMENT_PROVIDER_UNAVAILABLE",
]);
export type ReprintUnavailableReason = z.infer<typeof ReprintUnavailableReasonSchema>;

export const ReprintCostPerPageBySizeSchema = z.object({
  A4: z.number().nonnegative(),
  A5: z.number().nonnegative(),
  A6: z.number().nonnegative(),
});
export type ReprintCostPerPageBySize = z.infer<typeof ReprintCostPerPageBySizeSchema>;

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

export const BookReprintConfigResponseSchema = z.object({
  bookId: z.string().cuid(),
  canReprintSame: z.boolean(),
  disableReason: ReprintUnavailableReasonSchema.nullable(),
  finalPdfUrlPresent: z.boolean(),
  pageCount: z.number().int().positive().nullable(),
  minCopies: z.number().int().min(1),
  defaultBookSize: ReprintBookSizeSchema.nullable(),
  defaultPaperColor: PaperColorSchema,
  defaultLamination: LaminationSchema,
  allowedBookSizes: z.array(ReprintBookSizeSchema).min(1),
  allowedPaperColors: z.array(PaperColorSchema).min(1),
  allowedLaminations: z.array(LaminationSchema).min(1),
  costPerPageBySize: ReprintCostPerPageBySizeSchema,
  enabledPaymentProviders: z.array(ReprintPaymentProviderSchema),
});
export type BookReprintConfigResponse = z.infer<typeof BookReprintConfigResponseSchema>;

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
 * GET /api/v1/books?page=1&limit=10
 */
export const UserBooksListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
export type UserBooksListQueryInput = z.infer<typeof UserBooksListQuerySchema>;

export const UserBooksPaginationSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  totalItems: z.number().int().min(0),
  totalPages: z.number().int().min(0),
  hasPreviousPage: z.boolean(),
  hasNextPage: z.boolean(),
});
export type UserBooksPagination = z.infer<typeof UserBooksPaginationSchema>;

export const UserBookListItemSchema = z.object({
  id: z.string().cuid(),
  orderId: z.string().cuid(),
  title: BookTitleSchema.nullable(),
  status: BookStatusSchema,
  productionStatus: BookStatusSchema,
  orderStatus: OrderStatusSchema,
  currentStage: BookProgressStageSchema,
  coverImageUrl: z.string().nullable(),
  latestProcessingError: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  pageCount: z.number().int().nullable(),
  wordCount: z.number().int().nullable(),
  estimatedPages: z.number().int().nullable(),
  fontSize: BookFontSizeSchema.nullable(),
  pageSize: BookPageSizeSchema.nullable(),
  previewPdfUrlPresent: z.boolean(),
  finalPdfUrlPresent: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  workspaceUrl: z.string().trim().min(1),
  trackingUrl: z.string().trim().min(1),
  rollout: BookRolloutStateSchema,
  processing: BookProcessingStateSchema,
});
export type UserBookListItem = z.infer<typeof UserBookListItemSchema>;

export const UserBooksListResponseSchema = z.object({
  items: z.array(UserBookListItemSchema),
  pagination: UserBooksPaginationSchema,
});
export type UserBooksListResponse = z.infer<typeof UserBooksListResponseSchema>;

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

// ==========================================
// Admin Book Schemas
// ==========================================

/**
 * Computed admin-facing status derived as:
 *   productionStatus ?? status
 *
 * This is the single status used for admin table filters, badges,
 * and transition controls.
 */
export const AdminBookDisplayStatusSchema = BookStatusSchema;
export type AdminBookDisplayStatus = z.infer<typeof AdminBookDisplayStatusSchema>;

export const AdminBookStatusSourceSchema = z.enum(["manuscript", "production"]);
export type AdminBookStatusSource = z.infer<typeof AdminBookStatusSourceSchema>;

export const AdminBookSortFieldSchema = z.enum([
  "title",
  "authorName",
  "displayStatus",
  "orderNumber",
  "uploadedAt",
]);
export type AdminBookSortField = z.infer<typeof AdminBookSortFieldSchema>;

/**
 * GET /api/v1/admin/books?cursor=&limit=&status=&sortBy=&sortDirection=
 */
export const AdminBooksListQuerySchema = z.object({
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: AdminBookDisplayStatusSchema.optional(),
  sortBy: AdminBookSortFieldSchema.default("uploadedAt"),
  sortDirection: AdminSortDirectionSchema.default("desc"),
});
export type AdminBooksListQuery = z.infer<typeof AdminBooksListQuerySchema>;

export const AdminBookAuthorSummarySchema = z.object({
  id: z.string().cuid(),
  fullName: z.string().trim().min(1).max(200),
  email: z.string().email(),
  preferredLanguage: z.string().trim().min(2).max(10),
});
export type AdminBookAuthorSummary = z.infer<typeof AdminBookAuthorSummarySchema>;

export const AdminBookOrderSummarySchema = z.object({
  id: z.string().cuid(),
  orderNumber: z.string().trim().min(1).max(120),
  status: OrderStatusSchema,
  detailUrl: z.string().trim().min(1),
});
export type AdminBookOrderSummary = z.infer<typeof AdminBookOrderSummarySchema>;

export const AdminBooksListItemSchema = z.object({
  id: z.string().cuid(),
  title: z.string().trim().min(1).max(240).nullable(),
  author: AdminBookAuthorSummarySchema,
  order: AdminBookOrderSummarySchema,
  status: BookStatusSchema,
  productionStatus: BookStatusSchema.nullable(),
  displayStatus: AdminBookDisplayStatusSchema,
  statusSource: AdminBookStatusSourceSchema,
  uploadedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  detailUrl: z.string().trim().min(1),
});
export type AdminBooksListItem = z.infer<typeof AdminBooksListItemSchema>;

export const AdminBooksListResponseSchema = z.object({
  items: z.array(AdminBooksListItemSchema),
  nextCursor: z.string().cuid().nullable(),
  hasMore: z.boolean(),
  totalItems: z.number().int().min(0),
  limit: z.number().int().min(1).max(50),
  sortBy: AdminBookSortFieldSchema,
  sortDirection: AdminSortDirectionSchema,
  sortableFields: z.array(AdminBookSortFieldSchema),
});
export type AdminBooksListResponse = z.infer<typeof AdminBooksListResponseSchema>;

export const AdminBookStatusControlSchema = z.object({
  currentStatus: AdminBookDisplayStatusSchema,
  statusSource: AdminBookStatusSourceSchema,
  expectedVersion: z.number().int().min(1),
  nextAllowedStatuses: z.array(BookStatusSchema),
  canRejectManuscript: z.boolean(),
  canUploadHtmlFallback: z.boolean(),
});
export type AdminBookStatusControl = z.infer<typeof AdminBookStatusControlSchema>;

/**
 * PATCH /api/v1/admin/books/:id/status
 */
export const AdminUpdateBookStatusSchema = z.object({
  nextStatus: BookStatusSchema,
  expectedVersion: z.number().int().min(1),
  reason: z.string().trim().min(1).max(240).optional(),
  note: z.string().trim().min(1).max(1000).optional(),
});
export type AdminUpdateBookStatusInput = z.infer<typeof AdminUpdateBookStatusSchema>;

export const AdminUpdateBookStatusResponseSchema = z.object({
  bookId: z.string().cuid(),
  previousStatus: BookStatusSchema,
  nextStatus: BookStatusSchema,
  displayStatus: AdminBookDisplayStatusSchema,
  statusSource: AdminBookStatusSourceSchema,
  bookVersion: z.number().int().min(1),
  updatedAt: z.string().datetime(),
  audit: AdminAuditEntrySchema,
});
export type AdminUpdateBookStatusResponse = z.infer<typeof AdminUpdateBookStatusResponseSchema>;

/**
 * POST /api/v1/admin/books/:id/reject
 */
export const AdminRejectBookSchema = z.object({
  expectedVersion: z.number().int().min(1),
  rejectionReason: z.string().trim().min(1).max(5000),
});
export type AdminRejectBookInput = z.infer<typeof AdminRejectBookSchema>;

export const AdminRejectBookResponseSchema = z.object({
  bookId: z.string().cuid(),
  previousStatus: BookStatusSchema,
  nextStatus: z.literal("REJECTED"),
  displayStatus: z.literal("REJECTED"),
  statusSource: z.literal("manuscript"),
  bookVersion: z.number().int().min(1),
  rejectionReason: z.string().trim().min(1).max(5000),
  rejectedAt: z.string().datetime(),
  audit: AdminAuditEntrySchema,
});
export type AdminRejectBookResponse = z.infer<typeof AdminRejectBookResponseSchema>;

export const ADMIN_BOOK_HTML_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

export const AdminBookHtmlUploadMimeTypeSchema = z.literal("text/html");
export type AdminBookHtmlUploadMimeType = z.infer<typeof AdminBookHtmlUploadMimeTypeSchema>;

export const AdminBookHtmlFileNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(/\.html?$/i, {
    message: "fileName must end with .html or .htm",
  });
export type AdminBookHtmlFileName = z.infer<typeof AdminBookHtmlFileNameSchema>;

export const AdminBookHtmlFileMetadataSchema = z.object({
  fileName: AdminBookHtmlFileNameSchema,
  fileSize: z.number().int().min(1).max(ADMIN_BOOK_HTML_UPLOAD_MAX_BYTES),
  mimeType: AdminBookHtmlUploadMimeTypeSchema,
});
export type AdminBookHtmlFileMetadata = z.infer<typeof AdminBookHtmlFileMetadataSchema>;

export const AuthorizeAdminBookHtmlUploadBodySchema = AdminBookHtmlFileMetadataSchema.extend({
  action: z.literal("authorize"),
});
export type AuthorizeAdminBookHtmlUploadBodyInput = z.infer<
  typeof AuthorizeAdminBookHtmlUploadBodySchema
>;

export const FinalizeAdminBookHtmlUploadBodySchema = AdminBookHtmlFileMetadataSchema.extend({
  action: z.literal("finalize"),
  expectedVersion: z.number().int().min(1),
  secureUrl: z.string().url(),
  publicId: z.string().trim().min(1).max(255),
});
export type FinalizeAdminBookHtmlUploadBodyInput = z.infer<
  typeof FinalizeAdminBookHtmlUploadBodySchema
>;

/**
 * POST /api/v1/admin/books/:id/upload-html
 *
 * Two-step signed Cloudinary upload:
 *  1. authorize -> returns raw signed upload payload
 *  2. finalize  -> persists CLEANED_HTML metadata and resumes page-count / preview generation
 */
export const AdminBookHtmlUploadBodySchema = z.discriminatedUnion("action", [
  AuthorizeAdminBookHtmlUploadBodySchema,
  FinalizeAdminBookHtmlUploadBodySchema,
]);
export type AdminBookHtmlUploadBodyInput = z.infer<typeof AdminBookHtmlUploadBodySchema>;

export const AdminBookHtmlSignedUploadSchema = z.object({
  signature: z.string().min(1),
  timestamp: z.number().int().positive(),
  cloudName: z.string().min(1),
  apiKey: z.string().min(1),
  folder: z.string().min(1),
  eager: z.string().min(1).optional(),
  resourceType: z.literal("raw"),
  publicId: z.string().min(1),
  tags: z.array(z.string().min(1)).optional(),
});
export type AdminBookHtmlSignedUpload = z.infer<typeof AdminBookHtmlSignedUploadSchema>;

export const AuthorizeAdminBookHtmlUploadResponseSchema = z.object({
  action: z.literal("authorize"),
  upload: AdminBookHtmlSignedUploadSchema,
});
export type AuthorizeAdminBookHtmlUploadResponse = z.infer<
  typeof AuthorizeAdminBookHtmlUploadResponseSchema
>;

export const AdminBookPipelineQueuedJobSchema = z.object({
  queue: z.literal("page-count"),
  name: z.literal("count-pages"),
  jobId: z.string().nullable(),
});
export type AdminBookPipelineQueuedJob = z.infer<typeof AdminBookPipelineQueuedJobSchema>;

export const FinalizeAdminBookHtmlUploadResponseSchema = z.object({
  action: z.literal("finalize"),
  bookId: z.string().cuid(),
  file: BookFileVersionSchema.extend({
    fileType: z.literal("CLEANED_HTML"),
    mimeType: AdminBookHtmlUploadMimeTypeSchema,
  }),
  status: BookStatusSchema,
  productionStatus: BookStatusSchema.nullable(),
  displayStatus: AdminBookDisplayStatusSchema,
  statusSource: AdminBookStatusSourceSchema,
  bookVersion: z.number().int().min(1),
  queuedJob: AdminBookPipelineQueuedJobSchema,
});
export type FinalizeAdminBookHtmlUploadResponse = z.infer<
  typeof FinalizeAdminBookHtmlUploadResponseSchema
>;

export const AdminBookHtmlUploadResponseSchema = z.discriminatedUnion("action", [
  AuthorizeAdminBookHtmlUploadResponseSchema,
  FinalizeAdminBookHtmlUploadResponseSchema,
]);
export type AdminBookHtmlUploadResponse = z.infer<typeof AdminBookHtmlUploadResponseSchema>;

export const AdminBookDownloadFileTypeSchema = z.enum(["raw", "cleaned", "final-pdf"]);
export type AdminBookDownloadFileType = z.infer<typeof AdminBookDownloadFileTypeSchema>;

export const AdminBookDownloadParamsSchema = BookParamsSchema.extend({
  fileType: AdminBookDownloadFileTypeSchema,
});
export type AdminBookDownloadParamsInput = z.infer<typeof AdminBookDownloadParamsSchema>;

export const AdminBookVersionFileDownloadParamsSchema = BookParamsSchema.extend({
  fileId: z.string().cuid(),
});
export type AdminBookVersionFileDownloadParamsInput = z.infer<
  typeof AdminBookVersionFileDownloadParamsSchema
>;

/**
 * GET /api/v1/admin/books/:id
 */
export const AdminBookDetailSchema = BookDetailResponseSchema.extend({
  uploadedAt: z.string().datetime().nullable(),
  productionStatus: BookStatusSchema.nullable(),
  displayStatus: AdminBookDisplayStatusSchema,
  statusSource: AdminBookStatusSourceSchema,
  version: z.number().int().min(1),
  rejectedBy: z.string().cuid().nullable(),
  finalPdfUrl: z.string().url().nullable(),
  author: AdminBookAuthorSummarySchema,
  order: AdminBookOrderSummarySchema,
  files: z.array(BookFileVersionSchema),
  statusControl: AdminBookStatusControlSchema,
});
export type AdminBookDetail = z.infer<typeof AdminBookDetailSchema>;
