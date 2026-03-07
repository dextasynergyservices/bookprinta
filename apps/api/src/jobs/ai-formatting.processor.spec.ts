/// <reference types="jest" />
import type { TestingModule } from "@nestjs/testing";
import { Test } from "@nestjs/testing";
import type { Job } from "bullmq";
import { BooksPipelineService } from "../books/books-pipeline.service.js";
import { ManuscriptAnalysisService } from "../books/manuscript-analysis.service.js";
import { CloudinaryService } from "../cloudinary/cloudinary.service.js";
import { GeminiFormattingService } from "../engine/gemini-formatting.service.js";
import { HtmlValidationService } from "../engine/html-validation.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { AiFormattingProcessor } from "./ai-formatting.processor.js";
import { JOB_NAMES } from "./jobs.constants.js";

const txBookUpdate = jest.fn();
const txJobUpdate = jest.fn();

const mockPrismaService = {
  job: {
    updateMany: jest.fn(),
  },
  book: {
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  order: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  file: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      book: { update: txBookUpdate },
      job: { update: txJobUpdate },
    })
  ),
};

const mockCloudinaryService = {
  upload: jest.fn(),
};

const mockBooksPipelineService = {
  enqueuePageCountFromAiSuccess: jest.fn(),
};

const mockManuscriptAnalysisService = {
  extractText: jest.fn(),
  detectMimeType: jest.fn(),
};

const mockGeminiFormattingService = {
  formatManuscript: jest.fn(),
};

const mockHtmlValidationService = {
  validateFormattedHtml: jest.fn(),
};

describe("AiFormattingProcessor", () => {
  let processor: AiFormattingProcessor;
  const originalFetch = global.fetch;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiFormattingProcessor,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: CloudinaryService, useValue: mockCloudinaryService },
        { provide: BooksPipelineService, useValue: mockBooksPipelineService },
        { provide: ManuscriptAnalysisService, useValue: mockManuscriptAnalysisService },
        { provide: GeminiFormattingService, useValue: mockGeminiFormattingService },
        { provide: HtmlValidationService, useValue: mockHtmlValidationService },
      ],
    }).compile();

    processor = module.get<AiFormattingProcessor>(AiFormattingProcessor);
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("processes FORMAT_MANUSCRIPT job and persists success result", async () => {
    mockPrismaService.book.findUnique.mockResolvedValue({ status: "AI_PROCESSING" });
    mockPrismaService.order.findUnique.mockResolvedValue({ status: "FORMATTING" });
    mockManuscriptAnalysisService.extractText.mockResolvedValue("Chapter 1 Hello world.");
    mockGeminiFormattingService.formatManuscript.mockResolvedValue({
      html: "<!doctype html><html><body><h1>Chapter 1</h1><p>Hello world.</p></body></html>",
      inputWordCount: 3,
      outputWordCount: 3,
      chunkCount: 1,
      model: "gemini-1.5-flash",
    });
    mockHtmlValidationService.validateFormattedHtml.mockResolvedValue({ outputWordCount: 3 });
    mockPrismaService.file.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ version: 2 });
    mockCloudinaryService.upload.mockResolvedValue({
      secure_url: "https://cdn.example.com/books/cleaned.html",
    });
    mockPrismaService.file.create.mockResolvedValue({
      id: "cmfile1",
      url: "https://cdn.example.com/books/cleaned.html",
    });
    mockBooksPipelineService.enqueuePageCountFromAiSuccess.mockResolvedValue({
      queued: true,
      reason: "QUEUED",
      jobRecordId: "cmpagejob1",
      queueJobId: "count-pages:cmbook1:abc",
    });

    const job = {
      id: "bulljob1",
      name: JOB_NAMES.FORMAT_MANUSCRIPT,
      data: {
        jobRecordId: "cmjob1",
        bookId: "cmbook1",
        orderId: "cmorder1",
        trigger: "upload",
        rawManuscriptFileId: "cmraw1",
        rawManuscriptUrl: "https://cdn.example.com/books/raw.docx",
        rawManuscriptName: "raw.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        pageSize: "A5",
        fontSize: 12,
      },
      attemptsMade: 0,
      opts: { attempts: 3 },
    } as unknown as Job;

    const result = await processor.process(job);

    expect(mockPrismaService.job.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "cmjob1" }),
        data: expect.objectContaining({ status: "PROCESSING", attempts: 1 }),
      })
    );
    expect(mockPrismaService.book.update).toHaveBeenCalledWith({
      where: { id: "cmbook1" },
      data: { status: "FORMATTING" },
    });
    expect(mockBooksPipelineService.enqueuePageCountFromAiSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        bookId: "cmbook1",
        cleanedHtmlFileId: "cmfile1",
        trigger: "upload",
      })
    );
    expect(txBookUpdate).toHaveBeenCalledWith({
      where: { id: "cmbook1" },
      data: {
        status: "FORMATTED",
        currentHtmlUrl: "https://cdn.example.com/books/cleaned.html",
      },
    });
    expect(txJobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "cmjob1" },
        data: expect.objectContaining({ status: "COMPLETED" }),
      })
    );
    expect(result.cleanedHtmlFileId).toBe("cmfile1");
  });

  it("marks job as FAILED and book as FORMATTING_REVIEW on final retry failure", async () => {
    mockPrismaService.book.findUnique.mockResolvedValue({ status: "AI_PROCESSING" });
    mockPrismaService.order.findUnique.mockResolvedValue({ status: "FORMATTING" });
    mockManuscriptAnalysisService.extractText.mockResolvedValue("text");
    mockGeminiFormattingService.formatManuscript.mockRejectedValue(new Error("Gemini 500"));

    const job = {
      id: "bulljob2",
      name: JOB_NAMES.FORMAT_MANUSCRIPT,
      data: {
        jobRecordId: "cmjob2",
        bookId: "cmbook2",
        orderId: "cmorder2",
        trigger: "settings_change",
        rawManuscriptFileId: "cmraw2",
        rawManuscriptUrl: "https://cdn.example.com/books/raw2.docx",
        rawManuscriptName: "raw2.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        pageSize: "A4",
        fontSize: 11,
      },
      attemptsMade: 2,
      opts: { attempts: 3 },
    } as unknown as Job;

    await expect(processor.process(job)).rejects.toThrow("Gemini 500");

    expect(mockPrismaService.job.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "cmjob2" },
        data: expect.objectContaining({ status: "FAILED", attempts: 3, error: "Gemini 500" }),
      })
    );
    expect(mockPrismaService.book.updateMany).toHaveBeenCalledWith({
      where: { id: "cmbook2" },
      data: { status: "FORMATTING_REVIEW" },
    });
  });

  it("keeps the job retryable on non-final Gemini failures", async () => {
    mockPrismaService.book.findUnique.mockResolvedValue({ status: "AI_PROCESSING" });
    mockPrismaService.order.findUnique.mockResolvedValue({ status: "FORMATTING" });
    mockManuscriptAnalysisService.extractText.mockResolvedValue("text");
    mockGeminiFormattingService.formatManuscript.mockRejectedValue(new Error("Gemini timeout"));

    const job = {
      id: "bulljob3",
      name: JOB_NAMES.FORMAT_MANUSCRIPT,
      data: {
        jobRecordId: "cmjob3",
        bookId: "cmbook3",
        orderId: "cmorder3",
        trigger: "upload",
        rawManuscriptFileId: "cmraw3",
        rawManuscriptUrl: "https://cdn.example.com/books/raw3.docx",
        rawManuscriptName: "raw3.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        pageSize: "A5",
        fontSize: 12,
      },
      attemptsMade: 0,
      opts: { attempts: 3 },
    } as unknown as Job;

    await expect(processor.process(job)).rejects.toThrow("Gemini timeout");

    expect(mockPrismaService.job.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "cmjob3" },
        data: expect.objectContaining({
          status: "PROCESSING",
          attempts: 1,
          error: "Gemini timeout",
        }),
      })
    );
    expect(mockPrismaService.book.updateMany).not.toHaveBeenCalled();
    expect(txBookUpdate).not.toHaveBeenCalled();
    expect(txJobUpdate).not.toHaveBeenCalled();
  });
});
