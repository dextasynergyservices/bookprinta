/// <reference types="jest" />
import type { TestingModule } from "@nestjs/testing";
import { Test } from "@nestjs/testing";
import type { Job } from "bullmq";
import { GotenbergPageCountService } from "../engine/gotenberg-page-count.service.js";
import { FilesService } from "../files/files.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { JOB_NAMES } from "./jobs.constants.js";
import { PageCountProcessor } from "./page-count.processor.js";

const txBookUpdate = jest.fn();
const txOrderUpdate = jest.fn();
const txJobUpdate = jest.fn();

const mockPrismaService = {
  job: {
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  book: {
    findUnique: jest.fn(),
    updateMany: jest.fn(),
  },
  file: {
    findFirst: jest.fn(),
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
  countPages: jest.fn(),
  renderPdf: jest.fn(),
  countAndRenderPreview: jest.fn(),
  warmUp: jest.fn().mockResolvedValue(undefined),
};

const mockFilesService = {
  saveGeneratedFile: jest.fn(),
};

describe("PageCountProcessor", () => {
  let processor: PageCountProcessor;
  const originalFetch = global.fetch;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PageCountProcessor,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: GotenbergPageCountService, useValue: mockGotenbergPageCountService },
        { provide: FilesService, useValue: mockFilesService },
      ],
    }).compile();

    processor = module.get<PageCountProcessor>(PageCountProcessor);
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => "<!doctype html><html><body><p>Formatted text</p></body></html>",
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("stores authoritative page count and sets PREVIEW_READY when within package limit", async () => {
    mockPrismaService.book.findUnique
      .mockResolvedValueOnce({
        pageSize: "A5",
        fontSize: 12,
        currentHtmlUrl: "https://cdn.example.com/books/cleaned.html",
      })
      .mockResolvedValueOnce({
        pageSize: "A5",
        fontSize: 12,
        currentHtmlUrl: "https://cdn.example.com/books/cleaned.html",
      });
    mockPrismaService.file.findFirst.mockResolvedValue({
      id: "cmhtml1",
      url: "https://cdn.example.com/books/cleaned.html",
    });
    mockGotenbergPageCountService.countAndRenderPreview.mockResolvedValue({
      pageCount: 128,
      pdfBuffer: Buffer.from("%PDF-preview%", "latin1"),
      renderedPdfSha256: "a".repeat(64),
    });
    mockFilesService.saveGeneratedFile.mockResolvedValue({
      id: "cmpreview1",
      url: "https://cdn.example.com/books/preview.pdf",
    });

    const job = {
      id: "bull-count-1",
      name: JOB_NAMES.COUNT_PAGES,
      data: {
        jobRecordId: "cmcountjob1",
        bookId: "cmbook1",
        orderId: "cmorder1",
        cleanedHtmlFileId: "cmhtml1",
        cleanedHtmlUrl: "https://cdn.example.com/books/cleaned.html",
        pageSize: "A5",
        fontSize: 12,
        bundlePageLimit: 150,
        trigger: "upload",
        sourceAiJobRecordId: "cmai1",
      },
      attemptsMade: 0,
      opts: { attempts: 3 },
    } as unknown as Job;

    const result = await processor.process(job);

    expect(result.pageCount).toBe(128);
    expect(result.overagePages).toBe(0);
    expect(result.gateStatus).toBe("CLEAR");
    expect(result.previewPdfFileId).toBe("cmpreview1");

    expect(txBookUpdate).toHaveBeenCalledWith({
      where: { id: "cmbook1" },
      data: {
        pageCount: 128,
        status: "PREVIEW_READY",
        previewPdfUrl: "https://cdn.example.com/books/preview.pdf",
      },
    });
    expect(txOrderUpdate).toHaveBeenCalledWith({
      where: { id: "cmorder1" },
      data: { status: "PREVIEW_READY", extraAmount: 0 },
    });
    expect(txJobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "cmcountjob1" },
        data: expect.objectContaining({ status: "COMPLETED" }),
      })
    );
  });

  it("sets PENDING_EXTRA_PAYMENT and extraAmount when count exceeds package limit", async () => {
    mockPrismaService.book.findUnique
      .mockResolvedValueOnce({
        pageSize: "A4",
        fontSize: 11,
        currentHtmlUrl: "https://cdn.example.com/books/cleaned2.html",
      })
      .mockResolvedValueOnce({
        pageSize: "A4",
        fontSize: 11,
        currentHtmlUrl: "https://cdn.example.com/books/cleaned2.html",
      });
    mockPrismaService.file.findFirst.mockResolvedValue({
      id: "cmhtml2",
      url: "https://cdn.example.com/books/cleaned2.html",
    });
    mockGotenbergPageCountService.countAndRenderPreview.mockResolvedValue({
      pageCount: 173,
      pdfBuffer: Buffer.from("%PDF-preview-2%", "latin1"),
      renderedPdfSha256: "b".repeat(64),
    });
    mockFilesService.saveGeneratedFile.mockResolvedValue({
      id: "cmpreview2",
      url: "https://cdn.example.com/books/preview-2.pdf",
    });

    const job = {
      id: "bull-count-2",
      name: JOB_NAMES.COUNT_PAGES,
      data: {
        jobRecordId: "cmcountjob2",
        bookId: "cmbook2",
        orderId: "cmorder2",
        cleanedHtmlFileId: "cmhtml2",
        cleanedHtmlUrl: "https://cdn.example.com/books/cleaned2.html",
        pageSize: "A4",
        fontSize: 11,
        bundlePageLimit: 150,
        trigger: "settings_change",
      },
      attemptsMade: 0,
      opts: { attempts: 3 },
    } as unknown as Job;

    const result = await processor.process(job);

    expect(result.overagePages).toBe(23);
    expect(result.extraAmount).toBe(230);
    expect(result.gateStatus).toBe("PAYMENT_REQUIRED");
    expect(txOrderUpdate).toHaveBeenCalledWith({
      where: { id: "cmorder2" },
      data: { status: "PENDING_EXTRA_PAYMENT", extraAmount: 230 },
    });
  });

  it("marks job as FAILED and book as FORMATTING_REVIEW on final retry failure", async () => {
    mockPrismaService.book.findUnique.mockResolvedValue({
      pageSize: "A5",
      fontSize: 14,
      currentHtmlUrl: "https://cdn.example.com/books/cleaned3.html",
    });
    mockPrismaService.file.findFirst.mockResolvedValue({
      id: "cmhtml3",
      url: "https://cdn.example.com/books/cleaned3.html",
    });
    mockGotenbergPageCountService.countAndRenderPreview.mockRejectedValue(
      new Error("Gotenberg timeout")
    );

    const job = {
      id: "bull-count-3",
      name: JOB_NAMES.COUNT_PAGES,
      data: {
        jobRecordId: "cmcountjob3",
        bookId: "cmbook3",
        orderId: "cmorder3",
        cleanedHtmlFileId: "cmhtml3",
        cleanedHtmlUrl: "https://cdn.example.com/books/cleaned3.html",
        pageSize: "A5",
        fontSize: 14,
        bundlePageLimit: 120,
        trigger: "upload",
      },
      attemptsMade: 2,
      opts: { attempts: 3 },
    } as unknown as Job;

    await expect(processor.process(job)).rejects.toThrow("Gotenberg timeout");

    expect(mockPrismaService.job.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "cmcountjob3" },
        data: expect.objectContaining({
          status: "FAILED",
          attempts: 3,
          error: "Gotenberg timeout",
        }),
      })
    );
    expect(mockPrismaService.book.updateMany).toHaveBeenCalledWith({
      where: { id: "cmbook3" },
      data: { status: "FORMATTING_REVIEW" },
    });
  });

  it("keeps the count job retryable on non-final Gotenberg failures", async () => {
    mockPrismaService.book.findUnique.mockResolvedValue({
      pageSize: "A4",
      fontSize: 11,
      currentHtmlUrl: "https://cdn.example.com/books/cleaned4.html",
    });
    mockPrismaService.file.findFirst.mockResolvedValue({
      id: "cmhtml4",
      url: "https://cdn.example.com/books/cleaned4.html",
    });
    mockGotenbergPageCountService.countAndRenderPreview.mockRejectedValue(
      new Error("Gotenberg timeout")
    );

    const job = {
      id: "bull-count-4",
      name: JOB_NAMES.COUNT_PAGES,
      data: {
        jobRecordId: "cmcountjob4",
        bookId: "cmbook4",
        orderId: "cmorder4",
        cleanedHtmlFileId: "cmhtml4",
        cleanedHtmlUrl: "https://cdn.example.com/books/cleaned4.html",
        pageSize: "A4",
        fontSize: 11,
        bundlePageLimit: 150,
        trigger: "settings_change",
      },
      attemptsMade: 0,
      opts: { attempts: 3 },
    } as unknown as Job;

    await expect(processor.process(job)).rejects.toThrow("Gotenberg timeout");

    expect(mockPrismaService.job.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "cmcountjob4" },
        data: expect.objectContaining({
          status: "QUEUED",
          attempts: 1,
          error: "Gotenberg timeout",
          startedAt: null,
        }),
      })
    );
    expect(mockPrismaService.book.updateMany).not.toHaveBeenCalled();
    expect(txBookUpdate).not.toHaveBeenCalled();
    expect(txOrderUpdate).not.toHaveBeenCalled();
    expect(txJobUpdate).not.toHaveBeenCalled();
  });

  it("ignores stale authoritative count results when book settings changed before commit", async () => {
    mockPrismaService.book.findUnique
      .mockResolvedValueOnce({
        pageSize: "A5",
        fontSize: 12,
        currentHtmlUrl: "https://cdn.example.com/books/cleaned-stale.html",
      })
      .mockResolvedValueOnce({
        pageSize: "A4",
        fontSize: 11,
        currentHtmlUrl: null,
      });
    mockPrismaService.file.findFirst
      .mockResolvedValueOnce({
        id: "cmhtml-stale",
        url: "https://cdn.example.com/books/cleaned-stale.html",
      })
      .mockResolvedValueOnce(null);
    mockGotenbergPageCountService.countAndRenderPreview.mockResolvedValue({
      pageCount: 128,
      pdfBuffer: Buffer.from("%PDF-preview-stale%", "latin1"),
      renderedPdfSha256: "c".repeat(64),
    });
    mockFilesService.saveGeneratedFile.mockResolvedValue({
      id: "cmpreview-stale",
      url: "https://cdn.example.com/books/preview-stale.pdf",
    });

    const job = {
      id: "bull-count-stale",
      name: JOB_NAMES.COUNT_PAGES,
      data: {
        jobRecordId: "cmcountjob-stale",
        bookId: "cmbook-stale",
        orderId: "cmorder-stale",
        cleanedHtmlFileId: "cmhtml-stale",
        cleanedHtmlUrl: "https://cdn.example.com/books/cleaned-stale.html",
        pageSize: "A5",
        fontSize: 12,
        bundlePageLimit: 150,
        trigger: "settings_change",
      },
      attemptsMade: 0,
      opts: { attempts: 3 },
    } as unknown as Job;

    const result = await processor.process(job);

    expect(result.ignoredAsSuperseded).toBe(true);
    expect(mockPrismaService.job.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "cmcountjob-stale" },
        data: expect.objectContaining({
          status: "COMPLETED",
          result: expect.objectContaining({ ignoredAsSuperseded: true }),
        }),
      })
    );
    expect(txBookUpdate).not.toHaveBeenCalled();
    expect(txOrderUpdate).not.toHaveBeenCalled();
  });

  it("accepts a fresh page-count run when the latest cleaned-html file already matches but currentHtmlUrl is not yet updated", async () => {
    mockPrismaService.book.findUnique
      .mockResolvedValueOnce({
        pageSize: "A5",
        fontSize: 11,
        currentHtmlUrl: "https://cdn.example.com/books/older-cleaned.html",
      })
      .mockResolvedValueOnce({
        pageSize: "A5",
        fontSize: 11,
        currentHtmlUrl: "https://cdn.example.com/books/older-cleaned.html",
      });
    mockPrismaService.file.findFirst.mockResolvedValue({
      id: "cmhtml-race",
      url: "https://cdn.example.com/books/new-cleaned.html",
    });
    mockGotenbergPageCountService.countAndRenderPreview.mockResolvedValue({
      pageCount: 74,
      pdfBuffer: Buffer.from("%PDF-preview-race%", "latin1"),
      renderedPdfSha256: "d".repeat(64),
    });
    mockFilesService.saveGeneratedFile.mockResolvedValue({
      id: "cmpreview-race",
      url: "https://cdn.example.com/books/preview-race.pdf",
    });

    const job = {
      id: "bull-count-race",
      name: JOB_NAMES.COUNT_PAGES,
      data: {
        jobRecordId: "cmcountjob-race",
        bookId: "cmbook-race",
        orderId: "cmorder-race",
        cleanedHtmlFileId: "cmhtml-race",
        cleanedHtmlUrl: "https://cdn.example.com/books/new-cleaned.html",
        pageSize: "A5",
        fontSize: 11,
        bundlePageLimit: 100,
        trigger: "upload",
      },
      attemptsMade: 0,
      opts: { attempts: 3 },
    } as unknown as Job;

    const result = await processor.process(job);

    expect(result.ignoredAsSuperseded).toBeUndefined();
    expect(result.pageCount).toBe(74);
    expect(txBookUpdate).toHaveBeenCalledWith({
      where: { id: "cmbook-race" },
      data: {
        pageCount: 74,
        status: "PREVIEW_READY",
        previewPdfUrl: "https://cdn.example.com/books/preview-race.pdf",
      },
    });
  });
});
