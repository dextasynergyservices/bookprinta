import type {
  CreateReviewBodyInput,
  CreateReviewResponse,
  MyReviewsResponse,
  ReviewedBook,
} from "@bookprinta/shared";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { BookStatus } from "../generated/prisma/enums.js";
import { PrismaService } from "../prisma/prisma.service.js";

const REVIEW_ELIGIBLE_BOOK_STATUSES: BookStatus[] = [
  BookStatus.PRINTED,
  BookStatus.SHIPPING,
  BookStatus.DELIVERED,
  BookStatus.COMPLETED,
];

const REVIEW_SELECT = {
  bookId: true,
  rating: true,
  comment: true,
  isPublic: true,
  createdAt: true,
} as const;

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyReviews(userId: string): Promise<MyReviewsResponse> {
    const [reviews, reviewEligibleBooks] = await Promise.all([
      this.prisma.review.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: REVIEW_SELECT,
      }),
      this.prisma.book.findMany({
        where: {
          userId,
          status: { in: REVIEW_ELIGIBLE_BOOK_STATUSES },
        },
        select: {
          id: true,
          status: true,
          reviews: {
            where: { userId },
            select: { id: true },
            take: 1,
          },
        },
      }),
    ]);

    const pendingBooks = reviewEligibleBooks
      .filter((book) => book.reviews.length === 0)
      .map((book) => ({
        bookId: book.id,
        status: book.status,
      }));

    return {
      hasAnyPrintedBook: reviewEligibleBooks.length > 0,
      reviewedBooks: reviews.map((review) => this.serializeReviewedBook(review)),
      pendingBooks,
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
        reviews: {
          where: { userId },
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!book) {
      throw new NotFoundException(`Book "${input.bookId}" not found`);
    }

    if (!REVIEW_ELIGIBLE_BOOK_STATUSES.includes(book.status)) {
      throw new BadRequestException("This book is not ready for review yet");
    }

    if (book.reviews.length > 0) {
      throw new ConflictException("You have already reviewed this book");
    }

    const review = await this.prisma.review.create({
      data: {
        bookId: input.bookId,
        userId,
        rating: input.rating,
        comment: input.comment ?? null,
        isPublic: false,
      },
      select: REVIEW_SELECT,
    });

    return {
      review: this.serializeReviewedBook(review),
    };
  }

  private serializeReviewedBook(review: {
    bookId: string;
    rating: number;
    comment: string | null;
    isPublic: boolean;
    createdAt: Date;
  }): ReviewedBook {
    return {
      bookId: review.bookId,
      rating: review.rating,
      comment: review.comment,
      isPublic: review.isPublic,
      createdAt: review.createdAt.toISOString(),
    };
  }
}
