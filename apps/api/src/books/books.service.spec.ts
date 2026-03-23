/// <reference types="jest" />
import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { FilesService } from "../files/files.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { RolloutService } from "../rollout/rollout.service.js";
import { BooksService } from "./books.service.js";
import { BooksPipelineService } from "./books-pipeline.service.js";
import { ManuscriptAnalysisService } from "./manuscript-analysis.service.js";

const txBookUpdate = jest.fn();
const txOrderUpdate = jest.fn();

const mockPrismaService = {
  book: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  },
  order: {
    update: jest.fn(),
  },
  payment: {
    aggregate: jest.fn(),
  },
  systemSetting: {
    findMany: jest.fn(),
  },
  paymentGateway: {
    findMany: jest.fn(),
  },
  $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      book: { update: txBookUpdate },
      order: { update: txOrderUpdate },
    })
  ),
};

const mockFilesService = {
  uploadFile: jest.fn(),
  getBookFiles: jest.fn(),
};

const mockManuscriptAnalysisService = {
  detectMimeType: jest.fn(),
  validateFileIntegrity: jest.fn(),
  extractWordCount: jest.fn(),
  estimatePages: jest.fn(),
};

const mockBooksPipelineService = {
  enqueueFormatManuscript: jest.fn().mockResolvedValue({
    queued: true,
    reason: "QUEUED",
    jobRecordId: "job_1",
    queueJobId: "format:book:abc",
  }),
  enqueueGeneratePdf: jest.fn().mockResolvedValue({
    queued: true,
    reason: "QUEUED",
    jobRecordId: "job_pdf_1",
    queueJobId: "generate-pdf:book:abc",
  }),
};

const mockNotificationsService = {
  createReviewRequestNotification: jest.fn(),
};

const defaultRolloutState = {
  environment: "staging",
  allowInFlightAccess: true,
  isGrandfathered: false,
  blockedBy: null,
  workspace: { enabled: true, access: "enabled" },
  manuscriptPipeline: { enabled: true, access: "enabled" },
  billingGate: { enabled: true, access: "enabled" },
  finalPdf: { enabled: true, access: "enabled" },
};

const mockRolloutService = {
  resolveBookRolloutState: jest.fn().mockReturnValue(defaultRolloutState),
  assertBookWorkspaceAccess: jest.fn(),
  assertManuscriptPipelineAccess: jest.fn(),
  assertBillingGateAccess: jest.fn(),
  assertFinalPdfAccess: jest.fn(),
};

describe("BooksService", () => {
  let service: BooksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BooksService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: FilesService, useValue: mockFilesService },
        { provide: BooksPipelineService, useValue: mockBooksPipelineService },
        { provide: ManuscriptAnalysisService, useValue: mockManuscriptAnalysisService },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: RolloutService, useValue: mockRolloutService },
      ],
    }).compile();

    service = module.get<BooksService>(BooksService);
    jest.clearAllMocks();
    txBookUpdate.mockReset();
    txOrderUpdate.mockReset();
    mockNotificationsService.createReviewRequestNotification.mockReset();
    mockRolloutService.resolveBookRolloutState.mockReturnValue(defaultRolloutState);
    mockRolloutService.assertBookWorkspaceAccess.mockImplementation(() => undefined);
    mockRolloutService.assertManuscriptPipelineAccess.mockImplementation(() => undefined);
    mockRolloutService.assertBillingGateAccess.mockImplementation(() => undefined);
    mockRolloutService.assertFinalPdfAccess.mockImplementation(() => undefined);
    mockPrismaService.systemSetting.findMany.mockResolvedValue([]);
    mockPrismaService.paymentGateway.findMany.mockResolvedValue([]);
  });

  describe("updateUserBookSettings", () => {
    it("stores selected settings and recalculates estimated pages when word count exists", async () => {
      mockPrismaService.book.findFirst.mockResolvedValue({
        id: "cm1111111111111111111111111",
        wordCount: 58_000,
        status: "PAYMENT_RECEIVED",
        title: null,
      });
      mockManuscriptAnalysisService.estimatePages.mockReturnValue(224);
      mockPrismaService.book.update.mockResolvedValue({
        id: "cm1111111111111111111111111",
        title: "The Lagos Chronicle",
        pageSize: "A4",
        fontSize: 12,
        wordCount: 58_000,
        estimatedPages: 224,
        updatedAt: new Date("2026-03-06T12:00:00.000Z"),
      });

      const result = await service.updateUserBookSettings("user_1", "cm1111111111111111111111111", {
        title: "The Lagos Chronicle",
        pageSize: "A4",
        fontSize: 12,
      });

      expect(mockManuscriptAnalysisService.estimatePages).toHaveBeenCalledWith({
        wordCount: 58_000,
        pageSize: "A4",
        fontSize: 12,
      });
      expect(mockBooksPipelineService.enqueueFormatManuscript).toHaveBeenCalledWith({
        bookId: "cm1111111111111111111111111",
        trigger: "settings_change",
      });
      expect(result).toEqual({
        id: "cm1111111111111111111111111",
        title: "The Lagos Chronicle",
        pageSize: "A4",
        fontSize: 12,
        wordCount: 58_000,
        estimatedPages: 224,
        updatedAt: "2026-03-06T12:00:00.000Z",
      });
    });

    it("blocks settings changes after approval", async () => {
      mockPrismaService.book.findFirst.mockResolvedValue({
        id: "cm1111111111111111111111111",
        wordCount: 58_000,
        status: "APPROVED",
        title: "Locked Title",
      });

      await expect(
        service.updateUserBookSettings("user_1", "cm1111111111111111111111111", {
          title: "Locked Title",
          pageSize: "A4",
          fontSize: 12,
        })
      ).rejects.toThrow("Book settings can only be changed before approval.");

      expect(mockPrismaService.book.update).not.toHaveBeenCalled();
      expect(mockBooksPipelineService.enqueueFormatManuscript).not.toHaveBeenCalled();
    });

    it("blocks settings changes when automated manuscript processing is rolled back", async () => {
      mockPrismaService.book.findFirst.mockResolvedValue({
        id: "cm1111111111111111111111111",
        wordCount: 58_000,
        status: "PAYMENT_RECEIVED",
        title: null,
      });
      mockRolloutService.assertManuscriptPipelineAccess.mockImplementation(() => {
        throw new ServiceUnavailableException(
          "Automated manuscript processing is not enabled in this environment yet."
        );
      });

      await expect(
        service.updateUserBookSettings("user_1", "cm1111111111111111111111111", {
          title: "The Lagos Chronicle",
          pageSize: "A4",
          fontSize: 12,
        })
      ).rejects.toThrow("Automated manuscript processing is not enabled in this environment yet.");
    });
  });

  describe("uploadUserManuscript", () => {
    const file = {
      originalname: "novel.docx",
      mimetype: "application/octet-stream",
      size: 1024,
      buffer: Buffer.from("dummy"),
    } as Express.Multer.File;

    it("requires page size and font size before upload", async () => {
      mockPrismaService.book.findFirst.mockResolvedValue({
        id: "cm1111111111111111111111111",
        status: "AWAITING_UPLOAD",
        title: null,
        pageSize: null,
        fontSize: null,
      });

      await expect(
        service.uploadUserManuscript("user_1", "cm1111111111111111111111111", file)
      ).rejects.toThrow(BadRequestException);
    });

    it("uploads manuscript and stores extracted metrics", async () => {
      mockPrismaService.book.findFirst.mockResolvedValue({
        id: "cm1111111111111111111111111",
        status: "AWAITING_UPLOAD",
        title: null,
        pageSize: "A5",
        fontSize: 11,
      });
      mockManuscriptAnalysisService.detectMimeType.mockReturnValue(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      mockManuscriptAnalysisService.extractWordCount.mockResolvedValue(42_000);
      mockManuscriptAnalysisService.estimatePages.mockReturnValue(164);
      mockFilesService.uploadFile.mockResolvedValue({
        id: "file_123",
        url: "https://cdn.example.com/manuscripts/file_123.docx",
        fileName: "novel.docx",
        fileSize: 1024,
      });
      mockPrismaService.book.update.mockResolvedValue({});

      const result = await service.uploadUserManuscript(
        "user_1",
        "cm1111111111111111111111111",
        file
      );

      expect(mockFilesService.uploadFile).toHaveBeenCalledWith(
        expect.objectContaining({
          originalname: "novel.docx",
          mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
        { bookId: "cm1111111111111111111111111", fileType: "RAW_MANUSCRIPT" },
        "user_1"
      );
      expect(mockPrismaService.book.update).toHaveBeenCalledWith({
        where: { id: "cm1111111111111111111111111" },
        data: {
          status: "UPLOADED",
          wordCount: 42_000,
          estimatedPages: 164,
          pageSize: "A5",
          fontSize: 11,
        },
      });
      expect(mockBooksPipelineService.enqueueFormatManuscript).toHaveBeenCalledWith({
        bookId: "cm1111111111111111111111111",
        trigger: "upload",
      });
      expect(result.estimatedPages).toBe(164);
      expect(result.wordCount).toBe(42_000);
      expect(result.title).toBe("novel");
    });

    it("returns scanner unavailable message when scan provider is down", async () => {
      mockPrismaService.book.findFirst.mockResolvedValue({
        id: "cm1111111111111111111111111",
        status: "AWAITING_UPLOAD",
        title: "Scanner Test",
        pageSize: "A4",
        fontSize: 12,
      });
      mockManuscriptAnalysisService.detectMimeType.mockReturnValue("application/pdf");
      mockManuscriptAnalysisService.extractWordCount.mockResolvedValue(30_000);
      mockManuscriptAnalysisService.estimatePages.mockReturnValue(128);
      mockFilesService.uploadFile.mockRejectedValue(
        new ServiceUnavailableException("scanner offline")
      );

      await expect(
        service.uploadUserManuscript("user_1", "cm1111111111111111111111111", file)
      ).rejects.toThrow("File scanning temporarily unavailable");
    });

    it("blocks new uploads when automated manuscript processing is rolled back", async () => {
      mockPrismaService.book.findFirst.mockResolvedValue({
        id: "cm1111111111111111111111111",
        status: "AWAITING_UPLOAD",
        title: null,
        pageSize: "A4",
        fontSize: 12,
      });
      mockRolloutService.assertManuscriptPipelineAccess.mockImplementation(() => {
        throw new ServiceUnavailableException(
          "Automated manuscript processing is not enabled in this environment yet."
        );
      });

      await expect(
        service.uploadUserManuscript("user_1", "cm1111111111111111111111111", file)
      ).rejects.toThrow("Automated manuscript processing is not enabled in this environment yet.");

      expect(mockFilesService.uploadFile).not.toHaveBeenCalled();
    });
  });

  describe("findUserBooks", () => {
    it("lists the authenticated user's books with dashboard summary metadata", async () => {
      mockPrismaService.book.findMany.mockResolvedValue([
        {
          id: "cm1111111111111111111111111",
          orderId: "cm2222222222222222222222222",
          status: "PREVIEW_READY",
          productionStatus: "REVIEW",
          title: "The Lagos Chronicle",
          coverImageUrl: null,
          rejectionReason: null,
          pageCount: 180,
          wordCount: 52000,
          estimatedPages: 176,
          fontSize: 12,
          pageSize: "A5",
          currentHtmlUrl: "https://cdn.example.com/books/current.html",
          previewPdfUrl: "https://cdn.example.com/books/preview.pdf",
          finalPdfUrl: null,
          order: {
            status: "PREVIEW_READY",
          },
          jobs: [],
          createdAt: new Date("2026-03-01T08:00:00.000Z"),
          updatedAt: new Date("2026-03-10T08:00:00.000Z"),
        },
      ]);
      mockPrismaService.book.count.mockResolvedValue(1);

      const result = await service.findUserBooks("user_1", {
        page: 1,
        limit: 10,
      });

      expect(mockPrismaService.book.findMany).toHaveBeenCalledWith({
        where: { userId: "user_1" },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        skip: 0,
        take: 10,
        select: expect.any(Object),
      });
      expect(result).toEqual({
        items: [
          expect.objectContaining({
            id: "cm1111111111111111111111111",
            orderId: "cm2222222222222222222222222",
            title: "The Lagos Chronicle",
            status: "PREVIEW_READY",
            productionStatus: "REVIEW",
            orderStatus: "PREVIEW_READY",
            currentStage: "REVIEW",
            pageCount: 180,
            wordCount: 52000,
            estimatedPages: 176,
            fontSize: 12,
            pageSize: "A5",
            previewPdfUrlPresent: true,
            finalPdfUrlPresent: false,
            workspaceUrl: "/dashboard/books?bookId=cm1111111111111111111111111",
            trackingUrl: "/dashboard/orders/cm2222222222222222222222222",
          }),
        ],
        pagination: {
          page: 1,
          pageSize: 10,
          totalItems: 1,
          totalPages: 1,
          hasPreviousPage: false,
          hasNextPage: false,
        },
      });
    });
  });

  describe("findUserBookById", () => {
    it("returns book detail with progress timeline for normal flow", async () => {
      mockPrismaService.book.findFirst.mockResolvedValue({
        id: "cm1111111111111111111111111",
        orderId: "cm2222222222222222222222222",
        status: "PRINTING",
        productionStatus: "PRINTING",
        productionStatusUpdatedAt: new Date("2026-03-03T10:00:00.000Z"),
        rejectionReason: null,
        rejectedAt: null,
        pageCount: 220,
        wordCount: 65000,
        estimatedPages: 210,
        fontFamily: "Miller Text",
        fontSize: 12,
        pageSize: "A5",
        currentHtmlUrl: "https://cdn.example.com/books/1/current.html",
        previewPdfUrl: "https://cdn.example.com/books/1/preview.pdf",
        finalPdfUrl: null,
        order: {
          status: "IN_PRODUCTION",
        },
        jobs: [],
        createdAt: new Date("2026-03-01T08:00:00.000Z"),
        updatedAt: new Date("2026-03-03T10:00:00.000Z"),
      });

      const result = await service.findUserBookById("user_1", "cm1111111111111111111111111");

      expect(mockPrismaService.book.findFirst).toHaveBeenCalledWith({
        where: {
          id: "cm1111111111111111111111111",
          userId: "user_1",
        },
        select: expect.any(Object),
      });

      expect(result.id).toBe("cm1111111111111111111111111");
      expect(result.status).toBe("PRINTING");
      expect(result.productionStatus).toBe("PRINTING");
      expect(result.rejectionReason).toBeNull();
      expect(result.timeline.find((entry) => entry.stage === "PRINTING")?.state).toBe("current");
      expect(result.timeline.find((entry) => entry.stage === "PAYMENT_RECEIVED")?.state).toBe(
        "completed"
      );
      expect(result.timeline.find((entry) => entry.stage === "DELIVERED")?.state).toBe("upcoming");
      expect(result.rollout).toEqual(defaultRolloutState);
      expect(result.processing).toEqual({
        isActive: false,
        currentStep: null,
        jobStatus: null,
        trigger: null,
        startedAt: null,
        attempt: null,
        maxAttempts: null,
      });
    });

    it("hides elapsed timing for stale active processing jobs", async () => {
      const nowSpy = jest
        .spyOn(Date, "now")
        .mockReturnValue(new Date("2026-03-07T12:00:00.000Z").getTime());
      mockPrismaService.book.findFirst.mockResolvedValue({
        id: "cm1111111111111111111111111",
        orderId: "cm2222222222222222222222222",
        status: "FORMATTING",
        rejectionReason: null,
        rejectedAt: null,
        pageCount: null,
        wordCount: 18_534,
        estimatedPages: 73,
        fontFamily: "Miller Text",
        fontSize: 12,
        pageSize: "A5",
        currentHtmlUrl: null,
        previewPdfUrl: null,
        finalPdfUrl: null,
        order: {
          status: "FORMATTING",
        },
        jobs: [
          {
            type: "AI_CLEANING",
            status: "PROCESSING",
            attempts: 1,
            maxRetries: 3,
            payload: { trigger: "upload" },
            result: { progressStep: "AI_FORMATTING" },
            createdAt: new Date("2026-03-07T08:30:00.000Z"),
            startedAt: new Date("2026-03-07T08:35:00.000Z"),
          },
        ],
        createdAt: new Date("2026-03-07T08:00:00.000Z"),
        updatedAt: new Date("2026-03-07T08:35:00.000Z"),
      });

      try {
        const result = await service.findUserBookById("user_1", "cm1111111111111111111111111");

        expect(result.processing).toEqual({
          isActive: true,
          currentStep: "AI_FORMATTING",
          jobStatus: "processing",
          trigger: "upload",
          startedAt: null,
          attempt: null,
          maxAttempts: null,
        });
      } finally {
        nowSpy.mockRestore();
      }
    });

    it("hides elapsed timing for stale fallback processing state", async () => {
      const nowSpy = jest
        .spyOn(Date, "now")
        .mockReturnValue(new Date("2026-03-07T12:00:00.000Z").getTime());
      mockPrismaService.book.findFirst.mockResolvedValue({
        id: "cm1111111111111111111111111",
        orderId: "cm2222222222222222222222222",
        status: "FORMATTING",
        rejectionReason: null,
        rejectedAt: null,
        pageCount: null,
        wordCount: 18_534,
        estimatedPages: 73,
        fontFamily: "Miller Text",
        fontSize: 12,
        pageSize: "A5",
        currentHtmlUrl: null,
        previewPdfUrl: null,
        finalPdfUrl: null,
        order: {
          status: "FORMATTING",
        },
        jobs: [],
        createdAt: new Date("2026-03-07T08:00:00.000Z"),
        updatedAt: new Date("2026-03-07T08:35:00.000Z"),
      });

      try {
        const result = await service.findUserBookById("user_1", "cm1111111111111111111111111");

        expect(result.processing).toEqual({
          isActive: true,
          currentStep: "AI_FORMATTING",
          jobStatus: "processing",
          trigger: null,
          startedAt: null,
          attempt: null,
          maxAttempts: null,
        });
      } finally {
        nowSpy.mockRestore();
      }
    });

    it("renders review stage as rejected with reason when status is REJECTED", async () => {
      mockPrismaService.book.findFirst.mockResolvedValue({
        id: "cm1111111111111111111111111",
        orderId: "cm2222222222222222222222222",
        status: "REJECTED",
        rejectionReason: "Low-resolution manuscript images.",
        rejectedAt: new Date("2026-03-04T09:00:00.000Z"),
        pageCount: null,
        wordCount: 42000,
        estimatedPages: 140,
        fontFamily: null,
        fontSize: 11,
        pageSize: "A4",
        currentHtmlUrl: null,
        previewPdfUrl: null,
        finalPdfUrl: null,
        order: {
          status: "ACTION_REQUIRED",
        },
        jobs: [],
        createdAt: new Date("2026-03-01T08:00:00.000Z"),
        updatedAt: new Date("2026-03-04T09:00:00.000Z"),
      });

      const result = await service.findUserBookById("user_1", "cm1111111111111111111111111");

      expect(result.status).toBe("REJECTED");
      expect(result.productionStatus).toBe("PAYMENT_RECEIVED");
      expect(result.rejectionReason).toBe("Low-resolution manuscript images.");
      expect(result.timeline.find((entry) => entry.stage === "PAYMENT_RECEIVED")?.state).toBe(
        "current"
      );
      expect(result.timeline.find((entry) => entry.stage === "REVIEW")?.state).toBe("upcoming");
      expect(result.timeline.find((entry) => entry.stage === "APPROVED")?.state).toBe("upcoming");
    });

    it("does not present FORMATTING_REVIEW as an active processing state after AI failure", async () => {
      mockPrismaService.book.findFirst.mockResolvedValue({
        id: "cm1111111111111111111111111",
        orderId: "cm2222222222222222222222222",
        status: "FORMATTING_REVIEW",
        rejectionReason: null,
        rejectedAt: null,
        pageCount: null,
        wordCount: 18_534,
        estimatedPages: 73,
        fontFamily: "Miller Text",
        fontSize: 11,
        pageSize: "A5",
        currentHtmlUrl: null,
        previewPdfUrl: null,
        finalPdfUrl: null,
        order: {
          status: "FORMATTING",
        },
        jobs: [],
        createdAt: new Date("2026-03-09T09:00:00.000Z"),
        updatedAt: new Date("2026-03-09T09:04:36.820Z"),
      });

      const result = await service.findUserBookById("user_1", "cm1111111111111111111111111");

      expect(result.processing).toEqual({
        isActive: false,
        currentStep: null,
        jobStatus: null,
        trigger: null,
        startedAt: null,
        attempt: null,
        maxAttempts: null,
      });
    });

    it("never exposes final PDF URLs on the user book detail endpoint", async () => {
      mockPrismaService.book.findFirst.mockResolvedValue({
        id: "cm1111111111111111111111111",
        orderId: "cm2222222222222222222222222",
        status: "APPROVED",
        productionStatus: "PAYMENT_RECEIVED",
        productionStatusUpdatedAt: new Date("2026-03-03T10:00:00.000Z"),
        rejectionReason: null,
        rejectedAt: null,
        pageCount: 220,
        wordCount: 65_000,
        estimatedPages: 210,
        fontFamily: "Miller Text",
        fontSize: 12,
        pageSize: "A5",
        currentHtmlUrl: "https://cdn.example.com/books/1/current.html",
        previewPdfUrl: "https://cdn.example.com/books/1/preview.pdf",
        finalPdfUrl: "https://cdn.example.com/books/1/final.pdf",
        order: {
          status: "APPROVED",
        },
        jobs: [],
        createdAt: new Date("2026-03-01T08:00:00.000Z"),
        updatedAt: new Date("2026-03-03T10:00:00.000Z"),
      });

      const result = await service.findUserBookById("user_1", "cm1111111111111111111111111");

      expect(result.finalPdfUrl).toBeNull();
    });

    it("returns the latest user-facing manuscript processing failure message", async () => {
      mockPrismaService.book.findFirst.mockResolvedValue({
        id: "cm1111111111111111111111111",
        orderId: "cm2222222222222222222222222",
        status: "FORMATTING_REVIEW",
        productionStatus: null,
        productionStatusUpdatedAt: null,
        rejectionReason: null,
        rejectedAt: null,
        pageCount: null,
        wordCount: 18_534,
        estimatedPages: 73,
        fontFamily: "Miller Text",
        fontSize: 11,
        pageSize: "A5",
        currentHtmlUrl: null,
        previewPdfUrl: null,
        finalPdfUrl: null,
        order: {
          status: "ACTION_REQUIRED",
        },
        jobs: [
          {
            type: "AI_CLEANING",
            status: "FAILED",
            attempts: 0,
            maxRetries: 3,
            error: "Cleared by local development queue reset.",
            payload: { trigger: "upload" },
            result: { progressStep: "AI_FORMATTING" },
            createdAt: new Date("2026-03-09T09:05:00.000Z"),
            startedAt: null,
          },
          {
            type: "AI_CLEANING",
            status: "FAILED",
            attempts: 3,
            maxRetries: 3,
            error: 'Gemini request failed (429): {"error":{"message":"Rate limit exceeded"}}',
            payload: { trigger: "upload" },
            result: { progressStep: "AI_FORMATTING" },
            createdAt: new Date("2026-03-09T09:04:00.000Z"),
            startedAt: new Date("2026-03-09T09:04:05.000Z"),
          },
          {
            type: "PAGE_COUNT",
            status: "FAILED",
            attempts: 1,
            maxRetries: 3,
            error: "Gotenberg timeout",
            payload: { trigger: "upload" },
            result: { progressStep: "COUNTING_PAGES" },
            createdAt: new Date("2026-03-08T09:04:00.000Z"),
            startedAt: new Date("2026-03-08T09:04:05.000Z"),
          },
        ],
        createdAt: new Date("2026-03-09T09:00:00.000Z"),
        updatedAt: new Date("2026-03-09T09:04:36.820Z"),
      });

      const result = await service.findUserBookById("user_1", "cm1111111111111111111111111");

      expect(result.latestProcessingError).toBe(
        'Gemini request failed (429): {"error":{"message":"Rate limit exceeded"}}'
      );
    });

    it("throws NotFoundException when book does not belong to user", async () => {
      mockPrismaService.book.findFirst.mockResolvedValue(null);

      await expect(service.findUserBookById("user_1", "cm_missing")).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe("approveUserBook", () => {
    it("blocks approval when extra pages payment has not fully covered overage", async () => {
      mockPrismaService.book.findFirst.mockResolvedValue({
        id: "cm1111111111111111111111111",
        orderId: "cm2222222222222222222222222",
        status: "PREVIEW_READY",
        pageCount: 175,
        currentHtmlUrl: "https://cdn.example.com/books/current.html",
        order: {
          status: "PENDING_EXTRA_PAYMENT",
          package: { pageLimit: 150 },
        },
      });
      mockPrismaService.payment.aggregate.mockResolvedValue({
        _sum: { amount: { toNumber: () => 100 } },
      });

      await expect(
        service.approveUserBook("user_1", "cm1111111111111111111111111", {})
      ).rejects.toThrow("Extra pages payment is required before approval");

      expect(txBookUpdate).not.toHaveBeenCalled();
      expect(txOrderUpdate).not.toHaveBeenCalled();
      expect(mockBooksPipelineService.enqueueGeneratePdf).not.toHaveBeenCalled();
    });

    it("approves and queues final PDF generation after billing gate is satisfied", async () => {
      mockPrismaService.book.findFirst.mockResolvedValue({
        id: "cm1111111111111111111111111",
        orderId: "cm2222222222222222222222222",
        status: "PREVIEW_READY",
        pageCount: 170,
        currentHtmlUrl: "https://cdn.example.com/books/current.html",
        order: {
          status: "PREVIEW_READY",
          package: { pageLimit: 150 },
        },
      });
      mockPrismaService.payment.aggregate.mockResolvedValue({
        _sum: { amount: { toNumber: () => 200 } },
      });
      txBookUpdate.mockResolvedValue({});
      txOrderUpdate.mockResolvedValue({});
      mockBooksPipelineService.enqueueGeneratePdf.mockResolvedValue({
        queued: true,
        reason: "QUEUED",
        jobRecordId: "job_pdf_2",
        queueJobId: "generate-pdf:cm1111111111111111111111111:hash",
      });

      const result = await service.approveUserBook("user_1", "cm1111111111111111111111111", {});

      expect(txBookUpdate).toHaveBeenCalledWith({
        where: { id: "cm1111111111111111111111111" },
        data: {
          status: "APPROVED",
        },
      });
      expect(txOrderUpdate).toHaveBeenCalledWith({
        where: { id: "cm2222222222222222222222222" },
        data: { status: "APPROVED", extraAmount: 200 },
      });
      expect(mockBooksPipelineService.enqueueGeneratePdf).toHaveBeenCalledWith({
        bookId: "cm1111111111111111111111111",
      });
      expect(result).toEqual({
        bookId: "cm1111111111111111111111111",
        bookStatus: "APPROVED",
        orderStatus: "APPROVED",
        queuedJob: {
          queue: "pdf-generation",
          name: "generate-pdf",
          jobId: "generate-pdf:cm1111111111111111111111111:hash",
        },
      });
    });

    it("blocks approval when automated final PDF generation is rolled back", async () => {
      mockPrismaService.book.findFirst.mockResolvedValue({
        id: "cm1111111111111111111111111",
        orderId: "cm2222222222222222222222222",
        status: "PREVIEW_READY",
        pageCount: 128,
        currentHtmlUrl: "https://cdn.example.com/books/current.html",
        order: {
          status: "PREVIEW_READY",
          package: { pageLimit: 150 },
        },
      });
      mockRolloutService.assertFinalPdfAccess.mockImplementation(() => {
        throw new ServiceUnavailableException(
          "Automated final PDF generation is not enabled in this environment yet."
        );
      });

      await expect(
        service.approveUserBook("user_1", "cm1111111111111111111111111", {})
      ).rejects.toThrow("Automated final PDF generation is not enabled in this environment yet.");

      expect(txBookUpdate).not.toHaveBeenCalled();
      expect(mockBooksPipelineService.enqueueGeneratePdf).not.toHaveBeenCalled();
    });
  });

  describe("reprocessUserBook", () => {
    it("requeues stale manuscript processing from the uploaded manuscript", async () => {
      mockPrismaService.book.findFirst.mockResolvedValue({
        id: "cm1111111111111111111111111",
        orderId: "cm2222222222222222222222222",
        status: "FORMATTING",
        pageSize: "A5",
        fontSize: 12,
      });
      mockBooksPipelineService.enqueueFormatManuscript.mockResolvedValue({
        queued: true,
        reason: "QUEUED",
        jobRecordId: "job_retry_1",
        queueJobId: "format:cm1111111111111111111111111:retry",
      });

      const result = await service.reprocessUserBook("user_1", "cm1111111111111111111111111");

      expect(mockBooksPipelineService.enqueueFormatManuscript).toHaveBeenCalledWith({
        bookId: "cm1111111111111111111111111",
        trigger: "upload",
      });
      expect(result).toEqual({
        bookId: "cm1111111111111111111111111",
        bookStatus: "AI_PROCESSING",
        orderStatus: "FORMATTING",
        queuedJob: {
          queue: "ai-formatting",
          name: "format-manuscript",
          jobId: "format:cm1111111111111111111111111:retry",
        },
      });
    });

    it("rejects retry when no manuscript has been uploaded yet", async () => {
      mockPrismaService.book.findFirst.mockResolvedValue({
        id: "cm1111111111111111111111111",
        orderId: "cm2222222222222222222222222",
        status: "FORMATTING",
        pageSize: "A5",
        fontSize: 12,
      });
      mockBooksPipelineService.enqueueFormatManuscript.mockResolvedValue({
        queued: false,
        reason: "NO_MANUSCRIPT",
        jobRecordId: null,
        queueJobId: null,
      });

      await expect(
        service.reprocessUserBook("user_1", "cm1111111111111111111111111")
      ).rejects.toThrow("Upload a manuscript before retrying automated processing.");
    });

    it("blocks retry when an active processing run still exists", async () => {
      mockPrismaService.book.findFirst.mockResolvedValue({
        id: "cm1111111111111111111111111",
        orderId: "cm2222222222222222222222222",
        status: "FORMATTING",
        pageSize: "A5",
        fontSize: 12,
      });
      mockBooksPipelineService.enqueueFormatManuscript.mockResolvedValue({
        queued: false,
        reason: "ALREADY_ACTIVE",
        jobRecordId: null,
        queueJobId: "format:cm1111111111111111111111111:retry",
      });

      await expect(
        service.reprocessUserBook("user_1", "cm1111111111111111111111111")
      ).rejects.toThrow(
        "Manuscript processing is still active. Please wait a little longer before retrying."
      );
    });
  });

  describe("getUserBookPreview", () => {
    it("returns the current watermarked preview route URL", async () => {
      mockPrismaService.book.findFirst.mockResolvedValue({
        id: "cm1111111111111111111111111",
        status: "PREVIEW_READY",
        previewPdfUrl: "https://cdn.example.com/books/1/preview.pdf",
        files: [
          {
            url: "https://cdn.example.com/books/1/preview.pdf",
            fileName: "preview-v1.pdf",
            mimeType: "application/pdf",
          },
        ],
      });

      const result = await service.getUserBookPreview(
        "user_1",
        "cm1111111111111111111111111",
        "http://localhost:3001/api/v1/books/cm1111111111111111111111111/preview/file"
      );

      expect(result).toEqual({
        bookId: "cm1111111111111111111111111",
        previewPdfUrl:
          "http://localhost:3001/api/v1/books/cm1111111111111111111111111/preview/file",
        status: "PREVIEW_READY",
        watermarked: true,
      });
    });

    it("throws when preview PDF is not available yet", async () => {
      mockPrismaService.book.findFirst.mockResolvedValue({
        id: "cm1111111111111111111111111",
        status: "FORMATTING_REVIEW",
        previewPdfUrl: null,
        files: [],
      });

      await expect(
        service.getUserBookPreview(
          "user_1",
          "cm1111111111111111111111111",
          "http://localhost:3001/api/v1/books/cm1111111111111111111111111/preview/file"
        )
      ).rejects.toThrow(NotFoundException);
    });

    it("hides preview PDF while a settings rerun has put the book back into formatting", async () => {
      mockPrismaService.book.findFirst.mockResolvedValue({
        id: "cm1111111111111111111111111",
        status: "FORMATTING",
        previewPdfUrl: "https://cdn.example.com/books/1/preview.pdf",
        files: [],
      });

      await expect(
        service.getUserBookPreview(
          "user_1",
          "cm1111111111111111111111111",
          "http://localhost:3001/api/v1/books/cm1111111111111111111111111/preview/file"
        )
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("getUserBookFiles", () => {
    it("returns file lineage with API-safe nullables and excludes FINAL_PDF", async () => {
      mockFilesService.getBookFiles.mockResolvedValue([
        {
          id: "cmfile1",
          fileType: "RAW_MANUSCRIPT",
          url: "https://cdn.example.com/books/1/manuscript.docx",
          fileName: "manuscript.docx",
          fileSize: 2048,
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          version: 1,
          createdBy: "user_1",
          createdAt: new Date("2026-03-07T10:00:00.000Z"),
        },
        {
          id: "cmfile2",
          fileType: "CLEANED_HTML",
          url: "https://cdn.example.com/books/1/cleaned.html",
          fileName: null,
          fileSize: null,
          mimeType: null,
          version: 2,
          createdBy: null,
          createdAt: new Date("2026-03-07T10:15:00.000Z"),
        },
        {
          id: "cmfile3",
          fileType: "FINAL_PDF",
          url: "https://cdn.example.com/books/1/final.pdf",
          fileName: "final.pdf",
          fileSize: 8192,
          mimeType: "application/pdf",
          version: 1,
          createdBy: "SYSTEM",
          createdAt: new Date("2026-03-07T10:20:00.000Z"),
        },
      ]);

      const result = await service.getUserBookFiles("user_1", "cm1111111111111111111111111");

      expect(mockFilesService.getBookFiles).toHaveBeenCalledWith(
        "cm1111111111111111111111111",
        "user_1"
      );
      expect(result).toEqual({
        bookId: "cm1111111111111111111111111",
        files: [
          {
            id: "cmfile1",
            fileType: "RAW_MANUSCRIPT",
            url: "https://cdn.example.com/books/1/manuscript.docx",
            fileName: "manuscript.docx",
            fileSize: 2048,
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            version: 1,
            createdBy: "user_1",
            createdAt: "2026-03-07T10:00:00.000Z",
          },
          {
            id: "cmfile2",
            fileType: "CLEANED_HTML",
            url: "https://cdn.example.com/books/1/cleaned.html",
            fileName: null,
            fileSize: null,
            mimeType: null,
            version: 2,
            createdBy: null,
            createdAt: "2026-03-07T10:15:00.000Z",
          },
        ],
      });
    });
  });

  describe("getUserBookReprintConfig", () => {
    it("returns the narrow reprint config for a delivered book", async () => {
      mockPrismaService.book.findFirst.mockResolvedValue({
        id: "cm1111111111111111111111111",
        status: "DELIVERED",
        pageCount: 192,
        finalPdfUrl: "https://cdn.example.com/books/1/final.pdf",
        order: {
          bookSize: "A5",
          paperColor: "cream",
          lamination: "matt",
        },
      });
      mockPrismaService.systemSetting.findMany.mockResolvedValue([
        {
          key: "quote_cost_per_page",
          value: "12",
        },
      ]);
      mockPrismaService.paymentGateway.findMany.mockResolvedValue([
        { provider: "PAYSTACK" },
        { provider: "STRIPE" },
      ]);

      const result = await service.getUserBookReprintConfig(
        "user_1",
        "cm1111111111111111111111111"
      );

      expect(mockPrismaService.book.findFirst).toHaveBeenCalledWith({
        where: {
          id: "cm1111111111111111111111111",
          userId: "user_1",
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
      expect(mockPrismaService.systemSetting.findMany).toHaveBeenCalledWith({
        where: {
          key: {
            in: ["quote_cost_per_page"],
          },
        },
        select: {
          key: true,
          value: true,
        },
      });
      expect(mockPrismaService.paymentGateway.findMany).toHaveBeenCalledWith({
        where: {
          isEnabled: true,
          provider: {
            in: ["PAYSTACK", "STRIPE"],
          },
        },
        orderBy: [{ priority: "asc" }, { provider: "asc" }],
        select: {
          provider: true,
        },
      });
      expect(result).toEqual({
        bookId: "cm1111111111111111111111111",
        canReprintSame: true,
        disableReason: null,
        finalPdfUrlPresent: true,
        pageCount: 192,
        minCopies: 25,
        defaultBookSize: "A5",
        defaultPaperColor: "cream",
        defaultLamination: "matt",
        allowedBookSizes: ["A4", "A5", "A6"],
        allowedPaperColors: ["white", "cream"],
        allowedLaminations: ["matt", "gloss"],
        costPerPageBySize: {
          A4: 24,
          A5: 12,
          A6: 6,
        },
        enabledPaymentProviders: ["PAYSTACK", "STRIPE"],
      });
    });

    it("flags books that cannot reprint the same PDF yet", async () => {
      mockPrismaService.book.findFirst.mockResolvedValue({
        id: "cm1111111111111111111111111",
        status: "PRINTING",
        pageCount: null,
        finalPdfUrl: null,
        order: {
          bookSize: "A6",
          paperColor: "white",
          lamination: "gloss",
        },
      });

      const result = await service.getUserBookReprintConfig(
        "user_1",
        "cm1111111111111111111111111"
      );

      expect(result).toEqual({
        bookId: "cm1111111111111111111111111",
        canReprintSame: false,
        disableReason: "BOOK_NOT_ELIGIBLE",
        finalPdfUrlPresent: false,
        pageCount: null,
        minCopies: 25,
        defaultBookSize: "A6",
        defaultPaperColor: "white",
        defaultLamination: "gloss",
        allowedBookSizes: ["A4", "A5", "A6"],
        allowedPaperColors: ["white", "cream"],
        allowedLaminations: ["matt", "gloss"],
        costPerPageBySize: {
          A4: 20,
          A5: 10,
          A6: 5,
        },
        enabledPaymentProviders: [],
      });
    });
  });

  describe("updateAdminBookProductionStatus", () => {
    it("updates the admin-controlled production tracker without creating a review request before delivered", async () => {
      mockPrismaService.book.findFirst.mockResolvedValue({
        id: "cm1111111111111111111111111",
        orderId: "cm2222222222222222222222222",
        userId: "user_1",
        title: "The Lagos Chronicle",
        status: "PRINTING",
        productionStatus: "PRINTING",
      });
      txBookUpdate.mockResolvedValue({
        id: "cm1111111111111111111111111",
        productionStatus: "PRINTING",
        productionStatusUpdatedAt: new Date("2026-03-10T12:00:00.000Z"),
      });

      const result = await service.updateAdminBookProductionStatus("cm1111111111111111111111111", {
        productionStatus: "PRINTING",
      });

      expect(txBookUpdate).toHaveBeenCalledWith({
        where: { id: "cm1111111111111111111111111" },
        data: {
          productionStatus: "PRINTING",
          productionStatusUpdatedAt: expect.any(Date),
        },
        select: {
          id: true,
          productionStatus: true,
          productionStatusUpdatedAt: true,
        },
      });
      expect(mockNotificationsService.createReviewRequestNotification).not.toHaveBeenCalled();
      expect(result).toEqual({
        bookId: "cm1111111111111111111111111",
        productionStatus: "PRINTING",
        updatedAt: "2026-03-10T12:00:00.000Z",
      });
    });

    it("creates a review request notification when a book first reaches delivered", async () => {
      mockPrismaService.book.findFirst.mockResolvedValue({
        id: "cm1111111111111111111111111",
        orderId: "cm2222222222222222222222222",
        userId: "user_1",
        title: "The Lagos Chronicle",
        status: "PRINTING",
        productionStatus: "SHIPPING",
      });
      txBookUpdate.mockResolvedValue({
        id: "cm1111111111111111111111111",
        productionStatus: "DELIVERED",
        productionStatusUpdatedAt: new Date("2026-03-10T14:30:00.000Z"),
      });

      const result = await service.updateAdminBookProductionStatus("cm1111111111111111111111111", {
        productionStatus: "DELIVERED",
      });

      expect(txBookUpdate).toHaveBeenCalledWith({
        where: { id: "cm1111111111111111111111111" },
        data: {
          productionStatus: "DELIVERED",
          productionStatusUpdatedAt: expect.any(Date),
        },
        select: {
          id: true,
          productionStatus: true,
          productionStatusUpdatedAt: true,
        },
      });
      expect(mockNotificationsService.createReviewRequestNotification).toHaveBeenCalledWith(
        {
          userId: "user_1",
          orderId: "cm2222222222222222222222222",
          bookId: "cm1111111111111111111111111",
          bookTitle: "The Lagos Chronicle",
        },
        expect.objectContaining({
          book: expect.any(Object),
          order: expect.any(Object),
        })
      );
      expect(result).toEqual({
        bookId: "cm1111111111111111111111111",
        productionStatus: "DELIVERED",
        updatedAt: "2026-03-10T14:30:00.000Z",
      });
    });

    it("does not create a review request notification when the book is already review eligible", async () => {
      mockPrismaService.book.findFirst.mockResolvedValue({
        id: "cm1111111111111111111111111",
        orderId: "cm2222222222222222222222222",
        userId: "user_1",
        title: "The Lagos Chronicle",
        status: "COMPLETED",
        productionStatus: null,
      });
      txBookUpdate.mockResolvedValue({
        id: "cm1111111111111111111111111",
        productionStatus: "DELIVERED",
        productionStatusUpdatedAt: new Date("2026-03-10T15:00:00.000Z"),
      });

      await service.updateAdminBookProductionStatus("cm1111111111111111111111111", {
        productionStatus: "DELIVERED",
      });

      expect(mockNotificationsService.createReviewRequestNotification).not.toHaveBeenCalled();
    });
  });
});
