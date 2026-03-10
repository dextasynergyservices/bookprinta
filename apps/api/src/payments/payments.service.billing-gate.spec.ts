/// <reference types="jest" />
import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
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

  const prisma = {
    paymentGateway: {
      findUnique: jest.fn(),
    },
    book: {
      findUnique: jest.fn(),
    },
    order: {
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    payment: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const paystackService = {
    isAvailable: true,
    initialize: jest.fn(),
  };

  const stripeService = {
    isAvailable: true,
    initialize: jest.fn(),
  };

  const paypalService = {
    isAvailable: true,
    initialize: jest.fn(),
  };

  const rollout = {
    assertBillingGateAccess: jest.fn(),
  };

  const notificationsService = {
    createOrderStatusNotification: jest.fn(),
    notifyAdminsBankTransferReceived: jest.fn(),
  };

  const service = new PaymentsService(
    prisma as never,
    paystackService as never,
    stripeService as never,
    paypalService as never,
    {} as never,
    {} as never,
    { sendRegistrationLink: jest.fn() } as never,
    notificationsService as never,
    rollout as never
  );

  return { service, prisma, paystackService, rollout, notificationsService };
}

describe("PaymentsService billing gate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("skips Paystack webhook processing when the payment was already processed", async () => {
    const { service, prisma } = createService();

    prisma.payment.findUnique.mockResolvedValue({
      processedAt: new Date("2026-03-07T12:00:00.000Z"),
    });

    const result = await service.handlePaystackWebhook({
      event: "charge.success",
      data: {
        reference: "ep_ref_done",
        status: "success",
        amount: 20000,
        currency: "NGN",
        customer: { email: "author@example.com" },
        metadata: {},
      },
    } as never);

    expect(result).toEqual({ status: "ok", message: "Already processed" });
    expect(prisma.payment.updateMany).not.toHaveBeenCalled();
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it("skips Stripe webhook processing when the session was already processed", async () => {
    const { service, prisma } = createService();

    prisma.payment.findUnique.mockResolvedValue({
      processedAt: new Date("2026-03-07T12:00:00.000Z"),
    });

    const result = await service.handleStripeWebhook({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_done",
          payment_status: "paid",
          amount_total: 20000,
          currency: "ngn",
          customer_email: "author@example.com",
          metadata: {},
        },
      },
    });

    expect(result).toEqual({ status: "ok", message: "Already processed" });
    expect(prisma.payment.updateMany).not.toHaveBeenCalled();
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it("rejects extra-pages payment when client extraPages differs from authoritative overage", async () => {
    const { service, prisma } = createService();

    prisma.paymentGateway.findUnique.mockResolvedValue({ isEnabled: true });
    prisma.book.findUnique.mockResolvedValue({
      id: "cmbook1",
      userId: "user_1",
      orderId: "cmorder1",
      pageCount: 170,
      order: {
        id: "cmorder1",
        package: {
          pageLimit: 150,
        },
      },
      user: {
        email: "author@example.com",
      },
    });

    await expect(
      service.payExtraPages({
        bookId: "cmbook1",
        provider: "PAYSTACK",
        extraPages: 10,
        userId: "user_1",
      })
    ).rejects.toThrow(BadRequestException);

    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it("creates payment using authoritative overage amount", async () => {
    const { service, prisma, paystackService } = createService();

    prisma.paymentGateway.findUnique.mockResolvedValue({ isEnabled: true });
    prisma.book.findUnique.mockResolvedValue({
      id: "cmbook1",
      userId: "user_1",
      orderId: "cmorder1",
      pageCount: 170,
      order: {
        id: "cmorder1",
        package: {
          pageLimit: 150,
        },
      },
      user: {
        email: "author@example.com",
      },
    });
    prisma.order.update.mockResolvedValue({});
    prisma.payment.create.mockResolvedValue({ id: "cmpay1" });
    paystackService.initialize.mockResolvedValue({
      authorization_url: "https://checkout.paystack.com/test",
      reference: "ep_ref_1",
      access_code: "access_1",
    });

    const result = await service.payExtraPages({
      bookId: "cmbook1",
      provider: "PAYSTACK",
      extraPages: 20,
      userId: "user_1",
      callbackUrl: "https://app.bookprinta.com/dashboard/books/cmbook1",
    });

    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: "cmorder1" },
      data: {
        status: "PENDING_EXTRA_PAYMENT",
        extraAmount: 200,
      },
    });
    expect(prisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 200,
          metadata: expect.objectContaining({
            extraPages: 20,
            requiredAmount: 200,
            pageCount: 170,
            pageLimit: 150,
          }),
        }),
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        authorizationUrl: "https://checkout.paystack.com/test",
        reference: "ep_ref_1",
        provider: "PAYSTACK",
        paymentId: "cmpay1",
      })
    );
  });

  it("blocks extra-pages payment when billing gate rollout is disabled", async () => {
    const { service, prisma, rollout } = createService();

    prisma.paymentGateway.findUnique.mockResolvedValue({ isEnabled: true });
    prisma.book.findUnique.mockResolvedValue({
      id: "cmbook1",
      userId: "user_1",
      orderId: "cmorder1",
      pageCount: 170,
      order: {
        id: "cmorder1",
        package: {
          pageLimit: 150,
        },
      },
      user: {
        email: "author@example.com",
      },
    });
    rollout.assertBillingGateAccess.mockImplementation(() => {
      throw new ServiceUnavailableException(
        "Automated extra-page billing is not enabled in this environment yet."
      );
    });

    await expect(
      service.payExtraPages({
        bookId: "cmbook1",
        provider: "PAYSTACK",
        extraPages: 20,
        userId: "user_1",
      })
    ).rejects.toThrow("Automated extra-page billing is not enabled in this environment yet.");

    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it("unlocks billing gate to PREVIEW_READY after successful extra-pages webhook coverage", async () => {
    const { service, prisma } = createService();

    prisma.payment.findUnique.mockResolvedValue({
      id: "cmpay1",
      type: "EXTRA_PAGES",
      userId: "user_1",
      orderId: "cmorder1",
      processedAt: null,
      metadata: null,
      payerEmail: "author@example.com",
    });
    prisma.payment.updateMany.mockResolvedValue({ count: 1 });
    prisma.order.findUnique.mockResolvedValue({
      id: "cmorder1",
      status: "PENDING_EXTRA_PAYMENT",
      package: { pageLimit: 150 },
      book: { pageCount: 170 },
      payments: [{ amount: { toNumber: () => 200 } }],
    });
    prisma.order.update.mockResolvedValue({});

    await (service as unknown as PaymentsServicePrivate).createPaymentFromWebhook({
      provider: "PAYSTACK",
      providerRef: "ep_ref_1",
      amount: 200,
      currency: "NGN",
      payerEmail: "author@example.com",
      gatewayResponse: {},
      metadata: null,
    });

    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: "cmorder1" },
      data: {
        status: "PREVIEW_READY",
        extraAmount: 200,
      },
    });
  });

  it("keeps billing gate locked when successful extra-pages payments are still short", async () => {
    const { service, prisma } = createService();

    prisma.payment.findUnique.mockResolvedValue({
      id: "cmpay2",
      type: "EXTRA_PAGES",
      userId: "user_1",
      orderId: "cmorder2",
      processedAt: null,
      metadata: null,
      payerEmail: "author@example.com",
    });
    prisma.payment.updateMany.mockResolvedValue({ count: 1 });
    prisma.order.findUnique.mockResolvedValue({
      id: "cmorder2",
      status: "PENDING_EXTRA_PAYMENT",
      package: { pageLimit: 150 },
      book: { pageCount: 170 },
      payments: [{ amount: { toNumber: () => 100 } }],
    });
    prisma.order.update.mockResolvedValue({});

    await (service as unknown as PaymentsServicePrivate).createPaymentFromWebhook({
      provider: "PAYSTACK",
      providerRef: "ep_ref_2",
      amount: 100,
      currency: "NGN",
      payerEmail: "author@example.com",
      gatewayResponse: {},
      metadata: null,
    });

    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: "cmorder2" },
      data: {
        status: "PENDING_EXTRA_PAYMENT",
        extraAmount: 200,
      },
    });
  });

  it("skips webhook reconciliation when another process already claimed the payment", async () => {
    const { service, prisma } = createService();

    prisma.payment.findUnique.mockResolvedValue({
      id: "cmpay3",
      type: "EXTRA_PAGES",
      userId: "user_1",
      orderId: "cmorder3",
      processedAt: null,
      metadata: null,
      payerEmail: "author@example.com",
    });
    prisma.payment.updateMany.mockResolvedValue({ count: 0 });

    await (service as unknown as PaymentsServicePrivate).createPaymentFromWebhook({
      provider: "PAYSTACK",
      providerRef: "ep_ref_race",
      amount: 200,
      currency: "NGN",
      payerEmail: "author@example.com",
      gatewayResponse: {},
      metadata: null,
    });

    expect(prisma.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "cmpay3", processedAt: null },
      })
    );
    expect(prisma.order.findUnique).not.toHaveBeenCalled();
    expect(prisma.order.update).not.toHaveBeenCalled();
  });
});
