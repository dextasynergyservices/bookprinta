/// <reference types="jest" />
import { PaymentsService } from "./payments.service.js";

type PaymentsServicePrivate = {
  createPaymentFromWebhook: (data: {
    provider: "PAYSTACK" | "STRIPE" | "PAYPAL";
    providerRef: string;
    amount: number;
    currency: string;
    payerEmail: string | null;
    gatewayResponse: Record<string, unknown>;
    metadata: Record<string, unknown> | null;
  }) => Promise<void>;
};

function createService() {
  process.env.FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

  const tx = {
    order: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    book: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    payment: {
      update: jest.fn(),
    },
    auditLog: {
      createMany: jest.fn(),
    },
  };

  const prisma = {
    payment: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(async (callback: (trx: typeof tx) => Promise<unknown>) => callback(tx)),
  };

  const notificationsService = {
    createOrderStatusNotification: jest.fn(),
    notifyAdminsBankTransferReceived: jest.fn(),
  };

  const service = new PaymentsService(
    prisma as never,
    { isAvailable: true, initialize: jest.fn() } as never,
    { isAvailable: true, initialize: jest.fn() } as never,
    { isAvailable: true, initialize: jest.fn() } as never,
    {} as never,
    {} as never,
    { sendRegistrationLink: jest.fn() } as never,
    notificationsService as never,
    {} as never
  );

  const resendMock = {
    emails: {
      send: jest.fn().mockResolvedValue({ error: null }),
    },
  };
  (service as unknown as { resend: typeof resendMock | null }).resend = resendMock;

  return { service, prisma, tx, notificationsService, resendMock };
}

describe("PaymentsService reprint fulfillment", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates a REPRINT order and in-production book when a reprint payment succeeds", async () => {
    const { service, prisma, tx, notificationsService, resendMock } = createService();
    const sourceOrderCreatedAt = new Date("2026-03-13T12:00:00.000Z");
    const sourceBookCreatedAt = new Date("2026-03-13T12:00:01.000Z");

    prisma.payment.findUnique.mockResolvedValue({
      id: "payment_reprint_1",
      type: "REPRINT",
      userId: "user_1",
      orderId: null,
      processedAt: null,
      payerEmail: "author@example.com",
      metadata: {
        sourceBookId: "book_source_1",
        sourceOrderId: "order_source_1",
        orderType: "REPRINT",
        copies: 30,
        bookSize: "A4",
        paperColor: "white",
        lamination: "gloss",
        pageCount: 128,
        unitCostPerPage: 20,
        finalPdfUrl: "https://example.com/final-paid.pdf",
      },
    });
    prisma.payment.updateMany.mockResolvedValue({ count: 1 });
    tx.book.findUnique.mockResolvedValue({
      id: "book_source_1",
      orderId: "order_source_1",
      userId: "user_1",
      title: "My Book",
      coverImageUrl: "https://example.com/cover.jpg",
      pageCount: 128,
      wordCount: 42000,
      estimatedPages: 132,
      fontFamily: "Merriweather",
      fontSize: 12,
      finalPdfUrl: "https://example.com/final-current.pdf",
      user: {
        email: "author@example.com",
      },
      order: {
        id: "order_source_1",
        packageId: "package_1",
        packagePriceSnap: 49900,
        package: {
          name: "Premium Package",
        },
      },
    });
    tx.order.findUnique.mockResolvedValue(null);
    tx.order.create.mockResolvedValue({
      id: "order_reprint_1",
      createdAt: sourceOrderCreatedAt,
    });
    tx.book.create.mockResolvedValue({
      id: "book_reprint_1",
      createdAt: sourceBookCreatedAt,
    });
    tx.payment.update.mockResolvedValue({});
    tx.auditLog.createMany.mockResolvedValue({ count: 2 });
    notificationsService.createOrderStatusNotification.mockResolvedValue(undefined);

    await (service as unknown as PaymentsServicePrivate).createPaymentFromWebhook({
      provider: "PAYSTACK",
      providerRef: "rp_ref_1",
      amount: 76800,
      currency: "NGN",
      payerEmail: "author@example.com",
      gatewayResponse: {
        status: "success",
      },
      metadata: null,
    });

    expect(prisma.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "payment_reprint_1", processedAt: null },
        data: expect.objectContaining({
          status: "SUCCESS",
          amount: 76800,
          currency: "NGN",
          payerEmail: "author@example.com",
        }),
      })
    );
    expect(tx.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user_1",
          packageId: "package_1",
          orderType: "REPRINT",
          originalBookId: "book_source_1",
          skipFormatting: true,
          copies: 30,
          hasCoverDesign: false,
          hasFormatting: false,
          bookSize: "A4",
          paperColor: "white",
          lamination: "gloss",
          status: "IN_PRODUCTION",
          initialAmount: 76800,
          totalAmount: 76800,
          currency: "NGN",
        }),
      })
    );
    expect(tx.book.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: "order_reprint_1",
          userId: "user_1",
          status: "IN_PRODUCTION",
          productionStatus: "IN_PRODUCTION",
          title: "My Book",
          coverImageUrl: "https://example.com/cover.jpg",
          pageCount: 128,
          pageSize: "A4",
          finalPdfUrl: "https://example.com/final-paid.pdf",
        }),
      })
    );
    expect(tx.payment.update).toHaveBeenCalledWith({
      where: { id: "payment_reprint_1" },
      data: {
        userId: "user_1",
        orderId: "order_reprint_1",
      },
    });
    expect(tx.auditLog.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            userId: "user_1",
            details: expect.objectContaining({
              source: "order",
              status: "IN_PRODUCTION",
              label: "In Production",
            }),
          }),
          expect.objectContaining({
            userId: "user_1",
            details: expect.objectContaining({
              source: "book",
              status: "IN_PRODUCTION",
              label: "In Production",
            }),
          }),
        ]),
      })
    );
    expect(notificationsService.createOrderStatusNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_1",
        orderId: "order_reprint_1",
        status: "IN_PRODUCTION",
        source: "order",
        bookId: "book_reprint_1",
      }),
      tx
    );
    expect(resendMock.emails.send).toHaveBeenCalledTimes(1);
  });

  it("does not create duplicate reprint entities when the payment is already linked to an order", async () => {
    const { service, prisma, tx, notificationsService } = createService();

    prisma.payment.findUnique.mockResolvedValue({
      id: "payment_reprint_1",
      type: "REPRINT",
      userId: "user_1",
      orderId: "order_existing_1",
      processedAt: null,
      payerEmail: "author@example.com",
      metadata: {
        sourceBookId: "book_source_1",
        copies: 30,
        bookSize: "A4",
        paperColor: "white",
        lamination: "gloss",
      },
    });
    prisma.payment.updateMany.mockResolvedValue({ count: 1 });

    await (service as unknown as PaymentsServicePrivate).createPaymentFromWebhook({
      provider: "PAYSTACK",
      providerRef: "rp_ref_1",
      amount: 76800,
      currency: "NGN",
      payerEmail: "author@example.com",
      gatewayResponse: {
        status: "success",
      },
      metadata: null,
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.order.create).not.toHaveBeenCalled();
    expect(tx.book.create).not.toHaveBeenCalled();
    expect(notificationsService.createOrderStatusNotification).not.toHaveBeenCalled();
  });
});
