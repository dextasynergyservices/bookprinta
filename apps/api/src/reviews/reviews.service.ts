import { Injectable } from "@nestjs/common";
import { BookStatus } from "../generated/prisma/enums.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { MyReviewsResponseDto } from "./dto/my-reviews-response.dto.js";

const REVIEW_ELIGIBLE_BOOK_STATUSES: BookStatus[] = [
  BookStatus.PRINTED,
  BookStatus.SHIPPING,
  BookStatus.DELIVERED,
  BookStatus.COMPLETED,
];

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyReviews(userId: string): Promise<MyReviewsResponseDto> {
    const [reviews, reviewEligibleBooks] = await Promise.all([
      this.prisma.review.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: {
          bookId: true,
          rating: true,
          comment: true,
          isPublic: true,
          createdAt: true,
        },
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
      reviewedBooks: reviews,
      pendingBooks,
    };
  }
}
