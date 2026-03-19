/// <reference types="jest" />

import { renderManuscriptRejectedEmail } from "@bookprinta/emails/render";
import { ConflictException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { CloudinaryService } from "../cloudinary/cloudinary.service.js";
import { FilesService } from "../files/files.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { WhatsappNotificationsService } from "../notifications/whatsapp-notifications.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { RolloutService } from "../rollout/rollout.service.js";
import { BooksService } from "./books.service.js";
import { BooksPipelineService } from "./books-pipeline.service.js";
import { ManuscriptAnalysisService } from "./manuscript-analysis.service.js";

jest.mock("@bookprinta/emails/render", () => ({
  renderManuscriptRejectedEmail: jest.fn(),
}));

const txBookUpdateMany = jest.fn();
const txBookFindUnique = jest.fn();
const txOrderUpdate = jest.fn();
const txFileFindFirst = jest.fn();
const txFileCreate = jest.fn();
const txAuditLogCreate = jest.fn();
const notificationCreateManyMock = jest.fn();
const userFindManyMock = jest.fn();

const mockPrismaService = {
  book: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  file: {
    findFirst: jest.fn(),
  },
  order: {
    update: jest.fn(),
  },
  auditLog: {
    create: jest.fn(),
  },
  notification: {
    createMany: notificationCreateManyMock,
  },
  user: {
    findMany: userFindManyMock,
  },
  $transaction: jest.fn(
    async (callback: (tx: unknown) => Promise<unknown>): Promise<unknown> =>
      callback({
        book: {
          updateMany: txBookUpdateMany,
          findUnique: txBookFindUnique,
        },
        order: {
          update: txOrderUpdate,
        },
        file: {
          findFirst: txFileFindFirst,
          create: txFileCreate,
        },
        auditLog: {
          create: txAuditLogCreate,
        },
        notification: {
          createMany: notificationCreateManyMock,
        },
        user: {
          findMany: userFindManyMock,
        },
      })
  ),
};

const mockFilesService = {
  uploadFile: jest.fn(),
  getBookFiles: jest.fn(),
};

const mockBooksPipelineService = {
  enqueueFormatManuscript: jest.fn(),
  enqueueGeneratePdf: jest.fn(),
  enqueuePageCountFromAiSuccess: jest.fn(),
};

const mockManuscriptAnalysisService = {
  detectMimeType: jest.fn(),
  extractWordCount: jest.fn(),
  estimatePages: jest.fn(),
};

const mockNotificationsService = {
  createReviewRequestNotification: jest.fn(),
  createSystemNotification: jest.fn(),
};

const mockWhatsappNotificationsService = {
  sendBookStatusUpdate: jest.fn(),
  sendShippingNotification: jest.fn(),
  sendManuscriptRejected: jest.fn(),
};

const mockRolloutService = {
  resolveBookRolloutState: jest.fn(),
  assertBookWorkspaceAccess: jest.fn(),
  assertManuscriptPipelineAccess: jest.fn(),
  assertBillingGateAccess: jest.fn(),
  assertFinalPdfAccess: jest.fn(),
};

const mockCloudinaryService = {
  generateSignature: jest.fn(),
};

const originalFrontendUrl = process.env.FRONTEND_URL;
const originalCloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME;
const originalGlobalFetch = global.fetch;

describe("BooksService admin workflows", () => {
  let service: BooksService;

  beforeEach(async () => {
    process.env.FRONTEND_URL = "http://localhost:3000";
    process.env.CLOUDINARY_CLOUD_NAME = "demo";

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BooksService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: FilesService, useValue: mockFilesService },
        { provide: BooksPipelineService, useValue: mockBooksPipelineService },
        { provide: ManuscriptAnalysisService, useValue: mockManuscriptAnalysisService },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: WhatsappNotificationsService, useValue: mockWhatsappNotificationsService },
        { provide: RolloutService, useValue: mockRolloutService },
        { provide: CloudinaryService, useValue: mockCloudinaryService },
      ],
    }).compile();

    service = module.get<BooksService>(BooksService);
    jest.clearAllMocks();
    txBookUpdateMany.mockReset();
    txBookFindUnique.mockReset();
    txOrderUpdate.mockReset();
    txFileFindFirst.mockReset();
    txFileCreate.mockReset();
    txAuditLogCreate.mockReset();
    (renderManuscriptRejectedEmail as jest.Mock).mockResolvedValue({
      html: "<p>Rejected</p>",
      subject: "Needs revision",
    });
  });

  afterAll(() => {
    process.env.FRONTEND_URL = originalFrontendUrl;
    process.env.CLOUDINARY_CLOUD_NAME = originalCloudinaryCloudName;
    global.fetch = originalGlobalFetch;
  });

  it("lists admin books with computed display status and cursor pagination", async () => {
    mockPrismaService.book.findMany.mockResolvedValue([
      {
        id: "cm1111111111111111111111111",
        title: "Second Book",
        status: "PAYMENT_RECEIVED",
        productionStatus: "DESIGNING",
        createdAt: new Date("2026-03-11T09:00:00.000Z"),
        user: {
          id: "user_2",
          firstName: "Kemi",
          lastName: "Adebayo",
          email: "kemi@example.com",
          preferredLanguage: "en",
        },
        order: {
          id: "cmorder2222222222222222222222",
          orderNumber: "BP-2026-0002",
          status: "PROCESSING",
        },
        files: [{ createdAt: new Date("2026-03-11T10:00:00.000Z") }],
      },
      {
        id: "cm3333333333333333333333333",
        title: "First Book",
        status: "UPLOADED",
        productionStatus: null,
        createdAt: new Date("2026-03-10T08:00:00.000Z"),
        user: {
          id: "user_1",
          firstName: "Ada",
          lastName: "Okafor",
          email: "ada@example.com",
          preferredLanguage: "en",
        },
        order: {
          id: "cmorder1111111111111111111111",
          orderNumber: "BP-2026-0001",
          status: "PENDING",
        },
        files: [{ createdAt: new Date("2026-03-10T09:00:00.000Z") }],
      },
    ]);

    const result = await service.findAdminBooks({
      limit: 1,
      sortBy: "uploadedAt",
      sortDirection: "desc",
    });

    expect(mockPrismaService.book.findMany).toHaveBeenCalledWith({
      where: {},
      select: expect.any(Object),
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      id: "cm1111111111111111111111111",
      title: "Second Book",
      author: {
        id: "user_2",
        fullName: "Kemi Adebayo",
        email: "kemi@example.com",
        preferredLanguage: "en",
      },
      order: {
        id: "cmorder2222222222222222222222",
        orderNumber: "BP-2026-0002",
        status: "PROCESSING",
        detailUrl: "/admin/orders/cmorder2222222222222222222222",
      },
      status: "PAYMENT_RECEIVED",
      productionStatus: "DESIGNING",
      displayStatus: "DESIGNING",
      statusSource: "production",
      uploadedAt: "2026-03-11T10:00:00.000Z",
      createdAt: "2026-03-11T09:00:00.000Z",
      detailUrl: "/admin/books/cm1111111111111111111111111",
    });
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe("cm1111111111111111111111111");
    expect(result.totalItems).toBe(2);
  });

  it("returns the admin book detail projection with files and status controls", async () => {
    mockPrismaService.book.findFirst.mockResolvedValue({
      id: "cm1111111111111111111111111",
      orderId: "cm2222222222222222222222222",
      status: "FORMATTING",
      productionStatus: "FORMATTING_REVIEW",
      title: "The Lagos Chronicle",
      coverImageUrl: null,
      rejectionReason: null,
      rejectedAt: null,
      rejectedBy: null,
      pageCount: 184,
      wordCount: 42100,
      estimatedPages: 188,
      fontFamily: "Miller Text",
      fontSize: 12,
      pageSize: "A5",
      currentHtmlUrl: "https://example.com/current.html",
      previewPdfUrl: "https://example.com/preview.pdf",
      finalPdfUrl: "https://example.com/final.pdf",
      version: 7,
      createdAt: new Date("2026-03-10T09:30:00.000Z"),
      updatedAt: new Date("2026-03-11T14:45:00.000Z"),
      productionStatusUpdatedAt: new Date("2026-03-11T14:30:00.000Z"),
      user: {
        id: "user_1",
        firstName: "Ada",
        lastName: "Okafor",
        email: "ada@example.com",
        preferredLanguage: "en",
      },
      order: {
        id: "cm2222222222222222222222222",
        orderNumber: "BP-2026-0001",
        status: "PROCESSING",
      },
      files: [
        {
          id: "file_raw_1",
          fileType: "RAW_MANUSCRIPT",
          url: "https://example.com/raw.docx",
          fileName: "lagos-chronicle.docx",
          fileSize: 21000,
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          version: 1,
          createdBy: "user_1",
          createdAt: new Date("2026-03-10T09:31:00.000Z"),
        },
      ],
      jobs: [],
    });
    mockRolloutService.resolveBookRolloutState.mockReturnValue({
      environment: "development",
      allowInFlightAccess: true,
      isGrandfathered: false,
      blockedBy: null,
      workspace: { enabled: true, access: "enabled" },
      manuscriptPipeline: { enabled: true, access: "enabled" },
      billingGate: { enabled: true, access: "enabled" },
      finalPdf: { enabled: true, access: "enabled" },
    });

    const result = await service.findAdminBookById("cm1111111111111111111111111");

    expect(result).toEqual(
      expect.objectContaining({
        id: "cm1111111111111111111111111",
        orderId: "cm2222222222222222222222222",
        displayStatus: "FORMATTING_REVIEW",
        statusSource: "production",
        title: "The Lagos Chronicle",
        uploadedAt: "2026-03-10T09:31:00.000Z",
        version: 7,
        author: {
          id: "user_1",
          fullName: "Ada Okafor",
          email: "ada@example.com",
          preferredLanguage: "en",
        },
        order: {
          id: "cm2222222222222222222222222",
          orderNumber: "BP-2026-0001",
          status: "PROCESSING",
          detailUrl: "/admin/orders/cm2222222222222222222222222",
        },
      })
    );
    expect(result.files).toEqual([
      {
        id: "file_raw_1",
        fileType: "RAW_MANUSCRIPT",
        url: "https://example.com/raw.docx",
        fileName: "lagos-chronicle.docx",
        fileSize: 21000,
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        version: 1,
        createdBy: "user_1",
        createdAt: "2026-03-10T09:31:00.000Z",
      },
    ]);
    expect(result.statusControl).toEqual(
      expect.objectContaining({
        currentStatus: "FORMATTING_REVIEW",
        expectedVersion: 7,
        canRejectManuscript: true,
      })
    );
  });

  it("advances admin book status with optimistic locking and audit logging", async () => {
    mockPrismaService.book.findFirst.mockResolvedValue({
      id: "cm1111111111111111111111111",
      orderId: "cm2222222222222222222222222",
      userId: "cm3333333333333333333333333",
      title: "The Lagos Chronicle",
      status: "PAYMENT_RECEIVED",
      productionStatus: null,
      version: 3,
      order: {
        orderNumber: "BP-2026-0001",
        trackingNumber: null,
        shippingProvider: null,
      },
      user: {
        email: "ada@example.com",
        firstName: "Ada",
        lastName: "Okafor",
        phoneNumber: "+2348012345678",
        preferredLanguage: "en",
        whatsAppNotificationsEnabled: true,
      },
    });
    txBookUpdateMany.mockResolvedValue({ count: 1 });
    txBookFindUnique.mockResolvedValue({
      id: "cm1111111111111111111111111",
      orderId: "cm2222222222222222222222222",
      userId: "cm3333333333333333333333333",
      title: "The Lagos Chronicle",
      status: "PAYMENT_RECEIVED",
      productionStatus: "DESIGNING",
      version: 4,
      updatedAt: new Date("2026-03-12T12:00:00.000Z"),
    });
    txAuditLogCreate
      .mockResolvedValueOnce({
        id: "audit_1",
        action: "ADMIN_BOOK_STATUS_UPDATED",
        entityType: "BOOK",
        entityId: "cm1111111111111111111111111",
        details: {
          reason: "Kick off design",
        },
        createdAt: new Date("2026-03-12T12:00:00.000Z"),
      })
      .mockResolvedValueOnce({
        id: "audit_2",
        createdAt: new Date("2026-03-12T12:00:01.000Z"),
      });

    const result = await service.updateAdminBookStatus(
      "cm1111111111111111111111111",
      {
        nextStatus: "DESIGNING",
        expectedVersion: 3,
        reason: "Kick off design",
      },
      "admin_1"
    );

    expect(txBookUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "cm1111111111111111111111111",
        version: 3,
      },
      data: {
        productionStatus: "DESIGNING",
        productionStatusUpdatedAt: expect.any(Date),
        version: {
          increment: 1,
        },
      },
    });
    expect(txAuditLogCreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          action: "ADMIN_BOOK_STATUS_UPDATED",
          entityType: "BOOK",
          entityId: "cm1111111111111111111111111",
        }),
      })
    );
    expect(txAuditLogCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          action: "ORDER_STATUS_REACHED",
          entityType: "ORDER_TRACKING",
          entityId: "cm2222222222222222222222222",
        }),
      })
    );
    expect(mockWhatsappNotificationsService.sendBookStatusUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        bookTitle: "The Lagos Chronicle",
        newStatus: "DESIGNING",
      })
    );
    expect(result).toEqual({
      bookId: "cm1111111111111111111111111",
      previousStatus: "PAYMENT_RECEIVED",
      nextStatus: "DESIGNING",
      displayStatus: "DESIGNING",
      statusSource: "production",
      bookVersion: 4,
      updatedAt: "2026-03-12T12:00:00.000Z",
      audit: {
        auditId: "audit_1",
        action: "ADMIN_BOOK_STATUS_UPDATED",
        entityType: "BOOK",
        entityId: "cm1111111111111111111111111",
        recordedAt: "2026-03-12T12:00:00.000Z",
        recordedBy: "admin_1",
        note: null,
        reason: "Kick off design",
      },
    });
  });

  it("stores tracking details and sends shipping WhatsApp when a book moves to shipping", async () => {
    mockPrismaService.book.findFirst.mockResolvedValue({
      id: "cm1111111111111111111111111",
      orderId: "cm2222222222222222222222222",
      userId: "cm3333333333333333333333333",
      title: "The Lagos Chronicle",
      status: "PAYMENT_RECEIVED",
      productionStatus: "PRINTED",
      version: 7,
      order: {
        orderNumber: "BP-2026-0008",
        trackingNumber: null,
        shippingProvider: null,
      },
      user: {
        email: "ada@example.com",
        firstName: "Ada",
        lastName: "Okafor",
        phoneNumber: "+2348012345678",
        preferredLanguage: "en",
        whatsAppNotificationsEnabled: true,
      },
    });
    txBookUpdateMany.mockResolvedValue({ count: 1 });
    txBookFindUnique.mockResolvedValue({
      id: "cm1111111111111111111111111",
      orderId: "cm2222222222222222222222222",
      userId: "cm3333333333333333333333333",
      title: "The Lagos Chronicle",
      status: "PAYMENT_RECEIVED",
      productionStatus: "SHIPPING",
      version: 8,
      updatedAt: new Date("2026-03-12T16:00:00.000Z"),
    });
    txAuditLogCreate
      .mockResolvedValueOnce({
        id: "audit_ship",
        action: "ADMIN_BOOK_STATUS_UPDATED",
        entityType: "BOOK",
        entityId: "cm1111111111111111111111111",
        details: {},
        createdAt: new Date("2026-03-12T16:00:00.000Z"),
      })
      .mockResolvedValueOnce({
        id: "audit_ship_tracking",
        createdAt: new Date("2026-03-12T16:00:01.000Z"),
      });

    await service.updateAdminBookStatus(
      "cm1111111111111111111111111",
      {
        nextStatus: "SHIPPING",
        expectedVersion: 7,
        trackingNumber: "TRACK-123",
        shippingProvider: "DHL",
      },
      "admin_1"
    );

    expect(txOrderUpdate).toHaveBeenCalledWith({
      where: { id: "cm2222222222222222222222222" },
      data: {
        trackingNumber: "TRACK-123",
        shippingProvider: "DHL",
      },
    });
    expect(mockWhatsappNotificationsService.sendShippingNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        bookTitle: "The Lagos Chronicle",
        orderNumber: "BP-2026-0008",
        trackingNumber: "TRACK-123",
        shippingProvider: "DHL",
      })
    );
  });

  it("returns a conflict when the admin book version is stale", async () => {
    mockPrismaService.book.findFirst.mockResolvedValue({
      id: "cm1111111111111111111111111",
      orderId: "cm2222222222222222222222222",
      userId: "cm3333333333333333333333333",
      title: "The Lagos Chronicle",
      status: "PAYMENT_RECEIVED",
      productionStatus: null,
      version: 3,
    });
    txBookUpdateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.updateAdminBookStatus(
        "cm1111111111111111111111111",
        {
          nextStatus: "DESIGNING",
          expectedVersion: 3,
        },
        "admin_1"
      )
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects a manuscript, creates a notification, and sends the rejection email", async () => {
    mockPrismaService.book.findFirst.mockResolvedValue({
      id: "cm1111111111111111111111111",
      orderId: "cm2222222222222222222222222",
      userId: "cm3333333333333333333333333",
      title: "The Lagos Chronicle",
      status: "FORMATTING",
      productionStatus: null,
      version: 5,
      user: {
        email: "ada@example.com",
        firstName: "Ada",
        lastName: "Okafor",
        phoneNumber: "+2348012345678",
        preferredLanguage: "en",
        whatsAppNotificationsEnabled: true,
      },
    });
    txBookUpdateMany.mockResolvedValue({ count: 1 });
    txBookFindUnique.mockResolvedValue({
      id: "cm1111111111111111111111111",
      version: 6,
      rejectedAt: new Date("2026-03-12T14:00:00.000Z"),
      rejectionReason: "Please fix the chapter headings.",
    });
    txAuditLogCreate
      .mockResolvedValueOnce({
        id: "audit_reject",
        action: "ADMIN_BOOK_REJECTED",
        entityType: "BOOK",
        entityId: "cm1111111111111111111111111",
        details: {
          reason: "Please fix the chapter headings.",
        },
        createdAt: new Date("2026-03-12T14:00:00.000Z"),
      })
      .mockResolvedValueOnce({
        id: "audit_tracking",
        createdAt: new Date("2026-03-12T14:00:01.000Z"),
      });

    const resendMock = {
      emails: {
        send: jest.fn().mockResolvedValue({ error: null }),
      },
    };
    (service as unknown as { resend: typeof resendMock | null }).resend = resendMock;

    const result = await service.rejectAdminBook(
      "cm1111111111111111111111111",
      {
        expectedVersion: 5,
        rejectionReason: "Please fix the chapter headings.",
      },
      "admin_1"
    );

    expect(mockNotificationsService.createSystemNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "cm3333333333333333333333333",
        titleKey: "notifications.manuscript_rejected.title",
        messageKey: "notifications.manuscript_rejected.message",
      }),
      expect.anything()
    );
    expect(renderManuscriptRejectedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        userName: "Ada Okafor",
        bookTitle: "The Lagos Chronicle",
        rejectionReason: "Please fix the chapter headings.",
      })
    );
    expect(resendMock.emails.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "ada@example.com",
        subject: "Needs revision",
      })
    );
    expect(mockWhatsappNotificationsService.sendManuscriptRejected).toHaveBeenCalledWith(
      expect.objectContaining({
        bookTitle: "The Lagos Chronicle",
        rejectionReason: "Please fix the chapter headings.",
      })
    );
    expect(result).toEqual({
      bookId: "cm1111111111111111111111111",
      previousStatus: "FORMATTING",
      nextStatus: "REJECTED",
      displayStatus: "REJECTED",
      statusSource: "manuscript",
      bookVersion: 6,
      rejectionReason: "Please fix the chapter headings.",
      rejectedAt: "2026-03-12T14:00:00.000Z",
      audit: {
        auditId: "audit_reject",
        action: "ADMIN_BOOK_REJECTED",
        entityType: "BOOK",
        entityId: "cm1111111111111111111111111",
        recordedAt: "2026-03-12T14:00:00.000Z",
        recordedBy: "admin_1",
        note: null,
        reason: "Please fix the chapter headings.",
      },
    });
  });

  it("authorizes and finalizes manual cleaned HTML uploads", async () => {
    mockPrismaService.book.findFirst
      .mockResolvedValueOnce({
        id: "cm1111111111111111111111111",
        status: "FORMATTING",
        productionStatus: null,
        pageSize: "A5",
        fontSize: 11,
        files: [{ id: "raw_1" }],
      })
      .mockResolvedValueOnce({
        id: "cm1111111111111111111111111",
        status: "FORMATTING",
        productionStatus: null,
        pageSize: "A5",
        fontSize: 11,
        version: 4,
        files: [{ id: "raw_1" }],
      });
    mockCloudinaryService.generateSignature.mockReturnValue({
      signature: "signed-payload",
      timestamp: 123456,
      cloudName: "demo",
      apiKey: "key_123",
      folder: "bookprinta/admin/books/cm1111111111111111111111111/cleaned-html",
      resourceType: "raw",
      tags: ["bookprinta"],
    });
    txBookUpdateMany.mockResolvedValue({ count: 1 });
    txFileFindFirst.mockResolvedValue({ version: 2 });
    txFileCreate.mockResolvedValue({
      id: "html_3",
      fileType: "CLEANED_HTML",
      url: "https://res.cloudinary.com/demo/raw/upload/v123/bookprinta/admin/books/cm1111111111111111111111111/cleaned-html/manual-upload.html",
      fileName: "manual-upload.html",
      fileSize: 512,
      mimeType: "text/html",
      version: 3,
      createdBy: "admin_1",
      createdAt: new Date("2026-03-12T15:00:00.000Z"),
    });
    txBookFindUnique.mockResolvedValue({
      id: "cm1111111111111111111111111",
      status: "FORMATTING",
      productionStatus: null,
      version: 5,
    });
    txAuditLogCreate.mockResolvedValue({
      id: "audit_upload",
      createdAt: new Date("2026-03-12T15:00:00.000Z"),
    });
    mockBooksPipelineService.enqueuePageCountFromAiSuccess.mockResolvedValue({
      queued: true,
      reason: "QUEUED",
      jobRecordId: "job_page_count_1",
      queueJobId: "page-count:1",
    });
    mockPrismaService.book.findUnique.mockResolvedValue({
      id: "cm1111111111111111111111111",
      status: "FORMATTED",
      productionStatus: null,
      version: 5,
    });

    const authorizeResult = await service.requestAdminBookHtmlUpload(
      "cm1111111111111111111111111",
      {
        action: "authorize",
        fileName: "manual-upload.html",
        fileSize: 512,
        mimeType: "text/html",
      },
      "admin_1"
    );

    const finalizeResult = await service.requestAdminBookHtmlUpload(
      "cm1111111111111111111111111",
      {
        action: "finalize",
        fileName: "manual-upload.html",
        fileSize: 512,
        mimeType: "text/html",
        expectedVersion: 4,
        publicId: "manual-upload",
        secureUrl:
          "https://res.cloudinary.com/demo/raw/upload/v123/bookprinta/admin/books/cm1111111111111111111111111/cleaned-html/manual-upload.html",
      },
      "admin_1"
    );

    expect(authorizeResult).toEqual({
      action: "authorize",
      upload: expect.objectContaining({
        signature: "signed-payload",
        resourceType: "raw",
        publicId: expect.stringMatching(/^cleaned-html-admin_1-/),
      }),
    });
    expect(txFileCreate).toHaveBeenCalledWith({
      data: {
        bookId: "cm1111111111111111111111111",
        fileType: "CLEANED_HTML",
        url: "https://res.cloudinary.com/demo/raw/upload/v123/bookprinta/admin/books/cm1111111111111111111111111/cleaned-html/manual-upload.html",
        fileName: "manual-upload.html",
        fileSize: 512,
        mimeType: "text/html",
        version: 3,
        createdBy: "admin_1",
      },
      select: expect.any(Object),
    });
    expect(mockBooksPipelineService.enqueuePageCountFromAiSuccess).toHaveBeenCalledWith({
      bookId: "cm1111111111111111111111111",
      trigger: "upload",
      cleanedHtmlFileId: "html_3",
      cleanedHtmlUrl:
        "https://res.cloudinary.com/demo/raw/upload/v123/bookprinta/admin/books/cm1111111111111111111111111/cleaned-html/manual-upload.html",
      sourceAiJobRecordId: null,
    });
    expect(finalizeResult).toEqual({
      action: "finalize",
      bookId: "cm1111111111111111111111111",
      file: {
        id: "html_3",
        fileType: "CLEANED_HTML",
        url: "https://res.cloudinary.com/demo/raw/upload/v123/bookprinta/admin/books/cm1111111111111111111111111/cleaned-html/manual-upload.html",
        fileName: "manual-upload.html",
        fileSize: 512,
        mimeType: "text/html",
        version: 3,
        createdBy: "admin_1",
        createdAt: "2026-03-12T15:00:00.000Z",
      },
      status: "FORMATTED",
      productionStatus: null,
      displayStatus: "FORMATTED",
      statusSource: "manuscript",
      bookVersion: 5,
      queuedJob: {
        queue: "page-count",
        name: "count-pages",
        jobId: "page-count:1",
      },
    });
  });

  it("downloads the latest requested admin book file", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: jest.fn().mockResolvedValue(Uint8Array.from([1, 2, 3]).buffer),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    mockPrismaService.book.findFirst.mockResolvedValue({
      id: "cm1111111111111111111111111",
      finalPdfUrl: null,
      files: [
        {
          url: "https://example.com/raw.docx",
          fileName: "lagos-chronicle.docx",
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        },
      ],
    });

    const result = await service.downloadAdminBookFile("cm1111111111111111111111111", "raw");

    expect(fetchMock).toHaveBeenCalledWith("https://example.com/raw.docx");
    expect(result.fileName).toBe("lagos-chronicle.docx");
    expect(result.mimeType).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    expect(result.buffer).toEqual(Buffer.from([1, 2, 3]));
  });

  it("downloads the final clean PDF for admin verification", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: jest.fn().mockResolvedValue(Uint8Array.from([4, 5, 6]).buffer),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    mockPrismaService.book.findFirst.mockResolvedValue({
      id: "cm1111111111111111111111111",
      finalPdfUrl: "https://example.com/final.pdf",
      files: [
        {
          url: "https://example.com/final.pdf",
          fileName: "lagos-chronicle-final.pdf",
          mimeType: "application/pdf",
        },
      ],
    });

    const result = await service.downloadAdminBookFile("cm1111111111111111111111111", "final-pdf");

    expect(fetchMock).toHaveBeenCalledWith("https://example.com/final.pdf");
    expect(result.fileName).toBe("lagos-chronicle-final.pdf");
    expect(result.mimeType).toBe("application/pdf");
    expect(result.buffer).toEqual(Buffer.from([4, 5, 6]));
  });

  it("downloads a specific admin file lineage version with its recorded filename", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: jest.fn().mockResolvedValue(Uint8Array.from([7, 8, 9]).buffer),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    mockPrismaService.book.findFirst.mockResolvedValue({
      id: "cm1111111111111111111111111",
      files: [
        {
          url: "https://example.com/ministry-final.docx",
          fileName: "THE MINISTRY OF THE SPIRIT - FINAL EDIT.docx",
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        },
      ],
    });

    const result = await service.downloadAdminBookVersionFile(
      "cm1111111111111111111111111",
      "cm2222222222222222222222222"
    );

    expect(fetchMock).toHaveBeenCalledWith("https://example.com/ministry-final.docx");
    expect(result.fileName).toBe("THE MINISTRY OF THE SPIRIT - FINAL EDIT.docx");
    expect(result.mimeType).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    expect(result.buffer).toEqual(Buffer.from([7, 8, 9]));
  });
});
