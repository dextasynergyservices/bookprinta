/// <reference types="jest" />
import { getQueueToken } from "@nestjs/bullmq";
import { Test, type TestingModule } from "@nestjs/testing";
import {
  JOB_NAMES,
  QUEUE_AI_FORMATTING,
  QUEUE_PAGE_COUNT,
  QUEUE_PDF_GENERATION,
} from "../jobs/jobs.constants.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { BooksPipelineService } from "./books-pipeline.service.js";

const txBookUpdate = jest.fn();
const txOrderUpdate = jest.fn();

const mockPrismaService = {
  book: {
    findUnique: jest.fn(),
  },
  file: {
    findFirst: jest.fn(),
  },
  job: {
    findMany: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      book: { update: txBookUpdate },
      order: { update: txOrderUpdate },
    })
  ),
};

const mockAiFormattingQueue = {
  getJob: jest.fn(),
  add: jest.fn(),
};

const mockPageCountQueue = {
  getJob: jest.fn(),
  add: jest.fn(),
};

const mockPdfGenerationQueue = {
  getJob: jest.fn(),
  add: jest.fn(),
};

describe("BooksPipelineService", () => {
  let service: BooksPipelineService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BooksPipelineService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: getQueueToken(QUEUE_AI_FORMATTING), useValue: mockAiFormattingQueue },
        { provide: getQueueToken(QUEUE_PAGE_COUNT), useValue: mockPageCountQueue },
        { provide: getQueueToken(QUEUE_PDF_GENERATION), useValue: mockPdfGenerationQueue },
      ],
    }).compile();

    service = module.get<BooksPipelineService>(BooksPipelineService);
    jest.clearAllMocks();
  });

  it("queues FORMAT_MANUSCRIPT after upload when manuscript exists", async () => {
    mockPrismaService.book.findUnique.mockResolvedValue({
      id: "cmbook1",
      userId: "user_1",
      orderId: "cmorder1",
      status: "UPLOADED",
      pageSize: "A5",
      fontSize: 12,
      wordCount: 42_000,
      estimatedPages: 170,
      order: {
        id: "cmorder1",
        status: "PAID",
        package: {
          pageLimit: 150,
        },
      },
    });
    mockPrismaService.file.findFirst.mockResolvedValue({
      id: "cmraw1",
      url: "https://cdn.example.com/raw.docx",
      fileName: "raw.docx",
      fileSize: 1024,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      version: 1,
    });
    mockAiFormattingQueue.getJob.mockResolvedValue(null);
    mockPrismaService.job.findMany.mockResolvedValue([]);
    mockPrismaService.job.create.mockResolvedValue({ id: "cmjob1" });
    txBookUpdate.mockResolvedValue({});
    txOrderUpdate.mockResolvedValue({});
    mockAiFormattingQueue.add.mockResolvedValue({});

    const result = await service.enqueueFormatManuscript({
      bookId: "cmbook1",
      trigger: "upload",
    });

    expect(result.queued).toBe(true);
    expect(result.reason).toBe("QUEUED");
    expect(mockAiFormattingQueue.add).toHaveBeenCalledWith(
      JOB_NAMES.FORMAT_MANUSCRIPT,
      expect.objectContaining({
        bookId: "cmbook1",
        jobRecordId: "cmjob1",
        trigger: "upload",
      }),
      expect.objectContaining({
        jobId: expect.stringContaining("format:cmbook1:"),
      })
    );
    expect(txBookUpdate).toHaveBeenCalledWith({
      where: { id: "cmbook1" },
      data: {
        status: "AI_PROCESSING",
        pageCount: null,
        currentHtmlUrl: null,
      },
    });
    expect(txOrderUpdate).toHaveBeenCalledWith({
      where: { id: "cmorder1" },
      data: {
        status: "FORMATTING",
        extraAmount: 0,
      },
    });
  });

  it("does not enqueue format job when no manuscript file exists", async () => {
    mockPrismaService.book.findUnique.mockResolvedValue({
      id: "cmbook1",
      userId: "user_1",
      orderId: "cmorder1",
      status: "PAYMENT_RECEIVED",
      pageSize: "A5",
      fontSize: 11,
      wordCount: null,
      estimatedPages: null,
      order: {
        id: "cmorder1",
        status: "PAID",
        package: { pageLimit: 150 },
      },
    });
    mockPrismaService.file.findFirst.mockResolvedValue(null);

    const result = await service.enqueueFormatManuscript({
      bookId: "cmbook1",
      trigger: "settings_change",
    });

    expect(result).toEqual({
      queued: false,
      reason: "NO_MANUSCRIPT",
      jobRecordId: null,
      queueJobId: null,
    });
    expect(mockPrismaService.job.create).not.toHaveBeenCalled();
    expect(mockAiFormattingQueue.add).not.toHaveBeenCalled();
  });

  it("is idempotent for active format queue job with same fingerprint", async () => {
    mockPrismaService.book.findUnique.mockResolvedValue({
      id: "cmbook1",
      userId: "user_1",
      orderId: "cmorder1",
      status: "UPLOADED",
      pageSize: "A4",
      fontSize: 14,
      wordCount: 30_000,
      estimatedPages: 132,
      order: {
        id: "cmorder1",
        status: "FORMATTING",
        package: { pageLimit: 100 },
      },
    });
    mockPrismaService.file.findFirst.mockResolvedValue({
      id: "cmraw1",
      url: "https://cdn.example.com/raw.docx",
      fileName: "raw.docx",
      fileSize: 1024,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      version: 1,
    });
    mockAiFormattingQueue.getJob.mockResolvedValue({
      getState: jest.fn().mockResolvedValue("waiting"),
    });

    const result = await service.enqueueFormatManuscript({
      bookId: "cmbook1",
      trigger: "upload",
    });

    expect(result.queued).toBe(false);
    expect(result.reason).toBe("ALREADY_ACTIVE");
    expect(mockPrismaService.job.create).not.toHaveBeenCalled();
    expect(mockAiFormattingQueue.add).not.toHaveBeenCalled();
  });

  it("queues COUNT_PAGES after AI success hook", async () => {
    mockPrismaService.book.findUnique.mockResolvedValue({
      id: "cmbook1",
      orderId: "cmorder1",
      status: "FORMATTED",
      pageSize: "A5",
      fontSize: 12,
      order: {
        status: "FORMATTING",
        package: { pageLimit: 150 },
      },
    });
    mockPageCountQueue.getJob.mockResolvedValue(null);
    mockPrismaService.job.findMany.mockResolvedValue([]);
    mockPrismaService.job.create.mockResolvedValue({ id: "cmjob2" });
    txBookUpdate.mockResolvedValue({});
    txOrderUpdate.mockResolvedValue({});
    mockPageCountQueue.add.mockResolvedValue({});

    const result = await service.enqueuePageCountFromAiSuccess({
      bookId: "cmbook1",
      trigger: "upload",
      cleanedHtmlFileId: "cmhtml1",
      cleanedHtmlUrl: "https://cdn.example.com/cleaned.html",
      outputWordCount: 41_500,
      sourceAiJobRecordId: "cmjob1",
    });

    expect(result.queued).toBe(true);
    expect(result.reason).toBe("QUEUED");
    expect(mockPageCountQueue.add).toHaveBeenCalledWith(
      JOB_NAMES.COUNT_PAGES,
      expect.objectContaining({
        bookId: "cmbook1",
        jobRecordId: "cmjob2",
        cleanedHtmlFileId: "cmhtml1",
      }),
      expect.objectContaining({
        jobId: expect.stringContaining("count-pages:cmbook1:"),
      })
    );
  });

  it("queues GENERATE_PDF after approval", async () => {
    mockPrismaService.book.findUnique.mockResolvedValue({
      id: "cmbook9",
      orderId: "cmorder9",
      status: "APPROVED",
      pageSize: "A5",
      fontSize: 12,
      currentHtmlUrl: "https://cdn.example.com/books/current.html",
    });
    mockPrismaService.file.findFirst.mockResolvedValue({
      id: "cmhtml9",
    });
    mockPdfGenerationQueue.getJob.mockResolvedValue(null);
    mockPrismaService.job.findMany.mockResolvedValue([]);
    mockPrismaService.job.create.mockResolvedValue({ id: "cmpdfjob1" });
    mockPdfGenerationQueue.add.mockResolvedValue({});

    const result = await service.enqueueGeneratePdf({ bookId: "cmbook9" });

    expect(result).toEqual(
      expect.objectContaining({
        queued: true,
        reason: "QUEUED",
        jobRecordId: "cmpdfjob1",
      })
    );
    expect(mockPdfGenerationQueue.add).toHaveBeenCalledWith(
      JOB_NAMES.GENERATE_PDF,
      expect.objectContaining({
        bookId: "cmbook9",
        jobRecordId: "cmpdfjob1",
        cleanedHtmlFileId: "cmhtml9",
      }),
      expect.objectContaining({
        jobId: expect.stringContaining("generate-pdf:cmbook9:"),
      })
    );
  });
});
