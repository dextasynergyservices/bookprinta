import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { GotenbergPageCountService } from "../engine/gotenberg-page-count.service.js";
import { FilesService } from "../files/files.service.js";
import type { JobStatus, JobType } from "../generated/prisma/enums.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { JOB_NAMES, QUEUE_PDF_GENERATION } from "./jobs.constants.js";

type SupportedPageSize = "A4" | "A5";
type SupportedFontSize = 11 | 12 | 14;

type GeneratePdfPayload = {
  jobRecordId: string;
  bookId: string;
  orderId: string;
  cleanedHtmlFileId: string;
  cleanedHtmlUrl: string;
  pageSize: SupportedPageSize;
  fontSize: SupportedFontSize;
};

type GeneratePdfResult = {
  finalPdfFileId: string;
  finalPdfUrl: string;
  renderedPdfSha256: string;
  progressStep?: "GENERATING_FINAL_PDF";
};

@Injectable()
@Processor(QUEUE_PDF_GENERATION, {
  concurrency: 1,
})
export class PdfGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(PdfGenerationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gotenbergPageCount: GotenbergPageCountService,
    private readonly filesService: FilesService
  ) {
    super();
  }

  async process(job: Job): Promise<GeneratePdfResult> {
    if (job.name !== JOB_NAMES.GENERATE_PDF) {
      throw new Error(`Unsupported pdf-generation job name "${job.name}"`);
    }

    const payload = this.parsePayload(job.data);
    const attempt = job.attemptsMade + 1;
    const maxAttempts =
      typeof job.opts.attempts === "number" && Number.isFinite(job.opts.attempts)
        ? Math.max(1, job.opts.attempts)
        : 1;

    await this.markAttemptProcessing(payload, attempt);

    try {
      const cleanedHtml = await this.fetchCleanedHtml(payload.cleanedHtmlUrl);
      const rendered = await this.gotenbergPageCount.renderPdf({
        html: cleanedHtml,
        pageSize: payload.pageSize,
        fontSize: payload.fontSize,
      });
      const finalFile = await this.filesService.saveGeneratedFile({
        bookId: payload.bookId,
        fileType: "FINAL_PDF",
        fileName: `final-${String(job.id ?? payload.jobRecordId)}.pdf`,
        mimeType: "application/pdf",
        content: rendered.pdfBuffer,
        publicId: `bookprinta/final-pdfs/${payload.bookId}/${String(job.id ?? payload.jobRecordId)}`,
      });

      const result: GeneratePdfResult = {
        finalPdfFileId: finalFile.id,
        finalPdfUrl: finalFile.url,
        renderedPdfSha256: rendered.renderedPdfSha256,
        progressStep: "GENERATING_FINAL_PDF",
      };

      await this.markAttemptCompleted(payload, result);
      this.logger.log(
        `Final PDF generated for book ${payload.bookId} (job=${payload.jobRecordId})`
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

  private parsePayload(value: unknown): GeneratePdfPayload {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Invalid pdf-generation payload.");
    }
    const payload = value as Record<string, unknown>;

    const pageSize = payload.pageSize;
    const fontSize = payload.fontSize;
    if (pageSize !== "A4" && pageSize !== "A5") {
      throw new Error("Invalid pageSize in pdf-generation payload.");
    }
    if (fontSize !== 11 && fontSize !== 12 && fontSize !== 14) {
      throw new Error("Invalid fontSize in pdf-generation payload.");
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
        throw new Error(`Missing ${key} in pdf-generation payload.`);
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
    };
  }

  private async fetchCleanedHtml(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch cleaned HTML from storage (${response.status}).`);
    }
    return response.text();
  }

  private async markAttemptProcessing(payload: GeneratePdfPayload, attempt: number): Promise<void> {
    const status: JobStatus = "PROCESSING";
    const type: JobType = "PDF_GENERATION";
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
          progressStep: "GENERATING_FINAL_PDF",
        },
      },
    });
  }

  private async markAttemptCompleted(
    payload: GeneratePdfPayload,
    result: GeneratePdfResult
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.book.update({
        where: { id: payload.bookId },
        data: {
          finalPdfUrl: result.finalPdfUrl,
          status: "IN_PRODUCTION",
        },
      });

      await tx.order.update({
        where: { id: payload.orderId },
        data: {
          status: "IN_PRODUCTION",
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

  private async markAttemptFailed(params: {
    payload: GeneratePdfPayload;
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
      this.logger.error(
        `Final PDF generation failed permanently for book ${payload.bookId} (job=${payload.jobRecordId}): ${error}`
      );
    } else {
      this.logger.warn(
        `Final PDF generation attempt ${attempt} failed for book ${payload.bookId} (job=${payload.jobRecordId}): ${error}`
      );
    }
  }

  private toErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim().length > 0) {
      return error.message;
    }
    return String(error);
  }
}
