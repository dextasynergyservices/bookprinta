import { Injectable, Logger } from "@nestjs/common";

type HtmlValidationInput = {
  html: string;
  inputWordCount: number;
};

export type HtmlValidationResult = {
  outputWordCount: number;
};

const MAX_WORD_DRIFT_RATIO = 0.2;

@Injectable()
export class HtmlValidationService {
  private readonly logger = new Logger(HtmlValidationService.name);

  async validateFormattedHtml(input: HtmlValidationInput): Promise<HtmlValidationResult> {
    const html = input.html.trim();
    if (html.length === 0) {
      throw new Error("AI formatting returned empty HTML.");
    }

    if (!/<body[\s>]/i.test(html)) {
      throw new Error("AI output is missing a <body> tag.");
    }

    if (/<script[\s>]/i.test(html)) {
      throw new Error("AI output contains a forbidden <script> tag.");
    }

    if (/<style[\s>]/i.test(html)) {
      throw new Error("AI output contains a forbidden <style> tag.");
    }

    await this.ensureHtmlParses(html);

    const bodyContent = this.extractBodyContent(html);
    const plainText = this.stripHtml(bodyContent);
    if (plainText.length === 0) {
      throw new Error("AI output body is empty.");
    }

    const outputWordCount = this.countWords(plainText);
    if (outputWordCount <= 0) {
      throw new Error("AI output does not contain readable text.");
    }

    if (input.inputWordCount > 0) {
      const driftRatio = Math.abs(outputWordCount - input.inputWordCount) / input.inputWordCount;
      if (driftRatio > MAX_WORD_DRIFT_RATIO) {
        throw new Error(
          `AI output word count drift is too high (${outputWordCount} vs ${input.inputWordCount}).`
        );
      }
    }

    return { outputWordCount };
  }

  private extractBodyContent(html: string): string {
    const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    return match?.[1]?.trim() ?? "";
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

  private async ensureHtmlParses(html: string): Promise<void> {
    try {
      const moduleName = "htmlparser2";
      const parserModule = (await import(moduleName)) as {
        parseDocument?: (source: string) => unknown;
      };
      if (typeof parserModule.parseDocument === "function") {
        parserModule.parseDocument(html);
      } else {
        this.ensureBalancedTags(html);
      }
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isMissingParser =
        message.includes("Cannot find module 'htmlparser2'") ||
        message.includes('Cannot find package "htmlparser2"');
      if (!isMissingParser) {
        this.logger.warn(`htmlparser2 parse failed, using fallback validator: ${message}`);
      }
      this.ensureBalancedTags(html);
      if (!/<\/body>/i.test(html)) {
        throw new Error("AI output HTML appears malformed (missing closing </body>).");
      }
    }
  }

  private ensureBalancedTags(html: string): void {
    const stack: string[] = [];
    const voidTags = new Set([
      "area",
      "base",
      "br",
      "col",
      "embed",
      "hr",
      "img",
      "input",
      "link",
      "meta",
      "param",
      "source",
      "track",
      "wbr",
    ]);

    const tagRegex = /<\/?([a-zA-Z][\w:-]*)(?:\s[^>]*)?>/g;
    for (const match of html.matchAll(tagRegex)) {
      const fullTag = match[0];
      const name = match[1]?.toLowerCase();
      if (!name) continue;
      const isClosing = fullTag.startsWith("</");
      const isSelfClosing = fullTag.endsWith("/>") || voidTags.has(name);

      if (isClosing) {
        const previous = stack.pop();
        if (previous !== name) {
          throw new Error(`AI output HTML is malformed around closing </${name}> tag.`);
        }
        continue;
      }

      if (!isSelfClosing) {
        stack.push(name);
      }
    }

    if (stack.length > 0) {
      throw new Error("AI output HTML has unclosed tags.");
    }
  }
}
