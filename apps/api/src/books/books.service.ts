import type {
  AdminBookProductionStatusResponse,
  ApproveBookInput,
  BookApproveResponse,
  BookDetailResponse,
  BookFilesResponse,
  BookManuscriptUploadResponse,
  BookPreviewResponse,
  BookProcessingState,
  BookProcessingStep,
  BookProcessingTrigger,
  BookProgressStage,
  BookReprocessResponse,
  BookSettingsResponse,
  BookStatus,
  UpdateAdminBookProductionStatusInput,
  UpdateBookSettingsInput,
} from "@bookprinta/shared";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { FilesService } from "../files/files.service.js";
import { Prisma } from "../generated/prisma/client.js";
import type { FileType, JobStatus } from "../generated/prisma/enums.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { RolloutService } from "../rollout/rollout.service.js";
import { BooksPipelineService } from "./books-pipeline.service.js";
import { ManuscriptAnalysisService } from "./manuscript-analysis.service.js";

const BOOK_DETAIL_JOB_STATUSES: JobStatus[] = ["QUEUED", "PROCESSING", "FAILED"];

const BOOK_DETAIL_SELECT = {
  id: true,
  orderId: true,
  status: true,
  productionStatus: true,
  productionStatusUpdatedAt: true,
  rejectionReason: true,
  rejectedAt: true,
  pageCount: true,
  wordCount: true,
  estimatedPages: true,
  fontFamily: true,
  fontSize: true,
  pageSize: true,
  currentHtmlUrl: true,
  previewPdfUrl: true,
  finalPdfUrl: true,
  order: {
    select: {
      status: true,
    },
  },
  jobs: {
    where: {
      status: {
        in: BOOK_DETAIL_JOB_STATUSES,
      },
    },
    orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
    take: 3,
    select: {
      type: true,
      status: true,
      attempts: true,
      maxRetries: true,
      error: true,
      payload: true,
      result: true,
      createdAt: true,
      startedAt: true,
    },
  },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.BookSelect;

type BookDetailRow = Prisma.BookGetPayload<{ select: typeof BOOK_DETAIL_SELECT }>;

type UserPreviewAsset = {
  bookId: string;
  status: BookStatus;
  sourceUrl: string;
  fileName: string;
  mimeType: string;
};

@Injectable()
export class BooksService {
  private static readonly EXTRA_PAGE_PRICE_NGN = 10;
  private static readonly ACTIVE_JOB_STALE_AFTER_MS = 15 * 60 * 1000;
  private static readonly FALLBACK_PROCESSING_STALE_AFTER_MS = 15 * 60 * 1000;
  private static readonly NON_USER_FACING_PROCESSING_ERRORS = [
    "cleared by local development queue reset.",
    "marked stale and superseded by a fresh reprocess request.",
  ] as const;
  private static readonly SETTINGS_LOCKED_BOOK_STATUSES = new Set([
    "APPROVED",
    "IN_PRODUCTION",
    "PRINTING",
    "PRINTED",
    "SHIPPING",
    "DELIVERED",
    "COMPLETED",
    "CANCELLED",
  ]);
  private static readonly PREVIEW_AVAILABLE_BOOK_STATUSES = new Set([
    "PREVIEW_READY",
    "APPROVED",
    "IN_PRODUCTION",
    "PRINTING",
    "PRINTED",
    "SHIPPING",
    "DELIVERED",
    "COMPLETED",
  ]);
  private static readonly ACTIVE_JOB_STATUSES = new Set(["QUEUED", "PROCESSING"]);

  constructor(
    private readonly prisma: PrismaService,
    private readonly filesService: FilesService,
    private readonly booksPipeline: BooksPipelineService,
    private readonly manuscriptAnalysis: ManuscriptAnalysisService,
    private readonly rollout: RolloutService
  ) {}

  private readonly timelineStages: BookProgressStage[] = [
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
  ];

  private readonly statusToStage: Partial<Record<BookStatus, BookProgressStage>> = {
    AWAITING_UPLOAD: "PAYMENT_RECEIVED",
    UPLOADED: "PAYMENT_RECEIVED",
    PAYMENT_RECEIVED: "PAYMENT_RECEIVED",
    AI_PROCESSING: "DESIGNING",
    DESIGNING: "DESIGNING",
    DESIGNED: "DESIGNED",
    FORMATTING: "FORMATTING",
    FORMATTED: "FORMATTED",
    FORMATTING_REVIEW: "REVIEW",
    PREVIEW_READY: "REVIEW",
    REVIEW: "REVIEW",
    REJECTED: "REVIEW",
    APPROVED: "APPROVED",
    IN_PRODUCTION: "PRINTING",
    PRINTING: "PRINTING",
    PRINTED: "PRINTED",
    SHIPPING: "SHIPPING",
    DELIVERED: "DELIVERED",
    COMPLETED: "DELIVERED",
    CANCELLED: "REVIEW",
  };

  async updateUserBookSettings(
    userId: string,
    bookId: string,
    input: UpdateBookSettingsInput
  ): Promise<BookSettingsResponse> {
    const book = await this.prisma.book.findFirst({
      where: { id: bookId, userId },
      select: { id: true, wordCount: true, status: true, pageSize: true, fontSize: true },
    });

    if (!book) {
      throw new NotFoundException(`Book "${bookId}" not found`);
    }

    if (BooksService.SETTINGS_LOCKED_BOOK_STATUSES.has(book.status)) {
      throw new BadRequestException("Book settings can only be changed before approval.");
    }

    this.rollout.assertManuscriptPipelineAccess(book);

    const estimatedPages =
      typeof book.wordCount === "number"
        ? this.manuscriptAnalysis.estimatePages({
            wordCount: book.wordCount,
            pageSize: input.pageSize,
            fontSize: input.fontSize,
          })
        : null;

    const updated = await this.prisma.book.update({
      where: { id: bookId },
      data: {
        pageSize: input.pageSize,
        fontSize: input.fontSize,
        estimatedPages,
      },
      select: {
        id: true,
        pageSize: true,
        fontSize: true,
        wordCount: true,
        estimatedPages: true,
        updatedAt: true,
      },
    });

    const pageSize = this.resolvePageSize(updated.pageSize);
    const fontSize = this.resolveFontSize(updated.fontSize);
    if (!pageSize || !fontSize) {
      throw new BadRequestException("Invalid book settings");
    }

    await this.booksPipeline.enqueueFormatManuscript({
      bookId: updated.id,
      trigger: "settings_change",
    });

    return {
      id: updated.id,
      pageSize,
      fontSize,
      wordCount: updated.wordCount,
      estimatedPages: updated.estimatedPages,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async uploadUserManuscript(
    userId: string,
    bookId: string,
    file: Express.Multer.File
  ): Promise<BookManuscriptUploadResponse> {
    const book = await this.prisma.book.findFirst({
      where: { id: bookId, userId },
      select: {
        id: true,
        status: true,
        pageSize: true,
        fontSize: true,
      },
    });

    if (!book) {
      throw new NotFoundException(`Book "${bookId}" not found`);
    }

    this.rollout.assertManuscriptPipelineAccess(book);

    const pageSize = this.resolvePageSize(book.pageSize);
    const fontSize = this.resolveFontSize(book.fontSize);
    if (!pageSize || !fontSize) {
      throw new BadRequestException("Please select book size and font size before uploading.");
    }

    const mimeType = this.manuscriptAnalysis.detectMimeType(file);
    const wordCount = await this.manuscriptAnalysis.extractWordCount(file.buffer, mimeType);
    const estimatedPages = this.manuscriptAnalysis.estimatePages({
      wordCount,
      pageSize,
      fontSize,
    });

    const fileType: FileType = "RAW_MANUSCRIPT";
    const uploadedFile = await (async () => {
      try {
        return await this.filesService.uploadFile(
          {
            ...file,
            mimetype: mimeType,
          },
          { bookId, fileType },
          userId
        );
      } catch (error) {
        if (error instanceof ServiceUnavailableException) {
          throw new ServiceUnavailableException("File scanning temporarily unavailable");
        }
        throw error;
      }
    })();

    const shouldMarkUploaded = book.status === "AWAITING_UPLOAD" || book.status === "REJECTED";
    await this.prisma.book.update({
      where: { id: book.id },
      data: {
        status: shouldMarkUploaded ? "UPLOADED" : book.status,
        wordCount,
        estimatedPages,
        pageSize,
        fontSize,
      },
    });

    await this.booksPipeline.enqueueFormatManuscript({
      bookId: book.id,
      trigger: "upload",
    });

    return {
      bookId: book.id,
      fileId: uploadedFile.id,
      fileUrl: uploadedFile.url,
      fileName: uploadedFile.fileName ?? file.originalname,
      fileSize: uploadedFile.fileSize ?? file.size,
      mimeType,
      pageSize,
      fontSize,
      wordCount,
      estimatedPages,
    };
  }

  async findUserBookById(userId: string, bookId: string): Promise<BookDetailResponse> {
    const row = (await this.prisma.book.findFirst({
      where: {
        id: bookId,
        userId,
      },
      select: BOOK_DETAIL_SELECT,
    })) as BookDetailRow | null;

    if (!row) {
      throw new NotFoundException(`Book "${bookId}" not found`);
    }

    const rollout = this.rollout.resolveBookRolloutState(row);

    return {
      id: row.id,
      orderId: row.orderId,
      status: row.status,
      productionStatus: this.resolveProductionStatus({
        productionStatus: row.productionStatus,
        manuscriptStatus: row.status,
      }),
      latestProcessingError: this.resolveLatestProcessingError(row.jobs),
      rejectionReason: row.rejectionReason ?? null,
      rejectedAt: row.rejectedAt?.toISOString() ?? null,
      pageCount: row.pageCount,
      wordCount: row.wordCount,
      estimatedPages: row.estimatedPages,
      fontFamily: row.fontFamily ?? null,
      fontSize: row.fontSize,
      pageSize: row.pageSize ?? null,
      currentHtmlUrl: row.currentHtmlUrl ?? null,
      previewPdfUrl: row.previewPdfUrl ?? null,
      finalPdfUrl: null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      rollout,
      processing: this.resolveProcessingState({
        bookStatus: row.status,
        currentHtmlUrl: row.currentHtmlUrl ?? null,
        pageCount: row.pageCount,
        finalPdfUrl: row.finalPdfUrl ?? null,
        updatedAt: row.updatedAt,
        jobs: row.jobs,
      }),
      timeline: this.buildProgressTimeline({
        currentStatus: this.resolveProductionStatus({
          productionStatus: row.productionStatus,
          manuscriptStatus: row.status,
        }),
        createdAt: row.createdAt,
        updatedAt: row.productionStatusUpdatedAt ?? row.createdAt,
      }),
    };
  }

  async getUserBookPreview(
    userId: string,
    bookId: string,
    previewPdfUrl: string
  ): Promise<BookPreviewResponse> {
    const asset = await this.getUserPreviewAsset(userId, bookId);
    return {
      bookId: asset.bookId,
      previewPdfUrl,
      status: asset.status,
      watermarked: true,
    };
  }

  async getUserBookPreviewFileSource(userId: string, bookId: string): Promise<UserPreviewAsset> {
    return this.getUserPreviewAsset(userId, bookId);
  }

  async getUserBookFiles(userId: string, bookId: string): Promise<BookFilesResponse> {
    const files = await this.filesService.getBookFiles(bookId, userId);
    const visibleFiles = files.filter((file) => file.fileType !== "FINAL_PDF");

    return {
      bookId,
      files: visibleFiles.map((file) => ({
        id: file.id,
        fileType: file.fileType,
        url: file.url,
        fileName: file.fileName ?? null,
        fileSize: file.fileSize ?? null,
        mimeType: file.mimeType ?? null,
        version: file.version,
        createdBy: file.createdBy ?? null,
        createdAt: file.createdAt.toISOString(),
      })),
    };
  }

  async updateAdminBookProductionStatus(
    bookId: string,
    input: UpdateAdminBookProductionStatusInput
  ): Promise<AdminBookProductionStatusResponse> {
    const book = await this.prisma.book.findFirst({
      where: { id: bookId },
      select: { id: true },
    });

    if (!book) {
      throw new NotFoundException(`Book "${bookId}" not found`);
    }

    const updatedAt = new Date();
    const updated = await this.prisma.book.update({
      where: { id: bookId },
      data: {
        productionStatus: input.productionStatus,
        productionStatusUpdatedAt: updatedAt,
      },
      select: {
        id: true,
        productionStatus: true,
        productionStatusUpdatedAt: true,
      },
    });

    return {
      bookId: updated.id,
      productionStatus: input.productionStatus,
      updatedAt: (updated.productionStatusUpdatedAt ?? updatedAt).toISOString(),
    };
  }

  async approveUserBook(
    userId: string,
    bookId: string,
    _input: ApproveBookInput
  ): Promise<BookApproveResponse> {
    const book = await this.prisma.book.findFirst({
      where: { id: bookId, userId },
      select: {
        id: true,
        orderId: true,
        status: true,
        pageCount: true,
        currentHtmlUrl: true,
        order: {
          select: {
            status: true,
            package: {
              select: {
                pageLimit: true,
              },
            },
          },
        },
      },
    });

    if (!book) {
      throw new NotFoundException(`Book "${bookId}" not found`);
    }

    if (book.status !== "PREVIEW_READY") {
      throw new BadRequestException("Book can only be approved when preview is ready.");
    }

    if (typeof book.pageCount !== "number") {
      throw new BadRequestException("Authoritative page count is not ready yet.");
    }

    if (!book.currentHtmlUrl) {
      throw new BadRequestException(
        "Formatted manuscript output is missing. Please retry formatting."
      );
    }

    const overagePages = Math.max(0, book.pageCount - book.order.package.pageLimit);
    const requiredExtraAmount = overagePages * BooksService.EXTRA_PAGE_PRICE_NGN;

    if (requiredExtraAmount > 0) {
      this.rollout.assertBillingGateAccess(book);

      const successfulExtraPayments = await this.prisma.payment.aggregate({
        where: {
          orderId: book.orderId,
          type: "EXTRA_PAGES",
          status: "SUCCESS",
        },
        _sum: {
          amount: true,
        },
      });

      const paidAmount = this.readMoneyValue(successfulExtraPayments._sum.amount);
      if (paidAmount < requiredExtraAmount) {
        throw new ConflictException(
          "Extra pages payment is required before approval. Please complete payment to continue."
        );
      }
    }

    this.rollout.assertFinalPdfAccess(book);

    await this.prisma.$transaction(async (tx) => {
      await tx.book.update({
        where: { id: book.id },
        data: {
          status: "APPROVED",
        },
      });

      await tx.order.update({
        where: { id: book.orderId },
        data: {
          status: "APPROVED",
          extraAmount: requiredExtraAmount,
        },
      });
    });

    const queueResult = await this.booksPipeline.enqueueGeneratePdf({ bookId: book.id });

    return {
      bookId: book.id,
      bookStatus: "APPROVED",
      orderStatus: "APPROVED",
      queuedJob: {
        queue: "pdf-generation",
        name: "generate-pdf",
        jobId: queueResult.queueJobId,
      },
    };
  }

  async reprocessUserBook(userId: string, bookId: string): Promise<BookReprocessResponse> {
    const book = await this.prisma.book.findFirst({
      where: { id: bookId, userId },
      select: {
        id: true,
        orderId: true,
        status: true,
        pageSize: true,
        fontSize: true,
      },
    });

    if (!book) {
      throw new NotFoundException(`Book "${bookId}" not found`);
    }

    if (BooksService.SETTINGS_LOCKED_BOOK_STATUSES.has(book.status)) {
      throw new BadRequestException("Manuscript processing can only be retried before approval.");
    }

    this.rollout.assertManuscriptPipelineAccess(book);

    const queueResult = await this.booksPipeline.enqueueFormatManuscript({
      bookId: book.id,
      trigger: "upload",
    });

    if (!queueResult.queued) {
      if (queueResult.reason === "NO_MANUSCRIPT") {
        throw new BadRequestException("Upload a manuscript before retrying automated processing.");
      }

      throw new ConflictException(
        "Manuscript processing is still active. Please wait a little longer before retrying."
      );
    }

    return {
      bookId: book.id,
      bookStatus: "AI_PROCESSING",
      orderStatus: "FORMATTING",
      queuedJob: {
        queue: "ai-formatting",
        name: "format-manuscript",
        jobId: queueResult.queueJobId,
      },
    };
  }

  private resolveStageFromStatus(status: BookStatus): BookProgressStage {
    return this.statusToStage[status] ?? "PAYMENT_RECEIVED";
  }

  private async getUserPreviewAsset(userId: string, bookId: string): Promise<UserPreviewAsset> {
    const row = await this.prisma.book.findFirst({
      where: {
        id: bookId,
        userId,
      },
      select: {
        id: true,
        status: true,
        previewPdfUrl: true,
        files: {
          where: {
            fileType: "PREVIEW_PDF",
          },
          orderBy: {
            version: "desc",
          },
          take: 1,
          select: {
            url: true,
            fileName: true,
            mimeType: true,
          },
        },
      },
    });

    if (!row) {
      throw new NotFoundException(`Book "${bookId}" not found`);
    }

    if (!row.previewPdfUrl || !BooksService.PREVIEW_AVAILABLE_BOOK_STATUSES.has(row.status)) {
      throw new NotFoundException("Preview PDF is not available yet.");
    }

    const previewFile = row.files[0];
    return {
      bookId: row.id,
      status: row.status,
      sourceUrl: previewFile?.url ?? row.previewPdfUrl,
      fileName: previewFile?.fileName ?? `book-preview-${row.id}.pdf`,
      mimeType: previewFile?.mimeType ?? "application/pdf",
    };
  }

  private resolveProductionStatus(params: {
    productionStatus: BookStatus | null;
    manuscriptStatus: BookStatus;
  }): BookStatus {
    return params.productionStatus ?? "PAYMENT_RECEIVED";
  }

  private resolveLatestProcessingError(
    jobs: Array<{
      type: string;
      status: string;
      error: string | null;
    }>
  ): string | null {
    const latestFailure = jobs.find((job) => {
      if (job.status !== "FAILED") {
        return false;
      }

      if (job.type !== "AI_CLEANING" && job.type !== "PAGE_COUNT") {
        return false;
      }

      if (!job.error) {
        return false;
      }

      const normalizedError = job.error.trim().toLowerCase();
      return !BooksService.NON_USER_FACING_PROCESSING_ERRORS.includes(
        normalizedError as (typeof BooksService.NON_USER_FACING_PROCESSING_ERRORS)[number]
      );
    });

    if (!latestFailure?.error) {
      return null;
    }

    const normalized = latestFailure.error.trim();
    if (normalized.length === 0) {
      return null;
    }

    return this.toUserFacingProcessingError(normalized);
  }

  private toUserFacingProcessingError(error: string): string {
    const normalizedError = error.trim();
    const lower = normalizedError.toLowerCase();

    if (lower.includes("resource_exhausted") || lower.includes("quota exceeded")) {
      return "AI formatting is temporarily unavailable because the current Gemini quota is exhausted. Retry later or switch to a higher-capacity Gemini key.";
    }

    if (lower.includes("timed out")) {
      return "AI formatting timed out before the preview was generated. Retry processing to start a fresh run.";
    }

    if (lower.includes("503") || lower.includes("unavailable") || lower.includes("high demand")) {
      return "AI formatting is temporarily unavailable because Gemini is under high demand. Retry processing shortly.";
    }

    return normalizedError;
  }

  private buildProgressTimeline(params: {
    currentStatus: BookStatus;
    createdAt: Date;
    updatedAt: Date;
  }): BookDetailResponse["timeline"] {
    const currentStage = this.resolveStageFromStatus(params.currentStatus);
    const currentIndex = this.timelineStages.indexOf(currentStage);
    const reviewStageIndex = this.timelineStages.indexOf("REVIEW");
    const isRejected = params.currentStatus === "REJECTED";

    return this.timelineStages.map((stage, index) => {
      const state = this.resolveTimelineState({
        index,
        currentIndex,
        reviewStageIndex,
        isRejected,
      });

      return {
        key: stage.toLowerCase(),
        label: this.toTrackingLabel(stage),
        stage,
        sourceStatus: index === currentIndex ? params.currentStatus : null,
        state,
        reachedAt: this.resolveReachedAt({
          state,
          index,
          createdAt: params.createdAt,
          updatedAt: params.updatedAt,
        }),
      };
    });
  }

  private resolveTimelineState(params: {
    index: number;
    currentIndex: number;
    reviewStageIndex: number;
    isRejected: boolean;
  }): BookDetailResponse["timeline"][number]["state"] {
    if (params.isRejected) {
      if (params.index < params.reviewStageIndex) return "completed";
      if (params.index === params.reviewStageIndex) return "rejected";
      return "upcoming";
    }

    if (params.index < params.currentIndex) return "completed";
    if (params.index === params.currentIndex) return "current";
    return "upcoming";
  }

  private resolveReachedAt(params: {
    state: BookDetailResponse["timeline"][number]["state"];
    index: number;
    createdAt: Date;
    updatedAt: Date;
  }): string | null {
    if (params.state === "current" || params.state === "rejected") {
      return params.updatedAt.toISOString();
    }

    if (params.state === "completed" && params.index === 0) {
      return params.createdAt.toISOString();
    }

    return null;
  }

  private toTrackingLabel(status: string): string {
    return status
      .toLowerCase()
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  private resolvePageSize(value: string | null): "A4" | "A5" | null {
    return value === "A4" || value === "A5" ? value : null;
  }

  private resolveFontSize(value: number | null): 11 | 12 | 14 | null {
    return value === 11 || value === 12 || value === 14 ? value : null;
  }

  private resolveProcessingState(params: {
    bookStatus: BookStatus;
    currentHtmlUrl: string | null;
    pageCount: number | null;
    finalPdfUrl: string | null;
    updatedAt: Date;
    jobs: Array<{
      type: string;
      status: string;
      attempts: number;
      maxRetries: number;
      payload: unknown;
      result: unknown;
      createdAt: Date;
      startedAt: Date | null;
    }>;
  }): BookProcessingState {
    const latestActiveJob =
      params.jobs.find((job) => job.status === "PROCESSING") ??
      params.jobs.find((job) => BooksService.ACTIVE_JOB_STATUSES.has(job.status));
    const activeJob =
      latestActiveJob && !this.isStaleActiveJob(latestActiveJob) ? latestActiveJob : null;

    if (activeJob) {
      const currentStep =
        this.resolveProcessingStepFromJob(activeJob) ??
        this.resolveProcessingStepFromStatuses(params);

      return {
        isActive: currentStep !== null,
        currentStep,
        jobStatus: activeJob.status === "QUEUED" ? "queued" : "processing",
        trigger: this.resolveProcessingTrigger(activeJob.payload),
        startedAt: this.resolveActiveJobStartedAt(activeJob),
        attempt: activeJob.attempts > 0 ? activeJob.attempts : null,
        maxAttempts: activeJob.maxRetries > 0 ? activeJob.maxRetries : null,
      };
    }

    if (params.bookStatus === "FORMATTING_REVIEW") {
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

    const fallbackStep = this.resolveProcessingStepFromStatuses(params);
    if (!fallbackStep) {
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

    if (latestActiveJob) {
      const currentStep = this.resolveProcessingStepFromJob(latestActiveJob) ?? fallbackStep;

      return {
        isActive: true,
        currentStep,
        jobStatus: latestActiveJob.status === "QUEUED" ? "queued" : "processing",
        trigger: this.resolveProcessingTrigger(latestActiveJob.payload),
        startedAt: null,
        attempt: null,
        maxAttempts: null,
      };
    }

    return {
      isActive: true,
      currentStep: fallbackStep,
      jobStatus: "processing",
      trigger: null,
      startedAt: this.isStaleTimestamp(
        params.updatedAt,
        BooksService.FALLBACK_PROCESSING_STALE_AFTER_MS
      )
        ? null
        : params.updatedAt.toISOString(),
      attempt: null,
      maxAttempts: null,
    };
  }

  private isStaleActiveJob(job: {
    status: string;
    createdAt: Date;
    startedAt: Date | null;
  }): boolean {
    if (!BooksService.ACTIVE_JOB_STATUSES.has(job.status)) {
      return false;
    }

    const referenceTimestamp =
      job.status === "PROCESSING" ? (job.startedAt ?? job.createdAt) : job.startedAt;

    if (!referenceTimestamp) {
      return false;
    }

    return this.isStaleTimestamp(referenceTimestamp, BooksService.ACTIVE_JOB_STALE_AFTER_MS);
  }

  private resolveActiveJobStartedAt(job: {
    status: string;
    attempts: number;
    createdAt: Date;
    startedAt: Date | null;
  }): string | null {
    if (this.isStaleActiveJob(job)) {
      return null;
    }

    if (job.status === "PROCESSING") {
      return (job.startedAt ?? job.createdAt).toISOString();
    }

    if (job.attempts > 0 || !job.startedAt) {
      return null;
    }

    return job.startedAt.toISOString();
  }

  private isStaleTimestamp(value: Date, thresholdMs: number): boolean {
    return Date.now() - value.getTime() > thresholdMs;
  }

  private resolveProcessingStepFromJob(job: {
    type: string;
    result: unknown;
  }): BookProcessingStep | null {
    const result = this.asRecord(job.result);
    const progressStep = typeof result?.progressStep === "string" ? result.progressStep : null;
    if (
      progressStep === "AI_FORMATTING" ||
      progressStep === "RENDERING_PREVIEW" ||
      progressStep === "COUNTING_PAGES" ||
      progressStep === "GENERATING_FINAL_PDF"
    ) {
      return progressStep;
    }

    if (job.type === "AI_CLEANING") return "AI_FORMATTING";
    if (job.type === "PAGE_COUNT") return "COUNTING_PAGES";
    if (job.type === "PDF_GENERATION") return "GENERATING_FINAL_PDF";

    return null;
  }

  private resolveProcessingStepFromStatuses(params: {
    bookStatus: BookStatus;
    currentHtmlUrl: string | null;
    pageCount: number | null;
    finalPdfUrl: string | null;
  }): BookProcessingStep | null {
    if (params.bookStatus === "AI_PROCESSING" || params.bookStatus === "FORMATTING") {
      return "AI_FORMATTING";
    }

    if (
      (params.bookStatus === "FORMATTED" || params.bookStatus === "DESIGNED") &&
      typeof params.pageCount !== "number"
    ) {
      return "COUNTING_PAGES";
    }

    if (params.currentHtmlUrl && typeof params.pageCount !== "number") {
      return "COUNTING_PAGES";
    }

    if (params.bookStatus === "APPROVED" && !params.finalPdfUrl) {
      return "GENERATING_FINAL_PDF";
    }

    return null;
  }

  private resolveProcessingTrigger(value: unknown): BookProcessingTrigger | null {
    const payload = this.asRecord(value);
    const trigger = payload?.trigger;
    return trigger === "upload" || trigger === "settings_change" || trigger === "approval"
      ? trigger
      : null;
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private readMoneyValue(value: unknown): number {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim().length > 0) {
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

    return 0;
  }
}
