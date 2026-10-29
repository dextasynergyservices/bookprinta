/// <reference types="jest" />
/**
 * Concurrency guards on the user-facing book transitions.
 *
 * `approveUserBook` and `updateUserBookSettings` both decide what to write from
 * a snapshot read outside their transaction, so both need a compare-and-swap to
 * reject a stale write. Without it:
 *
 *  - approve vs. settings change: the pipeline's `markFormattingQueued()` moves
 *    the book to AI_PROCESSING and nulls `pageCount`, but a blind approve would
 *    still commit APPROVED and bill `extraAmount` off the stale page count;
 *  - settings change vs. approve: a blind settings write would land on an
 *    APPROVED book and the reformat it enqueues would reset it to AI_PROCESSING
 *    (APPROVED is not in `TERMINAL_BOOK_STATUSES`) while its PDF job was
 *    already in flight.
 *
 * The guards mirror the admin transitions in this service, which have always
 * used `updateMany({ where: { id, version } })` + ConflictException.
 *
 * These tests assert the guard is present AND that a lost claim aborts the whole
 * operation — the side effects (order write, PDF enqueue) must not happen.
 */
import { ConflictException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { FilesService } from "../files/files.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { SystemSettingsCacheService } from "../production-delay/system-settings-cache.service.js";
import { RolloutService } from "../rollout/rollout.service.js";
import { BooksService } from "./books.service.js";
import { BooksPipelineService } from "./books-pipeline.service.js";
import { ManuscriptAnalysisService } from "./manuscript-analysis.service.js";

const txBookUpdateMany = jest.fn();
const txBookFindUnique = jest.fn();
const txOrderUpdate = jest.fn();

const mockPrismaService = {
  book: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn() },
  order: { update: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) },
  payment: { findMany: jest.fn() },
  systemSetting: {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
  },
  paymentGateway: { findMany: jest.fn().mockResolvedValue([]) },
  $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      book: { updateMany: txBookUpdateMany, findUnique: txBookFindUnique, update: jest.fn() },
      order: { update: txOrderUpdate },
    })
  ),
};

const mockBooksPipelineService = {
  enqueueFormatManuscript: jest.fn().mockResolvedValue({ queued: true, reason: "QUEUED" }),
  enqueueGeneratePdf: jest
    .fn()
    .mockResolvedValue({ queued: true, reason: "QUEUED", queueJobId: "generate-pdf:book_1:hash" }),
  cancelActiveJobsForBook: jest.fn().mockResolvedValue(undefined),
};

/** 120 pages against a 100-page bundle: 20 pages overage, NGN200, already paid. */
const bookOverLimit = {
  id: "book_1",
  orderId: "order_1",
  status: "PREVIEW_READY",
  version: 7,
  pageCount: 120,
  currentHtmlUrl: "https://res.cloudinary.com/x/cleaned.html",
  finalPdfUrl: null,
  order: {
    status: "FORMATTED",
    orderType: "STANDARD",
    skipFormatting: false,
    package: { pageLimit: 100 },
  },
};

const reprintBook = {
  ...bookOverLimit,
  status: "REVIEW",
  finalPdfUrl: "https://res.cloudinary.com/x/final.pdf",
  order: { ...bookOverLimit.order, orderType: "REPRINT", skipFormatting: true },
};

describe("BooksService — concurrency guards", () => {
  let service: BooksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BooksService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: FilesService, useValue: { uploadFile: jest.fn(), getBookFiles: jest.fn() } },
        {
          provide: ManuscriptAnalysisService,
          useValue: { estimatePages: jest.fn().mockReturnValue(130), extractWordCount: jest.fn() },
        },
        { provide: BooksPipelineService, useValue: mockBooksPipelineService },
        { provide: NotificationsService, useValue: { createReviewRequestNotification: jest.fn() } },
        {
          provide: SystemSettingsCacheService,
          useValue: { getMany: jest.fn().mockResolvedValue({}), get: jest.fn() },
        },
        {
          provide: RolloutService,
          useValue: {
            assertBillingGateAccess: jest.fn(),
            assertFinalPdfAccess: jest.fn(),
            assertManuscriptPipelineAccess: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<BooksService>(BooksService);

    jest.clearAllMocks();
    txBookUpdateMany.mockResolvedValue({ count: 1 });
    mockPrismaService.payment.findMany.mockResolvedValue([
      { amount: 200, metadata: { extraPages: 20 } },
    ]);
    mockBooksPipelineService.enqueueGeneratePdf.mockResolvedValue({
      queued: true,
      reason: "QUEUED",
      queueJobId: "generate-pdf:book_1:hash",
    });
  });

  describe("approveUserBook", () => {
    it("claims the transition on both version and status, not on id alone", async () => {
      mockPrismaService.book.findFirst.mockResolvedValue(bookOverLimit);

      await service.approveUserBook("user_1", "book_1", {} as never);

      expect(txBookUpdateMany).toHaveBeenCalledTimes(1);
      const where = txBookUpdateMany.mock.calls[0][0].where;
      expect(where).toEqual({ id: "book_1", version: 7, status: "PREVIEW_READY" });
    });

    it("bumps version so a concurrent settings write is rejected in turn", async () => {
      mockPrismaService.book.findFirst.mockResolvedValue(bookOverLimit);

      await service.approveUserBook("user_1", "book_1", {} as never);

      expect(txBookUpdateMany.mock.calls[0][0].data).toEqual({
        status: "APPROVED",
        version: { increment: 1 },
      });
    });

    it("raises 409 and skips all side effects when another writer won the race", async () => {
      mockPrismaService.book.findFirst.mockResolvedValue(bookOverLimit);
      // A settings change committed between the snapshot read and this write.
      txBookUpdateMany.mockResolvedValue({ count: 0 });

      await expect(service.approveUserBook("user_1", "book_1", {} as never)).rejects.toThrow(
        ConflictException
      );

      // The order must not be advanced, and no overage billed off a stale count.
      expect(txOrderUpdate).not.toHaveBeenCalled();
      // And no final PDF render queued for a book that was not actually approved.
      expect(mockBooksPipelineService.enqueueGeneratePdf).not.toHaveBeenCalled();
    });

    it("guards the reprint REVIEW -> IN_PRODUCTION transition the same way", async () => {
      mockPrismaService.book.findFirst.mockResolvedValue(reprintBook);

      await service.approveUserBook("user_1", "book_1", {} as never);

      expect(txBookUpdateMany.mock.calls[0][0].where).toEqual({
        id: "book_1",
        version: 7,
        status: "REVIEW",
      });
    });

    it("raises 409 on a lost reprint claim without advancing the order", async () => {
      mockPrismaService.book.findFirst.mockResolvedValue(reprintBook);
      txBookUpdateMany.mockResolvedValue({ count: 0 });

      await expect(service.approveUserBook("user_1", "book_1", {} as never)).rejects.toThrow(
        ConflictException
      );
      expect(txOrderUpdate).not.toHaveBeenCalled();
    });
  });

  describe("updateUserBookSettings", () => {
    const settingsBook = {
      id: "book_1",
      wordCount: 58_000,
      status: "PREVIEW_READY",
      version: 7,
      pageSize: "A5",
      fontSize: 11,
      title: "Draft",
    };

    it("claims the write on the snapshot version", async () => {
      mockPrismaService.book.findFirst.mockResolvedValue(settingsBook);
      txBookFindUnique.mockResolvedValue({
        id: "book_1",
        title: "Draft",
        pageSize: "A4",
        fontSize: 12,
        wordCount: 58_000,
        estimatedPages: 130,
        updatedAt: new Date("2026-10-20T00:00:00.000Z"),
      });

      await service.updateUserBookSettings("user_1", "book_1", {
        pageSize: "A4",
        fontSize: 12,
      } as never);

      expect(txBookUpdateMany.mock.calls[0][0].where).toEqual({ id: "book_1", version: 7 });
    });

    it("raises 409 and does not enqueue a reformat when approval won the race", async () => {
      mockPrismaService.book.findFirst.mockResolvedValue(settingsBook);
      // approveUserBook incremented version to 8 after this method's snapshot.
      txBookUpdateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.updateUserBookSettings("user_1", "book_1", {
          pageSize: "A4",
          fontSize: 12,
        } as never)
      ).rejects.toThrow(ConflictException);

      // Critically: no reformat job, which is what would have reset an APPROVED
      // book back to AI_PROCESSING underneath an in-flight PDF render.
      expect(mockBooksPipelineService.enqueueFormatManuscript).not.toHaveBeenCalled();
    });
  });
});
