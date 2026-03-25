import { createHash } from "node:crypto";
import { InjectQueue } from "@nestjs/bullmq";
import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Queue } from "bullmq";
import { PaymentStatus, PaymentType } from "../generated/prisma/enums.js";
import {
  JOB_NAMES,
  QUEUE_AI_FORMATTING,
  QUEUE_PAGE_COUNT,
  QUEUE_PDF_GENERATION,
} from "../jobs/jobs.constants.js";
import { PrismaService } from "../prisma/prisma.service.js";

type OrchestrationTrigger = "upload" | "settings_change";
type EnqueueResultReason = "QUEUED" | "NO_MANUSCRIPT" | "ALREADY_ACTIVE" | "RESTORED_FROM_CACHE";
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
const ACTIVE_DB_JOB_STALE_AFTER_MS = 15 * 60 * 1000;
const ACTIVE_QUEUE_STATES = new Set<QueueJobState>([
  "waiting",
  "active",
  "delayed",
  "prioritized",
  "waiting-children",
]);
const TERMINAL_QUEUE_STATES = new Set<QueueJobState>(["completed", "failed"]);
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
const FORMAT_CACHE_PROFILE_VERSION = "2026-03-10-format-cache-v1";
const RENDER_CACHE_PROFILE_VERSION = "2026-03-10-render-cache-v1";
const EXTRA_PAGE_PRICE_NGN = 10;

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

    if (params.trigger === "settings_change") {
      const restored = await this.tryRestoreCachedPipelineArtifacts({
        bookId: book.id,
        orderId: book.orderId,
        rawManuscriptFileId: rawManuscript.id,
        pageSize: book.pageSize,
        fontSize: book.fontSize,
        bundlePageLimit: book.order.package.pageLimit,
      });

      if (restored) {
        this.logger.log(
          `Restored cached manuscript artifacts for book ${book.id} from AI job ${restored.aiJobId} and page-count job ${restored.pageCountJobId}`
        );
        return {
          queued: false,
          reason: "RESTORED_FROM_CACHE",
          jobRecordId: null,
          queueJobId: null,
        };
      }
    }

    const fingerprint = this.createFingerprint([
      "format",
      FORMAT_CACHE_PROFILE_VERSION,
      book.id,
      rawManuscript.id,
      book.pageSize,
      String(book.fontSize),
      String(book.wordCount ?? "0"),
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

    await this.removeTerminalQueueJob(this.aiFormattingQueue, queueJobId);

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
      formatProfileVersion: FORMAT_CACHE_PROFILE_VERSION,
      renderProfileVersion: RENDER_CACHE_PROFILE_VERSION,
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
        {
          jobId: queueJobId,
          attempts: 3,
          backoff: { type: "exponential", delay: 10_000 },
        }
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
      RENDER_CACHE_PROFILE_VERSION,
      book.id,
      params.cleanedHtmlFileId,
      book.pageSize,
      String(book.fontSize),
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

    await this.removeTerminalQueueJob(this.pageCountQueue, queueJobId);

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
      renderProfileVersion: RENDER_CACHE_PROFILE_VERSION,
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
        {
          jobId: queueJobId,
          attempts: 3,
          backoff: { type: "exponential", delay: 5_000 },
        }
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
      RENDER_CACHE_PROFILE_VERSION,
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

    await this.removeTerminalQueueJob(this.pdfGenerationQueue, queueJobId);

    const payload = {
      source: "books.approve",
      trigger: "approval",
      bookId: book.id,
      orderId: book.orderId,
      cleanedHtmlFileId: cleanedHtmlFile.id,
      cleanedHtmlUrl: book.currentHtmlUrl,
      pageSize: book.pageSize,
      fontSize: book.fontSize,
      renderProfileVersion: RENDER_CACHE_PROFILE_VERSION,
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
        {
          jobId: queueJobId,
          attempts: 3,
          backoff: { type: "exponential", delay: 10_000 },
        }
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
        id: true,
        status: true,
        payload: true,
        createdAt: true,
        startedAt: true,
      },
    });

    const staleJobIds: string[] = [];

    for (const job of jobs) {
      const payload = this.asRecord(job.payload);
      if (payload && payload.fingerprint === params.fingerprint) {
        if (this.isStaleActiveDbJob(job)) {
          staleJobIds.push(job.id);
          continue;
        }
        return true;
      }
    }

    if (staleJobIds.length > 0) {
      await this.prisma.job.updateMany({
        where: { id: { in: staleJobIds } },
        data: {
          status: "FAILED",
          error: "Marked stale and superseded by a fresh reprocess request.",
          startedAt: null,
          finishedAt: new Date(),
        },
      });
    }

    return false;
  }

  private async hasActiveQueueJob(queue: Queue, jobId: string): Promise<boolean> {
    const job = await queue.getJob(jobId);
    if (!job) return false;
    const state = (await job.getState()) as QueueJobState;
    return ACTIVE_QUEUE_STATES.has(state);
  }

  private async removeTerminalQueueJob(queue: Queue, jobId: string): Promise<void> {
    const job = await queue.getJob(jobId);
    if (!job) return;

    const state = (await job.getState()) as QueueJobState;
    if (!TERMINAL_QUEUE_STATES.has(state)) {
      return;
    }

    await queue.remove(jobId);
    this.logger.warn(
      `Removed terminal BullMQ job ${jobId} from ${queue.name} before re-enqueueing a fresh retry.`
    );
  }

  /**
   * Cancel all active BullMQ jobs and DB job records for a book.
   * Used by admin "Cancel Processing" and automatically on new manuscript upload
   * to prevent stale pipeline jobs from racing against the new upload.
   * Returns the number of queue jobs that were successfully removed.
   */
  async cancelActiveJobsForBook(
    bookId: string,
    reason: "cancelledByAdmin" | "supersededByUpload" = "cancelledByAdmin"
  ): Promise<number> {
    let cancelledCount = 0;

    const activeDbJobs = await this.prisma.job.findMany({
      where: {
        bookId,
        status: { in: ["QUEUED", "PROCESSING"] },
      },
      select: { id: true, type: true },
    });

    const queues: { queue: Queue; prefix: string }[] = [
      { queue: this.aiFormattingQueue, prefix: "format" },
      { queue: this.pageCountQueue, prefix: "count-pages" },
      { queue: this.pdfGenerationQueue, prefix: "generate-pdf" },
    ];

    for (const { queue, prefix } of queues) {
      const removed = await this.removeActiveQueueJobsByPrefix(queue, `${prefix}:${bookId}:`);
      cancelledCount += removed;
    }

    if (activeDbJobs.length > 0) {
      await this.prisma.job.updateMany({
        where: {
          bookId,
          status: { in: ["QUEUED", "PROCESSING"] },
        },
        data: {
          status: "FAILED",
          result: { [reason]: true },
          finishedAt: new Date(),
        },
      });

      this.logger.warn(
        `Marked ${activeDbJobs.length} active DB job(s) for book ${bookId} as FAILED (${reason}).`
      );
    }

    return cancelledCount;
  }

  private async removeActiveQueueJobsByPrefix(queue: Queue, prefix: string): Promise<number> {
    let removed = 0;

    for (const state of ["waiting", "active", "delayed"] as const) {
      const jobs = await queue.getJobs(state);
      for (const job of jobs) {
        if (job.id?.startsWith(prefix)) {
          try {
            await job.remove();
            removed++;
            this.logger.warn(
              `Removed ${state} BullMQ job ${job.id} from ${queue.name} (admin cancel).`
            );
          } catch {
            // Job may have transitioned state between getJobs and remove — safe to ignore
          }
        }
      }
    }

    return removed;
  }

  private isStaleActiveDbJob(job: {
    status: string;
    createdAt: Date;
    startedAt: Date | null;
  }): boolean {
    const referenceTimestamp =
      job.status === "PROCESSING" ? (job.startedAt ?? job.createdAt) : job.createdAt;
    return Date.now() - referenceTimestamp.getTime() > ACTIVE_DB_JOB_STALE_AFTER_MS;
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
            previewPdfUrl: null,
            finalPdfUrl: null,
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

  private async tryRestoreCachedPipelineArtifacts(params: {
    bookId: string;
    orderId: string;
    rawManuscriptFileId: string;
    pageSize: "A4" | "A5";
    fontSize: 11 | 12 | 14;
    bundlePageLimit: number;
  }): Promise<{ aiJobId: string; pageCountJobId: string } | null> {
    const aiJobs = await this.prisma.job.findMany({
      where: {
        bookId: params.bookId,
        type: "AI_CLEANING",
        status: "COMPLETED",
      },
      orderBy: [{ finishedAt: "desc" }, { createdAt: "desc" }],
      take: 40,
      select: {
        id: true,
        payload: true,
        result: true,
      },
    });

    const aiCandidates = aiJobs
      .map((job) => {
        const payload = this.asUnknownRecord(job.payload);
        const result = this.asUnknownRecord(job.result);
        if (!payload || !result) return null;
        if (this.readString(payload, "rawManuscriptFileId") !== params.rawManuscriptFileId) {
          return null;
        }
        if (this.readString(payload, "pageSize") !== params.pageSize) return null;
        if (this.readInteger(payload, "fontSize") !== params.fontSize) return null;
        if (
          !this.isCompatibleCacheVersion(
            this.readString(payload, "formatProfileVersion"),
            FORMAT_CACHE_PROFILE_VERSION
          )
        ) {
          return null;
        }

        const cleanedHtmlFileId = this.readString(result, "cleanedHtmlFileId");
        const cleanedHtmlUrl = this.readString(result, "cleanedHtmlUrl");
        if (!cleanedHtmlFileId || !cleanedHtmlUrl) return null;

        return {
          aiJobId: job.id,
          cleanedHtmlFileId,
          cleanedHtmlUrl,
        };
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);

    if (aiCandidates.length === 0) {
      return null;
    }

    const pageCountJobs = await this.prisma.job.findMany({
      where: {
        bookId: params.bookId,
        type: "PAGE_COUNT",
        status: "COMPLETED",
      },
      orderBy: [{ finishedAt: "desc" }, { createdAt: "desc" }],
      take: 40,
      select: {
        id: true,
        payload: true,
        result: true,
      },
    });

    for (const aiCandidate of aiCandidates) {
      const matchingPageCount = pageCountJobs.find((job) => {
        const payload = this.asUnknownRecord(job.payload);
        const result = this.asUnknownRecord(job.result);
        if (!payload || !result) return false;
        if (this.readString(payload, "cleanedHtmlFileId") !== aiCandidate.cleanedHtmlFileId) {
          return false;
        }
        if (this.readString(payload, "pageSize") !== params.pageSize) return false;
        if (this.readInteger(payload, "fontSize") !== params.fontSize) return false;
        if (
          !this.isCompatibleCacheVersion(
            this.readString(payload, "renderProfileVersion"),
            RENDER_CACHE_PROFILE_VERSION
          )
        ) {
          return false;
        }

        return (
          typeof this.readInteger(result, "pageCount") === "number" &&
          Boolean(this.readString(result, "previewPdfUrl"))
        );
      });

      if (!matchingPageCount) {
        continue;
      }

      const pageCountResult = this.asUnknownRecord(matchingPageCount.result);
      if (!pageCountResult) continue;

      const pageCount = this.readInteger(pageCountResult, "pageCount");
      const previewPdfUrl = this.readString(pageCountResult, "previewPdfUrl");
      if (pageCount === null || !previewPdfUrl) continue;

      const successfulExtraPayments = await this.prisma.payment.findMany({
        where: {
          orderId: params.orderId,
          type: PaymentType.EXTRA_PAGES,
          status: PaymentStatus.SUCCESS,
        },
        select: {
          amount: true,
        },
      });

      const paidAmount = successfulExtraPayments.reduce((sum, payment) => {
        return sum + this.toCurrencyNumber(payment.amount);
      }, 0);

      const overagePages = Math.max(0, pageCount - params.bundlePageLimit);
      const requiredAmount = overagePages * EXTRA_PAGE_PRICE_NGN;

      await this.prisma.$transaction(async (tx) => {
        await tx.book.update({
          where: { id: params.bookId },
          data: {
            status: "PREVIEW_READY",
            currentHtmlUrl: aiCandidate.cleanedHtmlUrl,
            previewPdfUrl,
            pageCount,
          },
        });

        await tx.order.update({
          where: { id: params.orderId },
          data: {
            status:
              requiredAmount > 0 && paidAmount < requiredAmount
                ? "PENDING_EXTRA_PAYMENT"
                : "PREVIEW_READY",
            extraAmount: requiredAmount,
          },
        });
      });

      return {
        aiJobId: aiCandidate.aiJobId,
        pageCountJobId: matchingPageCount.id,
      };
    }

    return null;
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

  private asUnknownRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  }

  private readString(record: Record<string, unknown>, key: string): string | null {
    const value = record[key];
    return typeof value === "string" && value.trim().length > 0 ? value : null;
  }

  private readInteger(record: Record<string, unknown>, key: string): number | null {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.trunc(value);
    }
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return Math.trunc(parsed);
      }
    }
    return null;
  }

  private isCompatibleCacheVersion(value: string | null, expectedVersion: string): boolean {
    return value === null || value === expectedVersion;
  }

  private toCurrencyNumber(value: unknown): number {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    if (
      value &&
      typeof value === "object" &&
      "toNumber" in value &&
      typeof (value as { toNumber?: unknown }).toNumber === "function"
    ) {
      return Number((value as { toNumber: () => number }).toNumber());
    }
    return 0;
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
