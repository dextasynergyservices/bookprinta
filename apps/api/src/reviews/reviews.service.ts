import type {
  BookStatus,
  CreateReviewBodyInput,
  CreateReviewResponse,
  MyReviewsResponse,
  ReviewBook,
  ReviewSummary,
} from "@bookprinta/shared";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  isReviewEligibleLifecycleStatus,
  REVIEW_ELIGIBLE_BOOK_STATUSES,
  resolveReviewLifecycleStatus,
} from "./review-eligibility.js";

const REVIEW_SUMMARY_SELECT = {
  rating: true,
  comment: true,
  isPublic: true,
  createdAt: true,
} as const;

const REVIEW_BOOK_SELECT = {
  id: true,
  status: true,
  productionStatus: true,
  title: true,
  coverImageUrl: true,
  order: {
    select: {
      customQuote: {
        select: {
          workingTitle: true,
        },
      },
    },
  },
  files: {
    select: {
      fileType: true,
      url: true,
      fileName: true,
      version: true,
    },
  },
  reviews: {
    select: REVIEW_SUMMARY_SELECT,
  },
} satisfies Prisma.BookSelect;

type ReviewBookRow = Prisma.BookGetPayload<{ select: typeof REVIEW_BOOK_SELECT }>;
type ReviewSummaryRow = NonNullable<ReviewBookRow["reviews"][number]>;

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyReviews(userId: string): Promise<MyReviewsResponse> {
    const rows = await this.findEligibleReviewBooks(userId);
    const books = rows.map((row) => this.serializeReviewBook(row));

    return {
      hasEligibleBooks: books.length > 0,
      hasPendingReviews: books.some((book) => book.reviewStatus === "PENDING"),
      books,
    };
  }

  async createReview(userId: string, input: CreateReviewBodyInput): Promise<CreateReviewResponse> {
    const book = await this.prisma.book.findFirst({
      where: {
        id: input.bookId,
        userId,
      },
      select: {
        id: true,
        status: true,
        productionStatus: true,
        reviews: {
          where: { userId },
          select: { rating: true },
          take: 1,
        },
      },
    });

    if (!book) {
      throw new NotFoundException(`Book "${input.bookId}" not found`);
    }

    if (
      !isReviewEligibleLifecycleStatus(
        resolveReviewLifecycleStatus({
          manuscriptStatus: book.status,
          productionStatus: book.productionStatus,
        })
      )
    ) {
      throw new BadRequestException("This book is not ready for review yet");
    }

    if (book.reviews.length > 0) {
      throw new ConflictException("You have already reviewed this book");
    }

    try {
      await this.prisma.review.create({
        data: {
          bookId: input.bookId,
          userId,
          rating: input.rating,
          comment: input.comment ?? null,
          isPublic: false,
        },
      });
    } catch (error) {
      if (this.isPrismaUniqueViolation(error)) {
        throw new ConflictException("You have already reviewed this book");
      }
      throw error;
    }

    const reviewBook = await this.findEligibleReviewBookById(userId, input.bookId);
    if (!reviewBook) {
      throw new NotFoundException(`Book "${input.bookId}" not found`);
    }

    return {
      book: this.serializeReviewBook(reviewBook),
    };
  }

  private async findEligibleReviewBooks(userId: string): Promise<ReviewBookRow[]> {
    return (await this.prisma.book.findMany({
      where: this.buildEligibleReviewBooksWhere({ userId }),
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      select: this.buildReviewBookSelect(userId),
    })) as unknown as ReviewBookRow[];
  }

  private async findEligibleReviewBookById(
    userId: string,
    bookId: string
  ): Promise<ReviewBookRow | null> {
    return (await this.prisma.book.findFirst({
      where: this.buildEligibleReviewBooksWhere({ userId, bookId }),
      select: this.buildReviewBookSelect(userId),
    })) as unknown as ReviewBookRow | null;
  }

  private buildEligibleReviewBooksWhere(params: {
    userId: string;
    bookId?: string;
  }): Prisma.BookWhereInput {
    const eligibleStatuses = [...REVIEW_ELIGIBLE_BOOK_STATUSES];

    return {
      ...(params.bookId ? { id: params.bookId } : {}),
      userId: params.userId,
      OR: [
        { productionStatus: { in: eligibleStatuses } },
        {
          productionStatus: null,
          status: { in: eligibleStatuses },
        },
      ],
    };
  }

  private buildReviewBookSelect(userId: string): Prisma.BookSelect {
    return {
      ...REVIEW_BOOK_SELECT,
      files: {
        where: {
          fileType: {
            in: ["RAW_MANUSCRIPT", "COVER_DESIGN_DRAFT", "COVER_DESIGN_FINAL"],
          },
        },
        orderBy: [{ version: "desc" }],
        select: REVIEW_BOOK_SELECT.files.select,
      },
      reviews: {
        where: { userId },
        orderBy: [{ createdAt: "desc" }],
        take: 1,
        select: REVIEW_SUMMARY_SELECT,
      },
    };
  }

  private serializeReviewBook(row: ReviewBookRow): ReviewBook {
    const review = row.reviews[0] ? this.serializeReviewSummary(row.reviews[0]) : null;
    const lifecycleStatus = resolveReviewLifecycleStatus({
      manuscriptStatus: row.status as BookStatus,
      productionStatus: row.productionStatus as BookStatus | null,
    });

    return {
      bookId: row.id,
      title: this.resolveBookTitle(row),
      coverImageUrl: this.resolveCoverImageUrl(row),
      lifecycleStatus,
      reviewStatus: review ? "REVIEWED" : "PENDING",
      review,
    };
  }

  private serializeReviewSummary(review: ReviewSummaryRow): ReviewSummary {
    return {
      rating: review.rating,
      comment: review.comment,
      isPublic: review.isPublic,
      createdAt: review.createdAt.toISOString(),
    };
  }

  private resolveBookTitle(row: ReviewBookRow): string | null {
    const storedTitle = this.normalizeString(row.title);
    if (storedTitle) return storedTitle;

    const quoteTitle = this.normalizeString(row.order?.customQuote?.workingTitle ?? null);
    if (quoteTitle) return quoteTitle;

    const manuscriptFile = row.files.find((file) => file.fileType === "RAW_MANUSCRIPT");
    return this.deriveTitleFromFileName(manuscriptFile?.fileName ?? null);
  }

  private resolveCoverImageUrl(row: ReviewBookRow): string | null {
    const storedCover = this.normalizeString(row.coverImageUrl);
    if (storedCover) return storedCover;

    const finalCover = row.files.find((file) => file.fileType === "COVER_DESIGN_FINAL");
    if (finalCover?.url) return finalCover.url;

    const draftCover = row.files.find((file) => file.fileType === "COVER_DESIGN_DRAFT");
    return draftCover?.url ?? null;
  }

  private deriveTitleFromFileName(fileName: string | null | undefined): string | null {
    const trimmed = this.normalizeString(fileName);
    if (!trimmed) return null;

    const normalized = trimmed
      .replace(/\.[^.]+$/, "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return normalized.length > 0 ? normalized : null;
  }

  private normalizeString(value: string | null | undefined): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private isPrismaUniqueViolation(error: unknown): boolean {
    return Boolean(
      error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
    );
  }
}
