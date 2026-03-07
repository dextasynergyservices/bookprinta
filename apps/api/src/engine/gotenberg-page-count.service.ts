import { createHash } from "node:crypto";
import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";

type SupportedPageSize = "A4" | "A5";
type SupportedFontSize = 11 | 12 | 14;

const PAGE_SIZE_TO_INCHES: Record<SupportedPageSize, { width: string; height: string }> = {
  A4: { width: "8.27", height: "11.69" },
  A5: { width: "5.83", height: "8.27" },
};

const PAGE_SIZE_TO_MARGINS_MM: Record<
  SupportedPageSize,
  { top: number; right: number; bottom: number; left: number }
> = {
  A4: { top: 19, right: 19, bottom: 19, left: 19 },
  A5: { top: 14, right: 14, bottom: 14, left: 14 },
};

export type AuthoritativePageCountInput = {
  html: string;
  pageSize: SupportedPageSize;
  fontSize: SupportedFontSize;
};

export type RenderPdfInput = {
  html: string;
  pageSize: SupportedPageSize;
  fontSize: SupportedFontSize;
  watermarkText?: string | null;
};

export type RenderPdfResult = {
  pdfBuffer: Buffer;
  renderedPdfSha256: string;
};

export type AuthoritativePageCountResult = {
  pageCount: number;
  renderedPdfSha256: string;
};

@Injectable()
export class GotenbergPageCountService {
  private readonly logger = new Logger(GotenbergPageCountService.name);

  async countPages(input: AuthoritativePageCountInput): Promise<AuthoritativePageCountResult> {
    const rendered = await this.renderPdf(input);
    const pageCount = this.countPagesFromPdf(rendered.pdfBuffer);

    return {
      pageCount,
      renderedPdfSha256: rendered.renderedPdfSha256,
    };
  }

  async renderPdf(input: RenderPdfInput): Promise<RenderPdfResult> {
    const html = this.prepareCountHtml(input);
    const renderedPdf = await this.renderWithGotenberg(html, input.pageSize);
    const pageCount = this.countPagesFromPdf(renderedPdf);
    if (pageCount < 1) {
      throw new Error("Unable to render a valid PDF from formatted HTML.");
    }

    return {
      pdfBuffer: renderedPdf,
      renderedPdfSha256: createHash("sha256").update(renderedPdf).digest("hex"),
    };
  }

  private prepareCountHtml(input: RenderPdfInput): string {
    const bodyContent = this.extractBodyContent(input.html);
    const margins = PAGE_SIZE_TO_MARGINS_MM[input.pageSize];
    const watermarkText = input.watermarkText?.trim();

    return [
      "<!doctype html>",
      '<html lang="en">',
      "<head>",
      '  <meta charset="utf-8" />',
      '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
      "  <style>",
      `    @page { size: ${input.pageSize}; margin: ${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm; }`,
      "    * { box-sizing: border-box; }",
      "    html, body { width: 100%; }",
      `    body { font-family: "Miller Text", "Times New Roman", serif; font-size: ${input.fontSize}pt; line-height: 1.5; color: #101828; margin: 0; padding: 0; }`,
      "    p, li, blockquote { margin: 0 0 0.8em 0; }",
      "    h1, h2, h3, h4 { margin: 1.2em 0 0.5em 0; line-height: 1.25; }",
      "    img { max-width: 100%; height: auto; }",
      "    .bookprinta-watermark { position: fixed; top: 45%; left: 50%; transform: translate(-50%, -50%) rotate(-28deg); font-family: Arial, sans-serif; font-size: 30pt; letter-spacing: 0.35em; color: rgba(15, 23, 42, 0.14); text-transform: uppercase; z-index: 9999; pointer-events: none; user-select: none; white-space: nowrap; }",
      "  </style>",
      "</head>",
      "<body>",
      ...(watermarkText
        ? [`<div class="bookprinta-watermark">${this.escapeHtml(watermarkText)}</div>`]
        : []),
      bodyContent,
      "</body>",
      "</html>",
    ].join("\n");
  }

  private extractBodyContent(inputHtml: string): string {
    const html = inputHtml.trim();
    const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (match?.[1]) {
      return match[1].trim();
    }
    return html;
  }

  private async renderWithGotenberg(html: string, pageSize: SupportedPageSize): Promise<Buffer> {
    const baseUrls = this.buildGotenbergBaseUrls();
    if (baseUrls.length === 0) {
      throw new ServiceUnavailableException(
        "Authoritative page counting is unavailable because GOTENBERG_URL is not configured."
      );
    }

    const headerVariants = this.buildGotenbergHeaderVariants();
    const maxAttemptsPerEndpoint = 3;
    const pageConfig = PAGE_SIZE_TO_INCHES[pageSize];

    for (const baseUrl of baseUrls) {
      for (const headers of headerVariants) {
        const hasAuthHeader = typeof headers.Authorization === "string";

        for (let attempt = 1; attempt <= maxAttemptsPerEndpoint; attempt += 1) {
          const form = new FormData();
          form.append("files", new Blob([html], { type: "text/html;charset=utf-8" }), "index.html");
          form.append("paperWidth", pageConfig.width);
          form.append("paperHeight", pageConfig.height);
          form.append("preferCssPageSize", "true");
          form.append("printBackground", "true");

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 15_000);

          let response: Response | null = null;
          try {
            response = await fetch(`${baseUrl}/forms/chromium/convert/html`, {
              method: "POST",
              body: form,
              headers,
              signal: controller.signal,
            });
          } catch (error) {
            this.logger.error(
              `Gotenberg page-count request failed on attempt ${attempt}/${maxAttemptsPerEndpoint} via ${baseUrl}`,
              error
            );
          } finally {
            clearTimeout(timeout);
          }

          if (response?.ok) {
            const bytes = await response.arrayBuffer();
            return Buffer.from(bytes);
          }

          if (response && hasAuthHeader && (response.status === 401 || response.status === 403)) {
            this.logger.warn(
              `Gotenberg rejected configured basic auth via ${baseUrl}; retrying without auth headers.`
            );
            break;
          }

          if (response) {
            const bodySnippet = await response
              .text()
              .then((value) => value.slice(0, 400))
              .catch(() => "");
            this.logger.error(
              `Gotenberg returned ${response.status} on attempt ${attempt}/${maxAttemptsPerEndpoint} via ${baseUrl} while counting pages. ${bodySnippet}`
            );
          }

          if (attempt < maxAttemptsPerEndpoint) {
            await this.delay(400 * attempt);
          }
        }
      }
    }

    throw new ServiceUnavailableException(
      "Unable to compute authoritative page count because Gotenberg render failed."
    );
  }

  private countPagesFromPdf(pdfBuffer: Buffer): number {
    const source = pdfBuffer.toString("latin1");

    const pageMatches = source.match(/\/Type\s*\/Page(?!s)\b/g);
    const pageCount = pageMatches?.length ?? 0;
    if (pageCount > 0) {
      return pageCount;
    }

    const counts = [...source.matchAll(/\/Count\s+(\d+)/g)]
      .map((match) => Number.parseInt(match[1] ?? "0", 10))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (counts.length > 0) {
      return Math.max(...counts);
    }

    throw new Error("Unable to extract page count from rendered PDF.");
  }

  private buildGotenbergAuthHeaders(): Record<string, string> {
    const username = process.env.GOTENBERG_USERNAME?.trim();
    const password = process.env.GOTENBERG_PASSWORD?.trim();
    if (!username || !password) {
      return {};
    }

    const token = Buffer.from(`${username}:${password}`, "utf-8").toString("base64");
    return { Authorization: `Basic ${token}` };
  }

  private buildGotenbergBaseUrls(): string[] {
    const primary = (process.env.GOTENBERG_URL ?? "").trim().replace(/\/+$/, "");
    const backup = (process.env.GOTENBERG_BACKUP_URL ?? "").trim().replace(/\/+$/, "");

    return [primary, backup].filter(
      (url, index, all) => Boolean(url) && all.indexOf(url) === index
    );
  }

  private buildGotenbergHeaderVariants(): Array<Record<string, string>> {
    const authHeaders = this.buildGotenbergAuthHeaders();
    if (Object.keys(authHeaders).length === 0) {
      return [{}];
    }
    return [authHeaders, {}];
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }
}
