/// <reference types="jest" />
import {
  BookStatus,
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
} from "../generated/prisma/enums.js";
import { PaymentsService } from "./payments.service.js";

type PaymentsServicePrivate = {
  resolvePackageFromCheckoutMetadata: (...args: never[]) => Promise<{
    id: string;
    name: string;
    basePrice: number;
  }>;
  generateOrderNumber: () => Promise<string>;
  resolveAppliedCouponForOrder: (...args: never[]) => Promise<null>;
  createOrderAddonsFromMetadata: (...args: never[]) => Promise<void>;
  resolveAddonNamesFromMetadata: (...args: never[]) => Promise<string[]>;
};

function getPaymentsServicePrivate(service: PaymentsService) {
  return service as unknown as PaymentsServicePrivate;
}

function createService() {
  process.env.FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

  const tx = {
    user: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    order: {
      findUnique: jest.fn(),
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
    paymentGateway: {
      findUnique: jest.fn(),
    },
    payment: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    order: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(async (callback: (trx: typeof tx) => unknown) => callback(tx)),
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
    { isAvailable: true } as never,
    { isAvailable: true } as never,
    { isAvailable: true } as never,
    {} as never,
    {} as never,
    signupNotificationsService as never,
    notificationsService as never,
    { assertBillingGateAccess: jest.fn() } as never
  );

  return {
    service,
    prisma,
    tx,
    signupNotificationsService,
    notificationsService,
  };
}

describe("PaymentsService bank transfer approval", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("refreshes signup token and sends the signup link for an unfinished linked checkout", async () => {
    const { service, prisma, tx, signupNotificationsService } = createService();

    prisma.payment.findUnique.mockResolvedValue({
      id: "payment_1",
      provider: PaymentProvider.BANK_TRANSFER,
      status: PaymentStatus.AWAITING_APPROVAL,
      payerEmail: "ada@example.com",
      payerName: "Ada Okafor",
      amount: 150000,
      currency: "NGN",
      providerRef: "BT-001",
      metadata: {
        locale: "fr",
        fullName: "Ada Okafor",
        phone: "+2348012345678",
      },
      userId: "user_1",
      orderId: "order_1",
    });

    tx.user.findUnique.mockResolvedValue({
      id: "user_1",
      email: "ada@example.com",
      firstName: "Ada",
      lastName: "Okafor",
      phoneNumber: null,
      phoneNumberNormalized: null,
      preferredLanguage: "en",
      password: null,
      isActive: true,
      isVerified: false,
    });
    tx.user.update.mockImplementation(async ({ data }) => ({
      id: "user_1",
      email: "ada@example.com",
      firstName: "Ada",
      lastName: "Okafor",
      phoneNumber: data.phoneNumber,
      phoneNumberNormalized: data.phoneNumberNormalized,
      preferredLanguage: data.preferredLanguage,
      password: null,
      isActive: true,
      isVerified: false,
    }));
    tx.order.findUnique.mockResolvedValue({
      id: "order_1",
      userId: "user_1",
      orderNumber: "BP-2026-0001",
      totalAmount: 150000,
      currency: "NGN",
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
    });
    tx.payment.update.mockResolvedValue({});
    tx.auditLog.create.mockResolvedValue({ id: "audit_1" });
    signupNotificationsService.sendRegistrationLink.mockResolvedValue({
      emailDelivered: true,
      whatsappDelivered: false,
    });

    const result = await service.approveBankTransfer({
      paymentId: "payment_1",
      adminId: "admin_1",
      adminNote: "Receipt verified against statement",
    });

    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user_1" },
        data: expect.objectContaining({
          preferredLanguage: "fr",
          verificationToken: expect.any(String),
          tokenExpiry: expect.any(Date),
        }),
      })
    );
    expect(tx.payment.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: "payment_1" },
        data: {
          userId: "user_1",
          orderId: "order_1",
        },
      })
    );
    expect(tx.payment.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: "payment_1" },
        data: expect.objectContaining({
          status: PaymentStatus.SUCCESS,
          approvedBy: "admin_1",
          adminNote: "Receipt verified against statement",
        }),
      })
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "ADMIN_BANK_TRANSFER_APPROVED",
          entityType: "PAYMENT",
          entityId: "payment_1",
          details: expect.objectContaining({
            signupLinkIssued: true,
            orderId: "order_1",
            linkedUserId: "user_1",
          }),
        }),
      })
    );
    expect(signupNotificationsService.sendRegistrationLink).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "ada@example.com",
        locale: "fr",
        orderNumber: "BP-2026-0001",
        packageName: "Legacy",
        token: expect.any(String),
      })
    );
    expect(result).toEqual({
      id: "payment_1",
      status: PaymentStatus.SUCCESS,
      message: "Bank transfer approved successfully.",
    });
  });

  it("creates the missing order for an existing linked user before completing approval", async () => {
    const { service, prisma, tx, signupNotificationsService, notificationsService } =
      createService();
    const servicePrivate = getPaymentsServicePrivate(service);

    prisma.payment.findUnique.mockResolvedValue({
      id: "payment_2",
      provider: PaymentProvider.BANK_TRANSFER,
      status: PaymentStatus.AWAITING_APPROVAL,
      payerEmail: null,
      payerName: "Ada Okafor",
      amount: 125000,
      currency: "NGN",
      providerRef: "BT-002",
      metadata: {
        locale: "es",
        fullName: "Ada Okafor",
        phone: "+2348099999999",
        packageSlug: "legacy",
        totalPrice: 125000,
        bookSize: "A5",
        paperColor: "white",
        lamination: "gloss",
      },
      userId: "user_1",
      orderId: null,
    });

    tx.user.findUnique.mockResolvedValue({
      id: "user_1",
      email: "ada@example.com",
      firstName: "Ada",
      lastName: "Okafor",
      phoneNumber: null,
      phoneNumberNormalized: null,
      preferredLanguage: "en",
      password: null,
      isActive: true,
      isVerified: false,
    });
    tx.user.update.mockImplementation(async ({ data }) => ({
      id: "user_1",
      email: "ada@example.com",
      firstName: data.firstName ?? "Ada",
      lastName: data.lastName ?? "Okafor",
      phoneNumber: data.phoneNumber,
      phoneNumberNormalized: data.phoneNumberNormalized,
      preferredLanguage: data.preferredLanguage,
      password: null,
      isActive: true,
      isVerified: false,
    }));
    tx.order.create.mockResolvedValue({
      id: "order_2",
      orderNumber: "BP-2026-0002",
      createdAt: new Date("2026-03-13T12:00:00.000Z"),
    });
    tx.book.create.mockResolvedValue({
      id: "book_1",
      createdAt: new Date("2026-03-13T12:01:00.000Z"),
    });
    tx.payment.update.mockResolvedValue({});
    tx.auditLog.createMany.mockResolvedValue({ count: 2 });
    tx.auditLog.create.mockResolvedValue({ id: "audit_2" });
    notificationsService.createOrderStatusNotification.mockResolvedValue(undefined);
    signupNotificationsService.sendRegistrationLink.mockResolvedValue({
      emailDelivered: true,
      whatsappDelivered: false,
    });

    servicePrivate.resolvePackageFromCheckoutMetadata = jest.fn().mockResolvedValue({
      id: "pkg_1",
      name: "Legacy",
      basePrice: 125000,
    });
    servicePrivate.generateOrderNumber = jest.fn().mockResolvedValue("BP-2026-0002");
    servicePrivate.resolveAppliedCouponForOrder = jest.fn().mockResolvedValue(null);
    servicePrivate.createOrderAddonsFromMetadata = jest.fn().mockResolvedValue(undefined);
    servicePrivate.resolveAddonNamesFromMetadata = jest
      .fn()
      .mockResolvedValue(["ISBN Registration"]);

    const result = await service.approveBankTransfer({
      paymentId: "payment_2",
      adminId: "admin_2",
      adminNote: "Approved after manual verification",
    });

    expect(tx.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user_1",
          packageId: "pkg_1",
          status: OrderStatus.PAID,
        }),
      })
    );
    expect(tx.book.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: "order_2",
          userId: "user_1",
          status: BookStatus.PAYMENT_RECEIVED,
        }),
      })
    );
    expect(tx.payment.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: "payment_2" },
        data: {
          userId: "user_1",
          orderId: "order_2",
        },
      })
    );
    expect(signupNotificationsService.sendRegistrationLink).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "ada@example.com",
        locale: "es",
        orderNumber: "BP-2026-0002",
        packageName: "Legacy",
        token: expect.any(String),
      })
    );
    expect(result).toEqual({
      id: "payment_2",
      status: PaymentStatus.SUCCESS,
      message: "Bank transfer approved successfully.",
    });
  });

  it("rejects approval when a linked checkout user has been deactivated", async () => {
    const { service, prisma, tx, signupNotificationsService } = createService();

    prisma.payment.findUnique.mockResolvedValue({
      id: "payment_inactive",
      provider: PaymentProvider.BANK_TRANSFER,
      status: PaymentStatus.AWAITING_APPROVAL,
      payerEmail: "ada@example.com",
      payerName: "Ada Okafor",
      amount: 150000,
      currency: "NGN",
      providerRef: "BT-004",
      metadata: {
        locale: "en",
        fullName: "Ada Okafor",
      },
      userId: "user_1",
      orderId: "order_1",
    });

    tx.order.findUnique.mockResolvedValue({
      id: "order_1",
      userId: "user_1",
      orderNumber: "BP-2026-0004",
      totalAmount: 150000,
      currency: "NGN",
      package: {
        name: "Legacy",
      },
      addons: [],
    });
    tx.user.findUnique.mockResolvedValue({
      id: "user_1",
      email: "ada@example.com",
      firstName: "Ada",
      lastName: "Okafor",
      phoneNumber: null,
      phoneNumberNormalized: null,
      preferredLanguage: "en",
      password: null,
      isActive: false,
      isVerified: false,
    });

    await expect(
      service.approveBankTransfer({
        paymentId: "payment_inactive",
        adminId: "admin_4",
        adminNote: "Inactive user should block approval",
      })
    ).rejects.toThrow(
      "This account has been deactivated. Reactivate your account first using the recovery flow, or contact support or an administrator before continuing with payment or account setup."
    );

    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.payment.update).not.toHaveBeenCalled();
    expect(signupNotificationsService.sendRegistrationLink).not.toHaveBeenCalled();
  });

  it("creates the missing user and order before completing approval for a guest bank transfer", async () => {
    const { service, prisma, tx, signupNotificationsService, notificationsService } =
      createService();
    const servicePrivate = getPaymentsServicePrivate(service);

    prisma.payment.findUnique.mockResolvedValue({
      id: "payment_3",
      provider: PaymentProvider.BANK_TRANSFER,
      status: PaymentStatus.AWAITING_APPROVAL,
      payerEmail: "guest@example.com",
      payerName: "Guest Writer",
      amount: 98000,
      currency: "NGN",
      providerRef: "BT-003",
      metadata: {
        locale: "en",
        fullName: "Guest Writer",
        phone: "+2348123456789",
        packageSlug: "legacy",
        totalPrice: 98000,
        bookSize: "A5",
        paperColor: "white",
        lamination: "matte",
      },
      userId: null,
      orderId: null,
    });

    tx.user.findUnique.mockResolvedValue(null);
    tx.user.create.mockResolvedValue({
      id: "user_3",
      email: "guest@example.com",
      firstName: "Guest",
      lastName: "Writer",
      phoneNumber: "+2348123456789",
      phoneNumberNormalized: "+2348123456789",
      preferredLanguage: "en",
      password: null,
      isActive: true,
      isVerified: false,
      verificationToken: "signup-token-guest",
      tokenExpiry: new Date("2026-03-14T12:00:00.000Z"),
    });
    tx.order.create.mockResolvedValue({
      id: "order_3",
      orderNumber: "BP-2026-0003",
      createdAt: new Date("2026-03-13T12:10:00.000Z"),
    });
    tx.book.create.mockResolvedValue({
      id: "book_3",
      createdAt: new Date("2026-03-13T12:11:00.000Z"),
    });
    tx.payment.update.mockResolvedValue({});
    tx.auditLog.createMany.mockResolvedValue({ count: 2 });
    tx.auditLog.create.mockResolvedValue({ id: "audit_3" });
    notificationsService.createOrderStatusNotification.mockResolvedValue(undefined);
    signupNotificationsService.sendRegistrationLink.mockResolvedValue({
      emailDelivered: true,
      whatsappDelivered: false,
    });

    servicePrivate.resolvePackageFromCheckoutMetadata = jest.fn().mockResolvedValue({
      id: "pkg_1",
      name: "Legacy",
      basePrice: 98000,
    });
    servicePrivate.generateOrderNumber = jest.fn().mockResolvedValue("BP-2026-0003");
    servicePrivate.resolveAppliedCouponForOrder = jest.fn().mockResolvedValue(null);
    servicePrivate.createOrderAddonsFromMetadata = jest.fn().mockResolvedValue(undefined);
    servicePrivate.resolveAddonNamesFromMetadata = jest.fn().mockResolvedValue([]);

    const result = await service.approveBankTransfer({
      paymentId: "payment_3",
      adminId: "admin_3",
      adminNote: "Approved for guest checkout flow",
    });

    expect(tx.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "guest@example.com",
          firstName: "Guest",
          lastName: "Writer",
          preferredLanguage: "en",
          isActive: true,
          verificationToken: expect.any(String),
          tokenExpiry: expect.any(Date),
        }),
      })
    );
    expect(tx.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user_3",
          packageId: "pkg_1",
          status: OrderStatus.PAID,
        }),
      })
    );
    expect(tx.payment.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: "payment_3" },
        data: {
          userId: "user_3",
          orderId: "order_3",
        },
      })
    );
    expect(signupNotificationsService.sendRegistrationLink).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "guest@example.com",
        locale: "en",
        orderNumber: "BP-2026-0003",
        packageName: "Legacy",
        token: expect.any(String),
      })
    );
    expect(result).toEqual({
      id: "payment_3",
      status: PaymentStatus.SUCCESS,
      message: "Bank transfer approved successfully.",
    });
  });
});
