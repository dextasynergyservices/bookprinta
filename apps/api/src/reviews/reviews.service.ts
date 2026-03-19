import type {
  AdminDeleteReviewResponse,
  AdminReviewItem,
  AdminReviewsListQuery,
  AdminReviewsListResponse,
  AdminUpdateReviewInput,
  AdminUpdateReviewResponse,
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

const ADMIN_REVIEW_SELECT = {
  id: true,
  rating: true,
  comment: true,
  isPublic: true,
  createdAt: true,
  book: {
    select: {
      id: true,
      title: true,
    },
  },
  user: {
    select: {
      firstName: true,
      lastName: true,
      email: true,
    },
  },
} satisfies Prisma.ReviewSelect;

type ReviewBookRow = Prisma.BookGetPayload<{ select: typeof REVIEW_BOOK_SELECT }>;
type ReviewSummaryRow = NonNullable<ReviewBookRow["reviews"][number]>;
type AdminReviewRow = Prisma.ReviewGetPayload<{ select: typeof ADMIN_REVIEW_SELECT }>;

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

  async listAdminReviews(query: AdminReviewsListQuery): Promise<AdminReviewsListResponse> {
    const q = query.q?.trim();

    const reviews = await this.prisma.review.findMany({
      where: {
        ...(query.isPublic !== undefined ? { isPublic: query.isPublic } : {}),
        ...(query.rating !== undefined ? { rating: query.rating } : {}),
        ...(q
          ? {
              OR: [
                { comment: { contains: q, mode: "insensitive" } },
                { book: { title: { contains: q, mode: "insensitive" } } },
                { user: { firstName: { contains: q, mode: "insensitive" } } },
                { user: { lastName: { contains: q, mode: "insensitive" } } },
                { user: { email: { contains: q, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor
        ? {
            cursor: { id: query.cursor },
            skip: 1,
          }
        : {}),
      select: ADMIN_REVIEW_SELECT,
    });

    const hasMore = reviews.length > query.limit;
    const pageItems = hasMore ? reviews.slice(0, query.limit) : reviews;

    return {
      items: pageItems.map((review) => this.serializeAdminReviewItem(review)),
      nextCursor:
        hasMore && pageItems.length > 0 ? (pageItems[pageItems.length - 1]?.id ?? null) : null,
      hasMore,
    };
  }

  async updateAdminReview(
    reviewId: string,
    input: AdminUpdateReviewInput
  ): Promise<AdminUpdateReviewResponse> {
    const data: Prisma.ReviewUpdateInput = {
      ...(input.isPublic !== undefined ? { isPublic: input.isPublic } : {}),
      ...(input.comment !== undefined ? { comment: input.comment } : {}),
    };

    try {
      const review = (await this.prisma.review.update({
        where: { id: reviewId },
        data,
        select: ADMIN_REVIEW_SELECT,
      })) as AdminReviewRow;

      return this.serializeAdminReviewItem(review);
    } catch (error) {
      if (this.isPrismaNotFound(error)) {
        throw new NotFoundException(`Review "${reviewId}" not found`);
      }

      throw error;
    }
  }

  async deleteAdminReview(reviewId: string): Promise<AdminDeleteReviewResponse> {
    try {
      await this.prisma.review.delete({
        where: { id: reviewId },
      });
    } catch (error) {
      if (this.isPrismaNotFound(error)) {
        throw new NotFoundException(`Review "${reviewId}" not found`);
      }

      throw error;
    }

    return {
      id: reviewId,
      deleted: true,
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

  private serializeAdminReviewItem(row: AdminReviewRow): AdminReviewItem {
    return {
      id: row.id,
      bookId: row.book.id,
      bookTitle: row.book.title,
      authorName: this.resolveAuthorName(row.user.firstName, row.user.lastName, row.user.email),
      authorEmail: row.user.email,
      rating: row.rating,
      comment: row.comment,
      isPublic: row.isPublic,
      createdAt: row.createdAt.toISOString(),
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

  private resolveAuthorName(
    firstName: string | null,
    lastName: string | null,
    email: string
  ): string {
    const normalizedFirst = this.normalizeString(firstName);
    const normalizedLast = this.normalizeString(lastName);
    const joined = [normalizedFirst, normalizedLast].filter(Boolean).join(" ").trim();

    if (joined.length > 0) {
      return joined;
    }

    return email;
  }

  private isPrismaUniqueViolation(error: unknown): boolean {
    return Boolean(
      error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
    );
  }

  private isPrismaNotFound(error: unknown): boolean {
    return Boolean(
      error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: string }).code === "P2025"
    );
  }
}
