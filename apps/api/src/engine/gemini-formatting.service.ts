import type { BookFontSize, BookPageSize } from "@bookprinta/shared";
import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";

const GEMINI_ENDPOINT_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_TIMEOUT_FALLBACK_MODEL = "gemini-2.5-flash-lite";
const CHUNK_TRIGGER_WORD_COUNT = 8_000;
const TARGET_CHUNK_WORDS = 5_000;
const DEFAULT_GEMINI_REQUEST_TIMEOUT_MS = 45_000;
const MIN_GEMINI_REQUEST_TIMEOUT_MS = 45_000;
const MAX_TRANSIENT_RETRIES_PER_MODEL = 2;
const MAJOR_HEADING_PREFIX_PATTERN =
  /^(chapter|part|book|appendix|prologue|epilogue|introduction|foreword|preface|afterword|conclusion|table of contents|contents)\b/i;
const ROMAN_NUMERAL_PATTERN = /^(?:[ivxlcdm]+)$/i;

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
    finishReason?: string;
  }>;
  promptFeedback?: {
    blockReason?: string;
  };
  error?: {
    message?: string;
  };
};

export type FormatManuscriptInput = {
  text: string;
  pageSize: BookPageSize;
  fontSize: BookFontSize;
  bookId: string;
};

export type FormatManuscriptOutput = {
  html: string;
  inputWordCount: number;
  outputWordCount: number;
  chunkCount: number;
  model: string;
};

type GeneratedChunkResult = {
  text: string;
  model: string;
};

@Injectable()
export class GeminiFormattingService {
  private readonly logger = new Logger(GeminiFormattingService.name);

  async formatManuscript(input: FormatManuscriptInput): Promise<FormatManuscriptOutput> {
    const sourceText = input.text.trim();
    if (sourceText.length === 0) {
      throw new Error("Manuscript text is empty. Unable to run AI formatting.");
    }

    const inputWordCount = this.countWords(sourceText);
    const chunks = this.splitIntoChunks(sourceText, inputWordCount);
    const fragments: string[] = [];
    const usedModels = new Set<string>();

    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      const prompt = this.buildPrompt({
        chunk,
        chunkIndex: index + 1,
        chunkCount: chunks.length,
        pageSize: input.pageSize,
        fontSize: input.fontSize,
      });
      const startedAt = Date.now();
      const generated = await this.generateChunk(prompt);
      const durationMs = Date.now() - startedAt;
      const durationLabel = `${durationMs}ms`;
      if (durationMs >= 15_000) {
        this.logger.warn(
          `Gemini chunk ${index + 1}/${chunks.length} for book ${input.bookId} took ${durationLabel} using ${generated.model}`
        );
      } else {
        this.logger.debug?.(
          `Gemini chunk ${index + 1}/${chunks.length} for book ${input.bookId} took ${durationLabel} using ${generated.model}`
        );
      }
      usedModels.add(generated.model);
      fragments.push(this.normalizeGeneratedFragment(generated.text));
    }

    const mergedFragment = fragments.join("\n\n");
    const html = this.wrapFragmentAsHtml(this.applyDeterministicBookStructure(mergedFragment));
    const outputWordCount = this.countWords(this.stripHtml(html));

    this.logger.log(
      `Gemini formatting complete for book ${input.bookId}: ${chunks.length} chunk(s), ${inputWordCount} -> ${outputWordCount} words`
    );

    return {
      html,
      inputWordCount,
      outputWordCount,
      chunkCount: chunks.length,
      model: Array.from(usedModels).join(", "),
    };
  }

  private splitIntoChunks(text: string, totalWords: number): string[] {
    if (totalWords <= CHUNK_TRIGGER_WORD_COUNT) {
      return [text];
    }

    const chapterSections = this.splitByChapter(text);
    if (chapterSections.length <= 1) {
      return this.splitByWordBudget(text, TARGET_CHUNK_WORDS);
    }

    const chunks: string[] = [];
    let currentChunk = "";
    let currentWords = 0;

    for (const section of chapterSections) {
      const sectionWords = this.countWords(section);
      if (sectionWords > TARGET_CHUNK_WORDS) {
        if (currentWords > 0) {
          chunks.push(currentChunk.trim());
          currentChunk = "";
          currentWords = 0;
        }
        chunks.push(...this.splitByWordBudget(section, TARGET_CHUNK_WORDS));
        continue;
      }

      if (currentWords > 0 && currentWords + sectionWords > TARGET_CHUNK_WORDS) {
        chunks.push(currentChunk.trim());
        currentChunk = section;
        currentWords = sectionWords;
        continue;
      }

      currentChunk = currentChunk.length > 0 ? `${currentChunk}\n\n${section}` : section;
      currentWords += sectionWords;
    }

    if (currentWords > 0) {
      chunks.push(currentChunk.trim());
    }

    return chunks.length > 0 ? chunks : [text];
  }

  private splitByChapter(text: string): string[] {
    const sections = text
      .split(/(?=\bchapter\s+(?:\d+|[ivxlcdm]+)\b)/gi)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    return sections;
  }

  private splitByWordBudget(text: string, targetWords: number): string[] {
    const sentences = text
      .split(/(?<=[.?!])\s+/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    const chunks: string[] = [];
    let currentChunk = "";
    let currentWords = 0;

    for (const sentence of sentences) {
      const sentenceWords = this.countWords(sentence);
      if (sentenceWords >= targetWords) {
        if (currentWords > 0) {
          chunks.push(currentChunk.trim());
          currentChunk = "";
          currentWords = 0;
        }
        chunks.push(sentence);
        continue;
      }

      if (currentWords > 0 && currentWords + sentenceWords > targetWords) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
        currentWords = sentenceWords;
        continue;
      }

      currentChunk = currentChunk.length > 0 ? `${currentChunk} ${sentence}` : sentence;
      currentWords += sentenceWords;
    }

    if (currentWords > 0) {
      chunks.push(currentChunk.trim());
    }

    return chunks.length > 0 ? chunks : [text];
  }

  private buildPrompt(params: {
    chunk: string;
    chunkIndex: number;
    chunkCount: number;
    pageSize: BookPageSize;
    fontSize: BookFontSize;
  }): string {
    return [
      "You are formatting a book manuscript into semantic HTML for print production.",
      `Target page size: ${params.pageSize}`,
      `Target font size: ${params.fontSize}pt`,
      `Chunk ${params.chunkIndex} of ${params.chunkCount}.`,
      "Rules:",
      "- Return HTML fragment only (no markdown code fences).",
      "- Do NOT include <script> or <style> tags.",
      "- Preserve the original content and chapter order.",
      "- Use semantic tags (<section>, <h1>, <h2>, <p>, <blockquote>, <ul>, <ol>, <li>) where appropriate.",
      "- Preserve front matter, introductions, chapter titles, subheadings, scripture blocks, and tables of contents as distinct structures.",
      "- Short standalone lines, obvious chapter labels, and all-caps section titles should become headings, not body paragraphs.",
      "- Do not collapse multiple paragraphs into one large block.",
      "- Keep lists as lists and quotations as blockquotes when the source implies them.",
      "- Wrap clearly separated major sections or chapters in <section> elements when possible.",
      "- Keep punctuation and wording faithful to the source text.",
      "",
      "MANUSCRIPT CHUNK:",
      params.chunk,
    ].join("\n");
  }

  private async generateChunk(prompt: string): Promise<GeneratedChunkResult> {
    const configuredModel = this.getModel();
    const fallbackModel = this.resolveFallbackModel(configuredModel);
    const modelsToTry = [configuredModel, fallbackModel].filter(
      (value, index, all): value is string => Boolean(value) && all.indexOf(value) === index
    );

    let lastError: unknown = null;

    for (const model of modelsToTry) {
      for (let attempt = 1; attempt <= MAX_TRANSIENT_RETRIES_PER_MODEL; attempt += 1) {
        try {
          const text = await this.generateChunkWithModel(prompt, model);
          return {
            text,
            model,
          };
        } catch (error) {
          lastError = error;
          const isTransient = this.isTransientGeminiError(error);
          const canRetrySameModel = isTransient && attempt < MAX_TRANSIENT_RETRIES_PER_MODEL;

          if (canRetrySameModel) {
            this.logger.warn(
              `Gemini request using ${model} failed transiently on attempt ${attempt}/${MAX_TRANSIENT_RETRIES_PER_MODEL}. Retrying same model.`
            );
            await this.delay(1200 * attempt);
            continue;
          }

          const hasAnotherModel = model !== modelsToTry[modelsToTry.length - 1];
          if (hasAnotherModel && isTransient && this.shouldTryAlternateModel(model, error)) {
            this.logger.warn(
              `Gemini request using ${model} failed. Retrying with alternate model.`
            );
          }

          break;
        }
      }
    }

    throw lastError ?? new Error("Gemini chunk generation failed.");
  }

  private resolveFallbackModel(model: string): string | null {
    if (model === GEMINI_TIMEOUT_FALLBACK_MODEL) {
      return null;
    }

    if (model === DEFAULT_GEMINI_MODEL) {
      return GEMINI_TIMEOUT_FALLBACK_MODEL;
    }

    return GEMINI_TIMEOUT_FALLBACK_MODEL;
  }

  private shouldTryAlternateModel(model: string, error: unknown): boolean {
    if (model === GEMINI_TIMEOUT_FALLBACK_MODEL) {
      return false;
    }

    return !this.isQuotaExhaustedGeminiError(error);
  }

  private async generateChunkWithModel(prompt: string, model: string): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new ServiceUnavailableException(
        "AI formatting service is not configured. GEMINI_API_KEY is missing."
      );
    }

    const endpoint = `${GEMINI_ENDPOINT_BASE}/${model}:generateContent`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.getRequestTimeoutMs());
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            topP: 0.9,
          },
        }),
        signal: controller.signal,
      });
    } catch (error: unknown) {
      if (
        typeof error === "object" &&
        error !== null &&
        "name" in error &&
        String((error as { name?: unknown }).name)
          .toLowerCase()
          .includes("abort")
      ) {
        throw new Error(`Gemini request timed out after ${this.getRequestTimeoutMs()}ms.`);
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Gemini request failed (${response.status}): ${text}`);
    }

    const payload = (await response.json()) as GeminiGenerateContentResponse;
    const candidate = payload.candidates?.[0];
    const text =
      candidate?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("")
        .trim() ?? "";

    if (text.length === 0) {
      const reason =
        payload.error?.message ??
        payload.promptFeedback?.blockReason ??
        candidate?.finishReason ??
        "empty output";
      throw new Error(`Gemini returned no content (${reason}).`);
    }

    return text;
  }

  private isTransientGeminiError(error: unknown): boolean {
    const message =
      error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

    return (
      message.includes("timed out") ||
      message.includes("429") ||
      message.includes("500") ||
      message.includes("503") ||
      message.includes("unavailable") ||
      message.includes("high demand")
    );
  }

  private isQuotaExhaustedGeminiError(error: unknown): boolean {
    const message =
      error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

    return message.includes("resource_exhausted") || message.includes("quota exceeded");
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private normalizeGeneratedFragment(value: string): string {
    let output = value.trim();
    output = output
      .replace(/^```(?:html)?/i, "")
      .replace(/```$/i, "")
      .trim();

    const bodyMatch = output.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch?.[1]) {
      output = bodyMatch[1].trim();
    }

    output = output
      .replace(/<!doctype[^>]*>/gi, "")
      .replace(/<\/?(html|head|meta|title)[^>]*>/gi, "")
      .trim();

    return output;
  }

  private applyDeterministicBookStructure(fragment: string): string {
    let output = fragment.trim();
    if (output.length === 0) {
      return output;
    }

    output = this.decorateSections(output);
    output = this.promoteMajorHeadingParagraphs(output);
    output = this.decorateHeadings(output);

    return output;
  }

  private decorateSections(fragment: string): string {
    return fragment.replace(/<section([^>]*)>/gi, (_match, attrs: string) => {
      return `<section${this.appendClassesToAttributes(attrs, "book-section")}>`;
    });
  }

  private promoteMajorHeadingParagraphs(fragment: string): string {
    return fragment.replace(
      /<p([^>]*)>([\s\S]*?)<\/p>/gi,
      (match, attrs: string, inner: string) => {
        const plainText = this.toPlainText(inner);
        if (!this.shouldPromoteParagraphToMajorHeading(plainText)) {
          return match;
        }

        const nextAttributes = this.setAttributeValue(
          this.appendClassesToAttributes(attrs, "book-major-heading"),
          "data-book-heading",
          "major"
        );
        return `<h1${nextAttributes}>${inner.trim()}</h1>`;
      }
    );
  }

  private decorateHeadings(fragment: string): string {
    return fragment.replace(
      /<(h[1-4])([^>]*)>([\s\S]*?)<\/\1>/gi,
      (_match, tagName: string, attrs: string, inner: string) => {
        const normalizedTag = tagName.toLowerCase();
        const plainText = this.toPlainText(inner);

        if (
          normalizedTag === "h1" ||
          (normalizedTag === "h2" && this.isMajorHeadingText(plainText))
        ) {
          const nextAttributes = this.setAttributeValue(
            this.appendClassesToAttributes(attrs, "book-major-heading"),
            "data-book-heading",
            "major"
          );
          return `<${tagName}${nextAttributes}>${inner.trim()}</${tagName}>`;
        }

        if (normalizedTag === "h2" || normalizedTag === "h3" || normalizedTag === "h4") {
          return `<${tagName}${this.appendClassesToAttributes(attrs, "book-subheading")}>${inner.trim()}</${tagName}>`;
        }

        return `<${tagName}${attrs}>${inner.trim()}</${tagName}>`;
      }
    );
  }

  private shouldPromoteParagraphToMajorHeading(text: string): boolean {
    if (!this.isMajorHeadingText(text)) {
      return false;
    }

    return !/[.!?;]/.test(text);
  }

  private isMajorHeadingText(text: string): boolean {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (normalized.length === 0 || normalized.length > 90) {
      return false;
    }

    const wordCount = this.countWords(normalized);
    if (wordCount === 0 || wordCount > 10) {
      return false;
    }

    if (MAJOR_HEADING_PREFIX_PATTERN.test(normalized)) {
      return true;
    }

    const tokens = normalized
      .replace(/[:"'.,]/g, "")
      .split(/\s+/)
      .filter((token) => token.length > 0);

    if (tokens.length === 0 || tokens.length > 6) {
      return false;
    }

    const hasRomanNumeralToken = tokens.some((token) => ROMAN_NUMERAL_PATTERN.test(token));
    const isAllCaps = normalized === normalized.toUpperCase();

    return isAllCaps || hasRomanNumeralToken;
  }

  private toPlainText(value: string): string {
    return this.stripHtml(value).replace(/\s+/g, " ").trim();
  }

  private appendClassesToAttributes(attrs: string, ...classes: string[]): string {
    const normalizedAttributes = attrs ?? "";
    const classMatch = normalizedAttributes.match(/\sclass\s*=\s*"([^"]*)"/i);
    const classSet = new Set(
      (classMatch?.[1] ?? "")
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 0)
    );

    for (const className of classes) {
      if (className.trim().length > 0) {
        classSet.add(className.trim());
      }
    }

    const nextClassValue = Array.from(classSet).join(" ");
    if (classMatch) {
      return normalizedAttributes.replace(classMatch[0], ` class="${nextClassValue}"`);
    }

    return `${normalizedAttributes} class="${nextClassValue}"`;
  }

  private setAttributeValue(attrs: string, attributeName: string, value: string): string {
    const attributePattern = new RegExp(`\\s${attributeName}\\s*=\\s*"[^"]*"`, "i");
    if (attributePattern.test(attrs)) {
      return attrs.replace(attributePattern, ` ${attributeName}="${value}"`);
    }

    return `${attrs} ${attributeName}="${value}"`;
  }

  private wrapFragmentAsHtml(fragment: string): string {
    return [
      "<!doctype html>",
      '<html lang="en">',
      "<head>",
      '  <meta charset="utf-8" />',
      '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
      "  <title>BookPrinta Formatted Manuscript</title>",
      "</head>",
      "<body>",
      fragment,
      "</body>",
      "</html>",
    ].join("\n");
  }

  private stripHtml(value: string): string {
    return value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;|&#160;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/\s+/g, " ")
      .trim();
  }

  private countWords(value: string): number {
    const words = value.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu);
    return words?.length ?? 0;
  }

  private getModel(): string {
    const configured = process.env.GEMINI_MODEL?.trim();
    return configured && configured.length > 0 ? configured : DEFAULT_GEMINI_MODEL;
  }

  private getRequestTimeoutMs(): number {
    const configured = Number(process.env.GEMINI_REQUEST_TIMEOUT_MS);
    if (Number.isFinite(configured) && configured >= MIN_GEMINI_REQUEST_TIMEOUT_MS) {
      return Math.floor(configured);
    }

    return DEFAULT_GEMINI_REQUEST_TIMEOUT_MS;
  }
}
