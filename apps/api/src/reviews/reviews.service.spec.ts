/// <reference types="jest" />
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { BookStatus } from "../generated/prisma/enums.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ReviewsService } from "./reviews.service.js";

const mockPrismaService = {
  review: {
    findMany: jest.fn(),
    create: jest.fn(),
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
    it("returns pending and submitted review state for the current user", async () => {
      mockPrismaService.review.findMany.mockResolvedValue([
        {
          bookId: "cmbook111111111111111111111111",
          rating: 5,
          comment: "Excellent quality.",
          isPublic: false,
          createdAt: new Date("2026-03-07T10:00:00.000Z"),
        },
      ]);
      mockPrismaService.book.findMany.mockResolvedValue([
        {
          id: "cmbook111111111111111111111111",
          status: BookStatus.PRINTED,
          reviews: [{ id: "cmreview1111111111111111111111" }],
        },
        {
          id: "cmbook222222222222222222222222",
          status: BookStatus.SHIPPING,
          reviews: [],
        },
      ]);

      await expect(service.getMyReviews("cmuser111111111111111111111111")).resolves.toEqual({
        hasAnyPrintedBook: true,
        reviewedBooks: [
          {
            bookId: "cmbook111111111111111111111111",
            rating: 5,
            comment: "Excellent quality.",
            isPublic: false,
            createdAt: "2026-03-07T10:00:00.000Z",
          },
        ],
        pendingBooks: [
          {
            bookId: "cmbook222222222222222222222222",
            status: BookStatus.SHIPPING,
          },
        ],
      });
    });
  });

  describe("createReview", () => {
    it("creates a review when the book is eligible and not yet reviewed", async () => {
      mockPrismaService.book.findFirst.mockResolvedValue({
        id: "cmbook333333333333333333333333",
        status: BookStatus.PRINTED,
        reviews: [],
      });
      mockPrismaService.review.create.mockResolvedValue({
        bookId: "cmbook333333333333333333333333",
        rating: 4,
        comment: "Very smooth process.",
        isPublic: false,
        createdAt: new Date("2026-03-07T12:00:00.000Z"),
      });

      await expect(
        service.createReview("cmuser222222222222222222222222", {
          bookId: "cmbook333333333333333333333333",
          rating: 4,
          comment: "Very smooth process.",
        })
      ).resolves.toEqual({
        review: {
          bookId: "cmbook333333333333333333333333",
          rating: 4,
          comment: "Very smooth process.",
          isPublic: false,
          createdAt: "2026-03-07T12:00:00.000Z",
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
        select: {
          bookId: true,
          rating: true,
          comment: true,
          isPublic: true,
          createdAt: true,
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
        status: BookStatus.PRINTING,
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
        status: BookStatus.PRINTED,
        reviews: [{ id: "cmreview5555555555555555555555" }],
      });

      await expect(
        service.createReview("cmuser555555555555555555555555", {
          bookId: "cmbook555555555555555555555555",
          rating: 5,
          comment: undefined,
        })
      ).rejects.toThrow(ConflictException);
    });
  });
});
