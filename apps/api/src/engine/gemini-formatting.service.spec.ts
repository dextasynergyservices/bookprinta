/// <reference types="jest" />
import { GeminiFormattingService } from "./gemini-formatting.service.js";

describe("GeminiFormattingService", () => {
  let service: GeminiFormattingService;
  const originalFetch = global.fetch;
  const originalApiKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    service = new GeminiFormattingService();
    process.env.GEMINI_API_KEY = "test-key";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = originalApiKey;
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
    expect(result.html).toContain("<h1>Chapter 1</h1>");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("chunks manuscripts larger than 30k words", async () => {
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
});
