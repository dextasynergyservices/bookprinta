/// <reference types="jest" />
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { PrismaService } from "../prisma/prisma.service.js";
import { ReviewsService } from "./reviews.service.js";

const mockPrismaService = {
  review: {
    create: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  book: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
};

describe("ReviewsService", () => {
  let service: ReviewsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReviewsService, { provide: PrismaService, useValue: mockPrismaService }],
    }).compile();

    service = module.get<ReviewsService>(ReviewsService);
    jest.resetAllMocks();
  });

  describe("getMyReviews", () => {
    it("returns delivered-book review state with persisted metadata and review summaries", async () => {
      mockPrismaService.book.findMany.mockResolvedValue([
        {
          id: "cmbook111111111111111111111111",
          status: "PRINTING",
          productionStatus: "DELIVERED",
          title: "The Lagos Chronicle",
          coverImageUrl: "https://cdn.example.com/covers/lagos-final.jpg",
          order: {
            customQuote: null,
          },
          files: [],
          reviews: [
            {
              rating: 5,
              comment: "Excellent quality.",
              isPublic: false,
              createdAt: new Date("2026-03-07T10:00:00.000Z"),
            },
          ],
        },
        {
          id: "cmbook222222222222222222222222",
          status: "COMPLETED",
          productionStatus: null,
          title: null,
          coverImageUrl: null,
          order: {
            customQuote: null,
          },
          files: [
            {
              fileType: "RAW_MANUSCRIPT",
              url: "https://cdn.example.com/manuscripts/book-2.docx",
              fileName: "my-second-book.docx",
              version: 2,
            },
            {
              fileType: "COVER_DESIGN_DRAFT",
              url: "https://cdn.example.com/covers/book-2-draft.jpg",
              fileName: "book-2-draft.jpg",
              version: 1,
            },
          ],
          reviews: [],
        },
      ]);

      await expect(service.getMyReviews("cmuser111111111111111111111111")).resolves.toEqual({
        hasEligibleBooks: true,
        hasPendingReviews: true,
        books: [
          {
            bookId: "cmbook111111111111111111111111",
            title: "The Lagos Chronicle",
            coverImageUrl: "https://cdn.example.com/covers/lagos-final.jpg",
            lifecycleStatus: "DELIVERED",
            reviewStatus: "REVIEWED",
            review: {
              rating: 5,
              comment: "Excellent quality.",
              isPublic: false,
              createdAt: "2026-03-07T10:00:00.000Z",
            },
          },
          {
            bookId: "cmbook222222222222222222222222",
            title: "my second book",
            coverImageUrl: "https://cdn.example.com/covers/book-2-draft.jpg",
            lifecycleStatus: "COMPLETED",
            reviewStatus: "PENDING",
            review: null,
          },
        ],
      });
    });
  });

  describe("createReview", () => {
    it("creates a review when the book is eligible and returns the refreshed book review state", async () => {
      mockPrismaService.book.findFirst
        .mockResolvedValueOnce({
          id: "cmbook333333333333333333333333",
          status: "PRINTING",
          productionStatus: "DELIVERED",
          reviews: [],
        })
        .mockResolvedValueOnce({
          id: "cmbook333333333333333333333333",
          status: "PRINTING",
          productionStatus: "DELIVERED",
          title: "New Dawn",
          coverImageUrl: "https://cdn.example.com/covers/new-dawn.jpg",
          order: {
            customQuote: null,
          },
          files: [],
          reviews: [
            {
              rating: 4,
              comment: "Very smooth process.",
              isPublic: false,
              createdAt: new Date("2026-03-07T12:00:00.000Z"),
            },
          ],
        });
      mockPrismaService.review.create.mockResolvedValue({
        id: "cmreview3333333333333333333333",
      });

      await expect(
        service.createReview("cmuser222222222222222222222222", {
          bookId: "cmbook333333333333333333333333",
          rating: 4,
          comment: "Very smooth process.",
        })
      ).resolves.toEqual({
        book: {
          bookId: "cmbook333333333333333333333333",
          title: "New Dawn",
          coverImageUrl: "https://cdn.example.com/covers/new-dawn.jpg",
          lifecycleStatus: "DELIVERED",
          reviewStatus: "REVIEWED",
          review: {
            rating: 4,
            comment: "Very smooth process.",
            isPublic: false,
            createdAt: "2026-03-07T12:00:00.000Z",
          },
        },
      });

      expect(mockPrismaService.review.create).toHaveBeenCalledWith({
        data: {
          bookId: "cmbook333333333333333333333333",
          userId: "cmuser222222222222222222222222",
          rating: 4,
          comment: "Very smooth process.",
          isPublic: false,
        },
      });
    });

    it("throws NotFoundException when the book does not belong to the user", async () => {
      mockPrismaService.book.findFirst.mockResolvedValue(null);

      await expect(
        service.createReview("cmuser333333333333333333333333", {
          bookId: "cmbookmissing11111111111111111",
          rating: 5,
          comment: undefined,
        })
      ).rejects.toThrow(NotFoundException);
    });

    it("throws BadRequestException when the book is not review eligible", async () => {
      mockPrismaService.book.findFirst.mockResolvedValue({
        id: "cmbook444444444444444444444444",
        status: "COMPLETED",
        productionStatus: "SHIPPING",
        reviews: [],
      });

      await expect(
        service.createReview("cmuser444444444444444444444444", {
          bookId: "cmbook444444444444444444444444",
          rating: 3,
          comment: undefined,
        })
      ).rejects.toThrow(BadRequestException);
    });

    it("throws ConflictException when the user already reviewed the book", async () => {
      mockPrismaService.book.findFirst.mockResolvedValue({
        id: "cmbook555555555555555555555555",
        status: "PRINTING",
        productionStatus: "DELIVERED",
        reviews: [{ rating: 5 }],
      });

      await expect(
        service.createReview("cmuser555555555555555555555555", {
          bookId: "cmbook555555555555555555555555",
          rating: 5,
          comment: undefined,
        })
      ).rejects.toThrow(ConflictException);
    });

    it("maps unique constraint races to a 409 ConflictException", async () => {
      mockPrismaService.book.findFirst.mockResolvedValue({
        id: "cmbook666666666666666666666666",
        status: "PRINTING",
        productionStatus: "DELIVERED",
        reviews: [],
      });
      mockPrismaService.review.create.mockRejectedValue({ code: "P2002" });

      const error = await service
        .createReview("cmuser666666666666666666666666", {
          bookId: "cmbook666666666666666666666666",
          rating: 5,
          comment: "Great.",
        })
        .catch((caught) => caught);

      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getStatus()).toBe(409);
    });
  });

  describe("admin moderation", () => {
    it("lists admin reviews with pagination and serialized output", async () => {
      mockPrismaService.review.findMany.mockResolvedValue([
        {
          id: "review-1",
          rating: 5,
          comment: "Brilliant execution",
          isPublic: false,
          createdAt: new Date("2026-03-19T10:00:00.000Z"),
          book: {
            id: "book-1",
            title: "Lagos Rising",
          },
          user: {
            firstName: "Ada",
            lastName: "Author",
            email: "ada@example.com",
          },
        },
        {
          id: "review-2",
          rating: 4,
          comment: "Solid",
          isPublic: true,
          createdAt: new Date("2026-03-18T10:00:00.000Z"),
          book: {
            id: "book-2",
            title: "Market Moves",
          },
          user: {
            firstName: "Bola",
            lastName: "Writer",
            email: "bola@example.com",
          },
        },
      ]);

      await expect(
        service.listAdminReviews({
          limit: 1,
          q: "  ada  ",
          isPublic: false,
          rating: 5,
        })
      ).resolves.toEqual({
        items: [
          {
            id: "review-1",
            bookId: "book-1",
            bookTitle: "Lagos Rising",
            authorName: "Ada Author",
            authorEmail: "ada@example.com",
            rating: 5,
            comment: "Brilliant execution",
            isPublic: false,
            createdAt: "2026-03-19T10:00:00.000Z",
          },
        ],
        nextCursor: "review-1",
        hasMore: true,
      });

      expect(mockPrismaService.review.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isPublic: false,
            rating: 5,
          }),
          take: 2,
        })
      );
    });

    it("updates moderation fields for an existing review", async () => {
      mockPrismaService.review.update.mockResolvedValue({
        id: "review-1",
        rating: 3,
        comment: null,
        isPublic: true,
        createdAt: new Date("2026-03-19T10:00:00.000Z"),
        book: {
          id: "book-1",
          title: "Lagos Rising",
        },
        user: {
          firstName: null,
          lastName: null,
          email: "ada@example.com",
        },
      });

      await expect(
        service.updateAdminReview("review-1", {
          isPublic: true,
          comment: null,
        })
      ).resolves.toEqual({
        id: "review-1",
        bookId: "book-1",
        bookTitle: "Lagos Rising",
        authorName: "ada@example.com",
        authorEmail: "ada@example.com",
        rating: 3,
        comment: null,
        isPublic: true,
        createdAt: "2026-03-19T10:00:00.000Z",
      });
    });

    it("maps missing review updates to NotFoundException", async () => {
      mockPrismaService.review.update.mockRejectedValue({ code: "P2025" });

      await expect(
        service.updateAdminReview("missing-review", {
          isPublic: false,
          comment: undefined,
        })
      ).rejects.toThrow(NotFoundException);
    });

    it("deletes an existing review", async () => {
      mockPrismaService.review.delete.mockResolvedValue({ id: "review-1" });

      await expect(service.deleteAdminReview("review-1")).resolves.toEqual({
        id: "review-1",
        deleted: true,
      });
    });

    it("maps missing review deletes to NotFoundException", async () => {
      mockPrismaService.review.delete.mockRejectedValue({ code: "P2025" });

      await expect(service.deleteAdminReview("missing-review")).rejects.toThrow(NotFoundException);
    });
  });
});
