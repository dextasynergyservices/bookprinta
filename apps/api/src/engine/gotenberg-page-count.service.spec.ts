/// <reference types="jest" />
import { ServiceUnavailableException } from "@nestjs/common";
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
});
