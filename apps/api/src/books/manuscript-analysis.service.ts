import { gunzipSync, inflateRawSync, inflateSync } from "node:zlib";
import type { BookFontSize, BookPageSize } from "@bookprinta/shared";
import { BadRequestException, Injectable, Logger } from "@nestjs/common";

const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PDF_MIME_TYPE = "application/pdf";

export type ManuscriptMimeType = typeof DOCX_MIME_TYPE | typeof PDF_MIME_TYPE;

const MAX_MANUSCRIPT_WORDS = 100_000;
const ZIP_LOCAL_FILE_HEADER = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const MAX_ZIP_COMMENT_LENGTH = 65_535;

/**
 * Printable area of the authoritative render (page size minus the margins in
 * GotenbergPageCountService.prepareCountHtml). Keep the two in sync.
 */
const PRINTABLE_AREA_MM: Record<BookPageSize, { width: number; height: number }> = {
  A4: { width: 210 - 38, height: 297 - 38 },
  A5: { width: 148 - 28, height: 210 - 28 },
};

const POINT_TO_MM = 0.352778;
/** Body line-height of the authoritative render. */
const RENDER_LINE_HEIGHT = 1.58;

/*
 * Page-estimate coefficients, fitted against authoritative Gotenberg counts of
 * real customer manuscripts and public-domain prose at every size/font (see
 * docs/audit-2026-10.md, "Page estimate calibration"). Mean error: line model
 * 5% (7% on real manuscripts), rescaling a known count 5%, word model 13%. The
 * previous fixed-density formula averaged 18% (21% on real manuscripts).
 */
/** Average glyph width as a fraction of the font size. */
const AVERAGE_CHAR_WIDTH_EM = 0.4388;
/** Extra lines per paragraph: list/heading spacing and break slack. */
const EXTRA_LINES_PER_PARAGRAPH = 0.1643;
const LINE_MODEL_BASE_PAGES = 0.937;
/** Pages lost to each section break (chapters start on a new page). */
const LINE_MODEL_PAGES_PER_BREAK = 0.611;
/** Word model: words per (printable mm² / font mm²). */
const WORD_MODEL_DENSITY = 0.2242;
const WORD_MODEL_BASE_PAGES = 2.968;
const WORD_MODEL_PAGES_PER_BREAK = 0.9897;
/** Assumed section length when the manuscript's structure is unknown. */
const WORDS_PER_ASSUMED_SECTION = 2500;
/** Upper bound for a heading signal to be believed as a section count. */
const MAX_PLAUSIBLE_SECTIONS = 80;

const SECTION_KEYWORD_PATTERN = /^(chapter|part|day|lesson|section|book)\b[\s\d.:IVXLC-]/i;

/** Structure visible at upload time, used by the page estimate. */
export type ManuscriptLayoutProfile = {
  /** Character length of every paragraph, headings included. */
  paragraphLengths: number[];
  /** Estimated number of sections (each starts on a new page). */
  sectionBreaks: number;
};

/** An authoritative count measured at other settings, for rescaling. */
export type PageCountReference = {
  pageCount: number;
  pageSize: BookPageSize;
  fontSize: BookFontSize;
};

export type ManuscriptAnalysis = {
  wordCount: number;
  /** Null for PDFs, whose paragraph boundaries are not reliable. */
  layout: ManuscriptLayoutProfile | null;
};

@Injectable()
export class ManuscriptAnalysisService {
  private readonly logger = new Logger(ManuscriptAnalysisService.name);

  detectMimeType(file: Express.Multer.File): ManuscriptMimeType {
    const extension = this.getExtension(file.originalname);
    const buffer = file.buffer;

    const isPdf = this.looksLikePdf(buffer);
    if (isPdf) {
      return PDF_MIME_TYPE;
    }

    if (this.looksLikeZip(buffer) && this.hasDocxPayload(buffer)) {
      return DOCX_MIME_TYPE;
    }

    if (extension === ".pdf" || extension === ".docx") {
      throw new BadRequestException(
        "Unable to validate file contents. Please upload a valid DOCX or PDF manuscript."
      );
    }

    throw new BadRequestException(
      "Unsupported manuscript type. Please upload a DOCX or PDF file only."
    );
  }

  async extractWordCount(buffer: Buffer, mimeType: ManuscriptMimeType): Promise<number> {
    return (await this.analyzeManuscript(buffer, mimeType)).wordCount;
  }

  /**
   * Validate the manuscript and measure what the page estimate needs. Parses the
   * file once (mammoth/pdf-parse are the expensive part on a 0.1 CPU host).
   */
  async analyzeManuscript(
    buffer: Buffer,
    mimeType: ManuscriptMimeType
  ): Promise<ManuscriptAnalysis> {
    const rawText = await this.extractRawText(buffer, mimeType);
    const text = this.normalizeText(rawText);
    const wordCount = this.countWords(text);

    if (wordCount <= 0) {
      if (mimeType === PDF_MIME_TYPE) {
        throw new BadRequestException(
          "This PDF appears to be a scanned image without extractable text. " +
            "Please upload a text-based PDF or a DOCX file instead."
        );
      }
      throw new BadRequestException(
        "We could not extract readable text from this manuscript. " +
          "Please upload a valid DOCX or PDF file with typed (not scanned) content."
      );
    }

    if (wordCount > MAX_MANUSCRIPT_WORDS) {
      throw new BadRequestException(
        "Manuscript exceeds the 100,000-word limit. Please split it into smaller files and try again."
      );
    }

    // Check text quality — reject garbled / mojibake content before queueing AI
    const qualityIssue = this.detectTextQualityIssue(text, wordCount, mimeType);
    if (qualityIssue) {
      throw new BadRequestException(qualityIssue);
    }

    return {
      wordCount,
      layout:
        mimeType === DOCX_MIME_TYPE ? this.buildLayoutProfile(rawText, buffer, wordCount) : null,
    };
  }

  async extractText(buffer: Buffer, mimeType: ManuscriptMimeType): Promise<string> {
    return this.normalizeText(await this.extractRawText(buffer, mimeType));
  }

  private async extractRawText(buffer: Buffer, mimeType: ManuscriptMimeType): Promise<string> {
    return mimeType === DOCX_MIME_TYPE
      ? await this.extractDocxText(buffer)
      : await this.extractPdfText(buffer);
  }

  /**
   * Paragraph lengths come from the raw text (one paragraph per line). Section
   * breaks use the most specific signal available: "Chapter/Day/Part…" lines,
   * then Word heading styles, then short all-caps lines, then an assumed
   * section length.
   */
  private buildLayoutProfile(
    rawText: string,
    buffer: Buffer,
    wordCount: number
  ): ManuscriptLayoutProfile | null {
    const paragraphs = rawText
      .split(/\n+/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter((line) => line.length > 0);
    if (paragraphs.length === 0) return null;

    const isPlausible = (count: number) => count >= 2 && count <= MAX_PLAUSIBLE_SECTIONS;

    const keywordHeadings = paragraphs.filter(
      (line) => line.length <= 80 && SECTION_KEYWORD_PATTERN.test(line)
    ).length;

    let sectionBreaks: number | null = keywordHeadings >= 2 ? keywordHeadings : null;

    if (sectionBreaks === null) {
      const styles = this.countDocxHeadingStyles(buffer);
      sectionBreaks = [styles.heading1, styles.heading2].find(isPlausible) ?? null;
    }

    if (sectionBreaks === null) {
      const capsHeadings = paragraphs.filter(
        (line) =>
          line.length >= 3 &&
          line.length <= 70 &&
          /\p{Lu}/u.test(line) &&
          line === line.toUpperCase() &&
          !/[.,;]$/.test(line)
      ).length;
      sectionBreaks = isPlausible(capsHeadings) ? capsHeadings : null;
    }

    return {
      paragraphLengths: paragraphs.map((line) => line.length),
      sectionBreaks: sectionBreaks ?? this.assumedSectionBreaks(wordCount),
    };
  }

  private countDocxHeadingStyles(buffer: Buffer): { heading1: number; heading2: number } {
    try {
      const xml = this.readZipEntry(buffer, "word/document.xml")?.toString("utf8") ?? "";
      return {
        heading1: (xml.match(/<w:pStyle w:val="Heading1"\s*\/>/g) ?? []).length,
        heading2: (xml.match(/<w:pStyle w:val="Heading2"\s*\/>/g) ?? []).length,
      };
    } catch {
      return { heading1: 0, heading2: 0 };
    }
  }

  private assumedSectionBreaks(wordCount: number): number {
    return Math.max(1, Math.round(wordCount / WORDS_PER_ASSUMED_SECTION));
  }

  /**
   * Estimated page count of the authoritative render at the given settings.
   *
   * - `reference` (an authoritative count at other settings): rescales it. It
   *   already reflects the manuscript's real structure, so this is the most
   *   accurate input on a settings change.
   * - `layout` (DOCX upload): sums wrapped lines per paragraph and adds the
   *   pages lost to section breaks.
   * - otherwise (PDF, or only a stored word count): words per page by area.
   */
  estimatePages(params: {
    wordCount: number;
    pageSize: BookPageSize;
    fontSize: BookFontSize;
    layout?: ManuscriptLayoutProfile | null;
    reference?: PageCountReference | null;
  }): number {
    const { wordCount, pageSize, fontSize, layout, reference } = params;

    if (reference && reference.pageCount > 0) {
      if (reference.pageSize === pageSize && reference.fontSize === fontSize) {
        return reference.pageCount;
      }
      // Only the text-flow part scales with size/font; section overhead does not.
      const fixed = this.wordModelFixedPages(wordCount);
      const referenceModel = this.wordModelPages(wordCount, reference.pageSize, reference.fontSize);
      const fixedShare = Math.min(0.9, fixed / referenceModel);
      const flowRatio =
        (this.wordModelPages(wordCount, pageSize, fontSize) - fixed) / (referenceModel - fixed);
      return Math.max(
        1,
        Math.round(reference.pageCount * ((1 - fixedShare) * flowRatio + fixedShare))
      );
    }

    if (layout && layout.paragraphLengths.length > 0) {
      const area = PRINTABLE_AREA_MM[pageSize];
      const fontMm = fontSize * POINT_TO_MM;
      const charsPerLine = area.width / (fontMm * AVERAGE_CHAR_WIDTH_EM);
      const linesPerPage = Math.floor(area.height / (fontMm * RENDER_LINE_HEIGHT));
      let lines = 0;
      for (const length of layout.paragraphLengths) {
        lines += Math.ceil(Math.max(1, length) / charsPerLine) + EXTRA_LINES_PER_PARAGRAPH;
      }
      return Math.max(
        1,
        Math.round(
          lines / linesPerPage +
            LINE_MODEL_BASE_PAGES +
            layout.sectionBreaks * LINE_MODEL_PAGES_PER_BREAK
        )
      );
    }

    return Math.max(1, Math.round(this.wordModelPages(wordCount, pageSize, fontSize)));
  }

  private wordModelPages(wordCount: number, pageSize: BookPageSize, fontSize: BookFontSize) {
    const area = PRINTABLE_AREA_MM[pageSize];
    const fontMm = fontSize * POINT_TO_MM;
    const wordsPerPage = (WORD_MODEL_DENSITY * (area.width * area.height)) / (fontMm * fontMm);
    return wordCount / wordsPerPage + this.wordModelFixedPages(wordCount);
  }

  private wordModelFixedPages(wordCount: number): number {
    return (
      WORD_MODEL_BASE_PAGES + WORD_MODEL_PAGES_PER_BREAK * this.assumedSectionBreaks(wordCount)
    );
  }

  /**
   * Extract the page count embedded in the user's original document.
   * - PDF: reads `numpages` from pdf-parse result (reliable).
   * - DOCX: reads `<Pages>N</Pages>` from `docProps/app.xml` inside the ZIP
   *   (set by MS Word on last save; may be absent in Google Docs / LibreOffice exports).
   * Returns null if page count cannot be determined.
   */
  async extractDocumentPageCount(
    buffer: Buffer,
    mimeType: ManuscriptMimeType
  ): Promise<number | null> {
    try {
      if (mimeType === PDF_MIME_TYPE) {
        return await this.extractPdfPageCount(buffer);
      }
      return this.extractDocxPageCount(buffer);
    } catch (error) {
      this.logger.warn(
        `Document page count extraction failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }

  private async extractPdfPageCount(buffer: Buffer): Promise<number | null> {
    // Try pdf-parse first (most accurate)
    try {
      const moduleName = "pdf-parse";
      const loadedModule = (await import(moduleName)) as unknown;

      let parseFn: ((input: Buffer) => Promise<{ numpages?: unknown }>) | null = null;
      if (typeof loadedModule === "function") {
        parseFn = loadedModule as (input: Buffer) => Promise<{ numpages?: unknown }>;
      } else if (loadedModule && typeof loadedModule === "object") {
        const defaultExport = (loadedModule as { default?: unknown }).default;
        if (typeof defaultExport === "function") {
          parseFn = defaultExport as (input: Buffer) => Promise<{ numpages?: unknown }>;
        }
      }

      if (parseFn) {
        const result = await parseFn(buffer);
        if (typeof result.numpages === "number" && result.numpages > 0) {
          this.logger.log(`PDF page count from pdf-parse: ${result.numpages}`);
          return result.numpages;
        }
      }
    } catch (error) {
      this.logger.warn(
        `pdf-parse page count failed, trying binary fallback: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Fallback: count /Type /Page objects in the raw PDF binary.
    // This is very reliable — every PDF page object has "/Type /Page"
    // (as opposed to "/Type /Pages" which is the page tree node).
    const fallback = this.countPdfPagesBinary(buffer);
    if (fallback !== null) {
      this.logger.log(`PDF page count from binary fallback: ${fallback}`);
    }
    return fallback;
  }

  /**
   * Count PDF pages by scanning for `/Type /Page` entries in the raw binary.
   * Matches `/Type/Page` and `/Type /Page` but NOT `/Type /Pages` (tree node).
   */
  private countPdfPagesBinary(buffer: Buffer): number | null {
    const text = buffer.toString("latin1");
    // Match /Type followed by optional whitespace then /Page, but NOT /Pages
    const regex = /\/Type\s*\/Page(?![s\w])/g;
    let count = 0;
    while (regex.exec(text) !== null) {
      count++;
    }
    return count > 0 ? count : null;
  }

  private extractDocxPageCount(buffer: Buffer): number | null {
    let appXml: Buffer | null = null;
    try {
      appXml = this.readZipEntry(buffer, "docProps/app.xml");
    } catch {
      return null;
    }
    if (!appXml) return null;

    const xml = appXml.toString("utf8");
    const match = xml.match(/<Pages>\s*(\d+)\s*<\/Pages>/i);
    if (!match?.[1]) return null;

    const pages = Number.parseInt(match[1], 10);
    return pages > 0 ? pages : null;
  }

  /**
   * Fast pre-validation that runs before ClamAV/Cloudinary upload.
   * Checks file integrity beyond magic bytes (truncated files, corrupt structure).
   */
  validateFileIntegrity(buffer: Buffer, mimeType: ManuscriptMimeType): void {
    if (buffer.length < 64) {
      throw new BadRequestException(
        "The uploaded file is too small to be a valid manuscript. Please check your file and try again."
      );
    }

    if (mimeType === DOCX_MIME_TYPE) {
      // DOCX is a ZIP: verify we can locate the end-of-central-directory record
      const eocd = this.findEndOfCentralDirectoryOffset(buffer);
      if (eocd < 0) {
        throw new BadRequestException(
          "This DOCX file appears to be corrupted or incomplete. " +
            "Please re-export it from your word processor and try again."
        );
      }
    }

    if (mimeType === PDF_MIME_TYPE) {
      // PDF must have %%EOF marker near the end
      const tail = buffer.subarray(Math.max(0, buffer.length - 1024)).toString("ascii");
      if (!tail.includes("%%EOF")) {
        throw new BadRequestException(
          "This PDF file appears to be truncated or corrupted. " +
            "Please re-export it and try again."
        );
      }
    }
  }

  /**
   * Detects garbled / mojibake text that would waste an AI formatting call.
   * Returns the error message string if the quality is too low, null otherwise.
   *
   * PDF text extraction is inherently lossy — custom font encodings, glyph IDs,
   * and CID fonts commonly produce C1 control characters (0x80–0x9F) as artifacts
   * even when the PDF renders perfectly. We use a relaxed threshold for PDFs.
   */
  private detectTextQualityIssue(
    text: string,
    wordCount: number,
    mimeType: ManuscriptMimeType
  ): string | null {
    if (wordCount < 10) return null; // too small to measure meaningfully

    // Sample a block for analysis (max 5000 chars from the middle)
    const sampleStart = Math.max(0, Math.floor(text.length / 2) - 2500);
    const sample = text.slice(sampleStart, sampleStart + 5000);

    // Count Unicode replacement characters (U+FFFD) and other garble indicators
    let garbledChars = 0;
    for (const ch of sample) {
      const code = ch.codePointAt(0) ?? 0;
      if (
        code === 0xfffd || // replacement character
        (code >= 0x80 && code <= 0x9f) || // C1 control characters (common in mojibake)
        code === 0 // null bytes
      ) {
        garbledChars += 1;
      }
    }

    const garbleRatio = garbledChars / sample.length;

    // PDF extraction is lossy — font encodings routinely produce C1 control chars.
    // DOCX extraction is cleaner, so we keep a stricter threshold.
    const threshold = mimeType === PDF_MIME_TYPE ? 0.25 : 0.05;

    this.logger.log(
      `Text quality check: garbleRatio=${(garbleRatio * 100).toFixed(1)}%, ` +
        `threshold=${(threshold * 100).toFixed(0)}%, mimeType=${mimeType}, ` +
        `sampleLength=${sample.length}, garbledChars=${garbledChars}`
    );

    if (garbleRatio > threshold) {
      return mimeType === PDF_MIME_TYPE
        ? "The text extracted from this PDF contains too many unreadable characters. " +
            "This usually means the PDF uses image-based or custom-encoded fonts. " +
            "Please try uploading a DOCX version instead, or re-export the PDF with standard fonts."
        : "The manuscript contains a high proportion of unreadable characters, " +
            "which suggests an encoding problem. Please re-save the file as UTF-8 " +
            "(DOCX is recommended) and upload again.";
    }

    return null;
  }

  private getExtension(fileName: string): string {
    const trimmed = fileName.trim();
    const index = trimmed.lastIndexOf(".");
    if (index < 0) return "";
    return trimmed.slice(index).toLowerCase();
  }

  private looksLikePdf(buffer: Buffer): boolean {
    if (buffer.length < 5) return false;
    return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  }

  private looksLikeZip(buffer: Buffer): boolean {
    if (buffer.length < 4) return false;
    return buffer[0] === 0x50 && buffer[1] === 0x4b;
  }

  private hasDocxPayload(buffer: Buffer): boolean {
    try {
      return this.readZipEntry(buffer, "word/document.xml") !== null;
    } catch (error) {
      this.logger.warn(
        `DOCX structure check failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return false;
    }
  }

  private async extractDocxText(buffer: Buffer): Promise<string> {
    const mammothText = await this.tryExtractDocxWithMammoth(buffer);
    if (mammothText) {
      return mammothText;
    }

    let xmlBuffer: Buffer | null = null;
    try {
      xmlBuffer = this.readZipEntry(buffer, "word/document.xml");
    } catch {
      xmlBuffer = null;
    }
    if (!xmlBuffer) {
      throw new BadRequestException("DOCX parsing failed. The manuscript appears to be corrupted.");
    }

    const xml = xmlBuffer.toString("utf8");
    const text = xml
      .replace(/<w:tab\/>/g, " ")
      .replace(/<w:br\/>/g, "\n")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<\/w:tr>/g, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;|&#160;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");

    return text;
  }

  private async tryExtractDocxWithMammoth(buffer: Buffer): Promise<string | null> {
    try {
      const moduleName = "mammoth";
      const mammothModule = (await import(moduleName)) as {
        extractRawText?: (input: { buffer: Buffer }) => Promise<{ value?: string }>;
      };

      if (typeof mammothModule.extractRawText !== "function") {
        this.logger.warn("mammoth module loaded but extractRawText not found");
        return null;
      }

      const result = await mammothModule.extractRawText({ buffer });
      if (typeof result.value !== "string") return null;
      const value = result.value.trim();
      return value.length > 0 ? value : null;
    } catch (error) {
      this.logger.error(
        `mammoth extraction failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }

  private async extractPdfText(buffer: Buffer): Promise<string> {
    const parsedText = await this.tryExtractPdfWithLibrary(buffer);
    if (parsedText) {
      return parsedText;
    }

    this.logger.warn("pdf-parse returned no text; falling back to heuristic extraction");
    const heuristicText = this.extractPdfTextHeuristically(buffer);
    return heuristicText;
  }

  private async tryExtractPdfWithLibrary(buffer: Buffer): Promise<string | null> {
    try {
      const moduleName = "pdf-parse";
      const loadedModule = (await import(moduleName)) as unknown;

      let parseFn: ((input: Buffer) => Promise<{ text?: unknown }>) | null = null;
      if (typeof loadedModule === "function") {
        parseFn = loadedModule as (input: Buffer) => Promise<{ text?: unknown }>;
      } else if (loadedModule && typeof loadedModule === "object") {
        const defaultExport = (loadedModule as { default?: unknown }).default;
        if (typeof defaultExport === "function") {
          parseFn = defaultExport as (input: Buffer) => Promise<{ text?: unknown }>;
        }
      }

      if (!parseFn) {
        this.logger.warn("pdf-parse module loaded but no parse function found");
        return null;
      }
      const result = await parseFn(buffer);
      if (typeof result.text !== "string") {
        this.logger.warn("pdf-parse returned non-string text field");
        return null;
      }
      const text = result.text.trim();
      if (text.length === 0) {
        this.logger.warn("pdf-parse returned empty text (scanned/image-based PDF?)");
      }
      return text.length > 0 ? text : null;
    } catch (error) {
      this.logger.error(
        `pdf-parse failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }

  private extractPdfTextHeuristically(buffer: Buffer): string {
    const binary = buffer.toString("latin1");
    const collected: string[] = [];

    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    for (const match of binary.matchAll(streamRegex)) {
      const streamContent = match[1];
      if (!streamContent) continue;

      const streamBuffer = Buffer.from(streamContent, "latin1");
      const decodedCandidates: Buffer[] = [streamBuffer];
      const inflated = this.tryInflateBuffer(streamBuffer);
      if (inflated) decodedCandidates.push(inflated);

      for (const candidate of decodedCandidates) {
        const chunk = candidate.toString("latin1");
        const extracted = this.extractPdfStringsFromChunk(chunk);
        if (extracted.length > 0) {
          collected.push(extracted.join(" "));
        }
      }
    }

    if (collected.length > 0) {
      return collected.join(" ");
    }

    return this.extractPdfStringsFromChunk(binary).join(" ");
  }

  private extractPdfStringsFromChunk(chunk: string): string[] {
    const output: string[] = [];

    const literalRegex = /\((?:\\.|[^\\()])*\)/g;
    for (const match of chunk.matchAll(literalRegex)) {
      const value = match[0];
      if (!value) continue;
      const decoded = this.decodePdfLiteral(value);
      if (decoded.trim().length > 0) output.push(decoded);
    }

    const hexRegex = /<([0-9A-Fa-f\s]{4,})>/g;
    for (const match of chunk.matchAll(hexRegex)) {
      const hexContent = match[1];
      if (!hexContent) continue;
      const compact = hexContent.replace(/\s+/g, "");
      if (compact.length < 2 || compact.length % 2 !== 0) continue;
      if (!/^[0-9A-Fa-f]+$/.test(compact)) continue;
      const decoded = Buffer.from(compact, "hex").toString("utf8");
      if (decoded.trim().length > 0) output.push(decoded);
    }

    return output;
  }

  private decodePdfLiteral(value: string): string {
    const content = value.slice(1, -1);
    let output = "";

    for (let index = 0; index < content.length; index += 1) {
      const current = content[index];
      if (current !== "\\") {
        output += current;
        continue;
      }

      const next = content[index + 1];
      if (!next) break;

      if (next >= "0" && next <= "7") {
        const octal = content.slice(index + 1, index + 4).match(/^[0-7]{1,3}/)?.[0] ?? "";
        if (octal.length > 0) {
          output += String.fromCharCode(Number.parseInt(octal, 8));
          index += octal.length;
          continue;
        }
      }

      if (next === "n") {
        output += "\n";
      } else if (next === "r") {
        output += "\r";
      } else if (next === "t") {
        output += "\t";
      } else if (next === "b") {
        output += "\b";
      } else if (next === "f") {
        output += "\f";
      } else if (next === "(" || next === ")" || next === "\\") {
        output += next;
      } else {
        output += next;
      }
      index += 1;
    }

    return output;
  }

  private tryInflateBuffer(data: Buffer): Buffer | null {
    const decoders = [inflateSync, inflateRawSync, gunzipSync];

    for (const decode of decoders) {
      try {
        return decode(data);
      } catch {
        // Keep trying other decoders.
      }
    }

    return null;
  }

  private normalizeText(value: string): string {
    return value.replace(/\s+/g, " ").trim();
  }

  private countWords(value: string): number {
    const words = value.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu);
    return words?.length ?? 0;
  }

  private readZipEntry(zipBuffer: Buffer, entryName: string): Buffer | null {
    const eocdOffset = this.findEndOfCentralDirectoryOffset(zipBuffer);
    if (eocdOffset < 0) return null;

    if (eocdOffset + 22 > zipBuffer.length) return null;

    const centralDirectorySize = zipBuffer.readUInt32LE(eocdOffset + 12);
    const centralDirectoryOffset = zipBuffer.readUInt32LE(eocdOffset + 16);
    const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;

    let pointer = centralDirectoryOffset;
    while (pointer + 46 <= centralDirectoryEnd && pointer + 46 <= zipBuffer.length) {
      if (zipBuffer.readUInt32LE(pointer) !== ZIP_CENTRAL_DIRECTORY_HEADER) {
        break;
      }

      const compressionMethod = zipBuffer.readUInt16LE(pointer + 10);
      const compressedSize = zipBuffer.readUInt32LE(pointer + 20);
      const fileNameLength = zipBuffer.readUInt16LE(pointer + 28);
      const extraLength = zipBuffer.readUInt16LE(pointer + 30);
      const fileCommentLength = zipBuffer.readUInt16LE(pointer + 32);
      const localHeaderOffset = zipBuffer.readUInt32LE(pointer + 42);

      const fileNameStart = pointer + 46;
      const fileNameEnd = fileNameStart + fileNameLength;
      if (fileNameEnd > zipBuffer.length) break;

      const currentName = zipBuffer.subarray(fileNameStart, fileNameEnd).toString("utf8");
      const nextPointer = fileNameEnd + extraLength + fileCommentLength;

      if (currentName === entryName) {
        return this.readZipFileDataAtLocalHeader({
          zipBuffer,
          localHeaderOffset,
          compressedSize,
          compressionMethod,
        });
      }

      pointer = nextPointer;
    }

    return null;
  }

  private readZipFileDataAtLocalHeader(params: {
    zipBuffer: Buffer;
    localHeaderOffset: number;
    compressedSize: number;
    compressionMethod: number;
  }): Buffer | null {
    const { zipBuffer, localHeaderOffset, compressedSize, compressionMethod } = params;

    if (localHeaderOffset + 30 > zipBuffer.length) return null;
    if (zipBuffer.readUInt32LE(localHeaderOffset) !== ZIP_LOCAL_FILE_HEADER) return null;

    const fileNameLength = zipBuffer.readUInt16LE(localHeaderOffset + 26);
    const extraLength = zipBuffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + fileNameLength + extraLength;
    const dataEnd = dataStart + compressedSize;

    if (dataEnd > zipBuffer.length) return null;
    const compressedData = zipBuffer.subarray(dataStart, dataEnd);

    if (compressionMethod === 0) {
      return Buffer.from(compressedData);
    }
    if (compressionMethod === 8) {
      return inflateRawSync(compressedData);
    }

    this.logger.warn(`Unsupported ZIP compression method: ${compressionMethod}`);
    return null;
  }

  private findEndOfCentralDirectoryOffset(zipBuffer: Buffer): number {
    const minimumEocdSize = 22;
    if (zipBuffer.length < minimumEocdSize) return -1;

    const start = Math.max(0, zipBuffer.length - minimumEocdSize - MAX_ZIP_COMMENT_LENGTH);
    for (let index = zipBuffer.length - minimumEocdSize; index >= start; index -= 1) {
      if (zipBuffer.readUInt32LE(index) === ZIP_END_OF_CENTRAL_DIRECTORY) {
        return index;
      }
    }

    return -1;
  }
}
