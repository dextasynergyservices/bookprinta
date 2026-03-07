/// <reference types="jest" />
import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { FilesService } from "../files/files.service.js";
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
    update: jest.fn(),
  },
  order: {
    update: jest.fn(),
  },
  payment: {
    aggregate: jest.fn(),
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
        { provide: RolloutService, useValue: mockRolloutService },
      ],
    }).compile();

    service = module.get<BooksService>(BooksService);
    jest.clearAllMocks();
    mockRolloutService.resolveBookRolloutState.mockReturnValue(defaultRolloutState);
    mockRolloutService.assertBookWorkspaceAccess.mockImplementation(() => undefined);
    mockRolloutService.assertManuscriptPipelineAccess.mockImplementation(() => undefined);
    mockRolloutService.assertBillingGateAccess.mockImplementation(() => undefined);
    mockRolloutService.assertFinalPdfAccess.mockImplementation(() => undefined);
  });

  describe("updateUserBookSettings", () => {
    it("stores selected settings and recalculates estimated pages when word count exists", async () => {
      mockPrismaService.book.findFirst.mockResolvedValue({
        id: "cm1111111111111111111111111",
        wordCount: 58_000,
        status: "PAYMENT_RECEIVED",
      });
      mockManuscriptAnalysisService.estimatePages.mockReturnValue(224);
      mockPrismaService.book.update.mockResolvedValue({
        id: "cm1111111111111111111111111",
        pageSize: "A4",
        fontSize: 12,
        wordCount: 58_000,
        estimatedPages: 224,
        updatedAt: new Date("2026-03-06T12:00:00.000Z"),
      });

      const result = await service.updateUserBookSettings("user_1", "cm1111111111111111111111111", {
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
      });

      await expect(
        service.updateUserBookSettings("user_1", "cm1111111111111111111111111", {
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
      });
      mockRolloutService.assertManuscriptPipelineAccess.mockImplementation(() => {
        throw new ServiceUnavailableException(
          "Automated manuscript processing is not enabled in this environment yet."
        );
      });

      await expect(
        service.updateUserBookSettings("user_1", "cm1111111111111111111111111", {
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
    });

    it("returns scanner unavailable message when scan provider is down", async () => {
      mockPrismaService.book.findFirst.mockResolvedValue({
        id: "cm1111111111111111111111111",
        status: "AWAITING_UPLOAD",
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

  describe("findUserBookById", () => {
    it("returns book detail with progress timeline for normal flow", async () => {
      mockPrismaService.book.findFirst.mockResolvedValue({
        id: "cm1111111111111111111111111",
        orderId: "cm2222222222222222222222222",
        status: "PRINTING",
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
      expect(result.rejectionReason).toBe("Low-resolution manuscript images.");
      expect(result.timeline.find((entry) => entry.stage === "REVIEW")?.state).toBe("rejected");
      expect(result.timeline.find((entry) => entry.stage === "APPROVED")?.state).toBe("upcoming");
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
        data: { status: "APPROVED" },
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

  describe("getUserBookPreview", () => {
    it("returns the current watermarked preview URL", async () => {
      mockPrismaService.book.findFirst.mockResolvedValue({
        id: "cm1111111111111111111111111",
        status: "PREVIEW_READY",
        previewPdfUrl: "https://cdn.example.com/books/1/preview.pdf",
      });

      const result = await service.getUserBookPreview("user_1", "cm1111111111111111111111111");

      expect(result).toEqual({
        bookId: "cm1111111111111111111111111",
        previewPdfUrl: "https://cdn.example.com/books/1/preview.pdf",
        status: "PREVIEW_READY",
        watermarked: true,
      });
    });

    it("throws when preview PDF is not available yet", async () => {
      mockPrismaService.book.findFirst.mockResolvedValue({
        id: "cm1111111111111111111111111",
        status: "FORMATTING_REVIEW",
        previewPdfUrl: null,
      });

      await expect(
        service.getUserBookPreview("user_1", "cm1111111111111111111111111")
      ).rejects.toThrow(NotFoundException);
    });

    it("hides preview PDF while a settings rerun has put the book back into formatting", async () => {
      mockPrismaService.book.findFirst.mockResolvedValue({
        id: "cm1111111111111111111111111",
        status: "FORMATTING",
        previewPdfUrl: "https://cdn.example.com/books/1/preview.pdf",
      });

      await expect(
        service.getUserBookPreview("user_1", "cm1111111111111111111111111")
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("getUserBookFiles", () => {
    it("returns file lineage with API-safe nullables", async () => {
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
});
