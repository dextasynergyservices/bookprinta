/// <reference types="jest" />
import { NotFoundException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { CloudinaryService } from "../cloudinary/cloudinary.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { OrdersService } from "./orders.service.js";

const mockPrismaService = {
  order: {
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
  },
  auditLog: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
  },
};

const mockCloudinaryService = {
  upload: jest.fn(),
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
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    mockPrismaService.auditLog.findMany.mockResolvedValue([]);
    mockPrismaService.auditLog.findFirst.mockResolvedValue(null);
    mockPrismaService.auditLog.create.mockResolvedValue({
      id: "audit_1",
    });
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
          rejectionReason: null,
          createdAt: new Date("2026-03-01T09:00:00.000Z"),
          updatedAt: new Date("2026-03-03T10:00:00.000Z"),
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
          rejectionReason: null,
          createdAt: new Date("2026-03-01T09:00:00.000Z"),
          updatedAt: new Date("2026-03-03T10:00:00.000Z"),
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

      await service.getUserOrderInvoiceArchive("user_1", "cm1111111111111111111111111");

      expect(fetchMock).not.toHaveBeenCalled();
      expect(mockCloudinaryService.upload).toHaveBeenCalledTimes(1);
      const uploadedBuffer = mockCloudinaryService.upload.mock.calls[0]?.[0] as Buffer;
      expect(Buffer.isBuffer(uploadedBuffer)).toBe(true);
      expect(uploadedBuffer.length).toBeGreaterThan(200);
    });
  });
});
