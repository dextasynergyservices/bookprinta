import { randomUUID } from "node:crypto";
import type { Locale } from "@bookprinta/emails";
import { renderManuscriptRejectedEmail } from "@bookprinta/emails/render";
import type {
  AdminBookDetail,
  AdminBookDownloadFileType,
  AdminBookHtmlUploadBodyInput,
  AdminBookHtmlUploadResponse,
  AdminBookProductionStatusResponse,
  AdminBooksListQuery,
  AdminBooksListResponse,
  AdminCancelProcessingInput,
  AdminCancelProcessingResponse,
  AdminDecommissionBookInput,
  AdminDecommissionBookResponse,
  AdminRejectBookInput,
  AdminRejectBookResponse,
  AdminResetProcessingInput,
  AdminResetProcessingResponse,
  AdminUpdateBookStatusInput,
  AdminUpdateBookStatusResponse,
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
  BookReprintConfigResponse,
  BookReprocessResponse,
  BookSettingsResponse,
  BookStatus,
  Lamination,
  PaperColor,
  ReprintBookSize,
  UpdateAdminBookProductionStatusInput,
  UpdateBookSettingsInput,
  UserBooksListQueryInput,
  UserBooksListResponse,
} from "@bookprinta/shared";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Resend } from "resend";
import { CloudinaryService } from "../cloudinary/cloudinary.service.js";
import { FilesService } from "../files/files.service.js";
import { Prisma } from "../generated/prisma/client.js";
import { type FileType, type JobStatus, PaymentProvider } from "../generated/prisma/enums.js";
import { isUserNotificationChannelEnabled } from "../notifications/notification-preference-policy.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { WhatsappNotificationsService } from "../notifications/whatsapp-notifications.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  isReviewEligibleLifecycleStatus,
  resolveReviewLifecycleStatus,
} from "../reviews/review-eligibility.js";
import { RolloutService } from "../rollout/rollout.service.js";
import {
  canCancelProcessing,
  canDecommissionBook,
  canRejectAdminBook,
  canResetProcessingPipeline,
  canUploadAdminHtmlFallback,
  humanizeAdminBookStatus,
  resolveAdminBookStatusProjection,
  resolveNextAllowedBookStatuses,
} from "./admin-book-workflow.js";
import { BooksPipelineService } from "./books-pipeline.service.js";
import { ManuscriptAnalysisService } from "./manuscript-analysis.service.js";

const BOOK_DETAIL_JOB_STATUSES: JobStatus[] = ["QUEUED", "PROCESSING", "FAILED", "COMPLETED"];
const ADMIN_BOOK_SORTABLE_FIELDS: AdminBooksListResponse["sortableFields"] = [
  "title",
  "authorName",
  "displayStatus",
  "orderNumber",
  "uploadedAt",
];
const ADMIN_BOOK_TRACKING_ENTITY_TYPE = "ORDER_TRACKING";
const ADMIN_BOOK_TRACKING_ACTION = "ORDER_STATUS_REACHED";
const ADMIN_BOOK_TRACKING_SOURCE = "book";
const ADMIN_HTML_UPLOAD_FOLDER_ROOT = "bookprinta/admin/books";
const DEFAULT_FROM_EMAIL = "BookPrinta <info@bookprinta.com>";
const DEFAULT_DASHBOARD_PATH = "/dashboard/books";
const MANUSCRIPT_REJECTED_TITLE_KEY = "notifications.manuscript_rejected.title";
const MANUSCRIPT_REJECTED_MESSAGE_KEY = "notifications.manuscript_rejected.message";
const MANUSCRIPT_REJECTED_FALLBACK_TITLE = "Manuscript needs revision";
const RAW_DOWNLOAD_FILE_TYPE: FileType = "RAW_MANUSCRIPT";
const CLEANED_DOWNLOAD_FILE_TYPE: FileType = "CLEANED_HTML";
const FINAL_PDF_DOWNLOAD_FILE_TYPE: FileType = "FINAL_PDF";
const ADMIN_FILE_VERSION_SELECT = {
  id: true,
  fileType: true,
  url: true,
  fileName: true,
  fileSize: true,
  mimeType: true,
  version: true,
  createdBy: true,
  createdAt: true,
} as const;

const BOOK_DETAIL_SELECT = {
  id: true,
  orderId: true,
  status: true,
  productionStatus: true,
  productionStatusUpdatedAt: true,
  title: true,
  coverImageUrl: true,
  rejectionReason: true,
  rejectedAt: true,
  pageCount: true,
  wordCount: true,
  estimatedPages: true,
  documentPageCount: true,
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
    take: 6,
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

const USER_BOOK_LIST_SELECT = {
  id: true,
  orderId: true,
  status: true,
  productionStatus: true,
  title: true,
  coverImageUrl: true,
  rejectionReason: true,
  pageCount: true,
  wordCount: true,
  estimatedPages: true,
  documentPageCount: true,
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
    take: 6,
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

type UserBookListRow = Prisma.BookGetPayload<{ select: typeof USER_BOOK_LIST_SELECT }>;

const ADMIN_BOOK_LIST_SELECT = {
  id: true,
  title: true,
  status: true,
  productionStatus: true,
  createdAt: true,
  user: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      preferredLanguage: true,
    },
  },
  order: {
    select: {
      id: true,
      orderNumber: true,
      status: true,
    },
  },
  files: {
    where: {
      fileType: RAW_DOWNLOAD_FILE_TYPE,
    },
    orderBy: [{ version: "desc" }, { createdAt: "desc" }],
    take: 1,
    select: {
      createdAt: true,
    },
  },
} satisfies Prisma.BookSelect;

type AdminBookListRow = Prisma.BookGetPayload<{ select: typeof ADMIN_BOOK_LIST_SELECT }>;

const ADMIN_BOOK_DETAIL_SELECT = {
  ...BOOK_DETAIL_SELECT,
  version: true,
  rejectedBy: true,
  user: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      preferredLanguage: true,
    },
  },
  order: {
    select: {
      id: true,
      orderNumber: true,
      status: true,
    },
  },
  files: {
    orderBy: [{ createdAt: "desc" }, { version: "desc" }],
    select: ADMIN_FILE_VERSION_SELECT,
  },
} satisfies Prisma.BookSelect;

type AdminBookDetailRow = Prisma.BookGetPayload<{ select: typeof ADMIN_BOOK_DETAIL_SELECT }>;

type UserPreviewAsset = {
  bookId: string;
  status: BookStatus;
  sourceUrl: string;
  fileName: string;
  mimeType: string;
};

type AdminDownloadAsset = {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
};

@Injectable()
export class BooksService {
  private readonly logger = new Logger(BooksService.name);
  private static readonly EXTRA_PAGE_PRICE_NGN = 10;
  private static readonly DEFAULT_REPRINT_COST_PER_PAGE_A5 = 10;
  private static readonly REPRINT_COST_PER_PAGE_SETTING_KEY = "quote_cost_per_page";
  private static readonly REPRINT_MIN_COPIES = 25;
  private static readonly ACTIVE_JOB_STALE_AFTER_MS = 15 * 60 * 1000;
  private static readonly FALLBACK_PROCESSING_STALE_AFTER_MS = 15 * 60 * 1000;
  private static readonly REPRINT_ELIGIBLE_BOOK_STATUSES = new Set<BookStatus>([
    "DELIVERED",
    "COMPLETED",
  ]);
  private static readonly REPRINT_ALLOWED_BOOK_SIZES: ReprintBookSize[] = ["A4", "A5", "A6"];
  private static readonly REPRINT_ALLOWED_PAPER_COLORS: PaperColor[] = ["white", "cream"];
  private static readonly REPRINT_ALLOWED_LAMINATIONS: Lamination[] = ["matt", "gloss"];
  private static readonly REPRINT_PAYMENT_PROVIDERS = [
    PaymentProvider.PAYSTACK,
    PaymentProvider.STRIPE,
  ] as const;
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
  private readonly resend: Resend | null;
  private readonly frontendBaseUrl: string;
  private readonly fromEmail: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly filesService: FilesService,
    private readonly booksPipeline: BooksPipelineService,
    private readonly manuscriptAnalysis: ManuscriptAnalysisService,
    private readonly notifications: NotificationsService,
    private readonly rollout: RolloutService,
    @Optional() private readonly whatsappNotificationsService?: WhatsappNotificationsService,
    @Optional() private readonly cloudinary?: CloudinaryService
  ) {
    this.resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
    this.frontendBaseUrl = this.resolveFrontendBaseUrl();
    this.fromEmail =
      process.env.ADMIN_FROM_EMAIL ||
      process.env.CONTACT_FROM_EMAIL ||
      process.env.DEFAULT_FROM_EMAIL ||
      DEFAULT_FROM_EMAIL;
  }

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
      select: {
        id: true,
        wordCount: true,
        status: true,
        pageSize: true,
        fontSize: true,
        title: true,
      },
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
        ...(input.title !== undefined ? { title: input.title } : {}),
        pageSize: input.pageSize,
        fontSize: input.fontSize,
        estimatedPages,
      },
      select: {
        id: true,
        title: true,
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
      title: updated.title ?? null,
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
        title: true,
        pageSize: true,
        fontSize: true,
      },
    });

    if (!book) {
      throw new NotFoundException(`Book "${bookId}" not found`);
    }

    const UPLOAD_BLOCKED_STATUSES: ReadonlySet<string> = new Set([
      "APPROVED",
      "IN_PRODUCTION",
      "PRINTING",
      "PRINTED",
      "SHIPPING",
      "DELIVERED",
      "COMPLETED",
      "CANCELLED",
    ]);

    if (UPLOAD_BLOCKED_STATUSES.has(book.status)) {
      throw new BadRequestException(
        "Manuscript uploads are no longer allowed after the book has been approved for production."
      );
    }

    this.rollout.assertManuscriptPipelineAccess(book);

    const pageSize = this.resolvePageSize(book.pageSize);
    const fontSize = this.resolveFontSize(book.fontSize);
    if (!pageSize || !fontSize) {
      throw new BadRequestException("Please select book size and font size before uploading.");
    }

    const mimeType = this.manuscriptAnalysis.detectMimeType(file);

    // Fast structural integrity check before expensive ClamAV + Cloudinary upload
    this.manuscriptAnalysis.validateFileIntegrity(file.buffer, mimeType);

    const wordCount = await this.manuscriptAnalysis.extractWordCount(file.buffer, mimeType);
    const estimatedPages = this.manuscriptAnalysis.estimatePages({
      wordCount,
      pageSize,
      fontSize,
    });
    const documentPageCount = await this.manuscriptAnalysis.extractDocumentPageCount(
      file.buffer,
      mimeType
    );

    this.logger.log(
      `Page count for book ${bookId}: ` +
        `documentPageCount=${documentPageCount ?? "null"} (source: ${documentPageCount !== null ? (mimeType === "application/pdf" ? "pdf-parse numpages" : "docProps/app.xml") : "unavailable"}), ` +
        `estimatedPages=${estimatedPages} (formula), ` +
        `wordCount=${wordCount}, mimeType=${mimeType}`
    );

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
    const newTitle = this.deriveTitleFromFileName(uploadedFile.fileName ?? file.originalname);
    await this.prisma.book.update({
      where: { id: book.id },
      data: {
        status: shouldMarkUploaded ? "UPLOADED" : book.status,
        wordCount,
        estimatedPages,
        documentPageCount,
        pageSize,
        fontSize,
        // Update the title to match the latest uploaded manuscript file name.
        ...(newTitle ? { title: newTitle } : {}),
        // Clear stale pipeline URLs so the previous manuscript's outputs
        // are never shown while the new pipeline processes.
        currentHtmlUrl: null,
        previewPdfUrl: null,
        finalPdfUrl: null,
        ...(book.status === "REJECTED"
          ? {
              rejectionReason: null,
              rejectedAt: null,
              rejectedBy: null,
              productionStatus: null,
              productionStatusUpdatedAt: null,
            }
          : {}),
      },
    });

    // Cancel any running pipeline jobs from a previous upload so they don't
    // race against the new manuscript and cause confusing state.
    await this.booksPipeline.cancelActiveJobsForBook(book.id, "supersededByUpload");

    await this.booksPipeline.enqueueFormatManuscript({
      bookId: book.id,
      trigger: "upload",
    });

    return {
      bookId: book.id,
      title:
        newTitle ??
        book.title ??
        this.deriveTitleFromFileName(uploadedFile.fileName ?? file.originalname),
      fileId: uploadedFile.id,
      fileUrl: uploadedFile.url,
      fileName: uploadedFile.fileName ?? file.originalname,
      fileSize: uploadedFile.fileSize ?? file.size,
      mimeType,
      pageSize,
      fontSize,
      wordCount,
      estimatedPages,
      documentPageCount,
    };
  }

  async findUserBooks(
    userId: string,
    query: Partial<UserBooksListQueryInput> = {}
  ): Promise<UserBooksListResponse> {
    const page = query.page ?? 1;
    const pageSize = query.limit ?? 10;
    const skip = (page - 1) * pageSize;

    const rows = (await this.prisma.book.findMany({
      where: { userId },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip,
      take: pageSize,
      select: USER_BOOK_LIST_SELECT,
    })) as UserBookListRow[];
    const totalItems = await this.prisma.book.count({
      where: { userId },
    });
    const totalPages = totalItems > 0 ? Math.ceil(totalItems / pageSize) : 0;

    return {
      items: rows.map((row) => this.serializeUserBookListItem(row)),
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasPreviousPage: page > 1,
        hasNextPage: page < totalPages,
      },
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
      title: row.title ?? null,
      coverImageUrl: row.coverImageUrl ?? null,
      latestProcessingError: this.resolveLatestProcessingError(row.jobs),
      rejectionReason: row.rejectionReason ?? null,
      rejectedAt: row.rejectedAt?.toISOString() ?? null,
      pageCount: row.pageCount,
      wordCount: row.wordCount,
      estimatedPages: row.estimatedPages,
      documentPageCount: row.documentPageCount,
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

  async findAdminBooks(query: AdminBooksListQuery): Promise<AdminBooksListResponse> {
    const limit = query.limit ?? 20;
    const sortBy = query.sortBy ?? "uploadedAt";
    const sortDirection = query.sortDirection ?? "desc";
    const rows = await this.prisma.book.findMany({
      where: this.buildAdminBookListWhere(query.status),
      select: ADMIN_BOOK_LIST_SELECT,
    });

    const items = rows
      .map((row) => this.serializeAdminBookListItem(row))
      .sort((left, right) =>
        this.compareAdminBookListItems(left, right, {
          sortBy,
          sortDirection,
        })
      );

    const startIndex = query.cursor
      ? Math.max(0, items.findIndex((item) => item.id === query.cursor) + 1)
      : 0;
    const pagedItems = items.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < items.length;

    return {
      items: pagedItems,
      nextCursor: hasMore ? (pagedItems.at(-1)?.id ?? null) : null,
      hasMore,
      totalItems: items.length,
      limit,
      sortBy,
      sortDirection,
      sortableFields: [...ADMIN_BOOK_SORTABLE_FIELDS],
    };
  }

  async findAdminBookById(bookId: string): Promise<AdminBookDetail> {
    const row = (await this.prisma.book.findFirst({
      where: { id: bookId },
      select: ADMIN_BOOK_DETAIL_SELECT,
    })) as AdminBookDetailRow | null;

    if (!row) {
      throw new NotFoundException(`Book "${bookId}" not found`);
    }

    const projection = resolveAdminBookStatusProjection({
      status: row.status,
      productionStatus: row.productionStatus,
    });
    const statusControl = this.buildAdminBookStatusControl({
      status: row.status,
      productionStatus: row.productionStatus,
      version: row.version,
    });
    const uploadedAt = this.resolveUploadedAtFromFiles(row.files);
    const timelineUpdatedAt =
      row.productionStatusUpdatedAt ?? row.rejectedAt ?? row.updatedAt ?? row.createdAt;

    // Derive the display title from the latest RAW_MANUSCRIPT file name so the
    // admin header always reflects the most-recently-uploaded manuscript, even
    // for books where the stored book.title still holds the first upload's name.
    const latestManuscript = row.files.find((f) => f.fileType === "RAW_MANUSCRIPT");
    const latestFileTitle = this.deriveTitleFromFileName(latestManuscript?.fileName ?? null);

    return {
      id: row.id,
      orderId: row.orderId,
      status: row.status,
      productionStatus: row.productionStatus,
      displayStatus: projection.displayStatus,
      statusSource: projection.statusSource,
      title: latestFileTitle ?? row.title ?? null,
      coverImageUrl: row.coverImageUrl ?? null,
      latestProcessingError: this.resolveLatestProcessingError(row.jobs),
      rejectionReason: row.rejectionReason ?? null,
      rejectedAt: row.rejectedAt?.toISOString() ?? null,
      rejectedBy: row.rejectedBy ?? null,
      pageCount: row.pageCount,
      wordCount: row.wordCount,
      estimatedPages: row.estimatedPages,
      documentPageCount: row.documentPageCount,
      fontFamily: row.fontFamily ?? null,
      fontSize: row.fontSize,
      pageSize: row.pageSize ?? null,
      currentHtmlUrl: row.currentHtmlUrl ?? null,
      previewPdfUrl: row.previewPdfUrl ?? null,
      finalPdfUrl: row.finalPdfUrl ?? null,
      uploadedAt,
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      rollout: this.rollout.resolveBookRolloutState(row),
      processing: this.resolveProcessingState({
        bookStatus: row.status,
        currentHtmlUrl: row.currentHtmlUrl ?? null,
        pageCount: row.pageCount,
        finalPdfUrl: row.finalPdfUrl ?? null,
        updatedAt: row.updatedAt,
        jobs: row.jobs,
      }),
      timeline: this.buildProgressTimeline({
        currentStatus: projection.displayStatus,
        createdAt: row.createdAt,
        updatedAt: timelineUpdatedAt,
      }),
      author: this.serializeAdminBookAuthor(row.user),
      order: {
        id: row.order.id,
        orderNumber: row.order.orderNumber,
        status: row.order.status,
        detailUrl: `/admin/orders/${row.order.id}`,
      },
      files: row.files.map((file) => this.serializeBookFileVersion(file)),
      statusControl,
    };
  }

  async updateAdminBookStatus(
    bookId: string,
    input: AdminUpdateBookStatusInput,
    adminId: string
  ): Promise<AdminUpdateBookStatusResponse> {
    if (input.nextStatus === "REJECTED") {
      throw new BadRequestException(
        "Use the manuscript rejection endpoint to reject a manuscript with a required reason."
      );
    }

    const current = await this.prisma.book.findFirst({
      where: { id: bookId },
      select: {
        id: true,
        orderId: true,
        userId: true,
        title: true,
        status: true,
        productionStatus: true,
        version: true,
        order: {
          select: {
            orderNumber: true,
            trackingNumber: true,
            shippingProvider: true,
          },
        },
        user: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
            phoneNumber: true,
            preferredLanguage: true,
            emailNotificationsEnabled: true,
            whatsAppNotificationsEnabled: true,
          },
        },
      },
    });

    if (!current) {
      throw new NotFoundException(`Book "${bookId}" not found`);
    }

    const currentProjection = resolveAdminBookStatusProjection({
      status: current.status,
      productionStatus: current.productionStatus,
    });
    const nextAllowedStatuses = resolveNextAllowedBookStatuses(currentProjection.displayStatus);
    if (!nextAllowedStatuses.includes(input.nextStatus)) {
      throw new BadRequestException(
        `Book cannot move from ${humanizeAdminBookStatus(currentProjection.displayStatus)} to ${humanizeAdminBookStatus(input.nextStatus)}.`
      );
    }

    const previousLifecycleStatus = resolveReviewLifecycleStatus({
      manuscriptStatus: current.status,
      productionStatus: current.productionStatus,
    });
    const shouldCreateReviewRequest =
      input.nextStatus === "DELIVERED" && !isReviewEligibleLifecycleStatus(previousLifecycleStatus);
    const reason = input.reason?.trim() || null;
    const note = input.note?.trim() || null;
    const trackingNumber = input.trackingNumber?.trim();
    const shippingProvider = input.shippingProvider?.trim();
    const shouldUpdateShippingDetails = Boolean(trackingNumber || shippingProvider);
    const trackingNumberChanged =
      Boolean(trackingNumber) && trackingNumber !== (current.order?.trackingNumber?.trim() ?? "");
    const shouldSendShippingNotification = trackingNumberChanged && input.nextStatus === "SHIPPING";
    const recordedAt = new Date();

    const { updated, audit } = await this.prisma.$transaction(async (tx) => {
      const updatedCount = await tx.book.updateMany({
        where: {
          id: current.id,
          version: input.expectedVersion,
        },
        data: {
          productionStatus: input.nextStatus,
          productionStatusUpdatedAt: recordedAt,
          version: {
            increment: 1,
          },
        },
      });

      if (updatedCount.count === 0) {
        throw new ConflictException("Book was updated by another admin. Refresh and try again.");
      }

      if (shouldUpdateShippingDetails) {
        const orderUpdateData: Prisma.OrderUpdateInput = {};
        if (trackingNumber) {
          orderUpdateData.trackingNumber = trackingNumber;
        }
        if (shippingProvider) {
          orderUpdateData.shippingProvider = shippingProvider;
        }

        await tx.order.update({
          where: { id: current.orderId },
          data: orderUpdateData,
        });
      }

      const updatedBook = await tx.book.findUnique({
        where: { id: current.id },
        select: {
          id: true,
          orderId: true,
          userId: true,
          title: true,
          status: true,
          productionStatus: true,
          version: true,
          updatedAt: true,
        },
      });

      if (!updatedBook) {
        throw new NotFoundException(`Book "${bookId}" not found`);
      }

      const auditLog = await tx.auditLog.create({
        data: {
          userId: adminId,
          action: "ADMIN_BOOK_STATUS_UPDATED",
          entityType: "BOOK",
          entityId: current.id,
          details: {
            previousStatus: currentProjection.displayStatus,
            nextStatus: input.nextStatus,
            note,
            reason,
            expectedVersion: input.expectedVersion,
            bookVersion: updatedBook.version,
            statusSource: currentProjection.statusSource,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: adminId,
          action: ADMIN_BOOK_TRACKING_ACTION,
          entityType: ADMIN_BOOK_TRACKING_ENTITY_TYPE,
          entityId: current.orderId,
          details: {
            source: ADMIN_BOOK_TRACKING_SOURCE,
            status: input.nextStatus,
            reachedAt: recordedAt.toISOString(),
            label: humanizeAdminBookStatus(input.nextStatus),
          },
        },
      });

      if (shouldCreateReviewRequest) {
        await this.notifications.createReviewRequestNotification(
          {
            userId: current.userId,
            orderId: current.orderId,
            bookId: current.id,
            bookTitle: current.title ?? "Your book",
          },
          tx
        );
      }

      return {
        updated: updatedBook,
        audit: auditLog,
      };
    });

    await this.sendBookWorkflowWhatsAppNotifications({
      user: current.user,
      bookTitle: current.title,
      nextStatus: input.nextStatus,
      orderId: current.orderId,
      orderNumber: current.order?.orderNumber,
      shouldSendShippingNotification,
      trackingNumber: trackingNumber ?? null,
      shippingProvider: shippingProvider ?? current.order?.shippingProvider ?? null,
    });

    const projection = resolveAdminBookStatusProjection({
      status: updated.status,
      productionStatus: updated.productionStatus,
    });

    return {
      bookId: updated.id,
      previousStatus: currentProjection.displayStatus,
      nextStatus: input.nextStatus,
      displayStatus: projection.displayStatus,
      statusSource: projection.statusSource,
      bookVersion: updated.version,
      updatedAt: updated.updatedAt.toISOString(),
      audit: this.serializeAdminAuditEntry(audit, adminId),
    };
  }

  async rejectAdminBook(
    bookId: string,
    input: AdminRejectBookInput,
    adminId: string
  ): Promise<AdminRejectBookResponse> {
    const current = await this.prisma.book.findFirst({
      where: { id: bookId },
      select: {
        id: true,
        orderId: true,
        userId: true,
        title: true,
        status: true,
        productionStatus: true,
        version: true,
        user: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
            phoneNumber: true,
            preferredLanguage: true,
            emailNotificationsEnabled: true,
            whatsAppNotificationsEnabled: true,
          },
        },
      },
    });

    if (!current) {
      throw new NotFoundException(`Book "${bookId}" not found`);
    }

    if (current.status === "REJECTED") {
      throw new BadRequestException("This manuscript has already been rejected.");
    }

    if (
      !canRejectAdminBook({
        status: current.status,
        productionStatus: current.productionStatus,
      })
    ) {
      throw new BadRequestException(
        "This manuscript can no longer be rejected at its current stage."
      );
    }

    const rejectionReason = input.rejectionReason.trim();
    const currentProjection = resolveAdminBookStatusProjection({
      status: current.status,
      productionStatus: current.productionStatus,
    });
    const recordedAt = new Date();
    const bookTitle = current.title?.trim() || "Your book";

    const { updated, audit } = await this.prisma.$transaction(async (tx) => {
      const updatedCount = await tx.book.updateMany({
        where: {
          id: current.id,
          version: input.expectedVersion,
        },
        data: {
          status: "REJECTED",
          productionStatus: null,
          productionStatusUpdatedAt: null,
          rejectionReason,
          rejectedAt: recordedAt,
          rejectedBy: adminId,
          version: {
            increment: 1,
          },
        },
      });

      if (updatedCount.count === 0) {
        throw new ConflictException("Book was updated by another admin. Refresh and try again.");
      }

      const updatedBook = await tx.book.findUnique({
        where: { id: current.id },
        select: {
          id: true,
          version: true,
          rejectedAt: true,
          rejectionReason: true,
        },
      });

      if (!updatedBook) {
        throw new NotFoundException(`Book "${bookId}" not found`);
      }

      const auditLog = await tx.auditLog.create({
        data: {
          userId: adminId,
          action: "ADMIN_BOOK_REJECTED",
          entityType: "BOOK",
          entityId: current.id,
          details: {
            previousStatus: currentProjection.displayStatus,
            nextStatus: "REJECTED",
            reason: rejectionReason,
            expectedVersion: input.expectedVersion,
            bookVersion: updatedBook.version,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: adminId,
          action: ADMIN_BOOK_TRACKING_ACTION,
          entityType: ADMIN_BOOK_TRACKING_ENTITY_TYPE,
          entityId: current.orderId,
          details: {
            source: ADMIN_BOOK_TRACKING_SOURCE,
            status: "REJECTED",
            reachedAt: recordedAt.toISOString(),
            label: humanizeAdminBookStatus("REJECTED"),
          },
        },
      });

      await this.notifications.createSystemNotification(
        {
          userId: current.userId,
          orderId: current.orderId,
          bookId: current.id,
          titleKey: MANUSCRIPT_REJECTED_TITLE_KEY,
          messageKey: MANUSCRIPT_REJECTED_MESSAGE_KEY,
          params: {
            bookTitle,
          },
          action: {
            kind: "navigate",
            href: DEFAULT_DASHBOARD_PATH,
          },
          presentation: {
            tone: "warning",
          },
          fallbackTitle: MANUSCRIPT_REJECTED_FALLBACK_TITLE,
          fallbackMessage: `"${bookTitle}" was returned for revision. Open your dashboard to review the manuscript notes.`,
        },
        tx
      );

      return {
        updated: updatedBook,
        audit: auditLog,
      };
    });

    await this.sendManuscriptRejectedEmail({
      email: current.user.email,
      preferredLanguage: current.user.preferredLanguage,
      userName: this.resolveUserFullName(current.user),
      bookTitle,
      rejectionReason,
      emailNotificationsEnabled: current.user.emailNotificationsEnabled,
    });
    await this.sendManuscriptRejectedWhatsApp({
      user: current.user,
      bookTitle,
      rejectionReason,
    });

    return {
      bookId: current.id,
      previousStatus: currentProjection.displayStatus,
      nextStatus: "REJECTED",
      displayStatus: "REJECTED",
      statusSource: "manuscript",
      bookVersion: updated.version,
      rejectionReason: updated.rejectionReason ?? rejectionReason,
      rejectedAt: (updated.rejectedAt ?? recordedAt).toISOString(),
      audit: this.serializeAdminAuditEntry(audit, adminId),
    };
  }

  async resetAdminBookProcessing(
    bookId: string,
    input: AdminResetProcessingInput,
    adminId: string
  ): Promise<AdminResetProcessingResponse> {
    const current = await this.prisma.book.findFirst({
      where: { id: bookId },
      select: {
        id: true,
        orderId: true,
        userId: true,
        status: true,
        productionStatus: true,
        version: true,
        pageSize: true,
        fontSize: true,
      },
    });

    if (!current) {
      throw new NotFoundException(`Book "${bookId}" not found`);
    }

    if (
      !canResetProcessingPipeline({
        status: current.status,
        productionStatus: current.productionStatus,
      })
    ) {
      throw new BadRequestException(
        "This book's processing pipeline cannot be reset at its current stage."
      );
    }

    const previousStatus = current.status;

    const { audit } = await this.prisma.$transaction(async (tx) => {
      const updatedCount = await tx.book.updateMany({
        where: {
          id: current.id,
          version: input.expectedVersion,
        },
        data: {
          status: "AI_PROCESSING",
          pageCount: null,
          version: { increment: 1 },
        },
      });

      if (updatedCount.count === 0) {
        throw new ConflictException("Book was updated by another admin. Refresh and try again.");
      }

      await tx.order.updateMany({
        where: { id: current.orderId },
        data: { status: "FORMATTING" },
      });

      const auditLog = await tx.auditLog.create({
        data: {
          userId: adminId,
          action: "ADMIN_BOOK_RESET_PROCESSING",
          entityType: "BOOK",
          entityId: current.id,
          details: {
            previousStatus,
            nextStatus: "AI_PROCESSING",
            reason: input.reason?.trim() || null,
            expectedVersion: input.expectedVersion,
          },
        },
      });

      return { audit: auditLog };
    });

    const queueResult = await this.booksPipeline.enqueueFormatManuscript({
      bookId: current.id,
      trigger: "upload",
    });

    const updatedBook = await this.prisma.book.findUnique({
      where: { id: current.id },
      select: { version: true },
    });

    return {
      bookId: current.id,
      previousStatus,
      bookStatus: "AI_PROCESSING",
      orderStatus: "FORMATTING",
      bookVersion: updatedBook?.version ?? input.expectedVersion + 1,
      queuedJob: queueResult.queued
        ? {
            queue: "ai-formatting",
            name: "format-manuscript",
            jobId: queueResult.queueJobId,
          }
        : null,
      audit: this.serializeAdminAuditEntry(audit, adminId),
    };
  }

  async cancelAdminBookProcessing(
    bookId: string,
    input: AdminCancelProcessingInput,
    adminId: string
  ): Promise<AdminCancelProcessingResponse> {
    const current = await this.prisma.book.findFirst({
      where: { id: bookId },
      select: {
        id: true,
        orderId: true,
        status: true,
        productionStatus: true,
        version: true,
      },
    });

    if (!current) {
      throw new NotFoundException(`Book "${bookId}" not found`);
    }

    if (
      !canCancelProcessing({
        status: current.status,
        productionStatus: current.productionStatus,
      })
    ) {
      throw new BadRequestException(
        "This book's processing cannot be cancelled at its current stage."
      );
    }

    const previousStatus = current.status;

    const cancelledJobs = await this.booksPipeline.cancelActiveJobsForBook(current.id);

    const { audit } = await this.prisma.$transaction(async (tx) => {
      const updatedCount = await tx.book.updateMany({
        where: {
          id: current.id,
          version: input.expectedVersion,
        },
        data: {
          status: "PAYMENT_RECEIVED",
          pageCount: null,
          currentHtmlUrl: null,
          previewPdfUrl: null,
          version: { increment: 1 },
        },
      });

      if (updatedCount.count === 0) {
        throw new ConflictException("Book was updated by another admin. Refresh and try again.");
      }

      await tx.order.updateMany({
        where: { id: current.orderId },
        data: { status: "AWAITING_UPLOAD" },
      });

      const auditLog = await tx.auditLog.create({
        data: {
          userId: adminId,
          action: "ADMIN_BOOK_CANCEL_PROCESSING",
          entityType: "BOOK",
          entityId: current.id,
          details: {
            previousStatus,
            nextStatus: "PAYMENT_RECEIVED",
            reason: input.reason?.trim() || null,
            expectedVersion: input.expectedVersion,
            cancelledJobs,
          },
        },
      });

      return { audit: auditLog };
    });

    const updatedBook = await this.prisma.book.findUnique({
      where: { id: current.id },
      select: { version: true },
    });

    return {
      bookId: current.id,
      previousStatus,
      bookStatus: "PAYMENT_RECEIVED",
      orderStatus: "AWAITING_UPLOAD",
      bookVersion: updatedBook?.version ?? input.expectedVersion + 1,
      cancelledJobs,
      audit: this.serializeAdminAuditEntry(audit, adminId),
    };
  }

  async decommissionAdminBook(
    bookId: string,
    input: AdminDecommissionBookInput,
    adminId: string
  ): Promise<AdminDecommissionBookResponse> {
    const current = await this.prisma.book.findFirst({
      where: { id: bookId },
      select: {
        id: true,
        orderId: true,
        status: true,
        productionStatus: true,
        version: true,
      },
    });

    if (!current) {
      throw new NotFoundException(`Book "${bookId}" not found`);
    }

    if (
      !canDecommissionBook({
        status: current.status,
        productionStatus: current.productionStatus,
      })
    ) {
      throw new BadRequestException(
        "This book cannot be decommissioned because it has already been delivered, completed, or cancelled."
      );
    }

    const previousStatus = current.status;

    // Cancel all active pipeline jobs (BullMQ + DB)
    const cancelledJobs = await this.booksPipeline.cancelActiveJobsForBook(
      current.id,
      "cancelledByAdmin"
    );

    const { audit } = await this.prisma.$transaction(async (tx) => {
      const updatedCount = await tx.book.updateMany({
        where: {
          id: current.id,
          version: input.expectedVersion,
        },
        data: {
          status: "CANCELLED",
          productionStatus: "CANCELLED",
          productionStatusUpdatedAt: new Date(),
          currentHtmlUrl: null,
          previewPdfUrl: null,
          finalPdfUrl: null,
          pageCount: null,
          version: { increment: 1 },
        },
      });

      if (updatedCount.count === 0) {
        throw new ConflictException("Book was updated by another admin. Refresh and try again.");
      }

      await tx.order.updateMany({
        where: { id: current.orderId },
        data: { status: "CANCELLED" },
      });

      const auditLog = await tx.auditLog.create({
        data: {
          userId: adminId,
          action: "ADMIN_BOOK_DECOMMISSION",
          entityType: "BOOK",
          entityId: current.id,
          details: {
            previousStatus,
            nextStatus: "CANCELLED",
            reason: input.reason.trim(),
            expectedVersion: input.expectedVersion,
            cancelledJobs,
          },
        },
      });

      return { audit: auditLog };
    });

    const updatedBook = await this.prisma.book.findUnique({
      where: { id: current.id },
      select: { version: true },
    });

    return {
      bookId: current.id,
      previousStatus,
      bookStatus: "CANCELLED",
      orderStatus: "CANCELLED",
      bookVersion: updatedBook?.version ?? input.expectedVersion + 1,
      cancelledJobs,
      audit: this.serializeAdminAuditEntry(audit, adminId),
    };
  }

  async requestAdminBookHtmlUpload(
    bookId: string,
    input: AdminBookHtmlUploadBodyInput,
    adminId: string
  ): Promise<AdminBookHtmlUploadResponse> {
    if (input.action === "authorize") {
      return this.authorizeAdminBookHtmlUpload(bookId, input, adminId);
    }

    return this.finalizeAdminBookHtmlUpload(bookId, input, adminId);
  }

  async downloadAdminBookFile(
    bookId: string,
    fileType: AdminBookDownloadFileType
  ): Promise<AdminDownloadAsset> {
    const targetFileType =
      fileType === "raw"
        ? RAW_DOWNLOAD_FILE_TYPE
        : fileType === "cleaned"
          ? CLEANED_DOWNLOAD_FILE_TYPE
          : FINAL_PDF_DOWNLOAD_FILE_TYPE;
    const row = await this.prisma.book.findFirst({
      where: { id: bookId },
      select: {
        id: true,
        finalPdfUrl: true,
        files: {
          where: {
            fileType: targetFileType,
          },
          orderBy: [{ version: "desc" }, { createdAt: "desc" }],
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

    const file = row.files[0] ?? null;
    const downloadUrl = file?.url ?? (fileType === "final-pdf" ? row.finalPdfUrl : null);
    if (!downloadUrl) {
      throw new NotFoundException(
        fileType === "raw"
          ? "Original manuscript file is not available."
          : fileType === "cleaned"
            ? "Cleaned HTML file is not available."
            : "Final clean PDF is not available yet."
      );
    }

    return {
      buffer: await this.fetchDownloadAssetBuffer(downloadUrl),
      fileName: this.normalizeDownloadFileName(
        file?.fileName,
        this.buildFallbackDownloadFileName({
          bookId: row.id,
          fileType,
          mimeType: file?.mimeType ?? null,
        })
      ),
      mimeType:
        file?.mimeType?.trim() ||
        (fileType === "cleaned"
          ? "text/html; charset=utf-8"
          : fileType === "final-pdf"
            ? "application/pdf"
            : "application/octet-stream"),
    };
  }

  async downloadAdminBookVersionFile(bookId: string, fileId: string): Promise<AdminDownloadAsset> {
    const row = await this.prisma.book.findFirst({
      where: { id: bookId },
      select: {
        id: true,
        files: {
          where: { id: fileId },
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

    const file = row.files[0];
    if (!file) {
      throw new NotFoundException(`Book file "${fileId}" not found`);
    }

    return {
      buffer: await this.fetchDownloadAssetBuffer(file.url),
      fileName: this.normalizeDownloadFileName(
        file.fileName,
        this.buildFallbackVersionDownloadFileName({
          bookId: row.id,
          fileId,
          mimeType: file.mimeType,
        })
      ),
      mimeType: file.mimeType?.trim() || "application/octet-stream",
    };
  }

  async getUserBookReprintConfig(
    userId: string,
    bookId: string
  ): Promise<BookReprintConfigResponse> {
    const book = await this.prisma.book.findFirst({
      where: {
        id: bookId,
        userId,
      },
      select: {
        id: true,
        status: true,
        pageCount: true,
        finalPdfUrl: true,
        order: {
          select: {
            bookSize: true,
            paperColor: true,
            lamination: true,
          },
        },
      },
    });

    if (!book) {
      throw new NotFoundException(`Book "${bookId}" not found`);
    }

    const [systemSettings, paymentGateways] = await Promise.all([
      this.prisma.systemSetting.findMany({
        where: {
          key: {
            in: [BooksService.REPRINT_COST_PER_PAGE_SETTING_KEY],
          },
        },
        select: {
          key: true,
          value: true,
        },
      }),
      this.prisma.paymentGateway.findMany({
        where: {
          isEnabled: true,
          provider: {
            in: [...BooksService.REPRINT_PAYMENT_PROVIDERS],
          },
        },
        orderBy: [{ priority: "asc" }, { provider: "asc" }],
        select: {
          provider: true,
        },
      }),
    ]);

    const configuredA5Cost = this.resolveConfiguredReprintCostPerPage(systemSettings);
    const defaultBookSize = this.normalizeReprintBookSize(book.order.bookSize);
    const defaultPaperColor = this.normalizePaperColor(book.order.paperColor);
    const defaultLamination = this.normalizeLamination(book.order.lamination);
    const enabledPaymentProviders = paymentGateways
      .map((gateway) => gateway.provider)
      .filter(
        (provider): provider is BookReprintConfigResponse["enabledPaymentProviders"][number] =>
          provider === PaymentProvider.PAYSTACK || provider === PaymentProvider.STRIPE
      );
    const disableReason = this.resolveReprintDisableReason({
      bookStatus: book.status,
      finalPdfUrl: book.finalPdfUrl,
      pageCount: book.pageCount,
      defaultBookSize,
      enabledPaymentProvidersCount: enabledPaymentProviders.length,
    });

    return {
      bookId: book.id,
      canReprintSame: disableReason === null,
      disableReason,
      finalPdfUrlPresent: Boolean(book.finalPdfUrl),
      pageCount: typeof book.pageCount === "number" && book.pageCount > 0 ? book.pageCount : null,
      minCopies: BooksService.REPRINT_MIN_COPIES,
      defaultBookSize,
      defaultPaperColor,
      defaultLamination,
      allowedBookSizes: [...BooksService.REPRINT_ALLOWED_BOOK_SIZES],
      allowedPaperColors: [...BooksService.REPRINT_ALLOWED_PAPER_COLORS],
      allowedLaminations: [...BooksService.REPRINT_ALLOWED_LAMINATIONS],
      costPerPageBySize: {
        A4: configuredA5Cost * 2,
        A5: configuredA5Cost,
        A6: configuredA5Cost / 2,
      },
      enabledPaymentProviders,
    };
  }

  async updateAdminBookProductionStatus(
    bookId: string,
    input: UpdateAdminBookProductionStatusInput
  ): Promise<AdminBookProductionStatusResponse> {
    const book = await this.prisma.book.findFirst({
      where: { id: bookId },
      select: {
        id: true,
        orderId: true,
        userId: true,
        title: true,
        status: true,
        productionStatus: true,
        order: {
          select: {
            orderNumber: true,
            trackingNumber: true,
            shippingProvider: true,
          },
        },
        user: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
            phoneNumber: true,
            preferredLanguage: true,
            whatsAppNotificationsEnabled: true,
          },
        },
      },
    });

    if (!book) {
      throw new NotFoundException(`Book "${bookId}" not found`);
    }

    const previousLifecycleStatus = resolveReviewLifecycleStatus({
      manuscriptStatus: book.status,
      productionStatus: book.productionStatus,
    });
    const shouldCreateReviewRequest =
      input.productionStatus === "DELIVERED" &&
      !isReviewEligibleLifecycleStatus(previousLifecycleStatus);
    const trackingNumber = input.trackingNumber?.trim();
    const shippingProvider = input.shippingProvider?.trim();
    const shouldUpdateShippingDetails = Boolean(trackingNumber || shippingProvider);
    const trackingNumberChanged =
      Boolean(trackingNumber) && trackingNumber !== (book.order?.trackingNumber?.trim() ?? "");
    const shouldSendShippingNotification =
      trackingNumberChanged && input.productionStatus === "SHIPPING";
    const updatedAt = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      if (shouldUpdateShippingDetails) {
        const orderUpdateData: Prisma.OrderUpdateInput = {};
        if (trackingNumber) {
          orderUpdateData.trackingNumber = trackingNumber;
        }
        if (shippingProvider) {
          orderUpdateData.shippingProvider = shippingProvider;
        }

        await tx.order.update({
          where: { id: book.orderId },
          data: orderUpdateData,
        });
      }

      const result = await tx.book.update({
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

      if (shouldCreateReviewRequest) {
        await this.notifications.createReviewRequestNotification(
          {
            userId: book.userId,
            orderId: book.orderId,
            bookId: book.id,
            bookTitle: book.title ?? "Your book",
          },
          tx
        );
      }

      return result;
    });

    await this.sendBookWorkflowWhatsAppNotifications({
      user: book.user,
      bookTitle: book.title,
      nextStatus: input.productionStatus,
      orderId: book.orderId,
      orderNumber: book.order?.orderNumber,
      shouldSendShippingNotification,
      trackingNumber: trackingNumber ?? null,
      shippingProvider: shippingProvider ?? book.order?.shippingProvider ?? null,
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

  private buildAdminBookListWhere(status?: AdminBooksListQuery["status"]): Prisma.BookWhereInput {
    if (!status) {
      return {};
    }

    return {
      OR: [
        { productionStatus: status },
        {
          productionStatus: null,
          status,
        },
      ],
    };
  }

  private serializeAdminBookListItem(
    row: AdminBookListRow
  ): AdminBooksListResponse["items"][number] {
    const projection = resolveAdminBookStatusProjection({
      status: row.status,
      productionStatus: row.productionStatus,
    });

    return {
      id: row.id,
      title: row.title ?? null,
      author: this.serializeAdminBookAuthor(row.user),
      order: {
        id: row.order.id,
        orderNumber: row.order.orderNumber,
        status: row.order.status,
        detailUrl: `/admin/orders/${row.order.id}`,
      },
      status: row.status,
      productionStatus: row.productionStatus,
      displayStatus: projection.displayStatus,
      statusSource: projection.statusSource,
      uploadedAt: this.resolveUploadedAtFromFiles(row.files),
      createdAt: row.createdAt.toISOString(),
      detailUrl: `/admin/books/${row.id}`,
    };
  }

  private serializeUserBookListItem(row: UserBookListRow): UserBooksListResponse["items"][number] {
    const productionStatus = this.resolveProductionStatus({
      productionStatus: row.productionStatus,
      manuscriptStatus: row.status,
    });

    return {
      id: row.id,
      orderId: row.orderId,
      title: row.title ?? null,
      status: row.status,
      productionStatus,
      orderStatus: row.order.status,
      currentStage: this.resolveStageFromStatus(productionStatus),
      coverImageUrl: row.coverImageUrl ?? null,
      latestProcessingError: this.resolveLatestProcessingError(row.jobs),
      rejectionReason: row.rejectionReason ?? null,
      pageCount: row.pageCount,
      wordCount: row.wordCount,
      estimatedPages: row.estimatedPages,
      documentPageCount: row.documentPageCount,
      fontSize: this.resolveFontSize(row.fontSize),
      pageSize: this.resolvePageSize(row.pageSize ?? null),
      previewPdfUrlPresent: typeof row.previewPdfUrl === "string" && row.previewPdfUrl.length > 0,
      finalPdfUrlPresent: typeof row.finalPdfUrl === "string" && row.finalPdfUrl.length > 0,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      workspaceUrl: `/dashboard/books/${row.id}`,
      trackingUrl: `/dashboard/orders/${row.orderId}`,
      rollout: this.rollout.resolveBookRolloutState(row),
      processing: this.resolveProcessingState({
        bookStatus: row.status,
        currentHtmlUrl: row.currentHtmlUrl ?? null,
        pageCount: row.pageCount,
        finalPdfUrl: row.finalPdfUrl ?? null,
        updatedAt: row.updatedAt,
        jobs: row.jobs,
      }),
    };
  }

  private compareAdminBookListItems(
    left: AdminBooksListResponse["items"][number],
    right: AdminBooksListResponse["items"][number],
    params: {
      sortBy: AdminBooksListQuery["sortBy"];
      sortDirection: AdminBooksListQuery["sortDirection"];
    }
  ): number {
    const direction = params.sortDirection === "asc" ? 1 : -1;

    const compareString = (leftValue: string, rightValue: string): number => {
      const result = leftValue.localeCompare(rightValue, undefined, { sensitivity: "base" });
      return result !== 0 ? result * direction : left.id.localeCompare(right.id) * direction;
    };

    if (params.sortBy === "title") {
      return compareString(left.title ?? "", right.title ?? "");
    }

    if (params.sortBy === "authorName") {
      return compareString(left.author.fullName, right.author.fullName);
    }

    if (params.sortBy === "displayStatus") {
      return compareString(left.displayStatus, right.displayStatus);
    }

    if (params.sortBy === "orderNumber") {
      return compareString(left.order.orderNumber, right.order.orderNumber);
    }

    return compareString(left.uploadedAt ?? left.createdAt, right.uploadedAt ?? right.createdAt);
  }

  private buildAdminBookStatusControl(params: {
    status: BookStatus;
    productionStatus: BookStatus | null;
    version: number;
  }): AdminBookDetail["statusControl"] {
    const projection = resolveAdminBookStatusProjection({
      status: params.status,
      productionStatus: params.productionStatus,
    });

    return {
      currentStatus: projection.displayStatus,
      statusSource: projection.statusSource,
      expectedVersion: params.version,
      nextAllowedStatuses: resolveNextAllowedBookStatuses(projection.displayStatus),
      canRejectManuscript: canRejectAdminBook({
        status: params.status,
        productionStatus: params.productionStatus,
      }),
      canUploadHtmlFallback: canUploadAdminHtmlFallback({
        status: params.status,
        productionStatus: params.productionStatus,
      }),
      canResetProcessing: canResetProcessingPipeline({
        status: params.status,
        productionStatus: params.productionStatus,
      }),
      canCancelProcessing: canCancelProcessing({
        status: params.status,
        productionStatus: params.productionStatus,
      }),
    };
  }

  private serializeAdminBookAuthor(row: {
    id: string;
    firstName: string;
    lastName: string | null;
    email: string;
    preferredLanguage: string;
  }): AdminBookDetail["author"] {
    return {
      id: row.id,
      fullName: this.resolveUserFullName(row),
      email: row.email,
      preferredLanguage: row.preferredLanguage,
    };
  }

  private serializeBookFileVersion(row: {
    id: string;
    fileType: FileType;
    url: string;
    fileName: string | null;
    fileSize: number | null;
    mimeType: string | null;
    version: number;
    createdBy: string | null;
    createdAt: Date;
  }): AdminBookDetail["files"][number] {
    return {
      id: row.id,
      fileType: row.fileType,
      url: row.url,
      fileName: row.fileName ?? null,
      fileSize: row.fileSize,
      mimeType: row.mimeType ?? null,
      version: row.version,
      createdBy: row.createdBy ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private resolveUploadedAtFromFiles(
    files: Array<{
      createdAt: Date;
      fileType?: FileType;
    }>
  ): string | null {
    const rawFile = files.find(
      (file) => file.fileType === undefined || file.fileType === "RAW_MANUSCRIPT"
    );
    return rawFile?.createdAt.toISOString() ?? null;
  }

  private async authorizeAdminBookHtmlUpload(
    bookId: string,
    input: Extract<AdminBookHtmlUploadBodyInput, { action: "authorize" }>,
    adminId: string
  ): Promise<Extract<AdminBookHtmlUploadResponse, { action: "authorize" }>> {
    const cloudinary = this.getCloudinaryService();
    const book = await this.prisma.book.findFirst({
      where: { id: bookId },
      select: {
        id: true,
        status: true,
        productionStatus: true,
        pageSize: true,
        fontSize: true,
        files: {
          where: {
            fileType: "RAW_MANUSCRIPT",
          },
          orderBy: [{ version: "desc" }, { createdAt: "desc" }],
          take: 1,
          select: {
            id: true,
          },
        },
      },
    });

    if (!book) {
      throw new NotFoundException(`Book "${bookId}" not found`);
    }

    this.assertAdminHtmlFallbackAllowed(book);
    this.assertAdminHtmlFallbackConfigured(book);

    if (book.files.length === 0) {
      throw new BadRequestException(
        "Upload a raw manuscript before using the manual HTML fallback."
      );
    }

    const publicId = `cleaned-html-${adminId}-${randomUUID().replace(/-/g, "")}`;
    const folder = this.buildAdminHtmlUploadFolder(book.id);
    const signature = cloudinary.generateSignature({
      folder,
      mimeType: input.mimeType,
      publicId,
      tags: [
        "bookprinta",
        `book:${book.id}`,
        "source:admin-html-fallback",
        "file-type:cleaned-html",
      ],
    });

    return {
      action: "authorize",
      upload: {
        ...signature,
        resourceType: "raw",
        publicId,
      },
    };
  }

  private async finalizeAdminBookHtmlUpload(
    bookId: string,
    input: Extract<AdminBookHtmlUploadBodyInput, { action: "finalize" }>,
    adminId: string
  ): Promise<Extract<AdminBookHtmlUploadResponse, { action: "finalize" }>> {
    const book = await this.prisma.book.findFirst({
      where: { id: bookId },
      select: {
        id: true,
        status: true,
        productionStatus: true,
        pageSize: true,
        fontSize: true,
        version: true,
        files: {
          where: {
            fileType: "RAW_MANUSCRIPT",
          },
          orderBy: [{ version: "desc" }, { createdAt: "desc" }],
          take: 1,
          select: {
            id: true,
          },
        },
      },
    });

    if (!book) {
      throw new NotFoundException(`Book "${bookId}" not found`);
    }

    this.assertAdminHtmlFallbackAllowed(book);
    this.assertAdminHtmlFallbackConfigured(book);

    if (book.files.length === 0) {
      throw new BadRequestException(
        "Upload a raw manuscript before using the manual HTML fallback."
      );
    }

    this.assertAllowedAdminHtmlUpload({
      bookId: book.id,
      secureUrl: input.secureUrl,
      publicId: input.publicId,
    });

    const { file, updatedBook } = await this.prisma.$transaction(async (tx) => {
      const updatedCount = await tx.book.updateMany({
        where: {
          id: book.id,
          version: input.expectedVersion,
        },
        data: {
          currentHtmlUrl: input.secureUrl,
          version: {
            increment: 1,
          },
        },
      });

      if (updatedCount.count === 0) {
        throw new ConflictException("Book was updated by another admin. Refresh and try again.");
      }

      const latestHtml = await tx.file.findFirst({
        where: {
          bookId: book.id,
          fileType: "CLEANED_HTML",
        },
        orderBy: [{ version: "desc" }, { createdAt: "desc" }],
        select: {
          version: true,
        },
      });

      const createdFile = await tx.file.create({
        data: {
          bookId: book.id,
          fileType: "CLEANED_HTML",
          url: input.secureUrl,
          fileName: input.fileName,
          fileSize: input.fileSize,
          mimeType: input.mimeType,
          version: (latestHtml?.version ?? 0) + 1,
          createdBy: adminId,
        },
        select: ADMIN_FILE_VERSION_SELECT,
      });

      const nextBook = await tx.book.findUnique({
        where: { id: book.id },
        select: {
          id: true,
          status: true,
          productionStatus: true,
          version: true,
        },
      });

      if (!nextBook) {
        throw new NotFoundException(`Book "${bookId}" not found`);
      }

      await tx.auditLog.create({
        data: {
          userId: adminId,
          action: "ADMIN_BOOK_HTML_UPLOADED",
          entityType: "BOOK",
          entityId: book.id,
          details: {
            fileId: createdFile.id,
            fileType: createdFile.fileType,
            fileName: createdFile.fileName,
            fileSize: createdFile.fileSize,
            mimeType: createdFile.mimeType,
            expectedVersion: input.expectedVersion,
            bookVersion: nextBook.version,
          },
        },
      });

      return {
        file: createdFile,
        updatedBook: nextBook,
      };
    });

    const queueResult = await this.booksPipeline.enqueuePageCountFromAiSuccess({
      bookId: book.id,
      trigger: "upload",
      cleanedHtmlFileId: file.id,
      cleanedHtmlUrl: file.url,
      sourceAiJobRecordId: null,
    });

    const refreshed = await this.prisma.book.findUnique({
      where: { id: book.id },
      select: {
        id: true,
        status: true,
        productionStatus: true,
        version: true,
      },
    });

    if (!refreshed) {
      throw new NotFoundException(`Book "${bookId}" not found`);
    }

    const projection = resolveAdminBookStatusProjection({
      status: refreshed.status,
      productionStatus: refreshed.productionStatus,
    });

    return {
      action: "finalize",
      bookId: refreshed.id,
      file: {
        ...this.serializeBookFileVersion(file),
        fileType: "CLEANED_HTML",
        mimeType: "text/html",
      },
      status: refreshed.status,
      productionStatus: refreshed.productionStatus,
      displayStatus: projection.displayStatus,
      statusSource: projection.statusSource,
      bookVersion: updatedBook.version,
      queuedJob: {
        queue: "page-count",
        name: "count-pages",
        jobId: queueResult.queueJobId,
      },
    };
  }

  private assertAdminHtmlFallbackAllowed(params: {
    status: BookStatus;
    productionStatus: BookStatus | null;
  }): void {
    if (!canUploadAdminHtmlFallback(params)) {
      throw new BadRequestException("Manual HTML fallback is not available at the current stage.");
    }
  }

  private assertAdminHtmlFallbackConfigured(params: {
    pageSize: string | null;
    fontSize: number | null;
  }): void {
    if (!this.resolvePageSize(params.pageSize) || !this.resolveFontSize(params.fontSize)) {
      throw new BadRequestException(
        "Book size and font size must be selected before uploading cleaned HTML."
      );
    }
  }

  private getCloudinaryService(): CloudinaryService {
    if (!this.cloudinary) {
      throw new ServiceUnavailableException("Cloudinary upload service is unavailable.");
    }

    return this.cloudinary;
  }

  private assertAllowedAdminHtmlUpload(params: {
    bookId: string;
    secureUrl: string;
    publicId: string;
  }): string {
    let parsed: URL;

    try {
      parsed = new URL(params.secureUrl);
    } catch {
      throw new BadRequestException("HTML upload URL must be a valid secure Cloudinary URL");
    }

    if (parsed.protocol !== "https:" || parsed.hostname !== "res.cloudinary.com") {
      throw new BadRequestException("HTML upload URL must be a valid secure Cloudinary URL");
    }

    const pathSegments = parsed.pathname.split("/").filter(Boolean);
    const expectedCloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
    if (expectedCloudName && pathSegments[0] !== expectedCloudName) {
      throw new BadRequestException("HTML upload URL must belong to this Cloudinary account");
    }

    const extractedPublicId = this.extractCloudinaryPublicId(params.secureUrl);
    if (!extractedPublicId) {
      throw new BadRequestException("HTML upload URL must be a valid secure Cloudinary URL");
    }

    const expectedPublicId = `${this.buildAdminHtmlUploadFolder(params.bookId)}/${params.publicId}`;
    if (extractedPublicId !== expectedPublicId) {
      throw new BadRequestException("HTML upload metadata does not match the signed asset");
    }

    return extractedPublicId;
  }

  private extractCloudinaryPublicId(url: string): string | null {
    try {
      const parsed = new URL(url);
      if (parsed.hostname !== "res.cloudinary.com") return null;

      const pathSegments = parsed.pathname.split("/").filter(Boolean);
      const uploadIndex = pathSegments.indexOf("upload");
      if (uploadIndex < 0) return null;

      const afterUpload = pathSegments.slice(uploadIndex + 1);
      const versionIndex = afterUpload.findIndex((segment) => /^v\d+$/.test(segment));
      const assetSegments = versionIndex >= 0 ? afterUpload.slice(versionIndex + 1) : afterUpload;
      if (assetSegments.length === 0) return null;

      const lastSegment = assetSegments[assetSegments.length - 1];
      assetSegments[assetSegments.length - 1] = lastSegment.replace(/\.[^.]+$/, "");
      const publicId = assetSegments.join("/");
      return publicId.length > 0 ? publicId : null;
    } catch {
      return null;
    }
  }

  private buildAdminHtmlUploadFolder(bookId: string): string {
    return `${ADMIN_HTML_UPLOAD_FOLDER_ROOT}/${bookId}/cleaned-html`;
  }

  private serializeAdminAuditEntry(
    row: Pick<
      Prisma.AuditLogGetPayload<object>,
      "id" | "action" | "entityType" | "entityId" | "details" | "createdAt"
    >,
    recordedBy: string
  ): AdminUpdateBookStatusResponse["audit"] {
    const details = this.asRecord(row.details);
    return {
      auditId: row.id,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      recordedAt: row.createdAt.toISOString(),
      recordedBy,
      note: this.toStringValue(details?.note) ?? null,
      reason: this.toStringValue(details?.reason) ?? null,
    };
  }

  private resolveUserFullName(user: { firstName: string; lastName: string | null }): string {
    const firstName = user.firstName.trim();
    const lastName = user.lastName?.trim() ?? "";
    const fullName = [firstName, lastName]
      .filter((part) => part.length > 0)
      .join(" ")
      .trim();
    return fullName.length > 0 ? fullName : "BookPrinta Author";
  }

  private resolveUserWhatsappName(user: {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  }): string {
    const firstName = user.firstName?.trim() ?? "";
    const lastName = user.lastName?.trim() ?? "";
    const fullName = [firstName, lastName]
      .filter((part) => part.length > 0)
      .join(" ")
      .trim();
    if (fullName.length > 0) {
      return fullName;
    }

    const emailName = user.email?.split("@")[0]?.trim() ?? "";
    return emailName.length > 0 ? emailName : "BookPrinta Author";
  }

  private async sendBookWorkflowWhatsAppNotifications(params: {
    user?: {
      email?: string | null;
      firstName?: string | null;
      lastName?: string | null;
      phoneNumber?: string | null;
      preferredLanguage?: string | null;
      whatsAppNotificationsEnabled?: boolean | null;
    } | null;
    bookTitle?: string | null;
    nextStatus: string;
    orderId: string;
    orderNumber?: string | null;
    shouldSendShippingNotification?: boolean;
    trackingNumber?: string | null;
    shippingProvider?: string | null;
  }): Promise<void> {
    if (!this.whatsappNotificationsService || !params.user) {
      return;
    }

    const locale = this.resolveLocale(params.user.preferredLanguage);
    const dashboardUrl = this.buildLocalizedDashboardUrl(locale);
    const bookTitle = params.bookTitle?.trim() || "Your book";
    const recipient = {
      userName: this.resolveUserWhatsappName(params.user),
      phoneNumber: params.user.phoneNumber ?? null,
      preferredLanguage: params.user.preferredLanguage ?? null,
      whatsAppNotificationsEnabled: params.user.whatsAppNotificationsEnabled ?? null,
    };

    const deliveries: Array<Promise<unknown>> = [
      this.whatsappNotificationsService.sendBookStatusUpdate({
        recipient,
        bookTitle,
        newStatus: params.nextStatus,
        dashboardUrl,
      }),
    ];

    if (params.shouldSendShippingNotification && params.trackingNumber) {
      deliveries.push(
        this.whatsappNotificationsService.sendShippingNotification({
          recipient,
          bookTitle,
          orderNumber: params.orderNumber?.trim() || params.orderId,
          trackingNumber: params.trackingNumber,
          shippingProvider: params.shippingProvider ?? null,
        })
      );
    }

    await Promise.allSettled(deliveries);
  }

  private async sendManuscriptRejectedWhatsApp(params: {
    user?: {
      email?: string | null;
      firstName?: string | null;
      lastName?: string | null;
      phoneNumber?: string | null;
      preferredLanguage?: string | null;
      whatsAppNotificationsEnabled?: boolean | null;
    } | null;
    bookTitle: string;
    rejectionReason: string;
  }): Promise<void> {
    if (!this.whatsappNotificationsService || !params.user) {
      return;
    }

    const locale = this.resolveLocale(params.user.preferredLanguage);
    await this.whatsappNotificationsService.sendManuscriptRejected({
      recipient: {
        userName: this.resolveUserWhatsappName(params.user),
        phoneNumber: params.user.phoneNumber ?? null,
        preferredLanguage: params.user.preferredLanguage ?? null,
        whatsAppNotificationsEnabled: params.user.whatsAppNotificationsEnabled ?? null,
      },
      bookTitle: params.bookTitle,
      rejectionReason: params.rejectionReason,
      dashboardUrl: this.buildLocalizedDashboardUrl(locale),
    });
  }

  private async sendManuscriptRejectedEmail(params: {
    email: string;
    preferredLanguage: string;
    userName: string;
    bookTitle: string;
    rejectionReason: string;
    emailNotificationsEnabled?: boolean | null;
  }): Promise<void> {
    if (
      !isUserNotificationChannelEnabled({
        enabled: params.emailNotificationsEnabled,
        kind: "manuscript_rejected",
      })
    ) {
      return;
    }

    if (!this.resend) {
      this.logger.warn("RESEND_API_KEY not set - manuscript rejection email skipped");
      return;
    }

    if (!this.frontendBaseUrl) {
      this.logger.warn("FRONTEND_URL not set - manuscript rejection email skipped");
      return;
    }

    try {
      const locale = this.resolveLocale(params.preferredLanguage);
      const rendered = await renderManuscriptRejectedEmail({
        locale,
        userName: params.userName,
        bookTitle: params.bookTitle,
        rejectionReason: params.rejectionReason,
        dashboardUrl: this.buildLocalizedDashboardUrl(locale),
      });

      const result = await this.resend.emails.send({
        from: this.resolveFromEmail(),
        to: params.email,
        subject: rendered.subject,
        html: rendered.html,
      });

      if (result.error) {
        this.logger.error(
          `Failed to send manuscript rejection email to ${params.email}: ${result.error.name} - ${result.error.message}`
        );
      }
    } catch (error) {
      this.logger.error(
        `Manuscript rejection email send failed for ${params.email}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private resolveLocale(value: string | null | undefined): Locale {
    return value === "fr" || value === "es" ? value : "en";
  }

  private buildLocalizedDashboardUrl(locale: Locale): string {
    return `${this.frontendBaseUrl}/${locale}${DEFAULT_DASHBOARD_PATH}`;
  }

  private resolveFromEmail(): string {
    const normalized = this.fromEmail.trim();
    return normalized.length > 0 ? normalized : DEFAULT_FROM_EMAIL;
  }

  private resolveFrontendBaseUrl(): string {
    const raw =
      process.env.FRONTEND_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_WEB_URL ||
      "";
    const normalized = raw.trim().replace(/\/+$/, "");
    if (!normalized) return "";
    if (/^https?:\/\//i.test(normalized)) return normalized;
    return `https://${normalized}`;
  }

  private normalizeDownloadFileName(fileName: string | null | undefined, fallback: string): string {
    if (typeof fileName !== "string") {
      return fallback;
    }

    const normalized = fileName.replace(/[\\/\r\n"]/g, "-").trim();
    return normalized.length > 0 ? normalized : fallback;
  }

  private async fetchDownloadAssetBuffer(sourceUrl: string): Promise<Buffer> {
    let upstreamResponse: Awaited<ReturnType<typeof fetch>>;
    try {
      upstreamResponse = await fetch(sourceUrl);
    } catch {
      throw new ServiceUnavailableException("Book file is temporarily unavailable.");
    }

    if (!upstreamResponse.ok) {
      throw new ServiceUnavailableException("Book file is temporarily unavailable.");
    }

    return Buffer.from(await upstreamResponse.arrayBuffer());
  }

  private buildFallbackDownloadFileName(params: {
    bookId: string;
    fileType: AdminBookDownloadFileType;
    mimeType: string | null;
  }): string {
    if (params.fileType === "cleaned") {
      return `book-${params.bookId}-cleaned.html`;
    }

    if (params.fileType === "final-pdf") {
      return `book-${params.bookId}-final.pdf`;
    }

    const extension = params.mimeType?.includes("pdf") ? "pdf" : "docx";
    return `book-${params.bookId}-raw.${extension}`;
  }

  private buildFallbackVersionDownloadFileName(params: {
    bookId: string;
    fileId: string;
    mimeType: string | null;
  }): string {
    if (params.mimeType?.includes("pdf")) {
      return `book-${params.bookId}-${params.fileId}.pdf`;
    }

    if (params.mimeType?.includes("html")) {
      return `book-${params.bookId}-${params.fileId}.html`;
    }

    if (params.mimeType?.includes("wordprocessingml")) {
      return `book-${params.bookId}-${params.fileId}.docx`;
    }

    return `book-${params.bookId}-${params.fileId}.file`;
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
      createdAt: Date;
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

      // Skip stale errors: if a COMPLETED job of the same type exists
      // that was created after this failure, the error is outdated.
      const hasNewerSuccess = jobs.some(
        (j) =>
          j.status === "COMPLETED" &&
          j.type === job.type &&
          j.createdAt.getTime() > job.createdAt.getTime()
      );
      if (hasNewerSuccess) {
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

    if (lower.includes("rate limited") || lower.includes("per-minute")) {
      return "AI formatting was temporarily rate-limited. Retry processing — the next attempt will likely succeed.";
    }

    if (lower.includes("resource_exhausted") || lower.includes("quota exceeded")) {
      return "AI formatting is temporarily unavailable because the current Gemini quota is exhausted. Retry later or switch to a higher-capacity Gemini key.";
    }

    if (lower.includes("timed out") || lower.includes("aborted")) {
      return "Processing timed out before completing. Retry processing to start a fresh run.";
    }

    if (lower.includes("gotenberg") || lower.includes("page count")) {
      return "Page counting failed during PDF rendering. Retry processing to start a fresh run.";
    }

    if (lower.includes("503") || lower.includes("unavailable") || lower.includes("high demand")) {
      return "AI formatting is temporarily unavailable because Gemini is under high demand. Retry processing shortly.";
    }

    if (
      lower.includes("failed to fetch cleaned html") ||
      lower.includes("failed to fetch manuscript")
    ) {
      return "Could not retrieve the manuscript file from storage. Retry processing or re-upload the manuscript.";
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

  private deriveTitleFromFileName(fileName: string | null | undefined): string | null {
    if (typeof fileName !== "string") return null;
    const trimmed = fileName.trim();
    if (!trimmed) return null;

    const normalized = trimmed
      .replace(/\.[^.]+$/, "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return normalized.length > 0 ? normalized : null;
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

  private resolveConfiguredReprintCostPerPage(rows: Array<{ key: string; value: string }>): number {
    const configuredValue = rows.find(
      (row) => row.key === BooksService.REPRINT_COST_PER_PAGE_SETTING_KEY
    )?.value;
    const parsedValue = this.readMoneyValue(configuredValue);

    return parsedValue > 0 ? parsedValue : BooksService.DEFAULT_REPRINT_COST_PER_PAGE_A5;
  }

  private resolveReprintDisableReason(params: {
    bookStatus: BookStatus;
    finalPdfUrl: string | null;
    pageCount: number | null;
    defaultBookSize: ReprintBookSize | null;
    enabledPaymentProvidersCount: number;
  }): BookReprintConfigResponse["disableReason"] {
    if (!BooksService.REPRINT_ELIGIBLE_BOOK_STATUSES.has(params.bookStatus)) {
      return "BOOK_NOT_ELIGIBLE";
    }

    if (!params.finalPdfUrl) {
      return "FINAL_PDF_MISSING";
    }

    if (typeof params.pageCount !== "number" || params.pageCount < 1) {
      return "PAGE_COUNT_UNAVAILABLE";
    }

    if (params.defaultBookSize === null) {
      return "BOOK_SIZE_UNSUPPORTED";
    }

    if (params.enabledPaymentProvidersCount < 1) {
      return "PAYMENT_PROVIDER_UNAVAILABLE";
    }

    return null;
  }

  private normalizeReprintBookSize(value: string | null | undefined): ReprintBookSize | null {
    return value === "A4" || value === "A5" || value === "A6" ? value : null;
  }

  private normalizePaperColor(value: string | null | undefined): PaperColor {
    return value === "cream" ? "cream" : "white";
  }

  private normalizeLamination(value: string | null | undefined): Lamination {
    return value === "matt" ? "matt" : "gloss";
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private toStringValue(value: unknown): string | null {
    if (typeof value === "string") {
      const normalized = value.trim();
      return normalized.length > 0 ? normalized : null;
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }

    return null;
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
