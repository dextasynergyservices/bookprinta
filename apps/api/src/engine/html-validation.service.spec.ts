/// <reference types="jest" />
import { HtmlValidationService } from "./html-validation.service.js";

/** Loading htmlparser2 the first time; slow only when every Jest worker is busy. */
const PARSER_LOAD_TIMEOUT_MS = 30_000;

describe("HtmlValidationService", () => {
  let service: HtmlValidationService;

  // The service imports htmlparser2 on first use. Load it here so that cost is
  // not charged to (and cannot time out) whichever test happens to run first.
  beforeAll(async () => {
    await import("htmlparser2");
  }, PARSER_LOAD_TIMEOUT_MS);

  beforeEach(() => {
    service = new HtmlValidationService();
  });

  it("accepts valid semantic HTML and returns output word count", async () => {
    const result = await service.validateFormattedHtml({
      html: "<!doctype html><html><body><h1>Chapter 1</h1><p>Hello world text here.</p></body></html>",
      inputWordCount: 6,
    });

    expect(result.outputWordCount).toBeGreaterThan(0);
  });

  it("rejects script tags in AI output", async () => {
    await expect(
      service.validateFormattedHtml({
        html: "<html><body><script>alert('x')</script><p>Hello</p></body></html>",
        inputWordCount: 1,
      })
    ).rejects.toThrow("forbidden <script>");
  });

  it("rejects output when word-count drift exceeds 20%", async () => {
    await expect(
      service.validateFormattedHtml({
        html: "<html><body><p>Only few words.</p></body></html>",
        inputWordCount: 100,
      })
    ).rejects.toThrow("word count drift");
  });
});
