import type { BookFontSize, BookPageSize } from "@bookprinta/shared";
import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";

const GEMINI_ENDPOINT_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_GEMINI_MODEL = "gemini-1.5-flash";
const CHUNK_TRIGGER_WORD_COUNT = 30_000;
const TARGET_CHUNK_WORDS = 10_000;

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

    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      const prompt = this.buildPrompt({
        chunk,
        chunkIndex: index + 1,
        chunkCount: chunks.length,
        pageSize: input.pageSize,
        fontSize: input.fontSize,
      });
      const generated = await this.generateChunk(prompt);
      fragments.push(this.normalizeGeneratedFragment(generated));
    }

    const mergedFragment = fragments.join("\n\n");
    const html = this.wrapFragmentAsHtml(mergedFragment);
    const outputWordCount = this.countWords(this.stripHtml(html));

    this.logger.log(
      `Gemini formatting complete for book ${input.bookId}: ${chunks.length} chunk(s), ${inputWordCount} -> ${outputWordCount} words`
    );

    return {
      html,
      inputWordCount,
      outputWordCount,
      chunkCount: chunks.length,
      model: this.getModel(),
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
      "- Use semantic tags (<h1>, <h2>, <p>, <blockquote>, <ul>, <ol>, <li>) where appropriate.",
      "- Keep punctuation and wording faithful to the source text.",
      "",
      "MANUSCRIPT CHUNK:",
      params.chunk,
    ].join("\n");
  }

  private async generateChunk(prompt: string): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new ServiceUnavailableException(
        "AI formatting service is not configured. GEMINI_API_KEY is missing."
      );
    }

    const model = this.getModel();
    const endpoint = `${GEMINI_ENDPOINT_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
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
    });

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
}
