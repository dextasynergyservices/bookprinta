import { createHash } from "node:crypto";
import type { BookFontSize, BookPageSize } from "@bookprinta/shared";
import { Injectable, Logger, Optional, ServiceUnavailableException } from "@nestjs/common";
import { RedisService } from "../redis/redis.service.js";

const GEMINI_ENDPOINT_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const CHUNK_TRIGGER_WORD_COUNT = 12_000;
const TARGET_CHUNK_WORDS = 10_000;
const DEFAULT_GEMINI_REQUEST_TIMEOUT_MS = 90_000;
const MIN_GEMINI_REQUEST_TIMEOUT_MS = 45_000;
const MAX_TRANSIENT_RETRIES_PER_MODEL = 2;
const CHUNK_CACHE_TTL_SECONDS = 7200; // 2 hours
const MAX_429_WAIT_SECONDS = 120;
const MAX_429_RETRIES = 3;
const PARALLEL_CHUNK_CONCURRENCY = 5;
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
  /** Called when each chunk completes.
   *  The fragment is raw HTML body content — NOT wrapped in a full document.
   *  `completedCount` = total chunks finished so far (1-based). */
  onChunkComplete?: (
    fragment: string,
    chunkIndex: number,
    totalChunks: number,
    completedCount: number
  ) => Promise<void>;
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

  constructor(@Optional() private readonly redis?: RedisService) {}

  async formatManuscript(input: FormatManuscriptInput): Promise<FormatManuscriptOutput> {
    const sourceText = input.text.trim();
    if (sourceText.length === 0) {
      throw new Error("Manuscript text is empty. Unable to run AI formatting.");
    }

    const inputWordCount = this.countWords(sourceText);
    const chunks = this.splitIntoChunks(sourceText, inputWordCount);
    const inputHash = this.computeInputHash(sourceText, input.pageSize, input.fontSize);
    const usedModels = new Set<string>();
    let apiCalls = 0;
    let cacheHits = 0;
    const formatStartedAt = Date.now();

    // Process chunks in parallel with controlled concurrency
    const results = await this.processChunksParallel(
      chunks,
      input,
      inputHash,
      (model) => usedModels.add(model),
      () => {
        apiCalls += 1;
      },
      () => {
        cacheHits += 1;
      },
      input.onChunkComplete
    );
    const fragments = results.map((r) => r.fragment);

    const mergedFragment = fragments.join("\n\n");
    const html = this.wrapFragmentAsHtml(this.applyDeterministicBookStructure(mergedFragment));
    const outputWordCount = this.countWords(this.stripHtml(html));
    const totalDurationMs = Date.now() - formatStartedAt;

    // Clean up chunk cache after successful completion
    await this.clearChunkCache(input.bookId, inputHash, chunks.length);

    this.logger.log(
      `Gemini formatting complete for book ${input.bookId}: ` +
        `${chunks.length} chunk(s), ${apiCalls} API call(s), ${cacheHits} cache hit(s), ` +
        `${inputWordCount} → ${outputWordCount} words, ${totalDurationMs}ms total, ` +
        `model=${Array.from(usedModels).join(", ")}`
    );

    return {
      html,
      inputWordCount,
      outputWordCount,
      chunkCount: chunks.length,
      model: Array.from(usedModels).join(", "),
    };
  }

  /**
   * Processes chunks with controlled concurrency (up to PARALLEL_CHUNK_CONCURRENCY at once).
   * Chunks are independent — results are reassembled in original order after all complete.
   * For single-chunk manuscripts (the common case), this is effectively sequential.
   */
  private async processChunksParallel(
    chunks: string[],
    input: FormatManuscriptInput,
    inputHash: string,
    onModel: (model: string) => void,
    onApiCall: () => void,
    onCacheHit: () => void,
    onChunkComplete?: (
      fragment: string,
      chunkIndex: number,
      totalChunks: number,
      completedCount: number
    ) => Promise<void>
  ): Promise<Array<{ fragment: string }>> {
    const results = new Array<{ fragment: string }>(chunks.length);
    let nextIndex = 0;
    const total = chunks.length;
    let completedCount = 0;

    const processOne = async (): Promise<void> => {
      while (nextIndex < total) {
        const index = nextIndex;
        nextIndex += 1;

        // Checkpoint: check Redis cache for previously completed chunk
        const cached = await this.getCachedChunk(input.bookId, inputHash, index);
        if (cached) {
          onCacheHit();
          onModel(cached.model);
          results[index] = { fragment: this.normalizeGeneratedFragment(cached.text) };
          this.logger.debug?.(
            `Gemini chunk ${index + 1}/${total} for book ${input.bookId} restored from cache`
          );

          // Notify progress
          completedCount += 1;
          if (onChunkComplete) {
            await onChunkComplete(results[index].fragment, index, total, completedCount).catch(
              () => {}
            );
          }
          continue;
        }

        const prompt = this.buildPrompt({
          chunk: chunks[index],
          chunkIndex: index + 1,
          chunkCount: total,
          pageSize: input.pageSize,
          fontSize: input.fontSize,
        });
        const startedAt = Date.now();
        const generated = await this.generateChunk(prompt);
        onApiCall();
        const durationMs = Date.now() - startedAt;
        if (durationMs >= 15_000) {
          this.logger.warn(
            `Gemini chunk ${index + 1}/${total} for book ${input.bookId} took ${durationMs}ms using ${generated.model}`
          );
        } else {
          this.logger.debug?.(
            `Gemini chunk ${index + 1}/${total} for book ${input.bookId} took ${durationMs}ms using ${generated.model}`
          );
        }
        onModel(generated.model);
        results[index] = { fragment: this.normalizeGeneratedFragment(generated.text) };

        // Checkpoint: save completed chunk to Redis for retry resilience
        await this.setCachedChunk(input.bookId, inputHash, index, generated);

        completedCount += 1;
        if (onChunkComplete) {
          await onChunkComplete(results[index].fragment, index, total, completedCount).catch(
            () => {}
          );
        }
      }
    };

    // Launch up to PARALLEL_CHUNK_CONCURRENCY workers
    const concurrency = Math.min(PARALLEL_CHUNK_CONCURRENCY, chunks.length);
    const workers = Array.from({ length: concurrency }, () => processOne());
    await Promise.all(workers);

    return results;
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
    const fallbackModels = this.getFallbackModels();
    const modelsToTry = [configuredModel, ...fallbackModels].filter(
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
          if (hasAnotherModel && isTransient && this.shouldTryAlternateModel(error)) {
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

  /**
   * Returns explicitly configured fallback models from GEMINI_FALLBACK_MODEL env.
   * Supports comma-separated list for multiple fallback pools:
   *   GEMINI_FALLBACK_MODEL=gemini-2.0-flash,gemini-1.5-flash
   * Each model has its own rate limit, so more models = more effective RPM.
   */
  private getFallbackModels(): string[] {
    const configured = process.env.GEMINI_FALLBACK_MODEL?.trim();
    if (!configured || configured.length === 0) {
      return [];
    }
    return configured
      .split(",")
      .map((m) => m.trim())
      .filter((m) => m.length > 0);
  }

  private shouldTryAlternateModel(error: unknown): boolean {
    return !this.isQuotaExhaustedGeminiError(error);
  }

  private async generateChunkWithModel(
    prompt: string,
    model: string,
    rateLimitRetry = 0
  ): Promise<string> {
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

    // Handle 429 rate limit: wait for Retry-After and retry up to MAX_429_RETRIES times
    // without consuming a BullMQ/transient retry attempt.
    // Free-tier 429s are per-minute rate limits that clear quickly with backoff.
    if (response.status === 429 && rateLimitRetry < MAX_429_RETRIES) {
      const retryAfterSeconds = this.parseRetryAfterSeconds(response);
      const backoffMultiplier = rateLimitRetry + 1;
      const waitSeconds = Math.min(retryAfterSeconds * backoffMultiplier, MAX_429_WAIT_SECONDS);
      this.logger.warn(
        `Gemini 429 rate limit on ${model} (attempt ${rateLimitRetry + 1}/${MAX_429_RETRIES}). Waiting ${waitSeconds}s before retry.`
      );
      await this.delay(waitSeconds * 1000);
      return this.generateChunkWithModel(prompt, model, rateLimitRetry + 1);
    }

    if (!response.ok) {
      const text = await response.text();
      // 429 after retry: treat as transient rate limit, NOT permanent quota exhaustion.
      // Gemini uses RESOURCE_EXHAUSTED status for per-minute rate limits too,
      // so we must use a distinct error message that won't be misclassified.
      if (response.status === 429) {
        throw new Error(
          `Gemini rate limited (429) on ${model}. Per-minute request limit likely exceeded.`
        );
      }
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
      message.includes("rate limited") ||
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

    // 429/rate-limit errors use the same RESOURCE_EXHAUSTED gRPC status
    // but are transient (per-minute limit), not permanent quota exhaustion.
    // Only treat non-429 errors containing quota keywords as true exhaustion.
    if (message.includes("rate limited") || message.includes("429")) {
      return false;
    }

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

  // ─── Chunk checkpointing (Redis) ──────────────────────────────

  private computeInputHash(text: string, pageSize: string, fontSize: number): string {
    return createHash("sha256")
      .update(`${pageSize}|${fontSize}|${text}`)
      .digest("hex")
      .slice(0, 12);
  }

  private getChunkCacheKey(bookId: string, inputHash: string, chunkIndex: number): string {
    return `bp:gemini-chunk:${bookId}:${inputHash}:${chunkIndex}`;
  }

  private async getCachedChunk(
    bookId: string,
    inputHash: string,
    chunkIndex: number
  ): Promise<GeneratedChunkResult | null> {
    try {
      const client = this.redis?.getClient();
      if (!client) return null;
      const raw = await client.get(this.getChunkCacheKey(bookId, inputHash, chunkIndex));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { text?: string; model?: string };
      if (typeof parsed.text === "string" && typeof parsed.model === "string") {
        return { text: parsed.text, model: parsed.model };
      }
      return null;
    } catch {
      return null;
    }
  }

  private async setCachedChunk(
    bookId: string,
    inputHash: string,
    chunkIndex: number,
    result: GeneratedChunkResult
  ): Promise<void> {
    try {
      const client = this.redis?.getClient();
      if (!client) return;
      await client.set(
        this.getChunkCacheKey(bookId, inputHash, chunkIndex),
        JSON.stringify({ text: result.text, model: result.model }),
        "EX",
        CHUNK_CACHE_TTL_SECONDS
      );
    } catch {
      // Cache write failure is non-critical
    }
  }

  private async clearChunkCache(
    bookId: string,
    inputHash: string,
    chunkCount: number
  ): Promise<void> {
    try {
      const client = this.redis?.getClient();
      if (!client) return;
      const keys = Array.from({ length: chunkCount }, (_, i) =>
        this.getChunkCacheKey(bookId, inputHash, i)
      );
      if (keys.length > 0) {
        await client.del(...keys);
      }
    } catch {
      // Cache cleanup failure is non-critical
    }
  }

  // ─── 429 rate-limit handling ──────────────────────────────────

  private parseRetryAfterSeconds(response: Response): number {
    const header = response.headers.get("retry-after");
    if (header) {
      const seconds = Number(header);
      if (Number.isFinite(seconds) && seconds > 0) {
        return Math.min(seconds, MAX_429_WAIT_SECONDS);
      }
    }
    // Default: 60 seconds for Gemini free tier rate limits
    return 60;
  }
}
