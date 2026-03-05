import type { BookDetailResponse, BookProgressStage, BookStatus } from "@bookprinta/shared";
import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class BooksService {
  constructor(private readonly prisma: PrismaService) {}

  private static readonly BOOK_DETAIL_SELECT = {
    id: true,
    orderId: true,
    status: true,
    rejectionReason: true,
    rejectedAt: true,
    pageCount: true,
    wordCount: true,
    estimatedPages: true,
    fontFamily: true,
    fontSize: true,
    pageSize: true,
    currentHtmlUrl: true,
    previewPdfUrl: true,
    finalPdfUrl: true,
    createdAt: true,
    updatedAt: true,
  } as const;

  private readonly timelineStages: BookProgressStage[] = [
    "PAYMENT_RECEIVED",
    "DESIGNING",
    "DESIGNED",
    "FORMATTING",
    "FORMATTED",
    "REVIEW",
    "APPROVED",
    "PRINTING",
    "PRINTED",
    "SHIPPING",
    "DELIVERED",
  ];

  private readonly statusToStage: Partial<Record<BookStatus, BookProgressStage>> = {
    AWAITING_UPLOAD: "PAYMENT_RECEIVED",
    UPLOADED: "PAYMENT_RECEIVED",
    PAYMENT_RECEIVED: "PAYMENT_RECEIVED",
    AI_PROCESSING: "DESIGNING",
    DESIGNING: "DESIGNING",
    DESIGNED: "DESIGNED",
    FORMATTING: "FORMATTING",
    FORMATTED: "FORMATTED",
    FORMATTING_REVIEW: "REVIEW",
    PREVIEW_READY: "REVIEW",
    REVIEW: "REVIEW",
    REJECTED: "REVIEW",
    APPROVED: "APPROVED",
    IN_PRODUCTION: "PRINTING",
    PRINTING: "PRINTING",
    PRINTED: "PRINTED",
    SHIPPING: "SHIPPING",
    DELIVERED: "DELIVERED",
    COMPLETED: "DELIVERED",
    CANCELLED: "REVIEW",
  };

  async findUserBookById(userId: string, bookId: string): Promise<BookDetailResponse> {
    const row = await this.prisma.book.findFirst({
      where: {
        id: bookId,
        userId,
      },
      select: BooksService.BOOK_DETAIL_SELECT,
    });

    if (!row) {
      throw new NotFoundException(`Book "${bookId}" not found`);
    }

    return {
      id: row.id,
      orderId: row.orderId,
      status: row.status,
      rejectionReason: row.rejectionReason ?? null,
      rejectedAt: row.rejectedAt?.toISOString() ?? null,
      pageCount: row.pageCount,
      wordCount: row.wordCount,
      estimatedPages: row.estimatedPages,
      fontFamily: row.fontFamily ?? null,
      fontSize: row.fontSize,
      pageSize: row.pageSize ?? null,
      currentHtmlUrl: row.currentHtmlUrl ?? null,
      previewPdfUrl: row.previewPdfUrl ?? null,
      finalPdfUrl: row.finalPdfUrl ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      timeline: this.buildProgressTimeline({
        currentStatus: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }),
    };
  }

  private resolveStageFromStatus(status: BookStatus): BookProgressStage {
    return this.statusToStage[status] ?? "PAYMENT_RECEIVED";
  }

  private buildProgressTimeline(params: {
    currentStatus: BookStatus;
    createdAt: Date;
    updatedAt: Date;
  }): BookDetailResponse["timeline"] {
    const currentStage = this.resolveStageFromStatus(params.currentStatus);
    const currentIndex = this.timelineStages.indexOf(currentStage);
    const reviewStageIndex = this.timelineStages.indexOf("REVIEW");
    const isRejected = params.currentStatus === "REJECTED";

    return this.timelineStages.map((stage, index) => {
      const state = this.resolveTimelineState({
        index,
        currentIndex,
        reviewStageIndex,
        isRejected,
      });

      return {
        key: stage.toLowerCase(),
        label: this.toTrackingLabel(stage),
        stage,
        sourceStatus: index === currentIndex ? params.currentStatus : null,
        state,
        reachedAt: this.resolveReachedAt({
          state,
          index,
          createdAt: params.createdAt,
          updatedAt: params.updatedAt,
        }),
      };
    });
  }

  private resolveTimelineState(params: {
    index: number;
    currentIndex: number;
    reviewStageIndex: number;
    isRejected: boolean;
  }): BookDetailResponse["timeline"][number]["state"] {
    if (params.isRejected) {
      if (params.index < params.reviewStageIndex) return "completed";
      if (params.index === params.reviewStageIndex) return "rejected";
      return "upcoming";
    }

    if (params.index < params.currentIndex) return "completed";
    if (params.index === params.currentIndex) return "current";
    return "upcoming";
  }

  private resolveReachedAt(params: {
    state: BookDetailResponse["timeline"][number]["state"];
    index: number;
    createdAt: Date;
    updatedAt: Date;
  }): string | null {
    if (params.state === "current" || params.state === "rejected") {
      return params.updatedAt.toISOString();
    }

    if (params.state === "completed" && params.index === 0) {
      return params.createdAt.toISOString();
    }

    return null;
  }

  private toTrackingLabel(status: string): string {
    return status
      .toLowerCase()
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }
}
