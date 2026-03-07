import { createHash } from "node:crypto";
import { InjectQueue } from "@nestjs/bullmq";
import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Queue } from "bullmq";
import {
  JOB_NAMES,
  QUEUE_AI_FORMATTING,
  QUEUE_PAGE_COUNT,
  QUEUE_PDF_GENERATION,
} from "../jobs/jobs.constants.js";
import { PrismaService } from "../prisma/prisma.service.js";

type OrchestrationTrigger = "upload" | "settings_change";
type EnqueueResultReason = "QUEUED" | "NO_MANUSCRIPT" | "ALREADY_ACTIVE";
type QueueJobState =
  | "waiting"
  | "active"
  | "delayed"
  | "prioritized"
  | "waiting-children"
  | "completed"
  | "failed";

export type EnqueueResult = {
  queued: boolean;
  reason: EnqueueResultReason;
  jobRecordId: string | null;
  queueJobId: string | null;
};

const ACTIVE_DB_JOB_STATUSES = ["QUEUED", "PROCESSING"] as const;
const ACTIVE_QUEUE_STATES = new Set<QueueJobState>([
  "waiting",
  "active",
  "delayed",
  "prioritized",
  "waiting-children",
]);
const TERMINAL_BOOK_STATUSES = new Set([
  "IN_PRODUCTION",
  "PRINTING",
  "PRINTED",
  "SHIPPING",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
]);
const TERMINAL_ORDER_STATUSES = new Set(["IN_PRODUCTION", "COMPLETED", "CANCELLED", "REFUNDED"]);

@Injectable()
export class BooksPipelineService {
  private readonly logger = new Logger(BooksPipelineService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_AI_FORMATTING) private readonly aiFormattingQueue: Queue,
    @InjectQueue(QUEUE_PAGE_COUNT) private readonly pageCountQueue: Queue,
    @InjectQueue(QUEUE_PDF_GENERATION) private readonly pdfGenerationQueue: Queue
  ) {}

  async enqueueFormatManuscript(params: {
    bookId: string;
    trigger: OrchestrationTrigger;
  }): Promise<EnqueueResult> {
    const book = await this.prisma.book.findUnique({
      where: { id: params.bookId },
      select: {
        id: true,
        userId: true,
        orderId: true,
        status: true,
        pageSize: true,
        fontSize: true,
        wordCount: true,
        estimatedPages: true,
        order: {
          select: {
            id: true,
            status: true,
            package: {
              select: {
                pageLimit: true,
              },
            },
          },
        },
      },
    });

    if (!book) {
      throw new NotFoundException(`Book "${params.bookId}" not found`);
    }

    if (!this.isSupportedPageSize(book.pageSize) || !this.isSupportedFontSize(book.fontSize)) {
      throw new BadRequestException("Book size and font size must be selected before formatting.");
    }

    const rawManuscript = await this.prisma.file.findFirst({
      where: {
        bookId: book.id,
        fileType: "RAW_MANUSCRIPT",
      },
      orderBy: { version: "desc" },
      select: {
        id: true,
        url: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        version: true,
      },
    });

    if (!rawManuscript) {
      return {
        queued: false,
        reason: "NO_MANUSCRIPT",
        jobRecordId: null,
        queueJobId: null,
      };
    }

    const fingerprint = this.createFingerprint([
      "format",
      book.id,
      rawManuscript.id,
      book.pageSize,
      String(book.fontSize),
      String(book.wordCount ?? "0"),
      params.trigger,
    ]);
    const queueJobId = this.buildQueueJobId("format", book.id, fingerprint);

    const hasActiveQueueJob = await this.hasActiveQueueJob(this.aiFormattingQueue, queueJobId);
    if (hasActiveQueueJob) {
      return {
        queued: false,
        reason: "ALREADY_ACTIVE",
        jobRecordId: null,
        queueJobId,
      };
    }

    const hasActiveDbJob = await this.hasActiveJobWithFingerprint({
      bookId: book.id,
      type: "AI_CLEANING",
      fingerprint,
    });
    if (hasActiveDbJob) {
      return {
        queued: false,
        reason: "ALREADY_ACTIVE",
        jobRecordId: null,
        queueJobId,
      };
    }

    const payload = {
      trigger: params.trigger,
      source: params.trigger === "upload" ? "books.upload" : "books.settings",
      bookId: book.id,
      orderId: book.orderId,
      userId: book.userId,
      rawManuscriptFileId: rawManuscript.id,
      rawManuscriptUrl: rawManuscript.url,
      rawManuscriptName: rawManuscript.fileName ?? null,
      rawManuscriptVersion: rawManuscript.version,
      mimeType: rawManuscript.mimeType ?? null,
      fileSize: rawManuscript.fileSize ?? null,
      pageSize: book.pageSize,
      fontSize: book.fontSize,
      wordCount: book.wordCount ?? null,
      estimatedPages: book.estimatedPages ?? null,
      bundlePageLimit: book.order.package.pageLimit,
      fingerprint,
      queuedAt: new Date().toISOString(),
    };

    const jobRecord = await this.prisma.job.create({
      data: {
        bookId: book.id,
        type: "AI_CLEANING",
        status: "QUEUED",
        payload,
      },
      select: { id: true },
    });

    try {
      await this.aiFormattingQueue.add(
        JOB_NAMES.FORMAT_MANUSCRIPT,
        {
          jobRecordId: jobRecord.id,
          ...payload,
        },
        { jobId: queueJobId }
      );
    } catch (error) {
      if (this.isDuplicateQueueJobError(error)) {
        await this.prisma.job.delete({ where: { id: jobRecord.id } });
        return {
          queued: false,
          reason: "ALREADY_ACTIVE",
          jobRecordId: null,
          queueJobId,
        };
      }

      await this.prisma.job.update({
        where: { id: jobRecord.id },
        data: {
          status: "FAILED",
          error: this.toErrorMessage(error),
        },
      });
      throw error;
    }

    await this.markFormattingQueued({
      bookId: book.id,
      orderId: book.orderId,
      bookStatus: book.status,
      orderStatus: book.order.status,
    });

    this.logger.log(
      `Queued FORMAT_MANUSCRIPT for book ${book.id} (trigger=${params.trigger}, job=${jobRecord.id})`
    );

    return {
      queued: true,
      reason: "QUEUED",
      jobRecordId: jobRecord.id,
      queueJobId,
    };
  }

  async enqueuePageCountFromAiSuccess(params: {
    bookId: string;
    trigger: OrchestrationTrigger;
    cleanedHtmlFileId: string;
    cleanedHtmlUrl: string;
    outputWordCount?: number | null;
    sourceAiJobRecordId?: string | null;
  }): Promise<EnqueueResult> {
    const book = await this.prisma.book.findUnique({
      where: { id: params.bookId },
      select: {
        id: true,
        orderId: true,
        status: true,
        pageSize: true,
        fontSize: true,
        order: {
          select: {
            status: true,
            package: {
              select: {
                pageLimit: true,
              },
            },
          },
        },
      },
    });

    if (!book) {
      throw new NotFoundException(`Book "${params.bookId}" not found`);
    }

    if (!this.isSupportedPageSize(book.pageSize) || !this.isSupportedFontSize(book.fontSize)) {
      throw new BadRequestException(
        "Book size and font size must be selected before page counting."
      );
    }

    const fingerprint = this.createFingerprint([
      "count-pages",
      book.id,
      params.cleanedHtmlFileId,
      book.pageSize,
      String(book.fontSize),
      params.trigger,
    ]);
    const queueJobId = this.buildQueueJobId("count-pages", book.id, fingerprint);

    const hasActiveQueueJob = await this.hasActiveQueueJob(this.pageCountQueue, queueJobId);
    if (hasActiveQueueJob) {
      return {
        queued: false,
        reason: "ALREADY_ACTIVE",
        jobRecordId: null,
        queueJobId,
      };
    }

    const hasActiveDbJob = await this.hasActiveJobWithFingerprint({
      bookId: book.id,
      type: "PAGE_COUNT",
      fingerprint,
    });
    if (hasActiveDbJob) {
      return {
        queued: false,
        reason: "ALREADY_ACTIVE",
        jobRecordId: null,
        queueJobId,
      };
    }

    const payload = {
      trigger: params.trigger,
      source: "ai-formatting.success",
      bookId: book.id,
      orderId: book.orderId,
      cleanedHtmlFileId: params.cleanedHtmlFileId,
      cleanedHtmlUrl: params.cleanedHtmlUrl,
      pageSize: book.pageSize,
      fontSize: book.fontSize,
      outputWordCount: params.outputWordCount ?? null,
      bundlePageLimit: book.order.package.pageLimit,
      sourceAiJobRecordId: params.sourceAiJobRecordId ?? null,
      fingerprint,
      queuedAt: new Date().toISOString(),
    };

    const jobRecord = await this.prisma.job.create({
      data: {
        bookId: book.id,
        type: "PAGE_COUNT",
        status: "QUEUED",
        payload,
      },
      select: { id: true },
    });

    try {
      await this.pageCountQueue.add(
        JOB_NAMES.COUNT_PAGES,
        {
          jobRecordId: jobRecord.id,
          ...payload,
        },
        { jobId: queueJobId }
      );
    } catch (error) {
      if (this.isDuplicateQueueJobError(error)) {
        await this.prisma.job.delete({ where: { id: jobRecord.id } });
        return {
          queued: false,
          reason: "ALREADY_ACTIVE",
          jobRecordId: null,
          queueJobId,
        };
      }

      await this.prisma.job.update({
        where: { id: jobRecord.id },
        data: {
          status: "FAILED",
          error: this.toErrorMessage(error),
        },
      });
      throw error;
    }

    await this.markPageCountQueued({
      bookId: book.id,
      orderId: book.orderId,
      bookStatus: book.status,
      orderStatus: book.order.status,
    });

    this.logger.log(`Queued COUNT_PAGES for book ${book.id} (job=${jobRecord.id})`);

    return {
      queued: true,
      reason: "QUEUED",
      jobRecordId: jobRecord.id,
      queueJobId,
    };
  }

  async enqueueGeneratePdf(params: { bookId: string }): Promise<EnqueueResult> {
    const book = await this.prisma.book.findUnique({
      where: { id: params.bookId },
      select: {
        id: true,
        orderId: true,
        status: true,
        pageSize: true,
        fontSize: true,
        currentHtmlUrl: true,
      },
    });

    if (!book) {
      throw new NotFoundException(`Book "${params.bookId}" not found`);
    }

    if (!this.isSupportedPageSize(book.pageSize) || !this.isSupportedFontSize(book.fontSize)) {
      throw new BadRequestException(
        "Book size and font size must be selected before PDF generation."
      );
    }

    if (!book.currentHtmlUrl) {
      throw new BadRequestException("Formatted manuscript HTML is missing for PDF generation.");
    }
    const cleanedHtmlFile = await this.prisma.file.findFirst({
      where: {
        bookId: book.id,
        fileType: "CLEANED_HTML",
        url: book.currentHtmlUrl,
      },
      orderBy: { version: "desc" },
      select: {
        id: true,
      },
    });
    if (!cleanedHtmlFile) {
      throw new BadRequestException(
        "Formatted manuscript file record is missing for PDF generation."
      );
    }

    const fingerprint = this.createFingerprint([
      "generate-pdf",
      book.id,
      cleanedHtmlFile.id,
      book.currentHtmlUrl,
      book.pageSize,
      String(book.fontSize),
    ]);
    const queueJobId = this.buildQueueJobId("generate-pdf", book.id, fingerprint);

    const hasActiveQueueJob = await this.hasActiveQueueJob(this.pdfGenerationQueue, queueJobId);
    if (hasActiveQueueJob) {
      return {
        queued: false,
        reason: "ALREADY_ACTIVE",
        jobRecordId: null,
        queueJobId,
      };
    }

    const hasActiveDbJob = await this.hasActiveJobWithFingerprint({
      bookId: book.id,
      type: "PDF_GENERATION",
      fingerprint,
    });
    if (hasActiveDbJob) {
      return {
        queued: false,
        reason: "ALREADY_ACTIVE",
        jobRecordId: null,
        queueJobId,
      };
    }

    const payload = {
      source: "books.approve",
      trigger: "approval",
      bookId: book.id,
      orderId: book.orderId,
      cleanedHtmlFileId: cleanedHtmlFile.id,
      cleanedHtmlUrl: book.currentHtmlUrl,
      pageSize: book.pageSize,
      fontSize: book.fontSize,
      fingerprint,
      queuedAt: new Date().toISOString(),
    };

    const jobRecord = await this.prisma.job.create({
      data: {
        bookId: book.id,
        type: "PDF_GENERATION",
        status: "QUEUED",
        payload,
      },
      select: { id: true },
    });

    try {
      await this.pdfGenerationQueue.add(
        JOB_NAMES.GENERATE_PDF,
        {
          jobRecordId: jobRecord.id,
          ...payload,
        },
        { jobId: queueJobId }
      );
    } catch (error) {
      if (this.isDuplicateQueueJobError(error)) {
        await this.prisma.job.delete({ where: { id: jobRecord.id } });
        return {
          queued: false,
          reason: "ALREADY_ACTIVE",
          jobRecordId: null,
          queueJobId,
        };
      }

      await this.prisma.job.update({
        where: { id: jobRecord.id },
        data: {
          status: "FAILED",
          error: this.toErrorMessage(error),
        },
      });
      throw error;
    }

    this.logger.log(`Queued GENERATE_PDF for book ${book.id} (job=${jobRecord.id})`);

    return {
      queued: true,
      reason: "QUEUED",
      jobRecordId: jobRecord.id,
      queueJobId,
    };
  }

  private async hasActiveJobWithFingerprint(params: {
    bookId: string;
    type: "AI_CLEANING" | "PAGE_COUNT" | "PDF_GENERATION";
    fingerprint: string;
  }): Promise<boolean> {
    const jobs = await this.prisma.job.findMany({
      where: {
        bookId: params.bookId,
        type: params.type,
        status: { in: [...ACTIVE_DB_JOB_STATUSES] },
      },
      select: {
        payload: true,
      },
    });

    for (const job of jobs) {
      const payload = this.asRecord(job.payload);
      if (payload && payload.fingerprint === params.fingerprint) {
        return true;
      }
    }

    return false;
  }

  private async hasActiveQueueJob(queue: Queue, jobId: string): Promise<boolean> {
    const job = await queue.getJob(jobId);
    if (!job) return false;
    const state = (await job.getState()) as QueueJobState;
    return ACTIVE_QUEUE_STATES.has(state);
  }

  private async markFormattingQueued(params: {
    bookId: string;
    orderId: string;
    bookStatus: string;
    orderStatus: string;
  }) {
    await this.prisma.$transaction(async (tx) => {
      if (!TERMINAL_BOOK_STATUSES.has(params.bookStatus)) {
        await tx.book.update({
          where: { id: params.bookId },
          data: {
            status: "AI_PROCESSING",
            pageCount: null,
            currentHtmlUrl: null,
          },
        });
      }

      if (!TERMINAL_ORDER_STATUSES.has(params.orderStatus)) {
        await tx.order.update({
          where: { id: params.orderId },
          data: {
            status: "FORMATTING",
            extraAmount: 0,
          },
        });
      }
    });
  }

  private async markPageCountQueued(params: {
    bookId: string;
    orderId: string;
    bookStatus: string;
    orderStatus: string;
  }) {
    await this.prisma.$transaction(async (tx) => {
      if (!TERMINAL_BOOK_STATUSES.has(params.bookStatus)) {
        await tx.book.update({
          where: { id: params.bookId },
          data: { status: "FORMATTED" },
        });
      }

      if (!TERMINAL_ORDER_STATUSES.has(params.orderStatus)) {
        await tx.order.update({
          where: { id: params.orderId },
          data: { status: "FORMATTING" },
        });
      }
    });
  }

  private createFingerprint(parts: string[]): string {
    const raw = parts.join("|");
    return createHash("sha256").update(raw).digest("hex");
  }

  private buildQueueJobId(
    prefix: "format" | "count-pages" | "generate-pdf",
    bookId: string,
    fingerprint: string
  ): string {
    return `${prefix}:${bookId}:${fingerprint.slice(0, 24)}`;
  }

  private asRecord(value: unknown): Record<string, string> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const output: Record<string, string> = {};
    for (const [key, current] of Object.entries(value as Record<string, unknown>)) {
      if (typeof current === "string") {
        output[key] = current;
      }
    }
    return output;
  }

  private isSupportedPageSize(value: string | null): value is "A4" | "A5" {
    return value === "A4" || value === "A5";
  }

  private isSupportedFontSize(value: number | null): value is 11 | 12 | 14 {
    return value === 11 || value === 12 || value === 14;
  }

  private isDuplicateQueueJobError(error: unknown): boolean {
    const message = this.toErrorMessage(error).toLowerCase();
    return message.includes("jobid") && message.includes("exists");
  }

  private toErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message;
    }
    return String(error);
  }
}
