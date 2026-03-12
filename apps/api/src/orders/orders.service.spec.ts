/// <reference types="jest" />
import { NotFoundException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { CloudinaryService } from "../cloudinary/cloudinary.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { OrdersService } from "./orders.service.js";

const mockPrismaService = {
  order: {
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    updateMany: jest.fn(),
  },
  auditLog: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockCloudinaryService = {
  upload: jest.fn(),
};

const mockNotificationsService = {
  createOrderStatusNotification: jest.fn(),
};

describe("OrdersService", () => {
  let service: OrdersService;
  const fetchMock = jest.fn();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: CloudinaryService, useValue: mockCloudinaryService },
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    jest.resetAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    mockPrismaService.auditLog.findMany.mockResolvedValue([]);
    mockPrismaService.auditLog.findFirst.mockResolvedValue(null);
    mockPrismaService.auditLog.create.mockResolvedValue({
      id: "audit_1",
    });
    mockPrismaService.$transaction.mockReset();
    mockNotificationsService.createOrderStatusNotification.mockReset();
    delete process.env.GOTENBERG_URL;
    delete process.env.GOTENBERG_BACKUP_URL;
    delete process.env.GOTENBERG_USERNAME;
    delete process.env.GOTENBERG_PASSWORD;
  });

  describe("findUserOrders", () => {
    it("returns paginated orders list for the authenticated user", async () => {
      mockPrismaService.order.findMany.mockResolvedValue([
        {
          id: "cm1111111111111111111111111",
          orderNumber: "BP-2026-0001",
          orderType: "STANDARD",
          status: "PAID",
          createdAt: new Date("2026-03-01T08:00:00.000Z"),
          totalAmount: { toNumber: () => 125000 } as unknown,
          currency: "NGN",
          package: {
            id: "cm2222222222222222222222222",
            name: "Legacy",
            slug: "legacy",
          },
          book: {
            id: "cm3333333333333333333333333",
            status: "PRINTING",
          },
        },
      ]);
      mockPrismaService.order.count.mockResolvedValue(1);

      const result = await service.findUserOrders("user_1", {
        page: 1,
        limit: 10,
      });

      expect(result).toEqual({
        items: [
          {
            id: "cm1111111111111111111111111",
            orderNumber: "BP-2026-0001",
            orderType: "STANDARD",
            status: "PAID",
            createdAt: "2026-03-01T08:00:00.000Z",
            totalAmount: 125000,
            currency: "NGN",
            package: {
              id: "cm2222222222222222222222222",
              name: "Legacy",
              slug: "legacy",
            },
            book: {
              id: "cm3333333333333333333333333",
              status: "PRINTING",
            },
            trackingUrl: "/dashboard/orders/cm1111111111111111111111111",
          },
        ],
        pagination: {
          page: 1,
          pageSize: 10,
          totalItems: 1,
          totalPages: 1,
          hasPreviousPage: false,
          hasNextPage: false,
        },
      });
    });
  });

  describe("findUserOrderById", () => {
    it("throws NotFoundException when order does not belong to user", async () => {
      mockPrismaService.order.findFirst.mockResolvedValue(null);

      await expect(service.findUserOrderById("user_1", "cm_missing")).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe("admin order management", () => {
    it("applies filters, sorting, and cursor pagination for admin order lists", async () => {
      mockPrismaService.order.findMany.mockResolvedValue([
        {
          id: "cmadminorder1",
          orderNumber: "BP-2026-0001",
          status: "FORMATTING",
          createdAt: new Date("2026-03-10T09:30:00.000Z"),
          totalAmount: { toNumber: () => 100000 } as unknown,
          currency: "NGN",
          package: {
            id: "pkg_1",
            name: "Signature Memoir",
            slug: "signature-memoir",
          },
          user: {
            id: "user_1",
            email: "ada@example.com",
            firstName: "Ada",
            lastName: "Okafor",
            phoneNumber: "+2348012345678",
            preferredLanguage: "en",
          },
          book: {
            status: "FORMATTING",
            productionStatus: "FORMATTING",
          },
        },
        {
          id: "cmadminorder2",
          orderNumber: "BP-2026-0002",
          status: "FORMATTING",
          createdAt: new Date("2026-03-11T09:30:00.000Z"),
          totalAmount: { toNumber: () => 150000 } as unknown,
          currency: "NGN",
          package: {
            id: "pkg_1",
            name: "Signature Memoir",
            slug: "signature-memoir",
          },
          user: {
            id: "user_2",
            email: "grace@example.com",
            firstName: "Grace",
            lastName: "Bello",
            phoneNumber: "+2348098765432",
            preferredLanguage: "en",
          },
          book: null,
        },
      ]);
      mockPrismaService.order.count.mockResolvedValue(2);

      const result = await service.findAdminOrders({
        cursor: "cm_cursor_1",
        limit: 1,
        status: "FORMATTING",
        packageId: "pkg_1",
        dateFrom: "2026-03-01",
        dateTo: "2026-03-31",
        q: "Ada",
        sortBy: "customerName",
        sortDirection: "asc",
      });

      expect(mockPrismaService.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 2,
          cursor: { id: "cm_cursor_1" },
          skip: 1,
          orderBy: [{ user: { firstName: "asc" } }, { user: { lastName: "asc" } }, { id: "asc" }],
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              { packageId: "pkg_1" },
              {
                createdAt: {
                  gte: new Date("2026-03-01T00:00:00.000Z"),
                  lte: new Date("2026-03-31T23:59:59.999Z"),
                },
              },
            ]),
          }),
        })
      );
      expect(mockPrismaService.order.findMany.mock.calls[0]?.[0]?.where).toEqual(
        expect.objectContaining({
          AND: expect.arrayContaining([
            {
              OR: expect.arrayContaining([
                { status: "FORMATTING" },
                { book: { is: { productionStatus: "FORMATTING" } } },
                { book: { is: { status: "FORMATTING" } } },
              ]),
            },
            {
              OR: expect.arrayContaining([
                { orderNumber: { contains: "Ada", mode: "insensitive" } },
                { user: { is: { firstName: { contains: "Ada", mode: "insensitive" } } } },
                { user: { is: { lastName: { contains: "Ada", mode: "insensitive" } } } },
                { user: { is: { email: { contains: "Ada", mode: "insensitive" } } } },
                { package: { is: { name: { contains: "Ada", mode: "insensitive" } } } },
              ]),
            },
          ]),
        })
      );
      expect(result).toEqual({
        items: [
          {
            id: "cmadminorder1",
            orderNumber: "BP-2026-0001",
            customer: {
              id: "user_1",
              fullName: "Ada Okafor",
              email: "ada@example.com",
              phoneNumber: "+2348012345678",
              preferredLanguage: "en",
            },
            package: {
              id: "pkg_1",
              name: "Signature Memoir",
              slug: "signature-memoir",
            },
            orderStatus: "FORMATTING",
            bookStatus: "FORMATTING",
            displayStatus: "FORMATTING",
            statusSource: "book",
            createdAt: "2026-03-10T09:30:00.000Z",
            totalAmount: 100000,
            currency: "NGN",
            detailUrl: "/admin/orders/cmadminorder1",
          },
        ],
        nextCursor: "cmadminorder1",
        hasMore: true,
        totalItems: 2,
        limit: 1,
        sortBy: "customerName",
        sortDirection: "asc",
        sortableFields: [
          "orderNumber",
          "customerName",
          "customerEmail",
          "packageName",
          "displayStatus",
          "createdAt",
          "totalAmount",
        ],
      });
    });

    it("creates an audit entry when an admin advances order status", async () => {
      mockPrismaService.order.findUnique.mockResolvedValue({
        id: "cmadminorder1",
        userId: "user_1",
        orderNumber: "BP-2026-0001",
        status: "FORMATTING",
        version: 3,
        book: null,
      });

      const auditLogCreateMock = jest
        .fn()
        .mockResolvedValueOnce({
          id: "audit_status_1",
          createdAt: new Date("2026-03-12T10:00:00.000Z"),
          action: "ADMIN_ORDER_STATUS_UPDATED",
          entityType: "ORDER",
          entityId: "cmadminorder1",
          details: {
            note: "QA sign-off completed.",
            reason: "Preview approved internally.",
          },
        })
        .mockResolvedValueOnce({
          id: "audit_tracking_1",
        });
      const tx = {
        order: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUnique: jest.fn().mockResolvedValue({
            id: "cmadminorder1",
            userId: "user_1",
            orderNumber: "BP-2026-0001",
            status: "PREVIEW_READY",
            version: 4,
            updatedAt: new Date("2026-03-12T10:00:00.000Z"),
            book: null,
          }),
        },
        auditLog: {
          create: auditLogCreateMock,
        },
      };
      mockPrismaService.$transaction.mockImplementation(
        async (callback: (trx: typeof tx) => unknown) => callback(tx)
      );

      const result = await service.updateAdminOrderStatus(
        "cmadminorder1",
        {
          nextStatus: "PREVIEW_READY",
          expectedVersion: 3,
          reason: "Preview approved internally.",
          note: "QA sign-off completed.",
        },
        "admin_1"
      );

      expect(tx.order.updateMany).toHaveBeenCalledWith({
        where: {
          id: "cmadminorder1",
          version: 3,
        },
        data: {
          status: "PREVIEW_READY",
          version: {
            increment: 1,
          },
        },
      });
      expect(auditLogCreateMock).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          data: expect.objectContaining({
            userId: "admin_1",
            action: "ADMIN_ORDER_STATUS_UPDATED",
            entityType: "ORDER",
            entityId: "cmadminorder1",
            details: expect.objectContaining({
              previousStatus: "FORMATTING",
              nextStatus: "PREVIEW_READY",
              note: "QA sign-off completed.",
              reason: "Preview approved internally.",
              expectedVersion: 3,
              orderVersion: 4,
            }),
          }),
        })
      );
      expect(mockNotificationsService.createOrderStatusNotification).toHaveBeenCalledWith(
        {
          userId: "user_1",
          orderId: "cmadminorder1",
          orderNumber: "BP-2026-0001",
          status: "PREVIEW_READY",
          source: "order",
        },
        tx
      );
      expect(result).toEqual({
        orderId: "cmadminorder1",
        previousStatus: "FORMATTING",
        nextStatus: "PREVIEW_READY",
        displayStatus: "PREVIEW_READY",
        statusSource: "order",
        orderVersion: 4,
        updatedAt: "2026-03-12T10:00:00.000Z",
        audit: {
          auditId: "audit_status_1",
          action: "ADMIN_ORDER_STATUS_UPDATED",
          entityType: "ORDER",
          entityId: "cmadminorder1",
          recordedAt: "2026-03-12T10:00:00.000Z",
          recordedBy: "admin_1",
          note: "QA sign-off completed.",
          reason: "Preview approved internally.",
        },
      });
    });
  });

  describe("getUserOrderTracking", () => {
    it("uses book lifecycle timeline when order is not in issue state", async () => {
      mockPrismaService.order.findFirst.mockResolvedValue({
        id: "cm1111111111111111111111111",
        orderNumber: "BP-2026-0001",
        status: "IN_PRODUCTION",
        createdAt: new Date("2026-03-01T08:00:00.000Z"),
        updatedAt: new Date("2026-03-03T10:00:00.000Z"),
        trackingNumber: "TRK-001",
        shippingProvider: "DHL",
        book: {
          id: "cm3333333333333333333333333",
          status: "DELIVERED",
          productionStatus: "DELIVERED",
          rejectionReason: null,
          createdAt: new Date("2026-03-01T09:00:00.000Z"),
          updatedAt: new Date("2026-03-03T10:00:00.000Z"),
          productionStatusUpdatedAt: new Date("2026-03-03T10:00:00.000Z"),
        },
      });

      const result = await service.getUserOrderTracking("user_1", "cm1111111111111111111111111");

      expect(result.bookId).toBe("cm3333333333333333333333333");
      expect(result.currentBookStatus).toBe("DELIVERED");
      expect(result.rejectionReason).toBeNull();
      expect(result.timeline.some((entry) => entry.status === "DELIVERED")).toBe(true);
      expect(result.timeline.find((entry) => entry.status === "DELIVERED")?.source).toBe("book");
      expect(result.timeline.find((entry) => entry.status === "DELIVERED")?.state).toBe("current");
    });

    it("prioritizes order timeline when order is in issue state", async () => {
      mockPrismaService.order.findFirst.mockResolvedValue({
        id: "cm1111111111111111111111111",
        orderNumber: "BP-2026-0002",
        status: "ACTION_REQUIRED",
        createdAt: new Date("2026-03-01T08:00:00.000Z"),
        updatedAt: new Date("2026-03-04T10:00:00.000Z"),
        trackingNumber: null,
        shippingProvider: null,
        book: {
          id: "cm3333333333333333333333333",
          status: "DELIVERED",
          productionStatus: "DELIVERED",
          rejectionReason: null,
          createdAt: new Date("2026-03-01T09:00:00.000Z"),
          updatedAt: new Date("2026-03-03T10:00:00.000Z"),
          productionStatusUpdatedAt: new Date("2026-03-03T10:00:00.000Z"),
        },
      });

      const result = await service.getUserOrderTracking("user_1", "cm1111111111111111111111111");
      const issueEntry = result.timeline.find((entry) => entry.status === "ACTION_REQUIRED");

      expect(issueEntry?.source).toBe("order");
      expect(issueEntry?.state).toBe("current");
    });
  });

  describe("getUserOrderInvoiceArchive", () => {
    it("generates and archives invoice metadata when archive is missing", async () => {
      process.env.GOTENBERG_URL = "http://gotenberg.local";

      mockPrismaService.order.findFirst.mockResolvedValue({
        id: "cm1111111111111111111111111",
        orderNumber: "BP-2026-0001",
        orderType: "STANDARD",
        status: "PAID",
        createdAt: new Date("2026-03-01T08:00:00.000Z"),
        updatedAt: new Date("2026-03-02T09:00:00.000Z"),
        copies: 100,
        bookSize: "A5",
        paperColor: "white",
        lamination: "gloss",
        initialAmount: { toNumber: () => 120000 } as unknown,
        extraAmount: { toNumber: () => 5000 } as unknown,
        discountAmount: { toNumber: () => 0 } as unknown,
        totalAmount: { toNumber: () => 125000 } as unknown,
        refundAmount: { toNumber: () => 0 } as unknown,
        currency: "NGN",
        trackingNumber: null,
        shippingProvider: null,
        package: {
          id: "pkg_1",
          name: "Legacy",
          slug: "legacy",
        },
        book: null,
        payments: [
          {
            id: "pay_1",
            provider: "PAYSTACK",
            status: "SUCCESS",
            type: "INITIAL",
            amount: { toNumber: () => 125000 } as unknown,
            currency: "NGN",
            providerRef: "PSK_REF_1",
            createdAt: new Date("2026-03-01T08:10:00.000Z"),
          },
        ],
        addons: [
          {
            id: "addon_row_1",
            addonId: "addon_1",
            priceSnap: { toNumber: () => 5000 } as unknown,
            wordCount: null,
            addon: {
              name: "Cover Design",
            },
          },
        ],
        user: {
          id: "user_1",
          email: "author@example.com",
          firstName: "Ada",
          lastName: "Author",
        },
      });

      fetchMock.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: jest.fn().mockResolvedValue(new Uint8Array([37, 80, 68, 70]).buffer),
      } as unknown as Response);

      mockCloudinaryService.upload.mockResolvedValueOnce({
        secure_url: "https://cdn.example.com/bookprinta/invoices/invoice-bp-2026-0001.pdf",
      });

      const result = await service.getUserOrderInvoiceArchive(
        "user_1",
        "cm1111111111111111111111111"
      );

      expect(result.invoiceNumber).toContain("INV-20260301-BP20260001");
      expect(result.archivedUrl).toContain("invoice-bp-2026-0001.pdf");
      expect(result.renderEngine).toBe("gotenberg");
      expect(mockCloudinaryService.upload).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.auditLog.create).toHaveBeenCalledTimes(1);
    });

    it("falls back to internal PDF renderer when Gotenberg is unavailable", async () => {
      process.env.GOTENBERG_URL = "";

      mockPrismaService.order.findFirst.mockResolvedValue({
        id: "cm1111111111111111111111111",
        orderNumber: "BP-2026-0009",
        orderType: "STANDARD",
        status: "PAID",
        createdAt: new Date("2026-03-01T08:00:00.000Z"),
        updatedAt: new Date("2026-03-02T09:00:00.000Z"),
        copies: 100,
        bookSize: "A5",
        paperColor: "white",
        lamination: "gloss",
        initialAmount: { toNumber: () => 120000 } as unknown,
        extraAmount: { toNumber: () => 5000 } as unknown,
        discountAmount: { toNumber: () => 0 } as unknown,
        totalAmount: { toNumber: () => 125000 } as unknown,
        refundAmount: { toNumber: () => 0 } as unknown,
        currency: "NGN",
        trackingNumber: null,
        shippingProvider: null,
        package: {
          id: "pkg_1",
          name: "Legacy",
          slug: "legacy",
        },
        book: null,
        payments: [
          {
            id: "pay_1",
            provider: "PAYSTACK",
            status: "SUCCESS",
            type: "INITIAL",
            amount: { toNumber: () => 125000 } as unknown,
            currency: "NGN",
            providerRef: "PSK_REF_1",
            createdAt: new Date("2026-03-01T08:10:00.000Z"),
          },
        ],
        addons: [],
        user: {
          id: "user_1",
          email: "author@example.com",
          firstName: "Ada",
          lastName: "Author",
        },
      });

      mockCloudinaryService.upload.mockResolvedValueOnce({
        secure_url: "https://cdn.example.com/bookprinta/invoices/invoice-bp-2026-0009.pdf",
      });

      const result = await service.getUserOrderInvoiceArchive(
        "user_1",
        "cm1111111111111111111111111"
      );

      expect(fetchMock).not.toHaveBeenCalled();
      expect(mockCloudinaryService.upload).toHaveBeenCalledTimes(1);
      const uploadedBuffer = mockCloudinaryService.upload.mock.calls[0]?.[0] as Buffer;
      expect(Buffer.isBuffer(uploadedBuffer)).toBe(true);
      expect(uploadedBuffer.length).toBeGreaterThan(200);
      expect(result.renderEngine).toBe("fallback");
    });

    it("retries invoice conversion without auth when Gotenberg returns 401", async () => {
      process.env.GOTENBERG_URL = "http://gotenberg.local";
      process.env.GOTENBERG_USERNAME = "local-user";
      process.env.GOTENBERG_PASSWORD = "local-pass";

      mockPrismaService.order.findFirst.mockResolvedValue({
        id: "cm1111111111111111111111111",
        orderNumber: "BP-2026-0011",
        orderType: "STANDARD",
        status: "PAID",
        createdAt: new Date("2026-03-01T08:00:00.000Z"),
        updatedAt: new Date("2026-03-02T09:00:00.000Z"),
        copies: 100,
        bookSize: "A5",
        paperColor: "white",
        lamination: "gloss",
        initialAmount: { toNumber: () => 120000 } as unknown,
        extraAmount: { toNumber: () => 0 } as unknown,
        discountAmount: { toNumber: () => 0 } as unknown,
        totalAmount: { toNumber: () => 120000 } as unknown,
        refundAmount: { toNumber: () => 0 } as unknown,
        currency: "NGN",
        trackingNumber: null,
        shippingProvider: null,
        package: {
          id: "pkg_1",
          name: "Legacy",
          slug: "legacy",
        },
        book: null,
        payments: [
          {
            id: "pay_11",
            provider: "PAYSTACK",
            status: "SUCCESS",
            type: "INITIAL",
            amount: { toNumber: () => 120000 } as unknown,
            currency: "NGN",
            providerRef: "PSK_REF_11",
            createdAt: new Date("2026-03-01T08:10:00.000Z"),
          },
        ],
        addons: [],
        user: {
          id: "user_1",
          email: "author@example.com",
          firstName: "Ada",
          lastName: "Author",
        },
      });

      fetchMock
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: jest.fn().mockResolvedValue(new Uint8Array([37, 80, 68, 70]).buffer),
        } as unknown as Response);

      mockCloudinaryService.upload.mockResolvedValueOnce({
        secure_url: "https://cdn.example.com/bookprinta/invoices/invoice-bp-2026-0011.pdf",
      });

      const result = await service.getUserOrderInvoiceArchive(
        "user_1",
        "cm1111111111111111111111111"
      );

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
        headers: expect.objectContaining({ Authorization: expect.stringContaining("Basic ") }),
      });
      expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
        headers: {},
      });
      expect(result.renderEngine).toBe("gotenberg");
    });

    it("retries primary Gotenberg 3 times then switches to backup URL", async () => {
      process.env.GOTENBERG_URL = "http://gotenberg-primary.local";
      process.env.GOTENBERG_BACKUP_URL = "http://gotenberg-backup.local";

      mockPrismaService.order.findFirst.mockResolvedValue({
        id: "cm1111111111111111111111111",
        orderNumber: "BP-2026-0012",
        orderType: "STANDARD",
        status: "PAID",
        createdAt: new Date("2026-03-01T08:00:00.000Z"),
        updatedAt: new Date("2026-03-02T09:00:00.000Z"),
        copies: 100,
        bookSize: "A5",
        paperColor: "white",
        lamination: "gloss",
        initialAmount: { toNumber: () => 120000 } as unknown,
        extraAmount: { toNumber: () => 0 } as unknown,
        discountAmount: { toNumber: () => 0 } as unknown,
        totalAmount: { toNumber: () => 120000 } as unknown,
        refundAmount: { toNumber: () => 0 } as unknown,
        currency: "NGN",
        trackingNumber: null,
        shippingProvider: null,
        package: {
          id: "pkg_1",
          name: "Legacy",
          slug: "legacy",
        },
        book: null,
        payments: [
          {
            id: "pay_12",
            provider: "PAYSTACK",
            status: "SUCCESS",
            type: "INITIAL",
            amount: { toNumber: () => 120000 } as unknown,
            currency: "NGN",
            providerRef: "PSK_REF_12",
            createdAt: new Date("2026-03-01T08:10:00.000Z"),
          },
        ],
        addons: [],
        user: {
          id: "user_1",
          email: "author@example.com",
          firstName: "Ada",
          lastName: "Author",
        },
      });

      fetchMock
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: jest.fn().mockResolvedValue("primary-failure-1"),
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: jest.fn().mockResolvedValue("primary-failure-2"),
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: jest.fn().mockResolvedValue("primary-failure-3"),
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: jest.fn().mockResolvedValue(new Uint8Array([37, 80, 68, 70]).buffer),
        } as unknown as Response);

      mockCloudinaryService.upload.mockResolvedValueOnce({
        secure_url: "https://cdn.example.com/bookprinta/invoices/invoice-bp-2026-0012.pdf",
      });

      const result = await service.getUserOrderInvoiceArchive(
        "user_1",
        "cm1111111111111111111111111"
      );

      expect(fetchMock).toHaveBeenCalledTimes(4);
      expect(String(fetchMock.mock.calls[0]?.[0])).toContain("gotenberg-primary.local");
      expect(String(fetchMock.mock.calls[1]?.[0])).toContain("gotenberg-primary.local");
      expect(String(fetchMock.mock.calls[2]?.[0])).toContain("gotenberg-primary.local");
      expect(String(fetchMock.mock.calls[3]?.[0])).toContain("gotenberg-backup.local");
      expect(result.renderEngine).toBe("gotenberg");
    });

    it("falls back after 3 failed attempts when only primary Gotenberg is configured", async () => {
      process.env.GOTENBERG_URL = "http://gotenberg-primary.local";

      mockPrismaService.order.findFirst.mockResolvedValue({
        id: "cm1111111111111111111111111",
        orderNumber: "BP-2026-0013",
        orderType: "STANDARD",
        status: "PAID",
        createdAt: new Date("2026-03-01T08:00:00.000Z"),
        updatedAt: new Date("2026-03-02T09:00:00.000Z"),
        copies: 100,
        bookSize: "A5",
        paperColor: "white",
        lamination: "gloss",
        initialAmount: { toNumber: () => 120000 } as unknown,
        extraAmount: { toNumber: () => 0 } as unknown,
        discountAmount: { toNumber: () => 0 } as unknown,
        totalAmount: { toNumber: () => 120000 } as unknown,
        refundAmount: { toNumber: () => 0 } as unknown,
        currency: "NGN",
        trackingNumber: null,
        shippingProvider: null,
        package: {
          id: "pkg_1",
          name: "Legacy",
          slug: "legacy",
        },
        book: null,
        payments: [
          {
            id: "pay_13",
            provider: "PAYSTACK",
            status: "SUCCESS",
            type: "INITIAL",
            amount: { toNumber: () => 120000 } as unknown,
            currency: "NGN",
            providerRef: "PSK_REF_13",
            createdAt: new Date("2026-03-01T08:10:00.000Z"),
          },
        ],
        addons: [],
        user: {
          id: "user_1",
          email: "author@example.com",
          firstName: "Ada",
          lastName: "Author",
        },
      });

      fetchMock
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          text: jest.fn().mockResolvedValue("primary-failure-1"),
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          text: jest.fn().mockResolvedValue("primary-failure-2"),
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          text: jest.fn().mockResolvedValue("primary-failure-3"),
        } as unknown as Response);

      mockCloudinaryService.upload.mockResolvedValueOnce({
        secure_url: "https://cdn.example.com/bookprinta/invoices/invoice-bp-2026-0013.pdf",
      });

      const result = await service.getUserOrderInvoiceArchive(
        "user_1",
        "cm1111111111111111111111111"
      );

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(mockCloudinaryService.upload).toHaveBeenCalledTimes(1);
      expect(result.renderEngine).toBe("fallback");
    });

    it("refreshes fallback archives once Gotenberg conversion succeeds", async () => {
      process.env.GOTENBERG_URL = "http://gotenberg.local";

      mockPrismaService.auditLog.findFirst.mockResolvedValue({
        id: "audit_prev",
        createdAt: new Date("2026-03-05T08:00:00.000Z"),
        details: {
          orderId: "cm1111111111111111111111111",
          orderNumber: "BP-2026-0010",
          invoiceNumber: "INV-20260301-BP20260010",
          brandingVersion: 2,
          renderEngine: "fallback",
          fileName: "bookprinta-invoice-INV-20260301-BP20260010.pdf",
          archivedUrl: "https://cdn.example.com/bookprinta/invoices/invoice-bp-2026-0010.pdf",
          generatedAt: "2026-03-05T08:00:00.000Z",
          issuedAt: "2026-03-05T08:00:00.000Z",
          paymentReference: null,
          legal: {
            legalName: "BookPrinta Publishing Ltd",
            address: "Lagos, Nigeria",
            supportEmail: "support@bookprinta.com",
            supportPhone: "+2348103208297",
            taxId: null,
          },
          financialBreakdown: {
            packageAmount: 120000,
            addonsSubtotal: 0,
            discountAmount: 0,
            taxAmount: 0,
            shippingFee: 0,
            grandTotal: 120000,
            currency: "NGN",
          },
          paymentProof: {
            provider: null,
            status: null,
            reference: null,
            paidAt: null,
            history: [],
          },
        },
      });

      mockPrismaService.order.findFirst.mockResolvedValue({
        id: "cm1111111111111111111111111",
        orderNumber: "BP-2026-0010",
        orderType: "STANDARD",
        status: "PAID",
        createdAt: new Date("2026-03-01T08:00:00.000Z"),
        updatedAt: new Date("2026-03-02T09:00:00.000Z"),
        copies: 100,
        bookSize: "A5",
        paperColor: "white",
        lamination: "gloss",
        initialAmount: { toNumber: () => 120000 } as unknown,
        extraAmount: { toNumber: () => 0 } as unknown,
        discountAmount: { toNumber: () => 0 } as unknown,
        totalAmount: { toNumber: () => 120000 } as unknown,
        refundAmount: { toNumber: () => 0 } as unknown,
        currency: "NGN",
        trackingNumber: null,
        shippingProvider: null,
        package: {
          id: "pkg_1",
          name: "Legacy",
          slug: "legacy",
        },
        book: null,
        payments: [
          {
            id: "pay_10",
            provider: "PAYSTACK",
            status: "SUCCESS",
            type: "INITIAL",
            amount: { toNumber: () => 120000 } as unknown,
            currency: "NGN",
            providerRef: "PSK_REF_10",
            createdAt: new Date("2026-03-01T08:10:00.000Z"),
          },
        ],
        addons: [],
        user: {
          id: "user_1",
          email: "author@example.com",
          firstName: "Ada",
          lastName: "Author",
        },
      });

      fetchMock.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: jest.fn().mockResolvedValue(new Uint8Array([37, 80, 68, 70]).buffer),
      } as unknown as Response);

      mockCloudinaryService.upload.mockResolvedValueOnce({
        secure_url:
          "https://cdn.example.com/bookprinta/invoices/invoice-bp-2026-0010-refreshed.pdf",
      });

      const result = await service.getUserOrderInvoiceArchive(
        "user_1",
        "cm1111111111111111111111111"
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(mockCloudinaryService.upload).toHaveBeenCalledTimes(1);
      expect(result.renderEngine).toBe("gotenberg");
      expect(result.archivedUrl).toContain("invoice-bp-2026-0010-refreshed.pdf");
    });
  });
});
