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

const PAGE_DIMENSIONS_MM: Record<BookPageSize, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
};

const PAGE_MARGINS_MM: Record<BookPageSize, { horizontal: number; vertical: number }> = {
  A4: { horizontal: 38, vertical: 46 },
  A5: { horizontal: 28, vertical: 34 },
};

const POINT_TO_MM = 0.352778;
const AVERAGE_CHAR_WIDTH_FACTOR = 0.52;
const LINE_HEIGHT_FACTOR = 1.5;
const AVERAGE_WORD_CHARS = 6;
const TEXT_DENSITY_FACTOR = 0.87;

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
    const text = await this.extractText(buffer, mimeType);
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
    const qualityIssue = this.detectTextQualityIssue(text, wordCount);
    if (qualityIssue) {
      throw new BadRequestException(qualityIssue);
    }

    return wordCount;
  }

  async extractText(buffer: Buffer, mimeType: ManuscriptMimeType): Promise<string> {
    const text =
      mimeType === DOCX_MIME_TYPE
        ? await this.extractDocxText(buffer)
        : await this.extractPdfText(buffer);
    return this.normalizeText(text);
  }

  estimatePages(params: {
    wordCount: number;
    pageSize: BookPageSize;
    fontSize: BookFontSize;
  }): number {
    const { wordCount, pageSize, fontSize } = params;
    const dimensions = PAGE_DIMENSIONS_MM[pageSize];
    const margins = PAGE_MARGINS_MM[pageSize];

    const printableWidth = Math.max(20, dimensions.width - margins.horizontal);
    const printableHeight = Math.max(40, dimensions.height - margins.vertical);

    const charWidthMm = Math.max(0.2, fontSize * POINT_TO_MM * AVERAGE_CHAR_WIDTH_FACTOR);
    const lineHeightMm = Math.max(0.35, fontSize * POINT_TO_MM * LINE_HEIGHT_FACTOR);

    const charsPerLine = Math.max(18, Math.floor(printableWidth / charWidthMm));
    const linesPerPage = Math.max(14, Math.floor(printableHeight / lineHeightMm));

    const wordsPerLine = charsPerLine / AVERAGE_WORD_CHARS;
    const wordsPerPage = Math.max(
      80,
      Math.floor(wordsPerLine * linesPerPage * TEXT_DENSITY_FACTOR)
    );

    return Math.max(1, Math.ceil(wordCount / wordsPerPage));
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
   */
  private detectTextQualityIssue(text: string, wordCount: number): string | null {
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
    if (garbleRatio > 0.05) {
      return (
        "The manuscript contains a high proportion of unreadable characters, " +
        "which suggests an encoding problem. Please re-save the file as UTF-8 " +
        "(DOCX is recommended) and upload again."
      );
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
