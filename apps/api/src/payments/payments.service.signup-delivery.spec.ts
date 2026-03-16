/// <reference types="jest" />
import { PaymentStatus, PaymentType } from "../generated/prisma/enums.js";
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
  createCheckoutEntitiesFromMetadata: (...args: never[]) => Promise<{
    userId: string;
    orderId: string;
    email: string;
    name: string;
    locale: "en" | "fr" | "es";
    signupToken: string | null;
    phone: string | null;
    orderNumber: string;
    packageName: string;
    amountPaid: string;
    addons: string[];
  } | null>;
  resolveOrderDetailsForPayment: (...args: never[]) => Promise<null>;
};

function getPaymentsServicePrivate(service: PaymentsService) {
  return service as unknown as PaymentsServicePrivate;
}

function createService() {
  process.env.FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
  process.env.CONTACT_FROM_EMAIL = "BookPrinta <info@bookprinta.com>";
  process.env.ADMIN_FROM_EMAIL = "BookPrinta <admin@bookprinta.com>";

  const prisma = {
    paymentGateway: {
      findUnique: jest.fn(),
    },
    payment: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    order: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    orderAddon: {
      findMany: jest.fn(),
    },
  };

  const signupNotificationsService = {
    sendRegistrationLink: jest.fn(),
  };

  const notificationsService = {
    createOrderStatusNotification: jest.fn(),
    notifyAdminsBankTransferReceived: jest.fn(),
  };

  const service = new PaymentsService(
    prisma as never,
    { isAvailable: true, verify: jest.fn() } as never,
    { isAvailable: true, verify: jest.fn() } as never,
    { isAvailable: true, verify: jest.fn() } as never,
    {} as never,
    {} as never,
    signupNotificationsService as never,
    notificationsService as never,
    { assertBillingGateAccess: jest.fn() } as never
  );

  return {
    service,
    prisma,
    signupNotificationsService,
  };
}

describe("PaymentsService signup-link delivery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("uses the public sender for customer-facing signup/payment emails and keeps admin alerts on the admin sender", () => {
    const { service } = createService();
    const serviceState = service as unknown as {
      customerPaymentsFromEmail: string;
      adminNotificationsFromEmail: string;
    };

    expect(serviceState.customerPaymentsFromEmail).toBe("BookPrinta <info@bookprinta.com>");
    expect(serviceState.adminNotificationsFromEmail).toBe("BookPrinta <admin@bookprinta.com>");
  });

  it("persists a failed signup-link delivery snapshot for webhook-created payments", async () => {
    const { service, prisma, signupNotificationsService } = createService();
    const servicePrivate = getPaymentsServicePrivate(service);

    prisma.payment.findUnique.mockResolvedValue(null);
    prisma.payment.create.mockResolvedValue({ id: "payment_1" });
    servicePrivate.createCheckoutEntitiesFromMetadata = jest.fn().mockResolvedValue({
      userId: "user_1",
      orderId: "order_1",
      email: "author@example.com",
      name: "Ada Okafor",
      locale: "en",
      signupToken: "signup_token_1",
      phone: "+2348012345678",
      orderNumber: "BP-2026-0008",
      packageName: "Legacy",
      amountPaid: "₦150,000",
      addons: ["ISBN Registration"],
    });
    signupNotificationsService.sendRegistrationLink.mockResolvedValue({
      emailDelivered: false,
      whatsappDelivered: false,
      emailFailureReason: "Domain not verified",
      whatsappFailureReason: "Infobip WhatsApp delivery failed",
      attemptedAt: "2026-03-14T10:00:00.000Z",
    });

    await servicePrivate.createPaymentFromWebhook({
      provider: "PAYSTACK",
      providerRef: "ps_ref_failed",
      amount: 150000,
      currency: "NGN",
      payerEmail: "author@example.com",
      gatewayResponse: {},
      metadata: {
        locale: "en",
      },
    });

    expect(signupNotificationsService.sendRegistrationLink).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "author@example.com",
        token: "signup_token_1",
        fromEmail: "BookPrinta <info@bookprinta.com>",
        orderNumber: "BP-2026-0008",
        packageName: "Legacy",
      })
    );
    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "payment_1" },
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            locale: "en",
            signupLinkDelivery: expect.objectContaining({
              status: "FAILED",
              emailDelivered: false,
              whatsappDelivered: false,
              emailFailureReason: "Domain not verified",
              whatsappFailureReason: "Infobip WhatsApp delivery failed",
              attemptCount: 1,
              lastAttemptAt: "2026-03-14T10:00:00.000Z",
              lastSuccessfulAt: null,
              lastAttemptSource: "WEBHOOK",
            }),
          }),
        }),
      })
    );
  });

  it("retries a failed signup-link delivery during verify and returns the updated delivery status", async () => {
    const { service, prisma, signupNotificationsService } = createService();
    const servicePrivate = getPaymentsServicePrivate(service);

    servicePrivate.resolveOrderDetailsForPayment = jest.fn().mockResolvedValue(null);
    prisma.payment.findUnique
      .mockResolvedValueOnce({
        id: "payment_2",
        status: PaymentStatus.SUCCESS,
        processedAt: new Date("2026-03-14T10:30:00.000Z"),
        amount: 150000,
        currency: "NGN",
        payerEmail: "author@example.com",
      })
      .mockResolvedValueOnce({
        id: "payment_2",
        type: PaymentType.INITIAL,
        status: PaymentStatus.SUCCESS,
        metadata: {
          signupLinkDelivery: {
            status: "FAILED",
            emailDelivered: false,
            whatsappDelivered: false,
            emailFailureReason: "Domain not verified",
            whatsappFailureReason: "Infobip WhatsApp delivery failed",
            attemptCount: 1,
            lastAttemptAt: "2026-03-14T09:00:00.000Z",
            lastSuccessfulAt: null,
            lastAttemptSource: "WEBHOOK",
          },
        },
        user: {
          email: "author@example.com",
          firstName: "Ada",
          phoneNumber: "+2348012345678",
          verificationToken: "signup_token_retry",
          tokenExpiry: new Date("2026-03-20T10:30:00.000Z"),
          preferredLanguage: "en",
        },
        order: {
          orderNumber: "BP-2026-0008",
          totalAmount: 150000,
          package: {
            name: "Legacy",
          },
          addons: [
            {
              addon: {
                name: "ISBN Registration",
              },
            },
          ],
        },
      });
    prisma.payment.update.mockResolvedValue({});
    signupNotificationsService.sendRegistrationLink.mockResolvedValue({
      emailDelivered: true,
      whatsappDelivered: false,
      emailFailureReason: null,
      whatsappFailureReason: "Phone number not provided",
      attemptedAt: "2026-03-14T10:31:00.000Z",
    });

    const result = await service.verify("ps_ref_retry", "PAYSTACK");

    expect(signupNotificationsService.sendRegistrationLink).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "author@example.com",
        token: "signup_token_retry",
        fromEmail: "BookPrinta <info@bookprinta.com>",
        orderNumber: "BP-2026-0008",
        packageName: "Legacy",
      })
    );
    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "payment_2" },
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            signupLinkDelivery: expect.objectContaining({
              status: "PARTIAL",
              emailDelivered: true,
              whatsappDelivered: false,
              attemptCount: 2,
              lastAttemptAt: "2026-03-14T10:31:00.000Z",
              lastSuccessfulAt: "2026-03-14T10:31:00.000Z",
              lastAttemptSource: "VERIFY_RETRY",
            }),
          }),
        }),
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        verified: true,
        signupUrl: "http://localhost:3000/en/signup/finish?token=signup_token_retry",
        signupDelivery: {
          status: "PARTIAL",
          emailDelivered: true,
          whatsappDelivered: false,
          attemptCount: 2,
          lastAttemptAt: "2026-03-14T10:31:00.000Z",
          retryEligible: false,
        },
      })
    );
  });
});
