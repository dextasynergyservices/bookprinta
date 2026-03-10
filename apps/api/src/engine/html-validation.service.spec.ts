/// <reference types="jest" />
import { HtmlValidationService } from "./html-validation.service.js";

describe("HtmlValidationService", () => {
  let service: HtmlValidationService;

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
