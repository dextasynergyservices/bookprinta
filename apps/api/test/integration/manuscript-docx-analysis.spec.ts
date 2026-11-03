/// <reference types="jest" />
import AdmZip from "adm-zip";
import { ManuscriptAnalysisService } from "../../src/books/manuscript-analysis.service.js";

/**
 * The real mammoth parser on a valid DOCX. The unit spec mocks mammoth; this
 * checks that its actual output is what the page estimate's layout parsing
 * expects (one paragraph per block).
 *
 * The first import of mammoth loads ~460 modules. Alone that takes well under
 * a second, but in a parallel full run it can exceed Jest's 5 s default, so
 * this test sets its own timeout.
 */
const COLD_MAMMOTH_IMPORT_TIMEOUT_MS = 30_000;

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function validDocx(paragraphs: string[]): Buffer {
  const zip = new AdmZip();
  zip.addFile(
    "[Content_Types].xml",
    Buffer.from(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        "</Types>"
    )
  );
  zip.addFile(
    "_rels/.rels",
    Buffer.from(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        "</Relationships>"
    )
  );
  const body = paragraphs.map((text) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`).join("");
  zip.addFile(
    "word/document.xml",
    Buffer.from(`<w:document xmlns:w="${W}"><w:body>${body}</w:body></w:document>`)
  );
  return zip.toBuffer();
}

describe("ManuscriptAnalysisService with the real mammoth parser", () => {
  it(
    "reads each DOCX paragraph and the chapter headings",
    async () => {
      const prose =
        "The author gathered her notes and wrote steadily through the long evening, " +
        "certain that every chapter was bringing the finished book closer to the press.";
      const paragraphs: string[] = [];
      for (let chapter = 1; chapter <= 3; chapter += 1) {
        paragraphs.push(`Chapter ${chapter}`);
        for (let i = 0; i < 4; i += 1) paragraphs.push(prose);
      }

      const service = new ManuscriptAnalysisService();
      // The XML fallback would give the same layout, so prove mammoth parsed it.
      const mammoth = jest.spyOn(
        service as unknown as { tryExtractDocxWithMammoth: (b: Buffer) => Promise<string | null> },
        "tryExtractDocxWithMammoth"
      );

      const analysis = await service.analyzeManuscript(
        validDocx(paragraphs),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );

      await expect(mammoth.mock.results[0]?.value).resolves.toEqual(expect.any(String));
      expect(analysis.layout?.paragraphLengths).toEqual(paragraphs.map((p) => p.length));
      expect(analysis.layout?.sectionBreaks).toBe(3);
    },
    COLD_MAMMOTH_IMPORT_TIMEOUT_MS
  );
});
