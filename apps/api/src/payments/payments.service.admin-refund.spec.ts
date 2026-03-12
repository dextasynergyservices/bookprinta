/// <reference types="jest" />
import { renderRefundConfirmEmail } from "@bookprinta/emails/render";
import { PaymentProvider, PaymentStatus, PaymentType } from "../generated/prisma/enums.js";
import { buildRefundPolicySnapshot } from "../orders/admin-order-workflow.js";
import { PaymentsService } from "./payments.service.js";

jest.mock("@bookprinta/emails/render", () => ({
  renderBankTransferAdminEmail: jest.fn(),
  renderBankTransferUserEmail: jest.fn(),
  renderRefundConfirmEmail: jest.fn(),
}));

function createService() {
  process.env.FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

  const tx = {
    order: {
      updateMany: jest.fn(),
      findUnique: jest.fn(),
    },
    book: {
      updateMany: jest.fn(),
      findUnique: jest.fn(),
    },
    payment: {
      update: jest.fn(),
      create: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  };

  const prisma = {
    paymentGateway: {
      findUnique: jest.fn(),
    },
    payment: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    order: {
      update: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    book: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn(async (callback: (trx: typeof tx) => unknown) => callback(tx)),
  };

  const paystackService = {
    isAvailable: true,
    initialize: jest.fn(),
    refund: jest.fn(),
  };

  const stripeService = {
    isAvailable: true,
    initialize: jest.fn(),
    refund: jest.fn(),
  };

  const paypalService = {
    isAvailable: true,
    initialize: jest.fn(),
    refund: jest.fn(),
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
    { assertBillingGateAccess: jest.fn() } as never
  );

  const resendMock = {
    emails: {
      send: jest.fn(),
    },
  };
  (service as unknown as { resend: typeof resendMock | null }).resend = resendMock;

  return {
    service,
    prisma,
    tx,
    paystackService,
    stripeService,
    paypalService,
    notificationsService,
    resendMock,
  };
}

function buildPaymentRecord(params: {
  provider: PaymentProvider;
  orderStatus: "PROCESSING" | "FORMATTING";
  providerRef: string | null;
  gatewayResponse?: Record<string, unknown> | null;
  paymentAmount?: number;
  orderTotalAmount?: number;
  preferredLanguage?: string | null;
}) {
  const paymentAmount = params.paymentAmount ?? 100000;
  const orderTotalAmount = params.orderTotalAmount ?? 100000;

  return {
    id: "payment_1",
    orderId: "order_1",
    userId: "user_1",
    provider: params.provider,
    type: PaymentType.INITIAL,
    amount: paymentAmount,
    currency: "NGN",
    status: PaymentStatus.SUCCESS,
    providerRef: params.providerRef,
    payerName: "Ada Okafor",
    payerEmail: "ada@example.com",
    payerPhone: "+2348012345678",
    adminNote: "Primary order payment",
    gatewayResponse: params.gatewayResponse ?? null,
    order: {
      id: "order_1",
      orderNumber: "BP-2026-0001",
      userId: "user_1",
      status: params.orderStatus,
      version: 3,
      totalAmount: orderTotalAmount,
      currency: "NGN",
      refundedAt: null,
      refundAmount: 0,
      user: {
        firstName: "Ada",
        lastName: "Okafor",
        email: "ada@example.com",
        preferredLanguage: params.preferredLanguage ?? "en",
      },
      book: null,
    },
  };
}

describe("PaymentsService admin refunds", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (renderRefundConfirmEmail as jest.Mock).mockResolvedValue({
      subject: "Refund processed",
      html: "<p>Refund processed</p>",
    });
  });

  it("processes a full Paystack refund, records audit data, and sends the confirmation email", async () => {
    const { service, prisma, tx, paystackService, notificationsService, resendMock } =
      createService();
    const payment = buildPaymentRecord({
      provider: PaymentProvider.PAYSTACK,
      orderStatus: "PROCESSING",
      providerRef: "PSK_REF_1",
    });
    const policySnapshot = buildRefundPolicySnapshot({
      orderTotalAmount: 100000,
      orderStatus: payment.order.status,
      book: null,
      calculatedAt: new Date("2026-03-12T09:00:00.000Z"),
    });

    prisma.payment.findUnique.mockResolvedValue(payment);
    paystackService.refund.mockResolvedValue({
      id: "rfnd_psk_1",
      status: "success",
    });
    tx.order.updateMany.mockResolvedValue({ count: 1 });
    tx.order.findUnique.mockResolvedValue({
      id: "order_1",
      status: "REFUNDED",
      version: 4,
    });
    tx.payment.update.mockResolvedValue({});
    tx.payment.create.mockResolvedValue({
      id: "refund_payment_1",
      status: PaymentStatus.REFUNDED,
    });
    tx.auditLog.create
      .mockResolvedValueOnce({
        id: "audit_refund_1",
        action: "ADMIN_ORDER_REFUND_PROCESSED",
        entityType: "ORDER",
        entityId: "order_1",
        details: {
          note: "Approved by support.",
          reason: "Customer cancelled before processing.",
        },
        createdAt: new Date("2026-03-12T10:15:00.000Z"),
      })
      .mockResolvedValueOnce({
        id: "audit_tracking_1",
      });
    notificationsService.createOrderStatusNotification.mockResolvedValue(undefined);
    resendMock.emails.send.mockResolvedValue({ error: null });

    const result = await service.refundAdminPayment({
      paymentId: "payment_1",
      adminId: "admin_1",
      input: {
        type: "FULL",
        reason: "Customer cancelled before processing.",
        note: "Approved by support.",
        expectedOrderVersion: 3,
        policySnapshot,
      },
    });

    expect(paystackService.refund).toHaveBeenCalledWith("PSK_REF_1", 100000);
    expect(tx.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: "order_1",
          userId: "user_1",
          provider: PaymentProvider.PAYSTACK,
          type: PaymentType.REFUND,
          amount: -100000,
          status: PaymentStatus.REFUNDED,
          providerRef: "rfnd_psk_1",
          approvedBy: "admin_1",
          metadata: expect.objectContaining({
            originalPaymentId: "payment_1",
            refundType: "FULL",
            policySnapshot: expect.objectContaining({
              policyDecision: "FULL",
              policyPercent: 100,
              recommendedRefundType: "FULL",
              maxRefundAmount: 100000,
            }),
          }),
        }),
      })
    );
    expect(tx.auditLog.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          action: "ADMIN_ORDER_REFUND_PROCESSED",
          entityType: "ORDER",
          entityId: "order_1",
          details: expect.objectContaining({
            paymentId: "payment_1",
            refundPaymentId: "refund_payment_1",
            refundType: "FULL",
            refundedAmount: 100000,
            provider: PaymentProvider.PAYSTACK,
            processingMode: "gateway",
            providerRefundReference: "rfnd_psk_1",
          }),
        }),
      })
    );
    expect(renderRefundConfirmEmail).toHaveBeenCalledWith({
      locale: "en",
      userName: "Ada Okafor",
      orderNumber: "BP-2026-0001",
      originalAmount: "₦100,000",
      refundAmount: "₦100,000",
      refundReason: "Customer cancelled before processing.",
    });
    expect(resendMock.emails.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "ada@example.com",
        subject: "Refund processed",
        html: "<p>Refund processed</p>",
      })
    );
    expect(notificationsService.createOrderStatusNotification).toHaveBeenCalledWith(
      {
        userId: "user_1",
        orderId: "order_1",
        orderNumber: "BP-2026-0001",
        status: "REFUNDED",
        source: "order",
        bookId: undefined,
      },
      tx
    );
    expect(result).toEqual(
      expect.objectContaining({
        paymentId: "payment_1",
        refundPaymentId: "refund_payment_1",
        processingMode: "gateway",
        refundType: "FULL",
        refundedAmount: 100000,
        providerRefundReference: "rfnd_psk_1",
        emailSent: true,
        audit: expect.objectContaining({
          auditId: "audit_refund_1",
          action: "ADMIN_ORDER_REFUND_PROCESSED",
          reason: "Customer cancelled before processing.",
        }),
      })
    );
  });

  it("processes a policy partial Stripe refund using the stored payment intent reference", async () => {
    const { service, prisma, tx, stripeService, resendMock } = createService();
    const payment = buildPaymentRecord({
      provider: PaymentProvider.STRIPE,
      orderStatus: "FORMATTING",
      providerRef: "cs_test_123",
      gatewayResponse: {
        payment_intent: "pi_test_123",
      },
    });
    const policySnapshot = buildRefundPolicySnapshot({
      orderTotalAmount: 100000,
      orderStatus: payment.order.status,
      book: null,
      calculatedAt: new Date("2026-03-12T09:00:00.000Z"),
    });

    prisma.payment.findUnique.mockResolvedValue(payment);
    stripeService.refund.mockResolvedValue({
      id: "re_stripe_1",
      status: "succeeded",
    });
    tx.order.updateMany.mockResolvedValue({ count: 1 });
    tx.order.findUnique.mockResolvedValue({
      id: "order_1",
      status: "REFUNDED",
      version: 4,
    });
    tx.payment.create.mockResolvedValue({
      id: "refund_payment_2",
      status: PaymentStatus.REFUNDED,
    });
    tx.auditLog.create
      .mockResolvedValueOnce({
        id: "audit_refund_2",
        action: "ADMIN_ORDER_REFUND_PROCESSED",
        entityType: "ORDER",
        entityId: "order_1",
        details: {
          note: null,
          reason: "Formatting has started, partial refund per policy.",
        },
        createdAt: new Date("2026-03-12T10:20:00.000Z"),
      })
      .mockResolvedValueOnce({
        id: "audit_tracking_2",
      });
    resendMock.emails.send.mockResolvedValue({ error: null });

    const result = await service.refundAdminPayment({
      paymentId: "payment_1",
      adminId: "admin_1",
      input: {
        type: "PARTIAL",
        reason: "Formatting has started, partial refund per policy.",
        expectedOrderVersion: 3,
        policySnapshot,
      },
    });

    expect(stripeService.refund).toHaveBeenCalledWith("pi_test_123", 70000);
    expect(tx.payment.update).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        processingMode: "gateway",
        refundType: "PARTIAL",
        refundedAmount: 70000,
        providerRefundReference: "re_stripe_1",
        emailSent: true,
      })
    );
  });

  it("processes a custom bank-transfer refund in manual mode without gateway dispatch", async () => {
    const { service, prisma, tx, paystackService, stripeService, resendMock } = createService();
    const payment = buildPaymentRecord({
      provider: PaymentProvider.BANK_TRANSFER,
      orderStatus: "FORMATTING",
      providerRef: null,
      preferredLanguage: "fr",
    });
    const policySnapshot = buildRefundPolicySnapshot({
      orderTotalAmount: 100000,
      orderStatus: payment.order.status,
      book: null,
      calculatedAt: new Date("2026-03-12T09:00:00.000Z"),
    });

    prisma.payment.findUnique.mockResolvedValue(payment);
    tx.order.updateMany.mockResolvedValue({ count: 1 });
    tx.order.findUnique.mockResolvedValue({
      id: "order_1",
      status: "REFUNDED",
      version: 4,
    });
    tx.payment.update.mockResolvedValue({});
    tx.payment.create.mockResolvedValue({
      id: "refund_payment_3",
      status: PaymentStatus.REFUNDED,
    });
    tx.auditLog.create
      .mockResolvedValueOnce({
        id: "audit_refund_3",
        action: "ADMIN_ORDER_REFUND_PROCESSED",
        entityType: "ORDER",
        entityId: "order_1",
        details: {
          note: "Manual bank refund approved by finance.",
          reason: "Goodwill custom refund.",
        },
        createdAt: new Date("2026-03-12T10:25:00.000Z"),
      })
      .mockResolvedValueOnce({
        id: "audit_tracking_3",
      });
    resendMock.emails.send.mockResolvedValue({ error: null });

    const result = await service.refundAdminPayment({
      paymentId: "payment_1",
      adminId: "admin_1",
      input: {
        type: "CUSTOM",
        reason: "Goodwill custom refund.",
        note: "Manual bank refund approved by finance.",
        customAmount: 50000,
        expectedOrderVersion: 3,
        policySnapshot,
      },
    });

    expect(paystackService.refund).not.toHaveBeenCalled();
    expect(stripeService.refund).not.toHaveBeenCalled();
    expect(tx.payment.update).toHaveBeenCalledWith({
      where: { id: "payment_1" },
      data: {
        adminNote: "Manual bank refund approved by finance.",
      },
    });
    expect(renderRefundConfirmEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: "fr",
        refundAmount: "₦50,000",
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        processingMode: "manual",
        refundType: "CUSTOM",
        refundedAmount: 50000,
        providerRefundReference: null,
        emailSent: true,
      })
    );
  });
});
