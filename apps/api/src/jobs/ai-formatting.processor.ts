import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger, Optional } from "@nestjs/common";
import type { Job } from "bullmq";
import { BooksPipelineService } from "../books/books-pipeline.service.js";
import {
  ManuscriptAnalysisService,
  type ManuscriptMimeType,
} from "../books/manuscript-analysis.service.js";
import { CloudinaryService } from "../cloudinary/cloudinary.service.js";
import { GeminiFormattingService } from "../engine/gemini-formatting.service.js";
import { GotenbergPageCountService } from "../engine/gotenberg-page-count.service.js";
import { HtmlValidationService } from "../engine/html-validation.service.js";
import { ProcessingEventsService } from "../engine/processing-events.service.js";
import type {
  BookStatus,
  FileType,
  JobStatus,
  JobType,
  OrderStatus,
} from "../generated/prisma/enums.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { RedisService } from "../redis/redis.service.js";
import { JOB_NAMES, QUEUE_AI_FORMATTING } from "./jobs.constants.js";

const CLEANED_HTML_CACHE_TTL_SECONDS = 7200; // 2 hours

/** Wraps a partial fragment (chunk 0) as a minimal HTML document for early preview. */
function wrapPartialFragment(fragment: string): string {
  return `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1" />\n  <title>BookPrinta Partial Preview</title>\n</head>\n<body>\n${fragment}\n</body>\n</html>`;
}

type OrchestrationTrigger = "upload" | "settings_change";
type SupportedPageSize = "A4" | "A5";
type SupportedFontSize = 11 | 12 | 14;

type FormatManuscriptPayload = {
  jobRecordId: string;
  bookId: string;
  orderId: string;
  trigger: OrchestrationTrigger;
  rawManuscriptFileId: string;
  rawManuscriptUrl: string;
  rawManuscriptName?: string | null;
  mimeType?: string | null;
  pageSize: SupportedPageSize;
  fontSize: SupportedFontSize;
  estimatedPages?: number | null;
};

type FormatManuscriptResult = {
  cleanedHtmlFileId: string | null;
  cleanedHtmlUrl: string | null;
  outputWordCount: number;
  inputWordCount: number;
  chunkCount: number;
  model: string;
  pageCountJobId: string | null;
  progressStep?: "AI_FORMATTING";
  ignoredAsSuperseded?: boolean;
};

const FORMATTING_ACTIVE_BOOK_STATUSES: ReadonlySet<BookStatus> = new Set([
  "AI_PROCESSING",
  "FORMATTING",
  "FORMATTING_REVIEW",
  "UPLOADED",
  "PAYMENT_RECEIVED",
]);

const TERMINAL_ORDER_STATUSES: ReadonlySet<OrderStatus> = new Set([
  "IN_PRODUCTION",
  "COMPLETED",
  "CANCELLED",
  "REFUNDED",
]);

@Injectable()
@Processor(QUEUE_AI_FORMATTING, {
  concurrency: 1,
})
export class AiFormattingProcessor extends WorkerHost {
  private readonly logger = new Logger(AiFormattingProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
    private readonly booksPipeline: BooksPipelineService,
    private readonly manuscriptAnalysis: ManuscriptAnalysisService,
    private readonly geminiFormatting: GeminiFormattingService,
    private readonly htmlValidation: HtmlValidationService,
    private readonly gotenbergPageCount: GotenbergPageCountService,
    @Optional() private readonly processingEvents?: ProcessingEventsService,
    @Optional() private readonly redis?: RedisService
  ) {
    super();
  }

  async process(job: Job): Promise<FormatManuscriptResult> {
    if (job.name !== JOB_NAMES.FORMAT_MANUSCRIPT) {
      throw new Error(`Unsupported ai-formatting job name "${job.name}"`);
    }

    const payload = this.parsePayload(job.data);
    const attempt = job.attemptsMade + 1;
    const maxAttempts =
      typeof job.opts.attempts === "number" && Number.isFinite(job.opts.attempts)
        ? Math.max(1, job.opts.attempts)
        : 1;

    await this.markAttemptProcessing(payload, attempt);

    // Bail out immediately if the job was cancelled (admin cancel / superseded by re-upload)
    // between being queued and starting to process.
    if (await this.isJobCancelled(payload.jobRecordId)) {
      this.logger.warn(
        `AI formatting job ${payload.jobRecordId} was cancelled before processing — aborting.`
      );
      return this.buildCancelledResult(payload);
    }

    await this.markBookFormatting(payload);

    // Emit SSE progress: AI formatting started (include estimated pages for instant UI feedback)
    await this.processingEvents?.emit(payload.bookId, {
      type: "progress",
      step: "AI_FORMATTING",
      ...(typeof payload.estimatedPages === "number"
        ? { estimatedPages: payload.estimatedPages }
        : {}),
    });

    try {
      const rawBuffer = await this.fetchRawManuscript(payload.rawManuscriptUrl);
      const mimeType = this.resolveMimeType(payload, rawBuffer);
      const manuscriptText = await this.manuscriptAnalysis.extractText(rawBuffer, mimeType);

      const formatted = await this.geminiFormatting.formatManuscript({
        text: manuscriptText,
        pageSize: payload.pageSize,
        fontSize: payload.fontSize,
        bookId: payload.bookId,
        onChunkComplete: async (fragment, chunkIndex, totalChunks, completedCount) => {
          if (totalChunks <= 1) return; // single-chunk: full preview arrives shortly anyway
          try {
            // Upload partial preview only for the first completed chunk
            let partialPreviewUrl: string | undefined;
            if (chunkIndex === 0) {
              const partialHtml = wrapPartialFragment(fragment);
              const partialFile = await this.saveCleanedHtmlFile({
                bookId: payload.bookId,
                html: partialHtml,
                jobKey: `partial-${String(job.id ?? payload.jobRecordId)}`,
              });
              partialPreviewUrl = partialFile.url;
            }
            await this.processingEvents?.emit(payload.bookId, {
              type: "progress",
              step: "AI_FORMATTING",
              chunkProgress: `${completedCount}/${totalChunks}`,
              ...(partialPreviewUrl ? { partialPreviewUrl } : {}),
            });
          } catch (error) {
            this.logger.debug?.(
              `Chunk progress emission failed for book ${payload.bookId}: ${this.toErrorMessage(error)}`
            );
          }
        },
      });

      const validated = await this.htmlValidation.validateFormattedHtml({
        html: formatted.html,
        inputWordCount: formatted.inputWordCount,
      });

      const stillCurrentBeforePersist = await this.isCurrentFormatRequest(payload);
      if (!stillCurrentBeforePersist) {
        const result: FormatManuscriptResult = {
          cleanedHtmlFileId: null,
          cleanedHtmlUrl: null,
          outputWordCount: validated.outputWordCount,
          inputWordCount: formatted.inputWordCount,
          chunkCount: formatted.chunkCount,
          model: formatted.model,
          pageCountJobId: null,
          progressStep: "AI_FORMATTING",
          ignoredAsSuperseded: true,
        };
        await this.markAttemptSuperseded(payload, result);
        this.logger.warn(
          `Skipped stale AI formatting write for book ${payload.bookId} (job=${payload.jobRecordId}) because manuscript/settings changed.`
        );
        return result;
      }

      const cleanedHtmlFile = await this.saveCleanedHtmlFile({
        bookId: payload.bookId,
        html: formatted.html,
        jobKey: String(job.id ?? payload.jobRecordId),
      });

      // Cache cleaned HTML in Redis for fast access by page-count processor
      await this.cacheCleanedHtml(cleanedHtmlFile.url, formatted.html);

      // Check again: job may have been cancelled during AI processing (race with admin cancel)
      if (await this.isJobCancelled(payload.jobRecordId)) {
        this.logger.warn(
          `AI formatting job ${payload.jobRecordId} was cancelled during processing — skipping status write and page-count enqueue.`
        );
        return this.buildCancelledResult(payload, {
          cleanedHtmlFileId: cleanedHtmlFile.id,
          cleanedHtmlUrl: cleanedHtmlFile.url,
          outputWordCount: validated.outputWordCount,
          inputWordCount: formatted.inputWordCount,
          chunkCount: formatted.chunkCount,
          model: formatted.model,
        });
      }

      // Pre-warm Gotenberg so it's ready when page-count job starts
      this.gotenbergPageCount.warmUp().catch(() => {});

      const pageCountEnqueue = await this.booksPipeline.enqueuePageCountFromAiSuccess({
        bookId: payload.bookId,
        trigger: payload.trigger,
        cleanedHtmlFileId: cleanedHtmlFile.id,
        cleanedHtmlUrl: cleanedHtmlFile.url,
        outputWordCount: validated.outputWordCount,
        sourceAiJobRecordId: payload.jobRecordId,
      });

      const result: FormatManuscriptResult = {
        cleanedHtmlFileId: cleanedHtmlFile.id,
        cleanedHtmlUrl: cleanedHtmlFile.url,
        outputWordCount: validated.outputWordCount,
        inputWordCount: formatted.inputWordCount,
        chunkCount: formatted.chunkCount,
        model: formatted.model,
        pageCountJobId: pageCountEnqueue.jobRecordId,
        progressStep: "AI_FORMATTING",
      };

      await this.markAttemptCompleted(payload, result);

      // Emit SSE progress: AI formatting done, transitioning to page count
      await this.processingEvents?.emit(payload.bookId, {
        type: "progress",
        step: "COUNTING_PAGES",
      });

      this.logger.log(
        `AI formatting completed for book ${payload.bookId} (job=${payload.jobRecordId}, count=${pageCountEnqueue.reason})`
      );
      return result;
    } catch (error) {
      const isFinalAttempt = attempt >= maxAttempts;
      await this.markAttemptFailed({
        payload,
        attempt,
        error: this.toErrorMessage(error),
        isFinalAttempt,
      });

      if (isFinalAttempt) {
        await this.processingEvents?.emit(payload.bookId, {
          type: "error",
          message: "Processing failed. Our team has been notified.",
          retryable: true,
        });
      }

      throw error;
    }
  }

  private parsePayload(value: unknown): FormatManuscriptPayload {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Invalid ai-formatting payload.");
    }
    const payload = value as Record<string, unknown>;

    const trigger = payload.trigger;
    const pageSize = payload.pageSize;
    const fontSize = payload.fontSize;

    if (trigger !== "upload" && trigger !== "settings_change") {
      throw new Error("Invalid trigger in ai-formatting payload.");
    }
    if (pageSize !== "A4" && pageSize !== "A5") {
      throw new Error("Invalid pageSize in ai-formatting payload.");
    }
    if (fontSize !== 11 && fontSize !== 12 && fontSize !== 14) {
      throw new Error("Invalid fontSize in ai-formatting payload.");
    }

    const requiredKeys = [
      "jobRecordId",
      "bookId",
      "orderId",
      "rawManuscriptFileId",
      "rawManuscriptUrl",
    ] as const;

    for (const key of requiredKeys) {
      const value = payload[key];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error(`Missing ${key} in ai-formatting payload.`);
      }
    }

    return {
      jobRecordId: payload.jobRecordId as string,
      bookId: payload.bookId as string,
      orderId: payload.orderId as string,
      trigger,
      rawManuscriptFileId: payload.rawManuscriptFileId as string,
      rawManuscriptUrl: payload.rawManuscriptUrl as string,
      rawManuscriptName:
        typeof payload.rawManuscriptName === "string" ? payload.rawManuscriptName : null,
      mimeType: typeof payload.mimeType === "string" ? payload.mimeType : null,
      pageSize,
      fontSize,
      estimatedPages:
        typeof payload.estimatedPages === "number" && Number.isFinite(payload.estimatedPages)
          ? payload.estimatedPages
          : null,
    };
  }

  private async fetchRawManuscript(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch manuscript from storage (${response.status}).`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  private resolveMimeType(payload: FormatManuscriptPayload, buffer: Buffer): ManuscriptMimeType {
    const fileName = payload.rawManuscriptName ?? "manuscript";
    if (
      payload.mimeType === "application/pdf" ||
      payload.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      return payload.mimeType;
    }

    return this.manuscriptAnalysis.detectMimeType({
      originalname: fileName,
      mimetype: payload.mimeType ?? "application/octet-stream",
      buffer,
    } as Express.Multer.File);
  }

  private async saveCleanedHtmlFile(params: {
    bookId: string;
    html: string;
    jobKey: string;
  }): Promise<{
    id: string;
    url: string;
  }> {
    const fileType: FileType = "CLEANED_HTML";
    const fileName = `cleaned-${params.jobKey}.html`;

    const existing = await this.prisma.file.findFirst({
      where: {
        bookId: params.bookId,
        fileType,
        fileName,
      },
      select: {
        id: true,
        url: true,
      },
    });
    if (existing) {
      return existing;
    }

    const publicId = `bookprinta/cleaned-html/${params.bookId}/${params.jobKey}`;
    const upload = await this.cloudinary.upload(Buffer.from(params.html, "utf8"), {
      resource_type: "raw",
      type: "upload",
      public_id: publicId,
      overwrite: true,
    });

    const latestVersion = await this.prisma.file.findFirst({
      where: {
        bookId: params.bookId,
        fileType,
      },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const version = (latestVersion?.version ?? 0) + 1;

    const created = await this.prisma.file.create({
      data: {
        bookId: params.bookId,
        fileType,
        url: upload.secure_url,
        fileName,
        fileSize: Buffer.byteLength(params.html, "utf8"),
        mimeType: "text/html",
        version,
        createdBy: "AI",
      },
      select: {
        id: true,
        url: true,
      },
    });

    return created;
  }

  private async markAttemptProcessing(
    payload: FormatManuscriptPayload,
    attempt: number
  ): Promise<void> {
    const status: JobStatus = "PROCESSING";
    const type: JobType = "AI_CLEANING";
    await this.prisma.job.updateMany({
      where: {
        id: payload.jobRecordId,
        type,
      },
      data: {
        status,
        attempts: attempt,
        startedAt: new Date(),
        error: null,
        result: {
          progressStep: "AI_FORMATTING",
        },
      },
    });
  }

  private async markBookFormatting(payload: FormatManuscriptPayload): Promise<void> {
    // Guard: skip status write if the job was cancelled (admin cancel / superseded by upload)
    if (await this.isJobCancelled(payload.jobRecordId)) return;

    const book = await this.prisma.book.findUnique({
      where: { id: payload.bookId },
      select: { status: true },
    });

    if (book && FORMATTING_ACTIVE_BOOK_STATUSES.has(book.status)) {
      await this.prisma.book.update({
        where: { id: payload.bookId },
        data: { status: "FORMATTING" },
      });
    }

    const order = await this.prisma.order.findUnique({
      where: { id: payload.orderId },
      select: { status: true },
    });
    if (order && !TERMINAL_ORDER_STATUSES.has(order.status)) {
      await this.prisma.order.update({
        where: { id: payload.orderId },
        data: { status: "FORMATTING" },
      });
    }
  }

  private async markAttemptCompleted(
    payload: FormatManuscriptPayload,
    result: FormatManuscriptResult
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Guard: if the job was marked FAILED by admin cancel or superseded-by-upload,
      // do NOT overwrite the book/order status that the cancel flow already reset.
      const jobRecord = await tx.job.findUnique({
        where: { id: payload.jobRecordId },
        select: { status: true },
      });
      if (jobRecord?.status === "FAILED") {
        this.logger.warn(
          `Skipping AI formatting status write for cancelled job ${payload.jobRecordId} (book ${payload.bookId}).`
        );
        return;
      }

      await tx.book.update({
        where: { id: payload.bookId },
        data: {
          status: "FORMATTED",
          currentHtmlUrl: result.cleanedHtmlUrl,
        },
      });

      await tx.job.update({
        where: { id: payload.jobRecordId },
        data: {
          status: "COMPLETED",
          result,
          error: null,
          finishedAt: new Date(),
        },
      });
    });
  }

  private async markAttemptSuperseded(
    payload: FormatManuscriptPayload,
    result: FormatManuscriptResult
  ): Promise<void> {
    await this.prisma.job.update({
      where: { id: payload.jobRecordId },
      data: {
        status: "COMPLETED",
        result,
        error: null,
        finishedAt: new Date(),
      },
    });
  }

  private async markAttemptFailed(params: {
    payload: FormatManuscriptPayload;
    attempt: number;
    error: string;
    isFinalAttempt: boolean;
  }): Promise<void> {
    const { payload, attempt, error, isFinalAttempt } = params;

    // Guard: if the job was already marked FAILED by admin cancel, don't overwrite
    if (await this.isJobCancelled(payload.jobRecordId)) return;

    await this.prisma.job.updateMany({
      where: {
        id: payload.jobRecordId,
      },
      data: {
        attempts: attempt,
        status: isFinalAttempt ? "FAILED" : "QUEUED",
        error,
        ...(isFinalAttempt ? { finishedAt: new Date() } : { startedAt: null }),
      },
    });

    if (isFinalAttempt) {
      await this.prisma.book.updateMany({
        where: { id: payload.bookId },
        data: {
          status: "FORMATTING_REVIEW",
        },
      });
      await this.prisma.order.updateMany({
        where: {
          id: payload.orderId,
          status: {
            notIn: Array.from(TERMINAL_ORDER_STATUSES),
          },
        },
        data: {
          status: "ACTION_REQUIRED",
        },
      });
      this.logger.error(
        `AI formatting failed permanently for book ${payload.bookId} (job=${payload.jobRecordId}): ${error}`
      );
    } else {
      this.logger.warn(
        `AI formatting attempt ${attempt} failed for book ${payload.bookId} (job=${payload.jobRecordId}): ${error}`
      );
    }
  }

  private toErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message;
    }
    return String(error);
  }

  private async isCurrentFormatRequest(payload: FormatManuscriptPayload): Promise<boolean> {
    const book = await this.prisma.book.findUnique({
      where: { id: payload.bookId },
      select: {
        pageSize: true,
        fontSize: true,
      },
    });
    const latestRaw = await this.prisma.file.findFirst({
      where: {
        bookId: payload.bookId,
        fileType: "RAW_MANUSCRIPT",
      },
      orderBy: { version: "desc" },
      select: {
        id: true,
      },
    });

    return (
      book?.pageSize === payload.pageSize &&
      book?.fontSize === payload.fontSize &&
      latestRaw?.id === payload.rawManuscriptFileId
    );
  }

  /**
   * Returns true if the DB job record was marked FAILED by admin cancel
   * or superseded-by-upload. Processors check this before writing status.
   */
  private async isJobCancelled(jobRecordId: string): Promise<boolean> {
    const record = await this.prisma.job.findUnique({
      where: { id: jobRecordId },
      select: { status: true },
    });
    return record?.status === "FAILED";
  }

  private buildCancelledResult(
    _payload: FormatManuscriptPayload,
    partial?: {
      cleanedHtmlFileId: string;
      cleanedHtmlUrl: string;
      outputWordCount: number;
      inputWordCount: number;
      chunkCount: number;
      model: string;
    }
  ): FormatManuscriptResult {
    return {
      cleanedHtmlFileId: partial?.cleanedHtmlFileId ?? null,
      cleanedHtmlUrl: partial?.cleanedHtmlUrl ?? null,
      outputWordCount: partial?.outputWordCount ?? 0,
      inputWordCount: partial?.inputWordCount ?? 0,
      chunkCount: partial?.chunkCount ?? 0,
      model: partial?.model ?? "cancelled",
      pageCountJobId: null,
      progressStep: "AI_FORMATTING",
      ignoredAsSuperseded: true,
    };
  }

  private async cacheCleanedHtml(url: string, html: string): Promise<void> {
    try {
      const client = this.redis?.getClient();
      if (!client) return;
      await client.set(`bp:cleaned-html:${url}`, html, "EX", CLEANED_HTML_CACHE_TTL_SECONDS);
    } catch {
      // Cache write failure is non-critical
    }
  }
}
