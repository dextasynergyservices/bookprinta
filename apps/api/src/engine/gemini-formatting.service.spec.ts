/// <reference types="jest" />
import { GeminiFormattingService } from "./gemini-formatting.service.js";

describe("GeminiFormattingService", () => {
  let service: GeminiFormattingService;
  const originalFetch = global.fetch;
  const originalApiKey = process.env.GEMINI_API_KEY;
  const originalModel = process.env.GEMINI_MODEL;
  const originalRequestTimeout = process.env.GEMINI_REQUEST_TIMEOUT_MS;

  beforeEach(() => {
    service = new GeminiFormattingService();
    process.env.GEMINI_API_KEY = "test-key";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = originalApiKey;
    process.env.GEMINI_MODEL = originalModel;
    process.env.GEMINI_REQUEST_TIMEOUT_MS = originalRequestTimeout;
    jest.restoreAllMocks();
  });

  it("formats a manuscript chunk and wraps it in a full HTML document", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "<h1>Chapter 1</h1><p>Hello world.</p>" }] } }],
      }),
    }) as unknown as typeof fetch;

    const result = await service.formatManuscript({
      text: "Chapter 1 Hello world.",
      pageSize: "A5",
      fontSize: 12,
      bookId: "cmbook1",
    });

    expect(result.chunkCount).toBe(1);
    expect(result.html).toContain("<body>");
    expect(result.html).toContain(
      '<h1 class="book-major-heading" data-book-heading="major">Chapter 1</h1>'
    );
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "x-goog-api-key": "test-key",
        }),
      })
    );
  });

  it("chunks manuscripts larger than 15k words", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "<p>Chunk output.</p>" }] } }],
      }),
    }) as unknown as typeof fetch;

    const largeText = `Chapter 1 ${"word ".repeat(16_000)} Chapter 2 ${"word ".repeat(16_000)}`;
    const result = await service.formatManuscript({
      text: largeText,
      pageSize: "A4",
      fontSize: 11,
      bookId: "cmbook2",
    });

    expect(result.chunkCount).toBeGreaterThan(1);
    expect(global.fetch).toHaveBeenCalledTimes(result.chunkCount);
  });

  it("fails fast when Gemini exceeds the configured request timeout", async () => {
    process.env.GEMINI_REQUEST_TIMEOUT_MS = "45000";
    global.fetch = jest.fn().mockRejectedValue({ name: "AbortError" }) as unknown as typeof fetch;

    await expect(
      service.formatManuscript({
        text: "Chapter 1 Hello world.",
        pageSize: "A5",
        fontSize: 12,
        bookId: "cmbook-timeout",
      })
    ).rejects.toThrow("Gemini request timed out after 45000ms.");
  });

  it("retries timed-out chunks with flash-lite before failing", async () => {
    process.env.GEMINI_MODEL = "gemini-2.5-flash";
    global.fetch = jest
      .fn()
      .mockRejectedValueOnce({ name: "AbortError" })
      .mockRejectedValueOnce({ name: "AbortError" })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: "<p>Fallback output.</p>" }] } }],
        }),
      }) as unknown as typeof fetch;

    const result = await service.formatManuscript({
      text: "Chapter 1 Hello world.",
      pageSize: "A5",
      fontSize: 12,
      bookId: "cmbook-fallback",
    });

    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      expect.any(Object)
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      expect.any(Object)
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      3,
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent",
      expect.any(Object)
    );
    expect(result.html).toContain("Fallback output.");
    expect(result.model).toBe("gemini-2.5-flash-lite");
  });

  it("does not fall back from flash-lite to flash when transient failures persist", async () => {
    process.env.GEMINI_MODEL = "gemini-2.5-flash-lite";
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () =>
          '{"error":{"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}',
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () =>
          '{"error":{"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}',
      }) as unknown as typeof fetch;

    await expect(
      service.formatManuscript({
        text: "Chapter 1 Hello world.",
        pageSize: "A5",
        fontSize: 12,
        bookId: "cmbook-503-fallback",
      })
    ).rejects.toThrow("Gemini request failed (503)");

    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent",
      expect.any(Object)
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent",
      expect.any(Object)
    );
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("promotes chapter-like labels into major headings and decorates major sections", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: "<p>TABLE OF CONTENTS</p><p>Intro copy.</p><h2>Chapter Two</h2><p>Body copy.</p><section><h3>Reflection</h3><p>Nested text.</p></section>",
                },
              ],
            },
          },
        ],
      }),
    }) as unknown as typeof fetch;

    const result = await service.formatManuscript({
      text: "Table of Contents Intro copy. Chapter Two Body copy. Reflection Nested text.",
      pageSize: "A5",
      fontSize: 12,
      bookId: "cmbook-structure",
    });

    expect(result.html).toContain(
      '<h1 class="book-major-heading" data-book-heading="major">TABLE OF CONTENTS</h1>'
    );
    expect(result.html).toContain(
      '<h2 class="book-major-heading" data-book-heading="major">Chapter Two</h2>'
    );
    expect(result.html).toContain('<section class="book-section">');
    expect(result.html).toContain('<h3 class="book-subheading">Reflection</h3>');
  });
});
