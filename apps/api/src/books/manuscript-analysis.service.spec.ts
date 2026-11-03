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
// PDF mocking — pdf-parse 2.x, in its real shape: a PDFParse class whose
// getText() returns per-page text. (The 1.x shape, a parse function, is what
// these mocks used to imitate while the real 2.x import silently failed.) The
// real library is covered by test/integration/manuscript-pdf-analysis.spec.ts.
// ---------------------------------------------------------------------------

const mockGetText = jest.fn();
const mockDestroy = jest.fn();
const mockPdfParseConstructor = jest.fn();
jest.mock("pdf-parse", () => ({
  PDFParse: jest.fn().mockImplementation((options: unknown) => {
    mockPdfParseConstructor(options);
    return { getText: mockGetText, destroy: mockDestroy };
  }),
}));

/** pdf-parse 2.x getText() result: per-page text, plus a joined text with page markers. */
function pdfTextResult(pages: string[]) {
  return {
    pages: pages.map((text, index) => ({ text, num: index + 1 })),
    total: pages.length,
    text: pages
      .map((text, index) => `${text}\n\n-- ${index + 1} of ${pages.length} --`)
      .join("\n\n"),
  };
}

const PDF = "application/pdf" as const;

// mammoth is dynamically imported too. Mocked so these tests do not depend on
// loading the real library (~460 modules, which under a busy parallel run can
// exceed the 5 s test timeout). The real parser is covered by
// test/integration/manuscript-docx-analysis.spec.ts.
const mockExtractRawText = jest.fn();
jest.mock("mammoth", () => ({ extractRawText: mockExtractRawText }));

/** mammoth's raw-text output: one paragraph per block, separated by a blank line. */
function mammothText(paragraphs: Array<{ text: string }>): { value: string } {
  return { value: paragraphs.map((paragraph) => paragraph.text).join("\n\n") };
}

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
      beforeEach(() => {
        mockDestroy.mockResolvedValue(undefined);
      });

      it("returns the page count from pdf-parse", async () => {
        mockGetText.mockResolvedValue({ ...pdfTextResult(["One"]), total: 42 });

        const result = await service.extractDocumentPageCount(Buffer.from("%PDF-1.4"), PDF);

        expect(result).toBe(42);
        expect(mockPdfParseConstructor).toHaveBeenCalledWith({ data: expect.any(Buffer) });
      });

      it("falls back to counting page objects when pdf-parse reports no pages", async () => {
        mockGetText.mockResolvedValue({ ...pdfTextResult([]), total: 0 });

        const pdf = Buffer.from("%PDF-1.4 /Type /Page x /Type /Page y /Type /Pages z");
        const result = await service.extractDocumentPageCount(pdf, PDF);

        expect(result).toBe(2);
      });

      it("returns null when pdf-parse throws and no page objects are found", async () => {
        mockGetText.mockRejectedValue(new Error("corrupt PDF"));

        const result = await service.extractDocumentPageCount(Buffer.from("%PDF-1.4"), PDF);

        expect(result).toBeNull();
      });

      it("always releases the parser, even when parsing fails", async () => {
        mockGetText.mockRejectedValue(new Error("corrupt PDF"));

        await service.extractDocumentPageCount(Buffer.from("%PDF-1.4"), PDF);

        expect(mockDestroy).toHaveBeenCalledTimes(1);
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

  describe("PDF text", () => {
    beforeEach(() => {
      mockDestroy.mockResolvedValue(undefined);
    });

    it("counts words from the page texts, not pdf-parse's page markers", async () => {
      mockGetText.mockResolvedValue(
        pdfTextResult([PROSE_SENTENCE.repeat(2).trim(), PROSE_SENTENCE.repeat(2).trim()])
      );

      const analysis = await service.analyzeManuscript(Buffer.from("%PDF-1.4"), PDF);

      // 25 words per sentence, four sentences; "-- 1 of 2 --" would add 3 per page.
      expect(analysis.wordCount).toBe(100);
    });

    it("drops running headers, footers and page numbers repeated on most pages", async () => {
      const topics = ["harvest", "river", "market", "lantern"];
      const page = (n: number) =>
        [
          "THE GOOD NEWS",
          `The ${topics[n - 1]} opened the chapter on a quiet note.`,
          PROSE_SENTENCE.trim(),
          `Every reader remembered the ${topics[n - 1]} long afterwards.`,
          `Page ${n}`,
        ].join("\n");
      mockGetText.mockResolvedValue(pdfTextResult([page(1), page(2), page(3), page(4)]));

      const text = await service.extractText(Buffer.from("%PDF-1.4"), PDF);

      expect(text).not.toContain("THE GOOD NEWS");
      expect(text).not.toMatch(/Page \d/);
      // Body text is kept, including the line repeated mid-page on every page.
      for (const topic of topics) expect(text).toContain(`The ${topic} opened`);
      expect(text.split(PROSE_SENTENCE.trim()).length - 1).toBe(4);
    });

    it("rebuilds paragraphs from printed lines and re-joins hyphenated words", async () => {
      const full = "x".repeat(60);
      mockGetText.mockResolvedValue(
        pdfTextResult([
          [
            "CHAPTER 1",
            `${full} wonder-`,
            `ful ${full}`,
            "Short last line.",
            "CHAPTER 2",
            `${full} ${full}`,
            "Another end.",
          ].join("\n"),
        ])
      );

      const analysis = await service.analyzeManuscript(Buffer.from("%PDF-1.4"), PDF);
      const text = await service.extractText(Buffer.from("%PDF-1.4"), PDF);

      // Two headings and two paragraphs of three and two printed lines.
      expect(analysis.layout?.paragraphLengths).toHaveLength(4);
      expect(analysis.layout?.sectionBreaks).toBe(2);
      expect(text).toContain("wonderful");
    });

    it("parses a PDF once for both the text and the page count", async () => {
      mockGetText.mockResolvedValue(pdfTextResult([PROSE_SENTENCE.trim()]));
      const upload = Buffer.from("%PDF-1.4");

      await service.analyzeManuscript(upload, PDF);
      await service.extractDocumentPageCount(upload, PDF);

      expect(mockPdfParseConstructor).toHaveBeenCalledTimes(1);
    });

    it("rejects a PDF with no extractable text as scanned", async () => {
      mockGetText.mockResolvedValue(pdfTextResult(["", ""]));

      await expect(service.analyzeManuscript(Buffer.from("%PDF-1.4"), PDF)).rejects.toThrow(
        "scanned image"
      );
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

    function threeChapters() {
      const paragraphs: Array<{ text: string; style?: string }> = [];
      for (let chapter = 1; chapter <= 3; chapter += 1) {
        paragraphs.push({ text: `Chapter ${chapter}` });
        for (let i = 0; i < 4; i += 1) paragraphs.push({ text: PROSE_SENTENCE.repeat(3) });
      }
      return paragraphs;
    }

    it("reads paragraphs and chapter headings from mammoth's text", async () => {
      const paragraphs = threeChapters();
      mockExtractRawText.mockResolvedValue(mammothText(paragraphs));

      const analysis = await service.analyzeManuscript(createManuscriptDocx(paragraphs), DOCX);

      expect(mockExtractRawText).toHaveBeenCalledTimes(1);
      expect(analysis.layout?.sectionBreaks).toBe(3);
      expect(analysis.layout?.paragraphLengths).toHaveLength(15);
      expect(analysis.wordCount).toBeGreaterThan(300);
    });

    it("gives the same layout from the document XML when mammoth cannot read the file", async () => {
      const paragraphs = threeChapters();
      mockExtractRawText.mockRejectedValue(new Error("Could not find file in options"));

      const analysis = await service.analyzeManuscript(createManuscriptDocx(paragraphs), DOCX);

      expect(analysis.layout?.sectionBreaks).toBe(3);
      expect(analysis.layout?.paragraphLengths).toHaveLength(15);
    });

    it("falls back to Word heading styles when there are no chapter keywords", async () => {
      const paragraphs = [];
      for (let section = 1; section <= 4; section += 1) {
        paragraphs.push({ text: `Walking in grace ${section}`, style: "Heading1" });
        paragraphs.push({ text: PROSE_SENTENCE.repeat(4) });
      }
      mockExtractRawText.mockResolvedValue(mammothText(paragraphs));

      const analysis = await service.analyzeManuscript(createManuscriptDocx(paragraphs), DOCX);

      expect(analysis.layout?.sectionBreaks).toBe(4);
    });
  });
});
