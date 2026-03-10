import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { BooksPipelineService } from "../books/books-pipeline.service.js";
import {
  ManuscriptAnalysisService,
  type ManuscriptMimeType,
} from "../books/manuscript-analysis.service.js";
import { CloudinaryService } from "../cloudinary/cloudinary.service.js";
import { GeminiFormattingService } from "../engine/gemini-formatting.service.js";
import { HtmlValidationService } from "../engine/html-validation.service.js";
import type {
  BookStatus,
  FileType,
  JobStatus,
  JobType,
  OrderStatus,
} from "../generated/prisma/enums.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { JOB_NAMES, QUEUE_AI_FORMATTING } from "./jobs.constants.js";

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
    private readonly htmlValidation: HtmlValidationService
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
    await this.markBookFormatting(payload);

    try {
      const rawBuffer = await this.fetchRawManuscript(payload.rawManuscriptUrl);
      const mimeType = this.resolveMimeType(payload, rawBuffer);
      const manuscriptText = await this.manuscriptAnalysis.extractText(rawBuffer, mimeType);

      const formatted = await this.geminiFormatting.formatManuscript({
        text: manuscriptText,
        pageSize: payload.pageSize,
        fontSize: payload.fontSize,
        bookId: payload.bookId,
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
    const [book, latestRaw] = await Promise.all([
      this.prisma.book.findUnique({
        where: { id: payload.bookId },
        select: {
          pageSize: true,
          fontSize: true,
        },
      }),
      this.prisma.file.findFirst({
        where: {
          bookId: payload.bookId,
          fileType: "RAW_MANUSCRIPT",
        },
        orderBy: { version: "desc" },
        select: {
          id: true,
        },
      }),
    ]);

    return (
      book?.pageSize === payload.pageSize &&
      book?.fontSize === payload.fontSize &&
      latestRaw?.id === payload.rawManuscriptFileId
    );
  }
}
