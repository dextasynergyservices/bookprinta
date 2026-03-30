/// <reference types="jest" />
import {
  BookStatus,
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
  PaymentType,
} from "../generated/prisma/enums.js";
import { PaymentsService } from "./payments.service.js";

function createService() {
  process.env.FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

  const prisma = {
    paymentGateway: {
      findUnique: jest.fn(),
    },
    payment: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    order: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    orderAddon: {
      findMany: jest.fn(),
    },
  };

  const notificationsService = {
    createOrderStatusNotification: jest.fn(),
    notifyAdminsBankTransferReceived: jest.fn(),
    createSystemNotification: jest.fn(),
  };

  const service = new PaymentsService(
    prisma as never,
    { isAvailable: true } as never,
    { isAvailable: true } as never,
    { isAvailable: true } as never,
    {} as never,
    {} as never,
    { sendRegistrationLink: jest.fn() } as never,
    notificationsService as never,
    { assertBillingGateAccess: jest.fn() } as never
  );

  return {
    service,
    prisma,
  };
}

function makePaymentRow(params: {
  id: string;
  createdAt: string;
  amount: number;
  provider?: PaymentProvider;
  status?: PaymentStatus;
  type?: PaymentType;
  payerName?: string | null;
  payerEmail?: string | null;
  payerPhone?: string | null;
  providerRef?: string | null;
  receiptUrl?: string | null;
  adminNote?: string | null;
  orderNumber?: string | null;
  orderStatus?: OrderStatus;
  orderVersion?: number;
  bookStatus?: BookStatus | null;
  bookProductionStatus?: BookStatus | null;
  bookVersion?: number | null;
  userFirstName?: string;
  userLastName?: string | null;
  userEmail?: string;
  userPreferredLanguage?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const orderId = params.orderNumber ? `order_${params.id}` : null;
  const userId = `user_${params.id}`;
  const createdAt = new Date(params.createdAt);

  const user = {
    id: userId,
    email: params.userEmail ?? params.payerEmail ?? `${params.id}@example.com`,
    firstName: params.userFirstName ?? "Ada",
    lastName: params.userLastName ?? "Okafor",
    phoneNumber: params.payerPhone ?? "+2348012345678",
    preferredLanguage: params.userPreferredLanguage ?? "en",
  };

  return {
    id: params.id,
    orderId,
    userId,
    provider: params.provider ?? PaymentProvider.PAYSTACK,
    type: params.type ?? PaymentType.INITIAL,
    amount: params.amount,
    currency: "NGN",
    status: params.status ?? PaymentStatus.SUCCESS,
    providerRef: params.providerRef ?? `REF-${params.id}`,
    processedAt: null,
    receiptUrl: params.receiptUrl ?? null,
    payerName: params.payerName ?? `${user.firstName} ${user.lastName ?? ""}`.trim(),
    payerEmail: params.payerEmail ?? user.email,
    payerPhone: params.payerPhone ?? "+2348012345678",
    adminNote: params.adminNote ?? null,
    approvedAt: null,
    approvedBy: null,
    metadata: params.metadata ?? {
      locale: "en",
      fullName: params.payerName ?? `${user.firstName} ${user.lastName ?? ""}`.trim(),
      phone: params.payerPhone ?? "+2348012345678",
    },
    createdAt,
    updatedAt: new Date(createdAt.getTime() + 30_000),
    order: orderId
      ? {
          id: orderId,
          orderNumber: params.orderNumber,
          status: params.orderStatus ?? OrderStatus.PROCESSING,
          version: params.orderVersion ?? 2,
          refundedAt: null,
          totalAmount: params.amount,
          currency: "NGN",
          userId,
          user,
          book: params.bookStatus
            ? {
                id: `book_${params.id}`,
                status: params.bookStatus,
                productionStatus: params.bookProductionStatus ?? null,
                version: params.bookVersion ?? 1,
              }
            : null,
        }
      : null,
    user,
  };
}

describe("PaymentsService admin payment listings", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("sorts and paginates the admin payments list with refundability metadata", async () => {
    const { service, prisma } = createService();

    prisma.payment.findMany.mockResolvedValue([
      makePaymentRow({
        id: "payment_3",
        createdAt: "2026-03-13T12:20:00.000Z",
        amount: 90000,
        payerName: "Zed Writer",
        orderNumber: "BP-2026-0003",
      }),
      makePaymentRow({
        id: "payment_1",
        createdAt: "2026-03-13T12:00:00.000Z",
        amount: 90000,
        payerName: "Ada Author",
        orderNumber: "BP-2026-0001",
        provider: PaymentProvider.PAYSTACK,
        orderStatus: OrderStatus.PROCESSING,
        orderVersion: 4,
      }),
      makePaymentRow({
        id: "payment_2",
        createdAt: "2026-03-13T12:10:00.000Z",
        amount: 90000,
        payerName: "Ada Author",
        orderNumber: "BP-2026-0002",
        provider: PaymentProvider.STRIPE,
        orderStatus: OrderStatus.PROCESSING,
        orderVersion: 5,
      }),
    ]);

    const firstPage = await service.listAdminPayments({
      limit: 2,
      sortBy: "customerName",
      sortDirection: "asc",
    });

    expect(firstPage.items.map((item) => item.id)).toEqual(["payment_1", "payment_2"]);
    expect(firstPage.nextCursor).toBe("payment_2");
    expect(firstPage.totalItems).toBe(3);
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.items[0]?.refundability).toEqual(
      expect.objectContaining({
        isRefundable: true,
        processingMode: "gateway",
        reason: null,
        orderVersion: 4,
      })
    );

    const secondPage = await service.listAdminPayments({
      limit: 2,
      sortBy: "customerName",
      sortDirection: "asc",
      cursor: firstPage.nextCursor ?? undefined,
    });

    expect(secondPage.items.map((item) => item.id)).toEqual(["payment_3"]);
    expect(secondPage.nextCursor).toBeNull();
    expect(secondPage.hasMore).toBe(false);
  });

  it("builds provider, status, date-range, and search filters for the admin payments list query", async () => {
    const { service, prisma } = createService();
    prisma.payment.findMany.mockResolvedValue([]);

    await service.listAdminPayments({
      limit: 20,
      status: PaymentStatus.SUCCESS,
      provider: PaymentProvider.BANK_TRANSFER,
      dateFrom: "2026-03-01",
      dateTo: "2026-03-31",
      q: "ada",
      sortBy: "createdAt",
      sortDirection: "desc",
    });

    expect(prisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: PaymentStatus.SUCCESS,
          provider: PaymentProvider.BANK_TRANSFER,
          createdAt: {
            gte: new Date("2026-03-01T00:00:00.000Z"),
            lt: new Date("2026-04-01T00:00:00.000Z"),
          },
          OR: expect.arrayContaining([
            { providerRef: { contains: "ada", mode: "insensitive" } },
            { payerName: { contains: "ada", mode: "insensitive" } },
          ]),
        }),
      })
    );
  });

  it("returns pending bank transfers oldest first with SLA snapshot states", async () => {
    const { service, prisma } = createService();
    jest.spyOn(Date, "now").mockReturnValue(new Date("2026-03-13T13:00:00.000Z").getTime());

    prisma.payment.findMany.mockResolvedValue([
      makePaymentRow({
        id: "payment_green",
        createdAt: "2026-03-13T12:50:00.000Z",
        amount: 50000,
        provider: PaymentProvider.BANK_TRANSFER,
        status: PaymentStatus.AWAITING_APPROVAL,
        orderNumber: "BP-2026-0010",
        receiptUrl: "https://example.com/receipt-green.jpg",
      }),
      makePaymentRow({
        id: "payment_red",
        createdAt: "2026-03-13T12:20:00.000Z",
        amount: 50000,
        provider: PaymentProvider.BANK_TRANSFER,
        status: PaymentStatus.AWAITING_APPROVAL,
        orderNumber: "BP-2026-0011",
        receiptUrl: "https://example.com/receipt-red.jpg",
      }),
      makePaymentRow({
        id: "payment_yellow",
        createdAt: "2026-03-13T12:40:00.000Z",
        amount: 50000,
        provider: PaymentProvider.BANK_TRANSFER,
        status: PaymentStatus.AWAITING_APPROVAL,
        orderNumber: "BP-2026-0012",
        receiptUrl: "https://example.com/receipt-yellow.jpg",
      }),
    ]);

    const result = await service.listAdminPendingBankTransfers();

    expect(prisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          provider: PaymentProvider.BANK_TRANSFER,
          status: PaymentStatus.AWAITING_APPROVAL,
        },
      })
    );
    expect(result.items.map((item) => item.id)).toEqual([
      "payment_red",
      "payment_yellow",
      "payment_green",
    ]);
    expect(result.items.map((item) => item.slaSnapshot.state)).toEqual(["red", "yellow", "green"]);
    expect(result.totalItems).toBe(3);
    expect(result.refreshedAt).toEqual(expect.any(String));
  });

  it("classifies pending checkout payments as active or stale for admin reporting", async () => {
    const { service, prisma } = createService();
    jest.spyOn(Date, "now").mockReturnValue(new Date("2026-03-13T15:00:00.000Z").getTime());

    prisma.payment.findMany.mockResolvedValue([
      makePaymentRow({
        id: "payment_pending_active",
        createdAt: "2026-03-13T14:20:00.000Z",
        amount: 50000,
        status: PaymentStatus.PENDING,
        orderNumber: null,
        metadata: {
          locale: "en",
          fullName: "Ada Author",
          phone: "+2348012345678",
          paymentFlow: "CHECKOUT",
          source: "dashboard",
          dashboardUserId: "user_pending_active",
        },
      }),
      makePaymentRow({
        id: "payment_pending_stale",
        createdAt: "2026-03-13T12:00:00.000Z",
        amount: 50000,
        status: PaymentStatus.PENDING,
        orderNumber: null,
        metadata: {
          locale: "en",
          fullName: "Ada Author",
          phone: "+2348012345678",
          paymentFlow: "CHECKOUT",
          source: "dashboard",
          dashboardUserId: "user_pending_stale",
        },
      }),
      makePaymentRow({
        id: "payment_successful",
        createdAt: "2026-03-13T11:00:00.000Z",
        amount: 50000,
        status: PaymentStatus.SUCCESS,
        orderNumber: "BP-2026-0099",
      }),
    ]);

    const result = await service.listAdminPayments({
      limit: 10,
      sortBy: "createdAt",
      sortDirection: "desc",
    });

    expect(
      result.items.find((item) => item.id === "payment_pending_active")?.pendingCheckout
    ).toEqual({
      ageMinutes: 40,
      staleAfterMinutes: 120,
      isStale: false,
    });
    expect(
      result.items.find((item) => item.id === "payment_pending_stale")?.pendingCheckout
    ).toEqual({
      ageMinutes: 180,
      staleAfterMinutes: 120,
      isStale: true,
    });
    expect(
      result.items.find((item) => item.id === "payment_successful")?.pendingCheckout
    ).toBeNull();
  });
});
