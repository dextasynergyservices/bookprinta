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
    findUnique: jest.fn().mockResolvedValue(null), // used by isJobCancelled
    findFirst: jest.fn().mockResolvedValue(null), // used by lookupPreviewSha256
  },
  $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      book: { update: txBookUpdate },
      order: { update: txOrderUpdate },
      job: { update: txJobUpdate, findUnique: jest.fn().mockResolvedValue(null) },
    })
  ),
};

const mockGotenbergPageCountService = {
  renderPdf: jest.fn(),
  waitForReady: jest.fn().mockResolvedValue(true),
};

const mockFilesService = {
  saveGeneratedFile: jest.fn(),
  saveGeneratedFileFromUrl: jest.fn(),
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

  // ── Phase 3 regression guard (docs/infra-cost-hardening-plan.md) ──────────
  // The whole point of Phase 3 is that the final PDF REUSES the page-count
  // render instead of rendering through Gotenberg a second time. Every other
  // test here exercises the fallback (file.findFirst → null), so without this
  // one, breaking tryPromotePreviewPdf to always return null would still pass
  // all tests while silently restoring the double render. This asserts the
  // promote path is taken and Gotenberg is NOT called.
  it("promotes an existing PREVIEW_PDF to FINAL_PDF via server-side copy, without calling Gotenberg", async () => {
    mockPrismaService.file.findFirst.mockResolvedValueOnce({
      id: "cmpreview1",
      url: "https://cdn.example.com/books/preview.pdf",
    });
    // page-count job supplies the reused sha256 (same bytes as the final).
    mockPrismaService.job.findFirst.mockResolvedValueOnce({
      result: { renderedPdfSha256: "c".repeat(64) },
    });

    // Validation reads the first stream chunk only — return a real streamable
    // Response whose body begins with the %PDF- magic bytes.
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        new Response(Buffer.from("%PDF-1.4\npreview-bytes\n", "latin1"))
      ) as unknown as typeof fetch;

    mockFilesService.saveGeneratedFileFromUrl.mockResolvedValue({
      id: "cmfinalPromoted",
      url: "https://cdn.example.com/books/final-promoted.pdf",
    });

    const job = {
      id: "bull-pdf-promote",
      name: JOB_NAMES.GENERATE_PDF,
      data: {
        jobRecordId: "cmpdfjob2",
        bookId: "cmbook2",
        orderId: "cmorder2",
        cleanedHtmlFileId: "cmhtml2",
        cleanedHtmlUrl: "https://cdn.example.com/books/cleaned.html",
        pageSize: "A5",
        fontSize: 12,
      },
      attemptsMade: 0,
      opts: { attempts: 3 },
    } as unknown as Job;

    const result = await processor.process(job);

    // Gotenberg was NOT invoked — this is the saved render, not a new one.
    expect(mockGotenbergPageCountService.renderPdf).not.toHaveBeenCalled();
    // FINAL_PDF copied server-side from the preview URL — no bytes buffered here.
    expect(mockFilesService.saveGeneratedFileFromUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        fileType: "FINAL_PDF",
        sourceUrl: "https://cdn.example.com/books/preview.pdf",
      })
    );
    // The old buffer-upload path is not used for promotion.
    expect(mockFilesService.saveGeneratedFile).not.toHaveBeenCalled();
    expect(result.finalPdfUrl).toBe("https://cdn.example.com/books/final-promoted.pdf");
    expect(result.renderedPdfSha256).toBe("c".repeat(64));
    expect(txBookUpdate).toHaveBeenCalledWith({
      where: { id: "cmbook2" },
      data: {
        finalPdfUrl: "https://cdn.example.com/books/final-promoted.pdf",
        status: "IN_PRODUCTION",
      },
    });
  });

  // ── Phase 5 memory guard (docs/infra-cost-hardening-plan.md) ──────────────
  // Promotion must NOT pull the whole PDF into this process. It may only peek at
  // the stream head for validation; the copy itself is server-side. If someone
  // reintroduces `response.arrayBuffer()`/`.blob()`, peak RSS starts scaling
  // with book length again on the 512MB container — this catches that.
  it("promotion never buffers the full preview body into memory", async () => {
    mockPrismaService.file.findFirst.mockResolvedValueOnce({
      id: "cmpreviewMem",
      url: "https://cdn.example.com/books/preview-mem.pdf",
    });

    // A Response whose full-body accessors throw — only stream reads are allowed.
    const streamed = new Response(Buffer.from("%PDF-1.4\nstreamed\n", "latin1"));
    const guarded = {
      ok: true,
      body: streamed.body,
      arrayBuffer: () => {
        throw new Error("arrayBuffer() must not be called — promotion must stream");
      },
      blob: () => {
        throw new Error("blob() must not be called — promotion must stream");
      },
      text: () => {
        throw new Error("text() must not be called on the preview");
      },
    };
    global.fetch = jest.fn().mockResolvedValue(guarded) as unknown as typeof fetch;

    mockFilesService.saveGeneratedFileFromUrl.mockResolvedValue({
      id: "cmfinalMem",
      url: "https://cdn.example.com/books/final-mem.pdf",
    });

    const job = {
      id: "bull-pdf-mem",
      name: JOB_NAMES.GENERATE_PDF,
      data: {
        jobRecordId: "cmpdfjobMem",
        bookId: "cmbookMem",
        orderId: "cmorderMem",
        cleanedHtmlFileId: "cmhtmlMem",
        cleanedHtmlUrl: "https://cdn.example.com/books/cleaned.html",
        pageSize: "A5",
        fontSize: 12,
      },
      attemptsMade: 0,
      opts: { attempts: 3 },
    } as unknown as Job;

    const result = await processor.process(job);

    // Completed via server-side copy without any full-body read throwing.
    expect(result.finalPdfUrl).toBe("https://cdn.example.com/books/final-mem.pdf");
    expect(mockGotenbergPageCountService.renderPdf).not.toHaveBeenCalled();
  });

  it("falls back to a Gotenberg render when the stored PREVIEW_PDF is not a valid PDF", async () => {
    // A corrupt/truncated preview must not be promoted — we must re-render.
    mockPrismaService.file.findFirst.mockResolvedValueOnce({
      id: "cmpreviewBad",
      url: "https://cdn.example.com/books/preview-bad.pdf",
    });

    let fetchCall = 0;
    global.fetch = jest.fn().mockImplementation(async () => {
      fetchCall += 1;
      if (fetchCall === 1) {
        // First fetch = preview validation. Body does NOT start with %PDF-.
        return new Response(Buffer.from("<html>not a pdf</html>", "latin1"));
      }
      // Subsequent fetch = cleaned HTML for the fallback render.
      return { ok: true, text: async () => "<!doctype html><html><body><p>x</p></body></html>" };
    }) as unknown as typeof fetch;

    mockGotenbergPageCountService.renderPdf.mockResolvedValue({
      pdfBuffer: Buffer.from("%PDF-fallback%", "latin1"),
      renderedPdfSha256: "a".repeat(64),
    });
    mockFilesService.saveGeneratedFile.mockResolvedValue({
      id: "cmfinalFallback",
      url: "https://cdn.example.com/books/final-fallback.pdf",
    });

    const job = {
      id: "bull-pdf-badpreview",
      name: JOB_NAMES.GENERATE_PDF,
      data: {
        jobRecordId: "cmpdfjob3",
        bookId: "cmbook3",
        orderId: "cmorder3",
        cleanedHtmlFileId: "cmhtml3",
        cleanedHtmlUrl: "https://cdn.example.com/books/cleaned.html",
        pageSize: "A4",
        fontSize: 11,
      },
      attemptsMade: 0,
      opts: { attempts: 3 },
    } as unknown as Job;

    const result = await processor.process(job);

    // Invalid preview → Gotenberg render IS used as the fallback.
    expect(mockGotenbergPageCountService.renderPdf).toHaveBeenCalledTimes(1);
    expect(result.finalPdfUrl).toBe("https://cdn.example.com/books/final-fallback.pdf");
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
