/// <reference types="jest" />
import {
  renderNewBookOrderAdminEmail,
  renderNewBookOrderUserEmail,
} from "@bookprinta/emails/render";
import { PaymentProvider, PaymentStatus } from "../generated/prisma/enums.js";
import { PaymentsService } from "./payments.service.js";

jest.mock("@bookprinta/emails/render", () => ({
  renderBankTransferAdminEmail: jest.fn(),
  renderBankTransferRejectedEmail: jest.fn(),
  renderBankTransferUserEmail: jest.fn(),
  renderNewBookOrderAdminEmail: jest.fn(),
  renderNewBookOrderUserEmail: jest.fn(),
  renderRefundConfirmEmail: jest.fn(),
  renderReprintAdminConfirmEmail: jest.fn(),
  renderReprintConfirmEmail: jest.fn(),
}));

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
  resolvePackageFromCheckoutMetadata: (...args: never[]) => Promise<{
    id: string;
    name: string;
    basePrice: number;
  }>;
  generateOrderNumber: (...args: never[]) => Promise<string>;
  resolveAppliedCouponForOrder: (...args: never[]) => Promise<null>;
  createOrderAddonsFromMetadata: (...args: never[]) => Promise<void>;
  resolveAddonNamesFromMetadata: (...args: never[]) => Promise<string[]>;
};

function getPaymentsServicePrivate(service: PaymentsService) {
  return service as unknown as PaymentsServicePrivate;
}

function createExistingDashboardUser() {
  return {
    id: "user_dashboard_1",
    email: "author@example.com",
    firstName: "Ada",
    lastName: "Okafor",
    phoneNumber: "+2348012345678",
    phoneNumberNormalized: "+2348012345678",
    preferredLanguage: "en",
    password: "hashed-password",
    isActive: true,
    isVerified: true,
    whatsAppNotificationsEnabled: false,
  };
}

function createService() {
  process.env.FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

  const tx = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    order: {
      create: jest.fn(),
    },
    book: {
      create: jest.fn(),
    },
    payment: {
      update: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
      createMany: jest.fn(),
    },
  };

  const prisma = {
    payment: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    order: {
      findUnique: jest.fn(),
    },
    orderAddon: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(async (callback: (trx: typeof tx) => Promise<unknown>) => callback(tx)),
  };

  const signupNotificationsService = {
    sendRegistrationLink: jest.fn(),
  };

  const notificationsService = {
    createOrderStatusNotification: jest.fn(),
    notifyAdminsBankTransferReceived: jest.fn(),
  };

  const whatsappNotificationsService = {
    sendPaymentConfirmation: jest.fn().mockResolvedValue(undefined),
  };

  const service = new PaymentsService(
    prisma as never,
    { isAvailable: true, initialize: jest.fn() } as never,
    { isAvailable: true, initialize: jest.fn() } as never,
    { isAvailable: true, initialize: jest.fn() } as never,
    {} as never,
    {} as never,
    signupNotificationsService as never,
    notificationsService as never,
    { assertBillingGateAccess: jest.fn() } as never,
    {} as never,
    whatsappNotificationsService as never
  );

  const resendMock = {
    emails: {
      send: jest.fn().mockResolvedValue({ error: null }),
    },
  };
  (service as unknown as { resend: typeof resendMock | null }).resend = resendMock;

  return {
    service,
    prisma,
    tx,
    resendMock,
    signupNotificationsService,
    notificationsService,
    whatsappNotificationsService,
  };
}

function stubCheckoutFinalizationHelpers(service: PaymentsService) {
  const servicePrivate = getPaymentsServicePrivate(service);
  servicePrivate.resolvePackageFromCheckoutMetadata = jest.fn().mockResolvedValue({
    id: "pkg_1",
    name: "Legacy",
    basePrice: 125000,
  });
  servicePrivate.generateOrderNumber = jest.fn().mockResolvedValue("BP-2026-0042");
  servicePrivate.resolveAppliedCouponForOrder = jest.fn().mockResolvedValue(null);
  servicePrivate.createOrderAddonsFromMetadata = jest.fn().mockResolvedValue(undefined);
  servicePrivate.resolveAddonNamesFromMetadata = jest.fn().mockResolvedValue(["ISBN Registration"]);
}

describe("PaymentsService new-book order emails", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (renderNewBookOrderUserEmail as jest.Mock).mockResolvedValue({
      subject: "Your BookPrinta order is confirmed",
      html: "<p>user email</p>",
    });
    (renderNewBookOrderAdminEmail as jest.Mock).mockResolvedValue({
      subject: "New dashboard order",
      html: "<p>admin email</p>",
    });
  });

  it("sends user and admin emails when a dashboard new-book online payment succeeds", async () => {
    const { service, prisma, tx, resendMock, signupNotificationsService } = createService();
    const existingUser = createExistingDashboardUser();
    stubCheckoutFinalizationHelpers(service);

    prisma.payment.findUnique.mockResolvedValue({
      id: "payment_pending_1",
      type: "INITIAL",
      userId: existingUser.id,
      orderId: null,
      processedAt: null,
      payerEmail: existingUser.email,
      metadata: {
        source: "dashboard",
        dashboardUserId: existingUser.id,
        paymentFlow: "CHECKOUT",
        locale: "en",
        fullName: "Ada Okafor",
        phone: existingUser.phoneNumber,
        packageId: "pkg_1",
        packageSlug: "legacy",
        packageName: "Legacy",
        hasCover: true,
        hasFormatting: true,
        bookSize: "A5",
        paperColor: "white",
        lamination: "gloss",
        totalPrice: 125000,
        addons: [{ id: "addon_isbn", name: "ISBN Registration", price: 5000 }],
      },
    });
    prisma.payment.updateMany.mockResolvedValue({ count: 1 });

    tx.user.findUnique.mockResolvedValue(existingUser);
    tx.user.findFirst.mockResolvedValue({
      id: existingUser.id,
      email: existingUser.email,
      isActive: true,
    });
    tx.user.findMany.mockResolvedValue([{ id: existingUser.id, email: existingUser.email }]);
    tx.user.update.mockImplementation(async ({ data }) => ({
      ...existingUser,
      firstName: data.firstName ?? existingUser.firstName,
      lastName: data.lastName ?? existingUser.lastName,
      phoneNumber: data.phoneNumber ?? existingUser.phoneNumber,
      phoneNumberNormalized: data.phoneNumberNormalized ?? existingUser.phoneNumberNormalized,
      preferredLanguage: data.preferredLanguage ?? existingUser.preferredLanguage,
    }));
    tx.order.create.mockResolvedValue({
      id: "order_new_book_1",
      createdAt: new Date("2026-03-30T10:00:00.000Z"),
    });
    tx.book.create.mockResolvedValue({
      id: "book_new_book_1",
      createdAt: new Date("2026-03-30T10:01:00.000Z"),
    });
    tx.payment.update.mockResolvedValue({});
    tx.auditLog.createMany.mockResolvedValue({ count: 2 });
    tx.auditLog.create.mockResolvedValue({ id: "audit_1" });

    await getPaymentsServicePrivate(service).createPaymentFromWebhook({
      provider: "PAYSTACK",
      providerRef: "ps_dashboard_order_1",
      amount: 125000,
      currency: "NGN",
      payerEmail: existingUser.email,
      gatewayResponse: { status: "success" },
      metadata: null,
    });

    expect(renderNewBookOrderUserEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: "en",
        userName: "Ada",
        orderNumber: "BP-2026-0042",
        packageName: "Legacy",
        totalPrice: "₦125,000",
        addons: ["ISBN Registration"],
        dashboardUrl: "http://localhost:3000/en/dashboard",
      })
    );
    expect(renderNewBookOrderAdminEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: "en",
        userName: "Ada",
        userEmail: existingUser.email,
        orderNumber: "BP-2026-0042",
        packageName: "Legacy",
        totalPrice: "₦125,000",
        addons: ["ISBN Registration"],
        provider: "PAYSTACK",
        reference: "ps_dashboard_order_1",
        adminPanelUrl: "http://localhost:3000/admin/orders",
      })
    );
    expect(resendMock.emails.send).toHaveBeenCalledTimes(2);
    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "payment_pending_1" },
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            dashboardOrderEmailDelivery: expect.objectContaining({
              userSentAt: expect.any(String),
              adminSentAt: expect.any(String),
              lastAttemptAt: expect.any(String),
            }),
          }),
        }),
      })
    );
    expect(signupNotificationsService.sendRegistrationLink).not.toHaveBeenCalled();
  });

  it("sends user and admin emails when a dashboard new-book bank transfer is approved", async () => {
    const { service, prisma, tx, resendMock, signupNotificationsService } = createService();
    const existingUser = createExistingDashboardUser();
    stubCheckoutFinalizationHelpers(service);

    prisma.payment.findUnique.mockResolvedValue({
      id: "payment_bank_1",
      type: "INITIAL",
      provider: PaymentProvider.BANK_TRANSFER,
      status: PaymentStatus.AWAITING_APPROVAL,
      payerEmail: existingUser.email,
      payerName: "Ada Okafor",
      amount: 125000,
      currency: "NGN",
      providerRef: "BT-NEW-001",
      metadata: {
        source: "dashboard",
        dashboardUserId: existingUser.id,
        paymentFlow: "CHECKOUT",
        locale: "en",
        fullName: "Ada Okafor",
        phone: existingUser.phoneNumber,
        packageId: "pkg_1",
        packageSlug: "legacy",
        packageName: "Legacy",
        hasCover: true,
        hasFormatting: true,
        bookSize: "A5",
        paperColor: "white",
        lamination: "gloss",
        totalPrice: 125000,
        addons: [{ id: "addon_isbn", name: "ISBN Registration", price: 5000 }],
      },
      userId: existingUser.id,
      orderId: null,
    });

    tx.user.findUnique.mockResolvedValue(existingUser);
    tx.user.findFirst.mockResolvedValue({
      id: existingUser.id,
      email: existingUser.email,
      isActive: true,
    });
    tx.user.findMany.mockResolvedValue([{ id: existingUser.id, email: existingUser.email }]);
    tx.user.update.mockImplementation(async ({ data }) => ({
      ...existingUser,
      firstName: data.firstName ?? existingUser.firstName,
      lastName: data.lastName ?? existingUser.lastName,
      phoneNumber: data.phoneNumber ?? existingUser.phoneNumber,
      phoneNumberNormalized: data.phoneNumberNormalized ?? existingUser.phoneNumberNormalized,
      preferredLanguage: data.preferredLanguage ?? existingUser.preferredLanguage,
    }));
    tx.order.create.mockResolvedValue({
      id: "order_new_book_2",
      createdAt: new Date("2026-03-30T11:00:00.000Z"),
    });
    tx.book.create.mockResolvedValue({
      id: "book_new_book_2",
      createdAt: new Date("2026-03-30T11:01:00.000Z"),
    });
    tx.payment.update.mockResolvedValue({});
    tx.auditLog.createMany.mockResolvedValue({ count: 2 });
    tx.auditLog.create.mockResolvedValue({ id: "audit_2" });

    const result = await service.approveBankTransfer({
      paymentId: "payment_bank_1",
      adminId: "admin_1",
      adminNote: "Verified against statement",
    });

    expect(renderNewBookOrderUserEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: "en",
        userName: "Ada",
        orderNumber: "BP-2026-0042",
        packageName: "Legacy",
        totalPrice: "₦125,000",
        addons: ["ISBN Registration"],
        dashboardUrl: "http://localhost:3000/en/dashboard",
      })
    );
    expect(renderNewBookOrderAdminEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: "en",
        userName: "Ada",
        userEmail: existingUser.email,
        orderNumber: "BP-2026-0042",
        packageName: "Legacy",
        totalPrice: "₦125,000",
        addons: ["ISBN Registration"],
        provider: PaymentProvider.BANK_TRANSFER,
        reference: "BT-NEW-001",
        adminPanelUrl: "http://localhost:3000/admin/orders",
      })
    );
    expect(resendMock.emails.send).toHaveBeenCalledTimes(2);
    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "payment_bank_1" },
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            dashboardOrderEmailDelivery: expect.objectContaining({
              userSentAt: expect.any(String),
              adminSentAt: expect.any(String),
              lastAttemptAt: expect.any(String),
            }),
          }),
        }),
      })
    );
    expect(signupNotificationsService.sendRegistrationLink).not.toHaveBeenCalled();
    expect(result).toEqual({
      id: "payment_bank_1",
      status: PaymentStatus.SUCCESS,
      message: "Bank transfer approved successfully.",
    });
  });

  it("backfills dashboard new-book emails on verify when payment already succeeded without recorded delivery", async () => {
    const { service, prisma, resendMock } = createService();

    prisma.payment.findUnique
      .mockResolvedValueOnce({
        id: "payment_success_1",
        provider: PaymentProvider.PAYSTACK,
        status: PaymentStatus.SUCCESS,
        type: "INITIAL",
        processedAt: new Date("2026-03-30T12:00:00.000Z"),
        amount: 125000,
        currency: "NGN",
        payerEmail: "author@example.com",
        metadata: {
          source: "dashboard",
          locale: "en",
          fullName: "Ada Okafor",
        },
      })
      .mockResolvedValueOnce({
        id: "payment_success_1",
        type: "INITIAL",
        status: PaymentStatus.SUCCESS,
        metadata: {
          source: "dashboard",
          locale: "en",
          fullName: "Ada Okafor",
        },
        user: null,
        order: null,
      })
      .mockResolvedValueOnce({
        orderId: "order_success_1",
      });

    prisma.order.findUnique.mockResolvedValue({
      orderNumber: "BP-2026-0055",
      totalAmount: 125000,
      currency: "NGN",
      package: {
        name: "Legacy",
      },
    });
    prisma.orderAddon.findMany.mockResolvedValue([
      {
        addon: {
          name: "ISBN Registration",
        },
      },
    ]);

    const result = await service.verify("ps_dashboard_success_1", "PAYSTACK");

    expect(renderNewBookOrderUserEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: "en",
        userName: "Ada Okafor",
        orderNumber: "BP-2026-0055",
        packageName: "Legacy",
        totalPrice: "₦125,000",
        addons: ["ISBN Registration"],
        dashboardUrl: "http://localhost:3000/en/dashboard",
      })
    );
    expect(renderNewBookOrderAdminEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: "en",
        userName: "Ada Okafor",
        userEmail: "author@example.com",
        orderNumber: "BP-2026-0055",
        packageName: "Legacy",
        totalPrice: "₦125,000",
        addons: ["ISBN Registration"],
        provider: PaymentProvider.PAYSTACK,
        reference: "ps_dashboard_success_1",
      })
    );
    expect(resendMock.emails.send).toHaveBeenCalledTimes(2);
    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "payment_success_1" },
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            dashboardOrderEmailDelivery: expect.objectContaining({
              userSentAt: expect.any(String),
              adminSentAt: expect.any(String),
              lastAttemptAt: expect.any(String),
            }),
          }),
        }),
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        status: "success",
        reference: "ps_dashboard_success_1",
        verified: true,
      })
    );
  });
});
