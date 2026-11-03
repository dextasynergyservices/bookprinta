/// <reference types="jest" />
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * The real pdf-parse on a real (generated) PDF. The unit spec mocks pdf-parse;
 * this is what catches an API change like the 1.x -> 2.x one, which made every
 * PDF silently fall back to a heuristic extractor.
 *
 * pdf.js loads its worker with a dynamic import(), which Jest's module sandbox
 * does not support, so the real library runs in a child process (plain Node or
 * Bun, like production). Its actual output is then fed to the service.
 */
const REAL_PARSE_TIMEOUT_MS = 60_000;

type RealPdfText = { total: number; pages: Array<{ text: string; num: number }> };

let realPdfText: RealPdfText | null = null;

jest.mock("pdf-parse", () => ({
  PDFParse: jest.fn().mockImplementation(() => ({
    getText: async () => realPdfText,
    destroy: async () => undefined,
  })),
}));

import { ManuscriptAnalysisService } from "../../src/books/manuscript-analysis.service.js";

/** A minimal, valid PDF: one Helvetica text block per page, one line per entry. */
function buildPdf(pages: string[][]): Buffer {
  const escapePdfText = (text: string) => text.replace(/[\\()]/g, (char) => `\\${char}`);
  const objects: string[] = [];
  const pageIds: number[] = [];
  // 1: catalog, 2: page tree, 3: font; then a page object and its content per page.
  pages.forEach((lines, index) => {
    const pageId = 4 + index * 2;
    const contentId = pageId + 1;
    pageIds.push(pageId);
    const stream = `BT /F1 12 Tf 16 TL 72 760 Td ${lines.map((line) => `(${escapePdfText(line)}) Tj T*`).join(" ")} ET`;
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(pdf, "latin1");
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

/** Run the installed pdf-parse in a child process and return its getText() result. */
function parseWithRealPdfParse(pdf: Buffer): RealPdfText {
  const dir = mkdtempSync(join(tmpdir(), "bp-pdf-"));
  try {
    const pdfPath = join(dir, "manuscript.pdf");
    const scriptPath = join(dir, "parse.mjs");
    writeFileSync(pdfPath, pdf);
    const pdfParseUrl = pathToFileURL(require.resolve("pdf-parse")).href;
    writeFileSync(
      scriptPath,
      [
        'import { readFileSync } from "node:fs";',
        `const { PDFParse } = await import(${JSON.stringify(pdfParseUrl)});`,
        `const parser = new PDFParse({ data: readFileSync(${JSON.stringify(pdfPath)}) });`,
        "const result = await parser.getText();",
        "await parser.destroy();",
        "process.stdout.write(JSON.stringify({ total: result.total, pages: result.pages }));",
      ].join("\n")
    );
    return JSON.parse(execFileSync(process.execPath, [scriptPath], { encoding: "utf8" }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("ManuscriptAnalysisService with the real pdf-parse", () => {
  it(
    "reads page text and count, and drops the running header and page numbers",
    async () => {
      const topics = ["harvest", "river", "market"];
      const pdf = buildPdf(
        topics.map((topic, index) => [
          "MY FIRST BOOK",
          `The ${topic} opened this chapter quietly.`,
          `Readers remembered the ${topic} for years.`,
          `${index + 1}`,
        ])
      );

      realPdfText = parseWithRealPdfParse(pdf);

      // The contract the service relies on: per-page text and a page total.
      expect(realPdfText.total).toBe(3);
      expect(realPdfText.pages).toHaveLength(3);
      expect(realPdfText.pages[0].text).toContain("The harvest opened this chapter quietly.");

      const service = new ManuscriptAnalysisService();
      const analysis = await service.analyzeManuscript(pdf, "application/pdf");
      const text = await service.extractText(pdf, "application/pdf");

      expect(await service.extractDocumentPageCount(pdf, "application/pdf")).toBe(3);
      // Two body lines of 6 words per page; header and page numbers dropped.
      expect(analysis.wordCount).toBe(36);
      expect(text).not.toContain("MY FIRST BOOK");
      for (const topic of topics) expect(text).toContain(`The ${topic} opened this chapter`);
      expect(analysis.layout).not.toBeNull();
    },
    REAL_PARSE_TIMEOUT_MS
  );
});
