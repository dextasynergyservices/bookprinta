/// <reference types="jest" />

import { Test, type TestingModule } from "@nestjs/testing";
import AdmZip from "adm-zip";
import { ManuscriptAnalysisService } from "./manuscript-analysis.service.js";

// ---------------------------------------------------------------------------
// Helpers to create minimal DOCX (ZIP) fixtures
// ---------------------------------------------------------------------------

function createDocxBuffer(appXmlContent: string | null): Buffer {
  const zip = new AdmZip();
  // A DOCX must contain word/document.xml to pass integrity checks
  zip.addFile("word/document.xml", Buffer.from("<w:document />"));
  if (appXmlContent !== null) {
    zip.addFile("docProps/app.xml", Buffer.from(appXmlContent));
  }
  return zip.toBuffer();
}

function makeAppXml(pages: number): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
  <Pages>${pages}</Pages>
</Properties>`;
}

// ---------------------------------------------------------------------------
// PDF mocking — pdf-parse is dynamically imported, so we mock at module level
// ---------------------------------------------------------------------------

const mockPdfParse = jest.fn();
jest.mock("pdf-parse", () => mockPdfParse);

describe("ManuscriptAnalysisService", () => {
  let service: ManuscriptAnalysisService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ManuscriptAnalysisService],
    }).compile();

    service = module.get<ManuscriptAnalysisService>(ManuscriptAnalysisService);
    jest.clearAllMocks();
  });

  describe("extractDocumentPageCount", () => {
    describe("PDF files", () => {
      it("returns numpages from pdf-parse result", async () => {
        mockPdfParse.mockResolvedValue({ numpages: 42 });

        const buffer = Buffer.from("%PDF-1.4 dummy content");
        const result = await service.extractDocumentPageCount(buffer, "application/pdf");

        expect(result).toBe(42);
      });

      it("returns null when pdf-parse returns numpages = 0", async () => {
        mockPdfParse.mockResolvedValue({ numpages: 0 });

        const buffer = Buffer.from("%PDF-1.4 dummy content");
        const result = await service.extractDocumentPageCount(buffer, "application/pdf");

        expect(result).toBeNull();
      });

      it("returns null when pdf-parse throws", async () => {
        mockPdfParse.mockRejectedValue(new Error("corrupt PDF"));

        const buffer = Buffer.from("%PDF-1.4 dummy content");
        const result = await service.extractDocumentPageCount(buffer, "application/pdf");

        expect(result).toBeNull();
      });

      it("returns null when numpages is not a number", async () => {
        mockPdfParse.mockResolvedValue({ numpages: undefined });

        const buffer = Buffer.from("%PDF-1.4 dummy content");
        const result = await service.extractDocumentPageCount(buffer, "application/pdf");

        expect(result).toBeNull();
      });
    });

    describe("DOCX files", () => {
      const DOCX_MIME =
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" as const;

      it("returns page count from docProps/app.xml", async () => {
        const buffer = createDocxBuffer(makeAppXml(128));
        const result = await service.extractDocumentPageCount(buffer, DOCX_MIME);

        expect(result).toBe(128);
      });

      it("returns null when docProps/app.xml is missing", async () => {
        const buffer = createDocxBuffer(null);
        const result = await service.extractDocumentPageCount(buffer, DOCX_MIME);

        expect(result).toBeNull();
      });

      it("returns null when <Pages> element is missing from app.xml", async () => {
        const xml = `<?xml version="1.0"?><Properties><Application>Microsoft Word</Application></Properties>`;
        const buffer = createDocxBuffer(xml);
        const result = await service.extractDocumentPageCount(buffer, DOCX_MIME);

        expect(result).toBeNull();
      });

      it("returns null when <Pages> is zero", async () => {
        const buffer = createDocxBuffer(makeAppXml(0));
        const result = await service.extractDocumentPageCount(buffer, DOCX_MIME);

        expect(result).toBeNull();
      });

      it("returns null for a non-ZIP buffer", async () => {
        const buffer = Buffer.from("This is not a ZIP file");
        const result = await service.extractDocumentPageCount(buffer, DOCX_MIME);

        expect(result).toBeNull();
      });
    });
  });
});
