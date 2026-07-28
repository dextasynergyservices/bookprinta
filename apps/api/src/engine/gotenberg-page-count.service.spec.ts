/// <reference types="jest" />
import { ServiceUnavailableException } from "@nestjs/common";
import * as Sentry from "@sentry/node";

// Sentry's module exports are non-configurable, so jest.spyOn cannot patch them.
jest.mock("@sentry/node", () => ({ captureMessage: jest.fn() }));

const captureMessage = Sentry.captureMessage as unknown as jest.Mock;

import { GotenbergPageCountService } from "./gotenberg-page-count.service.js";

describe("GotenbergPageCountService", () => {
  let service: GotenbergPageCountService;
  const originalFetch = global.fetch;
  const originalUrl = process.env.GOTENBERG_URL;
  const originalBackupUrl = process.env.GOTENBERG_BACKUP_URL;
  const originalUsername = process.env.GOTENBERG_USERNAME;
  const originalPassword = process.env.GOTENBERG_PASSWORD;

  beforeEach(() => {
    service = new GotenbergPageCountService();
    delete process.env.GOTENBERG_BACKUP_URL;
    delete process.env.GOTENBERG_USERNAME;
    delete process.env.GOTENBERG_PASSWORD;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.GOTENBERG_URL = originalUrl;
    process.env.GOTENBERG_BACKUP_URL = originalBackupUrl;
    process.env.GOTENBERG_USERNAME = originalUsername;
    process.env.GOTENBERG_PASSWORD = originalPassword;
    jest.restoreAllMocks();
  });

  it("counts pages from Gotenberg-rendered PDF", async () => {
    process.env.GOTENBERG_URL = "http://gotenberg.local";
    const fakePdf = Buffer.from(
      "%PDF-1.4\n1 0 obj\n<< /Type /Page >>\nendobj\n2 0 obj\n<< /Type /Page >>\nendobj\n",
      "latin1"
    );

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () =>
        fakePdf.buffer.slice(fakePdf.byteOffset, fakePdf.byteOffset + fakePdf.byteLength),
    }) as unknown as typeof fetch;

    const result = await service.countPages({
      html: "<html><body><p>Hello</p></body></html>",
      pageSize: "A5",
      fontSize: 12,
    });

    expect(result.pageCount).toBe(2);
    expect(result.renderedPdfSha256).toHaveLength(64);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  // ── Phase 3 regression guard (docs/infra-cost-hardening-plan.md) ──────────
  // The billing page count comes from a SINGLE Gotenberg render that also
  // produces the preview/final PDF. This test locks in that reusing one render
  // for both purposes does not change the authoritative count: countAndRenderPreview
  // must return the same pageCount that a count-only render would, over the same
  // rendered bytes. If this ever diverges, the billing number could shift when we
  // stopped double-rendering — the exact failure the reuse optimization risks.
  it("countAndRenderPreview yields the same page count as countPages and returns the rendered buffer", async () => {
    process.env.GOTENBERG_URL = "http://gotenberg.local";
    const fakePdf = Buffer.from(
      "%PDF-1.4\n1 0 obj\n<< /Type /Page >>\nendobj\n2 0 obj\n<< /Type /Page >>\nendobj\n3 0 obj\n<< /Type /Page >>\nendobj\n",
      "latin1"
    );
    const toArrayBuffer = () =>
      fakePdf.buffer.slice(fakePdf.byteOffset, fakePdf.byteOffset + fakePdf.byteLength);

    const input = {
      html: "<html><body><p>Chapter one</p></body></html>",
      pageSize: "A5" as const,
      fontSize: 12 as const,
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => toArrayBuffer(),
    }) as unknown as typeof fetch;
    const countOnly = await service.countPages(input);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => toArrayBuffer(),
    }) as unknown as typeof fetch;
    const countAndRender = await service.countAndRenderPreview(input);

    // Same authoritative count from one render as from a dedicated count render.
    expect(countAndRender.pageCount).toBe(countOnly.pageCount);
    expect(countAndRender.pageCount).toBe(3);
    // Same bytes hash — the buffer handed to the preview/final path IS what was counted.
    expect(countAndRender.renderedPdfSha256).toBe(countOnly.renderedPdfSha256);
    // The buffer itself is returned for upload/promotion.
    expect(countAndRender.pdfBuffer.toString("latin1", 0, 5)).toBe("%PDF-");
    // Exactly one Gotenberg render per call — no hidden second render.
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  // A rejected credential silently downgrades every subsequent render to an
  // UNAUTHENTICATED call, and rendering keeps working — so without an explicit
  // capture this security regression looks exactly like normal operation.
  it("reports to Sentry when Gotenberg rejects basic auth and we fall back to no auth", async () => {
    process.env.GOTENBERG_URL = "http://gotenberg.local";
    process.env.GOTENBERG_USERNAME = "admin";
    process.env.GOTENBERG_PASSWORD = "secret";
    captureMessage.mockClear();

    const fakePdf = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Page >>\nendobj\n", "latin1");
    global.fetch = jest.fn().mockImplementation(async (_url, init) => {
      const hasAuth = Boolean(
        (init as RequestInit)?.headers &&
          ((init as RequestInit).headers as Record<string, string>).Authorization
      );
      if (hasAuth) {
        return { ok: false, status: 401, text: async () => "Unauthorized" } as Response;
      }
      return {
        ok: true,
        arrayBuffer: async () =>
          fakePdf.buffer.slice(fakePdf.byteOffset, fakePdf.byteOffset + fakePdf.byteLength),
      } as Response;
    }) as unknown as typeof fetch;

    const result = await service.countPages({
      html: "<html><body><p>Hello</p></body></html>",
      pageSize: "A5",
      fontSize: 12,
    });

    // Render still succeeds via the unauthenticated retry — that is the danger.
    expect(result.pageCount).toBe(1);
    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage.mock.calls[0][0]).toContain("rejected basic auth");
    expect(captureMessage.mock.calls[0][1]).toMatchObject({ level: "warning" });
  });

  it("stays SILENT when auth is accepted", async () => {
    process.env.GOTENBERG_URL = "http://gotenberg.local";
    process.env.GOTENBERG_USERNAME = "admin";
    process.env.GOTENBERG_PASSWORD = "secret";
    captureMessage.mockClear();

    const fakePdf = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Page >>\nendobj\n", "latin1");
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () =>
        fakePdf.buffer.slice(fakePdf.byteOffset, fakePdf.byteOffset + fakePdf.byteLength),
    }) as unknown as typeof fetch;

    await service.countPages({
      html: "<html><body><p>Hello</p></body></html>",
      pageSize: "A5",
      fontSize: 12,
    });

    expect(captureMessage).not.toHaveBeenCalled();
  });

  it("throws when GOTENBERG_URL is not configured", async () => {
    delete process.env.GOTENBERG_URL;

    await expect(
      service.countPages({
        html: "<html><body><p>Hello</p></body></html>",
        pageSize: "A4",
        fontSize: 11,
      })
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it("injects deterministic chapter page-break styles into the rendered HTML payload", async () => {
    process.env.GOTENBERG_URL = "http://gotenberg.local";
    const fakePdf = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Page >>\nendobj\n", "latin1");

    global.fetch = jest.fn().mockImplementation(async (_input, init) => {
      const form = init?.body as FormData;
      const file = form.get("files");
      expect(file).toBeDefined();
      const html = await (file as Blob).text();

      expect(html).toContain(".book-major-heading");
      expect(html).toContain("break-before: page");
      expect(html).toContain("section.book-section + section.book-section");

      return {
        ok: true,
        arrayBuffer: async () =>
          fakePdf.buffer.slice(fakePdf.byteOffset, fakePdf.byteOffset + fakePdf.byteLength),
      } as Response;
    }) as unknown as typeof fetch;

    await service.renderPdf({
      html: '<html><body><section class="book-section"><h1 class="book-major-heading">Chapter One</h1><p>Hello</p></section></body></html>',
      pageSize: "A5",
      fontSize: 12,
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  describe("cold-start retry behaviour (renderWithGotenberg)", () => {
    const fakePdf = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Page >>\nendobj\n", "latin1");

    beforeEach(() => {
      process.env.GOTENBERG_URL = "http://gotenberg.local";
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("retries on 502 with cold-start delay and succeeds on second attempt", async () => {
      let call = 0;
      global.fetch = jest.fn().mockImplementation(async () => {
        call += 1;
        if (call === 1) {
          return { ok: false, status: 502, text: async () => "Bad Gateway" } as Response;
        }
        return {
          ok: true,
          arrayBuffer: async () =>
            fakePdf.buffer.slice(fakePdf.byteOffset, fakePdf.byteOffset + fakePdf.byteLength),
        } as Response;
      }) as unknown as typeof fetch;

      const countPromise = service.countPages({
        html: "<html><body><p>Hello</p></body></html>",
        pageSize: "A5",
        fontSize: 12,
      });

      // Advance past the 5s cold-start retry delay
      await jest.advanceTimersByTimeAsync(6_000);

      const result = await countPromise;
      expect(result.pageCount).toBe(1);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it("retries on timeout (AbortError) with cold-start delay and succeeds on second attempt", async () => {
      let call = 0;
      global.fetch = jest.fn().mockImplementation(async (_url, init) => {
        call += 1;
        if (call === 1) {
          // Simulate the AbortController firing by aborting the signal
          const signal = (init as RequestInit).signal as AbortSignal;
          await new Promise<void>((_, reject) => {
            signal.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError"))
            );
          });
        }
        return {
          ok: true,
          arrayBuffer: async () =>
            fakePdf.buffer.slice(fakePdf.byteOffset, fakePdf.byteOffset + fakePdf.byteLength),
        } as Response;
      }) as unknown as typeof fetch;

      const countPromise = service.countPages({
        html: "<html><body><p>Hello</p></body></html>",
        pageSize: "A5",
        fontSize: 12,
      });

      // Trigger the render timeout (120s) then the 5s retry delay
      await jest.advanceTimersByTimeAsync(120_000 + 6_000);

      const result = await countPromise;
      expect(result.pageCount).toBe(1);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it("does NOT retry on 400 Bad Request (non-transient)", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => "Bad Request",
      }) as unknown as typeof fetch;

      await expect(
        service.countPages({
          html: "<html><body><p>Hello</p></body></html>",
          pageSize: "A5",
          fontSize: 12,
        })
      ).rejects.toThrow(ServiceUnavailableException);

      // Only 1 call — broke immediately without retrying
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it("exhausts all retries on persistent 502 and throws ServiceUnavailableException", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 502,
        text: async () => "Bad Gateway",
      }) as unknown as typeof fetch;

      // Start the count and immediately attach a settlement handler to prevent
      // PromiseRejectionHandledWarning (rejection handled asynchronously).
      // Promise.allSettled ensures we await the rejection from the moment it's created.
      const countPromise = service.countPages({
        html: "<html><body><p>Hello</p></body></html>",
        pageSize: "A5",
        fontSize: 12,
      });

      const [timerResult, countResult] = await Promise.allSettled([
        jest.advanceTimersByTimeAsync(25_000),
        countPromise,
      ]);

      expect(timerResult.status).toBe("fulfilled");
      expect(countResult.status).toBe("rejected");
      expect((countResult as PromiseRejectedResult).reason).toBeInstanceOf(
        ServiceUnavailableException
      );
      // 3 total attempts (1 initial + 2 retries) before giving up
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });
  });
});
