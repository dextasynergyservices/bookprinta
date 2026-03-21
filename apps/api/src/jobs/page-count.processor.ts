import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { GotenbergPageCountService } from "../engine/gotenberg-page-count.service.js";
import { FilesService } from "../files/files.service.js";
import type { JobStatus, JobType } from "../generated/prisma/enums.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { JOB_NAMES, QUEUE_PAGE_COUNT } from "./jobs.constants.js";

type OrchestrationTrigger = "upload" | "settings_change";
type SupportedPageSize = "A4" | "A5";
type SupportedFontSize = 11 | 12 | 14;

type CountPagesPayload = {
  jobRecordId: string;
  bookId: string;
  orderId: string;
  cleanedHtmlFileId: string;
  cleanedHtmlUrl: string;
  pageSize: SupportedPageSize;
  fontSize: SupportedFontSize;
  bundlePageLimit: number;
  trigger: OrchestrationTrigger;
  sourceAiJobRecordId?: string | null;
};

type CountPagesResult = {
  pageCount: number | null;
  overagePages: number | null;
  extraAmount: number | null;
  gateStatus: "CLEAR" | "PAYMENT_REQUIRED" | null;
  renderedPdfSha256: string | null;
  previewPdfFileId: string | null;
  previewPdfUrl: string | null;
  pageLimit: number | null;
  sourceAiJobRecordId: string | null;
  trigger: OrchestrationTrigger;
  progressStep?: "COUNTING_PAGES" | "RENDERING_PREVIEW";
  ignoredAsSuperseded?: boolean;
};

type CompletedCountPagesResult = CountPagesResult & {
  pageCount: number;
  overagePages: number;
  extraAmount: number;
  gateStatus: "CLEAR" | "PAYMENT_REQUIRED";
  renderedPdfSha256: string;
  previewPdfFileId: string;
  previewPdfUrl: string;
  pageLimit: number;
  ignoredAsSuperseded?: false;
};

const COST_PER_EXTRA_PAGE = 10;

@Injectable()
@Processor(QUEUE_PAGE_COUNT, {
  concurrency: 1,
})
export class PageCountProcessor extends WorkerHost {
  private readonly logger = new Logger(PageCountProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gotenbergPageCount: GotenbergPageCountService,
    private readonly filesService: FilesService
  ) {
    super();
  }

  async process(job: Job): Promise<CountPagesResult> {
    if (job.name !== JOB_NAMES.COUNT_PAGES) {
      throw new Error(`Unsupported page-count job name "${job.name}"`);
    }

    const payload = this.parsePayload(job.data);
    const attempt = job.attemptsMade + 1;
    const maxAttempts =
      typeof job.opts.attempts === "number" && Number.isFinite(job.opts.attempts)
        ? Math.max(1, job.opts.attempts)
        : 1;

    await this.markAttemptProcessing(payload, attempt);

    try {
      const stillCurrentBeforeRender = await this.isCurrentPageCountRequest(payload);
      if (!stillCurrentBeforeRender) {
        const result: CountPagesResult = {
          pageCount: null,
          overagePages: null,
          extraAmount: null,
          gateStatus: null,
          renderedPdfSha256: null,
          previewPdfFileId: null,
          previewPdfUrl: null,
          pageLimit: payload.bundlePageLimit,
          sourceAiJobRecordId: payload.sourceAiJobRecordId ?? null,
          trigger: payload.trigger,
          progressStep: "COUNTING_PAGES",
          ignoredAsSuperseded: true,
        };
        await this.markAttemptSuperseded(payload, result);
        this.logger.warn(
          `Skipped stale page-count run for book ${payload.bookId} (job=${payload.jobRecordId}) because manuscript/settings changed.`
        );
        return result;
      }

      await this.markProgressStep(payload.jobRecordId, "COUNTING_PAGES");
      const cleanedHtml = await this.fetchCleanedHtml(payload.cleanedHtmlUrl);
      const countAndPreview = await this.gotenbergPageCount.countAndRenderPreview({
        html: cleanedHtml,
        pageSize: payload.pageSize,
        fontSize: payload.fontSize,
        watermarkText: "Preview",
      });
      await this.markProgressStep(payload.jobRecordId, "RENDERING_PREVIEW");
      const previewFile = await this.filesService.saveGeneratedFile({
        bookId: payload.bookId,
        fileType: "PREVIEW_PDF",
        fileName: `preview-${String(job.id ?? payload.jobRecordId)}.pdf`,
        mimeType: "application/pdf",
        content: countAndPreview.pdfBuffer,
        publicId: `bookprinta/preview-pdfs/${payload.bookId}/${String(job.id ?? payload.jobRecordId)}`,
      });

      const overagePages = Math.max(0, countAndPreview.pageCount - payload.bundlePageLimit);
      const extraAmount = overagePages * COST_PER_EXTRA_PAGE;
      const gateStatus = overagePages > 0 ? "PAYMENT_REQUIRED" : "CLEAR";

      const result: CompletedCountPagesResult = {
        pageCount: countAndPreview.pageCount,
        overagePages,
        extraAmount,
        gateStatus,
        renderedPdfSha256: countAndPreview.renderedPdfSha256,
        previewPdfFileId: previewFile.id,
        previewPdfUrl: previewFile.url,
        pageLimit: payload.bundlePageLimit,
        sourceAiJobRecordId: payload.sourceAiJobRecordId ?? null,
        trigger: payload.trigger,
        progressStep: "RENDERING_PREVIEW",
      };

      const stillCurrentBeforeCommit = await this.isCurrentPageCountRequest(payload);
      if (!stillCurrentBeforeCommit) {
        await this.markAttemptSuperseded(payload, {
          ...result,
          ignoredAsSuperseded: true,
        });
        this.logger.warn(
          `Discarded stale authoritative count for book ${payload.bookId} (job=${payload.jobRecordId}) because manuscript/settings changed before commit.`
        );
        return {
          ...result,
          ignoredAsSuperseded: true,
        };
      }

      await this.markAttemptCompleted(payload, result);

      this.logger.log(
        `Authoritative page count completed for book ${payload.bookId}: ${result.pageCount} pages (limit=${payload.bundlePageLimit}, overage=${overagePages})`
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

  private parsePayload(value: unknown): CountPagesPayload {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Invalid page-count payload.");
    }
    const payload = value as Record<string, unknown>;

    const trigger = payload.trigger;
    const pageSize = payload.pageSize;
    const fontSize = payload.fontSize;
    const bundlePageLimit = payload.bundlePageLimit;

    if (trigger !== "upload" && trigger !== "settings_change") {
      throw new Error("Invalid trigger in page-count payload.");
    }
    if (pageSize !== "A4" && pageSize !== "A5") {
      throw new Error("Invalid pageSize in page-count payload.");
    }
    if (fontSize !== 11 && fontSize !== 12 && fontSize !== 14) {
      throw new Error("Invalid fontSize in page-count payload.");
    }
    if (
      typeof bundlePageLimit !== "number" ||
      !Number.isFinite(bundlePageLimit) ||
      bundlePageLimit < 1
    ) {
      throw new Error("Invalid bundlePageLimit in page-count payload.");
    }

    const requiredKeys = [
      "jobRecordId",
      "bookId",
      "orderId",
      "cleanedHtmlFileId",
      "cleanedHtmlUrl",
    ] as const;
    for (const key of requiredKeys) {
      const value = payload[key];
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error(`Missing ${key} in page-count payload.`);
      }
    }

    return {
      jobRecordId: payload.jobRecordId as string,
      bookId: payload.bookId as string,
      orderId: payload.orderId as string,
      cleanedHtmlFileId: payload.cleanedHtmlFileId as string,
      cleanedHtmlUrl: payload.cleanedHtmlUrl as string,
      pageSize,
      fontSize,
      bundlePageLimit: Math.floor(bundlePageLimit),
      trigger,
      sourceAiJobRecordId:
        typeof payload.sourceAiJobRecordId === "string" ? payload.sourceAiJobRecordId : null,
    };
  }

  private async fetchCleanedHtml(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch cleaned HTML from storage (${response.status}).`);
    }
    return response.text();
  }

  private async markAttemptProcessing(payload: CountPagesPayload, attempt: number): Promise<void> {
    const status: JobStatus = "PROCESSING";
    const type: JobType = "PAGE_COUNT";
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
          progressStep: "COUNTING_PAGES",
        },
      },
    });
  }

  private async markProgressStep(
    jobRecordId: string,
    progressStep: "COUNTING_PAGES" | "RENDERING_PREVIEW"
  ): Promise<void> {
    await this.prisma.job.updateMany({
      where: { id: jobRecordId },
      data: {
        result: {
          progressStep,
        },
      },
    });
  }

  private async markAttemptCompleted(
    payload: CountPagesPayload,
    result: CompletedCountPagesResult
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.book.update({
        where: { id: payload.bookId },
        data: {
          pageCount: result.pageCount,
          status: "PREVIEW_READY",
          previewPdfUrl: result.previewPdfUrl,
        },
      });

      await tx.order.update({
        where: { id: payload.orderId },
        data: {
          status: result.overagePages > 0 ? "PENDING_EXTRA_PAYMENT" : "PREVIEW_READY",
          extraAmount: result.extraAmount,
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
    payload: CountPagesPayload,
    result: CountPagesResult
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
    payload: CountPagesPayload;
    attempt: number;
    error: string;
    isFinalAttempt: boolean;
  }): Promise<void> {
    const { payload, attempt, error, isFinalAttempt } = params;
    await this.prisma.job.updateMany({
      where: { id: payload.jobRecordId },
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
      this.logger.error(
        `Authoritative page count failed permanently for book ${payload.bookId} (job=${payload.jobRecordId}): ${error}`
      );
    } else {
      this.logger.warn(
        `Authoritative page count attempt ${attempt} failed for book ${payload.bookId} (job=${payload.jobRecordId}): ${error}`
      );
    }
  }

  private toErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message;
    }
    return String(error);
  }

  private async isCurrentPageCountRequest(payload: CountPagesPayload): Promise<boolean> {
    const book = await this.prisma.book.findUnique({
      where: { id: payload.bookId },
      select: {
        pageSize: true,
        fontSize: true,
        currentHtmlUrl: true,
      },
    });
    const latestCleanedHtml = await this.prisma.file.findFirst({
      where: {
        bookId: payload.bookId,
        fileType: "CLEANED_HTML",
      },
      orderBy: { version: "desc" },
      select: {
        id: true,
        url: true,
      },
    });

    const htmlMatchesCurrentBook = book?.currentHtmlUrl === payload.cleanedHtmlUrl;
    const htmlMatchesLatestFile =
      latestCleanedHtml?.id === payload.cleanedHtmlFileId &&
      latestCleanedHtml?.url === payload.cleanedHtmlUrl;

    return (
      book?.pageSize === payload.pageSize &&
      book?.fontSize === payload.fontSize &&
      (htmlMatchesCurrentBook || htmlMatchesLatestFile)
    );
  }
}
