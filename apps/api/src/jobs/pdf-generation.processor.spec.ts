/// <reference types="jest" />
import type { TestingModule } from "@nestjs/testing";
import { Test } from "@nestjs/testing";
import type { Job } from "bullmq";
import { GotenbergPageCountService } from "../engine/gotenberg-page-count.service.js";
import { FilesService } from "../files/files.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { JOB_NAMES } from "./jobs.constants.js";
import { PdfGenerationProcessor } from "./pdf-generation.processor.js";

const txBookUpdate = jest.fn();
const txOrderUpdate = jest.fn();
const txJobUpdate = jest.fn();

const mockPrismaService = {
  file: {
    findFirst: jest.fn().mockResolvedValue(null),
  },
  job: {
    updateMany: jest.fn(),
  },
  $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      book: { update: txBookUpdate },
      order: { update: txOrderUpdate },
      job: { update: txJobUpdate },
    })
  ),
};

const mockGotenbergPageCountService = {
  renderPdf: jest.fn(),
};

const mockFilesService = {
  saveGeneratedFile: jest.fn(),
};

describe("PdfGenerationProcessor", () => {
  let processor: PdfGenerationProcessor;
  const originalFetch = global.fetch;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PdfGenerationProcessor,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: GotenbergPageCountService, useValue: mockGotenbergPageCountService },
        { provide: FilesService, useValue: mockFilesService },
      ],
    }).compile();

    processor = module.get<PdfGenerationProcessor>(PdfGenerationProcessor);
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => "<!doctype html><html><body><p>Final text</p></body></html>",
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("generates FINAL_PDF and advances manuscript/order status without touching admin production status", async () => {
    mockGotenbergPageCountService.renderPdf.mockResolvedValue({
      pdfBuffer: Buffer.from("%PDF-final%", "latin1"),
      renderedPdfSha256: "f".repeat(64),
    });
    mockFilesService.saveGeneratedFile.mockResolvedValue({
      id: "cmfinal1",
      url: "https://cdn.example.com/books/final.pdf",
    });

    const job = {
      id: "bull-pdf-1",
      name: JOB_NAMES.GENERATE_PDF,
      data: {
        jobRecordId: "cmpdfjob1",
        bookId: "cmbook1",
        orderId: "cmorder1",
        cleanedHtmlFileId: "cmhtml1",
        cleanedHtmlUrl: "https://cdn.example.com/books/cleaned.html",
        pageSize: "A5",
        fontSize: 12,
      },
      attemptsMade: 0,
      opts: { attempts: 3 },
    } as unknown as Job;

    const result = await processor.process(job);

    expect(result.finalPdfFileId).toBe("cmfinal1");
    expect(result.finalPdfUrl).toBe("https://cdn.example.com/books/final.pdf");
    expect(txBookUpdate).toHaveBeenCalledWith({
      where: { id: "cmbook1" },
      data: {
        finalPdfUrl: "https://cdn.example.com/books/final.pdf",
        status: "IN_PRODUCTION",
      },
    });
    expect(txOrderUpdate).toHaveBeenCalledWith({
      where: { id: "cmorder1" },
      data: {
        status: "IN_PRODUCTION",
      },
    });
    expect(txJobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "cmpdfjob1" },
        data: expect.objectContaining({ status: "COMPLETED" }),
      })
    );
  });

  it("marks final PDF generation as FAILED on final retry", async () => {
    mockGotenbergPageCountService.renderPdf.mockRejectedValue(
      new Error("Gotenberg final render failed")
    );

    const job = {
      id: "bull-pdf-2",
      name: JOB_NAMES.GENERATE_PDF,
      data: {
        jobRecordId: "cmpdfjob2",
        bookId: "cmbook2",
        orderId: "cmorder2",
        cleanedHtmlFileId: "cmhtml2",
        cleanedHtmlUrl: "https://cdn.example.com/books/cleaned2.html",
        pageSize: "A4",
        fontSize: 11,
      },
      attemptsMade: 2,
      opts: { attempts: 3 },
    } as unknown as Job;

    await expect(processor.process(job)).rejects.toThrow("Gotenberg final render failed");

    expect(mockPrismaService.job.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "cmpdfjob2" },
        data: expect.objectContaining({
          status: "FAILED",
          attempts: 3,
          error: "Gotenberg final render failed",
        }),
      })
    );
    expect(txBookUpdate).not.toHaveBeenCalled();
    expect(txOrderUpdate).not.toHaveBeenCalled();
  });

  it("keeps final PDF generation retryable on non-final render failures", async () => {
    mockGotenbergPageCountService.renderPdf.mockRejectedValue(
      new Error("Gotenberg final render failed")
    );

    const job = {
      id: "bull-pdf-3",
      name: JOB_NAMES.GENERATE_PDF,
      data: {
        jobRecordId: "cmpdfjob3",
        bookId: "cmbook3",
        orderId: "cmorder3",
        cleanedHtmlFileId: "cmhtml3",
        cleanedHtmlUrl: "https://cdn.example.com/books/cleaned3.html",
        pageSize: "A5",
        fontSize: 14,
      },
      attemptsMade: 0,
      opts: { attempts: 3 },
    } as unknown as Job;

    await expect(processor.process(job)).rejects.toThrow("Gotenberg final render failed");

    expect(mockPrismaService.job.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "cmpdfjob3" },
        data: expect.objectContaining({
          status: "QUEUED",
          attempts: 1,
          error: "Gotenberg final render failed",
          startedAt: null,
        }),
      })
    );
    expect(txBookUpdate).not.toHaveBeenCalled();
    expect(txOrderUpdate).not.toHaveBeenCalled();
    expect(txJobUpdate).not.toHaveBeenCalled();
  });
});
