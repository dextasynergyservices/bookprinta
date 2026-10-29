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

function makeDocumentXml(paragraphs: Array<{ text: string; style?: string }>): string {
  const body = paragraphs
    .map(({ text, style }) => {
      const props = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : "";
      return `<w:p>${props}<w:r><w:t>${text}</w:t></w:r></w:p>`;
    })
    .join("");
  return `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;
}

function createManuscriptDocx(paragraphs: Array<{ text: string; style?: string }>): Buffer {
  const zip = new AdmZip();
  zip.addFile("word/document.xml", Buffer.from(makeDocumentXml(paragraphs)));
  return zip.toBuffer();
}

const PROSE_SENTENCE =
  "The author gathered her notes and wrote steadily through the long evening, " +
  "certain that every chapter was bringing the finished book closer to the press. ";

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

  describe("estimatePages", () => {
    const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

    it("returns the authoritative count unchanged when the settings match", () => {
      expect(
        service.estimatePages({
          wordCount: 34_046,
          pageSize: "A5",
          fontSize: 12,
          reference: { pageCount: 188, pageSize: "A5", fontSize: 12 },
        })
      ).toBe(188);
    });

    // Measured: a 34,046-word devotional rendered at 188 pages (A5/12pt) and
    // 104 pages (A4/12pt) through the billing template.
    it("rescales an authoritative count to new settings", () => {
      const estimate = service.estimatePages({
        wordCount: 34_046,
        pageSize: "A4",
        fontSize: 12,
        reference: { pageCount: 188, pageSize: "A5", fontSize: 12 },
      });
      expect(estimate).toBeGreaterThanOrEqual(94);
      expect(estimate).toBeLessThanOrEqual(114);
    });

    // Measured: 90,492 words of Pride and Prejudice rendered at 375 pages (A5/12pt).
    it("estimates from word count alone within 10% of a measured render", () => {
      const estimate = service.estimatePages({ wordCount: 90_492, pageSize: "A5", fontSize: 12 });
      expect(estimate).toBeGreaterThanOrEqual(338);
      expect(estimate).toBeLessThanOrEqual(413);
    });

    it("grows with font size and shrinks on a larger page", () => {
      const layout = { paragraphLengths: Array(800).fill(450), sectionBreaks: 20 };
      const pages = (pageSize: "A4" | "A5", fontSize: 11 | 12 | 14) =>
        service.estimatePages({ wordCount: 60_000, pageSize, fontSize, layout });

      expect(pages("A5", 11)).toBeLessThan(pages("A5", 12));
      expect(pages("A5", 12)).toBeLessThan(pages("A5", 14));
      expect(pages("A4", 12)).toBeLessThan(pages("A5", 12));
    });

    it("counts short paragraphs (lists, headings) as whole lines", () => {
      const words = 10_000;
      const prose = { paragraphLengths: Array(100).fill(600), sectionBreaks: 4 };
      const lists = { paragraphLengths: Array(1200).fill(50), sectionBreaks: 4 };

      expect(
        service.estimatePages({ wordCount: words, pageSize: "A5", fontSize: 12, layout: lists })
      ).toBeGreaterThan(
        service.estimatePages({ wordCount: words, pageSize: "A5", fontSize: 12, layout: prose })
      );
    });

    it("adds page-break overhead for each section", () => {
      const base = { paragraphLengths: Array(400).fill(500) };
      const few = service.estimatePages({
        wordCount: 35_000,
        pageSize: "A4",
        fontSize: 12,
        layout: { ...base, sectionBreaks: 2 },
      });
      const many = service.estimatePages({
        wordCount: 35_000,
        pageSize: "A4",
        fontSize: 12,
        layout: { ...base, sectionBreaks: 30 },
      });
      expect(many - few).toBeGreaterThanOrEqual(15);
    });

    it("reads paragraphs and chapter headings from a DOCX", async () => {
      const paragraphs = [];
      for (let chapter = 1; chapter <= 3; chapter += 1) {
        paragraphs.push({ text: `Chapter ${chapter}` });
        for (let i = 0; i < 4; i += 1) paragraphs.push({ text: PROSE_SENTENCE.repeat(3) });
      }

      const analysis = await service.analyzeManuscript(createManuscriptDocx(paragraphs), DOCX);

      expect(analysis.layout?.sectionBreaks).toBe(3);
      expect(analysis.layout?.paragraphLengths).toHaveLength(15);
      expect(analysis.wordCount).toBeGreaterThan(300);
    });

    it("falls back to Word heading styles when there are no chapter keywords", async () => {
      const paragraphs = [];
      for (let section = 1; section <= 4; section += 1) {
        paragraphs.push({ text: `Walking in grace ${section}`, style: "Heading1" });
        paragraphs.push({ text: PROSE_SENTENCE.repeat(4) });
      }

      const analysis = await service.analyzeManuscript(createManuscriptDocx(paragraphs), DOCX);

      expect(analysis.layout?.sectionBreaks).toBe(4);
    });
  });
});
