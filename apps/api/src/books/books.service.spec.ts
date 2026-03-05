/// <reference types="jest" />
import { NotFoundException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { PrismaService } from "../prisma/prisma.service.js";
import { BooksService } from "./books.service.js";

const mockPrismaService = {
  book: {
    findFirst: jest.fn(),
  },
};

describe("BooksService", () => {
  let service: BooksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BooksService, { provide: PrismaService, useValue: mockPrismaService }],
    }).compile();

    service = module.get<BooksService>(BooksService);
    jest.clearAllMocks();
  });

  describe("findUserBookById", () => {
    it("returns book detail with progress timeline for normal flow", async () => {
      mockPrismaService.book.findFirst.mockResolvedValue({
        id: "cm1111111111111111111111111",
        orderId: "cm2222222222222222222222222",
        status: "PRINTING",
        rejectionReason: null,
        rejectedAt: null,
        pageCount: 220,
        wordCount: 65000,
        estimatedPages: 210,
        fontFamily: "Miller Text",
        fontSize: 12,
        pageSize: "A5",
        currentHtmlUrl: "https://cdn.example.com/books/1/current.html",
        previewPdfUrl: "https://cdn.example.com/books/1/preview.pdf",
        finalPdfUrl: null,
        createdAt: new Date("2026-03-01T08:00:00.000Z"),
        updatedAt: new Date("2026-03-03T10:00:00.000Z"),
      });

      const result = await service.findUserBookById("user_1", "cm1111111111111111111111111");

      expect(mockPrismaService.book.findFirst).toHaveBeenCalledWith({
        where: {
          id: "cm1111111111111111111111111",
          userId: "user_1",
        },
        select: expect.any(Object),
      });

      expect(result.id).toBe("cm1111111111111111111111111");
      expect(result.status).toBe("PRINTING");
      expect(result.rejectionReason).toBeNull();
      expect(result.timeline.find((entry) => entry.stage === "PRINTING")?.state).toBe("current");
      expect(result.timeline.find((entry) => entry.stage === "PAYMENT_RECEIVED")?.state).toBe(
        "completed"
      );
      expect(result.timeline.find((entry) => entry.stage === "DELIVERED")?.state).toBe("upcoming");
    });

    it("renders review stage as rejected with reason when status is REJECTED", async () => {
      mockPrismaService.book.findFirst.mockResolvedValue({
        id: "cm1111111111111111111111111",
        orderId: "cm2222222222222222222222222",
        status: "REJECTED",
        rejectionReason: "Low-resolution manuscript images.",
        rejectedAt: new Date("2026-03-04T09:00:00.000Z"),
        pageCount: null,
        wordCount: 42000,
        estimatedPages: 140,
        fontFamily: null,
        fontSize: 11,
        pageSize: "A4",
        currentHtmlUrl: null,
        previewPdfUrl: null,
        finalPdfUrl: null,
        createdAt: new Date("2026-03-01T08:00:00.000Z"),
        updatedAt: new Date("2026-03-04T09:00:00.000Z"),
      });

      const result = await service.findUserBookById("user_1", "cm1111111111111111111111111");

      expect(result.status).toBe("REJECTED");
      expect(result.rejectionReason).toBe("Low-resolution manuscript images.");
      expect(result.timeline.find((entry) => entry.stage === "REVIEW")?.state).toBe("rejected");
      expect(result.timeline.find((entry) => entry.stage === "APPROVED")?.state).toBe("upcoming");
    });

    it("throws NotFoundException when book does not belong to user", async () => {
      mockPrismaService.book.findFirst.mockResolvedValue(null);

      await expect(service.findUserBookById("user_1", "cm_missing")).rejects.toThrow(
        NotFoundException
      );
    });
  });
});
