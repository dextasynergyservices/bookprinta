/// <reference types="jest" />
import { sanitizeHtmlContent } from "./sanitize-html.js";

describe("sanitizeHtmlContent", () => {
  it("preserves allowed tags and attributes", () => {
    const html =
      "<h1>Title</h1><p>Text with <strong>bold</strong> and <em>italic</em>.</p>" +
      '<a href="https://example.com" target="_blank" rel="noopener">Link</a>' +
      '<img src="https://example.com/img.jpg" alt="Photo" width="100" height="80">';

    const result = sanitizeHtmlContent(html);

    expect(result).toContain("<h1>Title</h1>");
    expect(result).toContain("<strong>bold</strong>");
    expect(result).toContain("<em>italic</em>");
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('target="_blank"');
    expect(result).toContain('rel="noopener"');
    expect(result).toContain('src="https://example.com/img.jpg"');
    expect(result).toContain('alt="Photo"');
  });

  it("strips <script> tags entirely", () => {
    const html = '<p>Hello</p><script>alert("xss")</script><p>World</p>';
    const result = sanitizeHtmlContent(html);

    expect(result).not.toContain("<script");
    expect(result).not.toContain("alert");
    expect(result).toContain("<p>Hello</p>");
    expect(result).toContain("<p>World</p>");
  });

  it("strips <style> tags", () => {
    const html = "<style>body { display: none }</style><p>Content</p>";
    const result = sanitizeHtmlContent(html);

    expect(result).not.toContain("<style");
    expect(result).not.toContain("display");
    expect(result).toContain("<p>Content</p>");
  });

  it("strips inline event handlers", () => {
    const html = '<p onclick="alert(1)">Click me</p>';
    const result = sanitizeHtmlContent(html);

    expect(result).not.toContain("onclick");
    expect(result).toContain("<p>Click me</p>");
  });

  it("strips javascript: href scheme", () => {
    // sanitize-html removes disallowed schemes
    const html = '<a href="javascript:alert(1)">Bad link</a>';
    const result = sanitizeHtmlContent(html);

    expect(result).not.toContain("javascript:");
  });

  it("strips data: scheme from images", () => {
    const html = '<img src="data:image/png;base64,AAAA">';
    const result = sanitizeHtmlContent(html);

    expect(result).not.toContain("data:");
  });

  it("strips disallowed tags like iframe, form, input", () => {
    const html =
      '<iframe src="https://evil.com"></iframe>' +
      '<form action="/steal"><input type="text"></form>' +
      "<p>Safe</p>";
    const result = sanitizeHtmlContent(html);

    expect(result).not.toContain("<iframe");
    expect(result).not.toContain("<form");
    expect(result).not.toContain("<input");
    expect(result).toContain("<p>Safe</p>");
  });

  it("strips disallowed attributes from allowed tags", () => {
    const html = '<p class="red" style="color:red" id="p1">Text</p>';
    const result = sanitizeHtmlContent(html);

    expect(result).not.toContain("class=");
    expect(result).not.toContain("style=");
    expect(result).not.toContain("id=");
    expect(result).toContain("<p>Text</p>");
  });

  it("preserves list elements", () => {
    const html = "<ul><li>One</li><li>Two</li></ul><ol><li>A</li></ol>";
    const result = sanitizeHtmlContent(html);

    expect(result).toContain("<ul>");
    expect(result).toContain("<li>One</li>");
    expect(result).toContain("<ol>");
  });

  it("preserves blockquote, pre, and code", () => {
    const html = "<blockquote>Quote</blockquote><pre><code>const x = 1;</code></pre>";
    const result = sanitizeHtmlContent(html);

    expect(result).toContain("<blockquote>Quote</blockquote>");
    expect(result).toContain("<pre>");
    expect(result).toContain("<code>const x = 1;</code>");
  });

  it("preserves heading levels h1-h6", () => {
    const headings = Array.from({ length: 6 }, (_, i) => `<h${i + 1}>H${i + 1}</h${i + 1}>`).join(
      ""
    );
    const result = sanitizeHtmlContent(headings);

    for (let i = 1; i <= 6; i++) {
      expect(result).toContain(`<h${i}>H${i}</h${i}>`);
    }
  });

  it("returns empty string for empty input", () => {
    expect(sanitizeHtmlContent("")).toBe("");
  });

  it("returns plain text when no tags are present", () => {
    expect(sanitizeHtmlContent("Hello World")).toBe("Hello World");
  });
});
