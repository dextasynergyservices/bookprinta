/// <reference types="jest" />
import { GeminiFormattingService } from "./gemini-formatting.service.js";

describe("GeminiFormattingService", () => {
  let service: GeminiFormattingService;
  const originalFetch = global.fetch;
  const originalApiKey = process.env.GEMINI_API_KEY;
  const originalModel = process.env.GEMINI_MODEL;
  const originalFallbackModel = process.env.GEMINI_FALLBACK_MODEL;
  const originalRequestTimeout = process.env.GEMINI_REQUEST_TIMEOUT_MS;

  beforeEach(() => {
    service = new GeminiFormattingService();
    process.env.GEMINI_API_KEY = "test-key";
    delete process.env.GEMINI_MODEL;
    delete process.env.GEMINI_FALLBACK_MODEL;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = originalApiKey;
    process.env.GEMINI_MODEL = originalModel;
    process.env.GEMINI_FALLBACK_MODEL = originalFallbackModel;
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

  it("retries timed-out chunks with fallback model when GEMINI_FALLBACK_MODEL is set", async () => {
    process.env.GEMINI_MODEL = "gemini-2.5-flash";
    process.env.GEMINI_FALLBACK_MODEL = "gemini-2.5-flash-lite";
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

  it("does not use fallback model when GEMINI_FALLBACK_MODEL is not set", async () => {
    process.env.GEMINI_MODEL = "gemini-2.5-flash";
    delete process.env.GEMINI_FALLBACK_MODEL;
    global.fetch = jest
      .fn()
      .mockRejectedValueOnce({ name: "AbortError" })
      .mockRejectedValueOnce({ name: "AbortError" }) as unknown as typeof fetch;

    await expect(
      service.formatManuscript({
        text: "Chapter 1 Hello world.",
        pageSize: "A5",
        fontSize: 12,
        bookId: "cmbook-no-fallback",
      })
    ).rejects.toThrow("Gemini request timed out after");

    // Only 2 attempts on the primary model, no fallback
    expect(global.fetch).toHaveBeenCalledTimes(2);
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
  });

  it("handles 429 rate limit by waiting and retrying once without burning retry attempts", async () => {
    process.env.GEMINI_MODEL = "gemini-2.5-flash-lite";
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers({ "retry-after": "1" }),
        text: async () => '{"error":{"message":"Rate limit exceeded"}}',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: "<p>After rate limit.</p>" }] } }],
        }),
      }) as unknown as typeof fetch;

    const result = await service.formatManuscript({
      text: "Chapter 1 Hello world.",
      pageSize: "A5",
      fontSize: 12,
      bookId: "cmbook-429",
    });

    expect(result.html).toContain("After rate limit.");
    // 2 fetch calls: first 429, then successful retry
    expect(global.fetch).toHaveBeenCalledTimes(2);
    // Both calls use the same model (no model switch on 429)
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
  });

  it("fails on repeated 429 with rate-limit message (does not show quota exhausted)", async () => {
    process.env.GEMINI_MODEL = "gemini-2.5-flash-lite";
    // Stub delay to make test instant (actual waits would be 60-120s)
    const delaySpy = jest.fn<Promise<void>, [number]>().mockResolvedValue(undefined);
    Object.defineProperty(service, "delay", { value: delaySpy });
    // Mock enough 429 responses to exhaust all retry layers:
    // MAX_429_RETRIES (3) + 1 initial = 4 per transient attempt,
    // MAX_TRANSIENT_RETRIES_PER_MODEL (2) = 8 total fetches.
    const make429 = () => ({
      ok: false,
      status: 429,
      headers: new Headers({ "retry-after": "1" }),
      text: async () => '{"error":{"message":"Rate limit exceeded","status":"RESOURCE_EXHAUSTED"}}',
    });
    const mockFetch = jest.fn().mockResolvedValue(make429());
    global.fetch = mockFetch as unknown as typeof fetch;

    await expect(
      service.formatManuscript({
        text: "Chapter 1 Hello world.",
        pageSize: "A5",
        fontSize: 12,
        bookId: "cmbook-429-double",
      })
    ).rejects.toThrow("rate limited");

    // Should have retried multiple times, not given up after 1
    expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(4);
  });
});
