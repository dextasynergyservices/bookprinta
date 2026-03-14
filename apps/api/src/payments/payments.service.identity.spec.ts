/// <reference types="jest" />
import { ConflictException } from "@nestjs/common";
import { PaymentsService } from "./payments.service.js";

type CreateCheckoutEntitiesFromMetadata = (params: {
  paymentId: string;
  payerEmail: string | null;
  metadata: Record<string, unknown> | null;
  amount: number;
  currency: string;
}) => Promise<unknown>;

function getCreateCheckoutEntitiesFromMetadata(
  service: PaymentsService
): CreateCheckoutEntitiesFromMetadata {
  return (
    service as unknown as {
      createCheckoutEntitiesFromMetadata: CreateCheckoutEntitiesFromMetadata;
    }
  ).createCheckoutEntitiesFromMetadata.bind(service);
}

function createService() {
  process.env.FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

  const tx = {
    user: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    order: {
      create: jest.fn(),
    },
    addon: {
      findMany: jest.fn(),
    },
    orderAddon: {
      createMany: jest.fn(),
    },
    book: {
      create: jest.fn(),
    },
    auditLog: {
      createMany: jest.fn(),
    },
    payment: {
      update: jest.fn(),
    },
    coupon: {
      update: jest.fn(),
    },
  };

  const prisma = {
    paymentGateway: {
      findUnique: jest.fn(),
    },
    user: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    payment: {
      create: jest.fn(),
    },
    package: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
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

  const service = new PaymentsService(
    prisma as never,
    paystackService as never,
    stripeService as never,
    paypalService as never,
    {} as never,
    {} as never,
    { sendRegistrationLink: jest.fn() } as never,
    {
      createOrderStatusNotification: jest.fn(),
      notifyAdminsBankTransferReceived: jest.fn(),
    } as never,
    {} as never
  );

  return {
    prisma,
    tx,
    paystackService,
    service,
  };
}

describe("PaymentsService identity conflicts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("allows payment initialization when the email and phone belong to the same account", async () => {
    const { service, prisma, paystackService } = createService();

    prisma.paymentGateway.findUnique.mockResolvedValue({ isEnabled: true });
    prisma.user.findFirst.mockResolvedValue({
      id: "user_existing",
      email: "author@example.com",
      isActive: true,
    });
    prisma.user.findMany.mockResolvedValue([
      {
        id: "user_existing",
        email: "author@example.com",
      },
    ]);
    paystackService.initialize.mockResolvedValue({
      authorization_url: "https://paystack.test/checkout",
      reference: "pay_ref_identity_ok",
      access_code: "access_identity_ok",
    });

    const result = await service.initialize({
      provider: "PAYSTACK",
      email: "author@example.com",
      amount: 15000,
      currency: "NGN",
      metadata: {
        phone: "+2348012345678",
      },
    });

    expect(paystackService.initialize).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        authorizationUrl: "https://paystack.test/checkout",
        provider: "PAYSTACK",
      })
    );
  });

  it("blocks payment initialization when the email and phone belong to different accounts", async () => {
    const { service, prisma, paystackService } = createService();

    prisma.paymentGateway.findUnique.mockResolvedValue({ isEnabled: true });
    prisma.user.findFirst.mockResolvedValue({
      id: "user_email_owner",
      email: "author@example.com",
      isActive: true,
    });
    prisma.user.findMany.mockResolvedValue([
      {
        id: "user_phone_owner",
        email: "different@example.com",
      },
    ]);

    await expect(
      service.initialize({
        provider: "PAYSTACK",
        email: "author@example.com",
        amount: 15000,
        currency: "NGN",
        metadata: {
          phone: "+2348012345678",
        },
      })
    ).rejects.toThrow(
      "This email and phone number belong to different accounts. Sign in to the correct account or use a different phone number."
    );

    expect(paystackService.initialize).not.toHaveBeenCalled();
  });

  it("blocks payment initialization when the email belongs to a deactivated account", async () => {
    const { service, prisma, paystackService } = createService();

    prisma.paymentGateway.findUnique.mockResolvedValue({ isEnabled: true });
    prisma.user.findFirst.mockResolvedValue({
      id: "user_inactive_email_owner",
      email: "author@example.com",
      isActive: false,
    });

    await expect(
      service.initialize({
        provider: "PAYSTACK",
        email: "author@example.com",
        amount: 15000,
        currency: "NGN",
        metadata: {},
      })
    ).rejects.toThrow(
      "This account has been deactivated. Contact support or an administrator before continuing with payment or account setup."
    );

    expect(paystackService.initialize).not.toHaveBeenCalled();
  });

  it("blocks bank transfer submission when the phone already belongs to another account", async () => {
    const { service, prisma } = createService();

    prisma.paymentGateway.findUnique.mockResolvedValue({ isEnabled: true });
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.findMany.mockResolvedValue([
      {
        id: "user_phone_owner",
        email: "existing@example.com",
      },
    ]);

    await expect(
      service.submitBankTransfer({
        payerName: "Author Example",
        payerEmail: "new@example.com",
        payerPhone: "+2348012345678",
        amount: 15000,
        currency: "NGN",
        receiptUrl: "https://example.com/receipt.png",
        metadata: {},
      })
    ).rejects.toThrow(
      "This phone number is already linked to another account. Use another phone number or sign in to your existing account."
    );
  });

  it("re-runs the phone conflict check before webhook-time user creation", async () => {
    const { service, prisma, tx } = createService();
    const createCheckoutEntitiesFromMetadata = getCreateCheckoutEntitiesFromMetadata(service);

    prisma.package.findFirst.mockResolvedValue({
      id: "pkg_starter",
      name: "Starter",
      basePrice: 50000,
    });
    tx.user.findFirst.mockResolvedValue(null);
    tx.user.findMany.mockResolvedValue([
      {
        id: "user_phone_owner",
        email: "existing@example.com",
      },
    ]);

    await expect(
      createCheckoutEntitiesFromMetadata({
        paymentId: "cmpay_identity_1",
        payerEmail: "new@example.com",
        metadata: {
          fullName: "Author Example",
          phone: "+2348012345678",
          packageSlug: "starter",
        },
        amount: 25000,
        currency: "NGN",
      })
    ).rejects.toBeInstanceOf(ConflictException);

    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it("blocks webhook-time user linking when the checkout email belongs to a deactivated account", async () => {
    const { service, prisma, tx } = createService();
    const createCheckoutEntitiesFromMetadata = getCreateCheckoutEntitiesFromMetadata(service);

    prisma.package.findFirst.mockResolvedValue({
      id: "pkg_starter",
      name: "Starter",
      basePrice: 50000,
    });
    tx.user.findFirst.mockResolvedValue({
      id: "user_inactive_email_owner",
      email: "author@example.com",
      isActive: false,
    });

    await expect(
      createCheckoutEntitiesFromMetadata({
        paymentId: "cmpay_identity_inactive",
        payerEmail: "author@example.com",
        metadata: {
          fullName: "Author Example",
          packageSlug: "starter",
        },
        amount: 25000,
        currency: "NGN",
      })
    ).rejects.toThrow(
      "This account has been deactivated. Contact support or an administrator before continuing with payment or account setup."
    );

    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it("maps a normalized-phone unique race to a conflict exception", async () => {
    const { service, prisma, tx } = createService();
    const createCheckoutEntitiesFromMetadata = getCreateCheckoutEntitiesFromMetadata(service);

    prisma.package.findFirst.mockResolvedValue({
      id: "pkg_starter",
      name: "Starter",
      basePrice: 50000,
    });
    tx.user.findFirst.mockResolvedValue(null);
    tx.user.findMany.mockResolvedValue([]);
    tx.user.create.mockRejectedValue({
      code: "P2002",
      meta: {
        target: ["phoneNumberNormalized"],
      },
    });

    await expect(
      createCheckoutEntitiesFromMetadata({
        paymentId: "cmpay_identity_2",
        payerEmail: "new@example.com",
        metadata: {
          fullName: "Author Example",
          phone: "+2348012345678",
          packageSlug: "starter",
        },
        amount: 25000,
        currency: "NGN",
      })
    ).rejects.toThrow(
      "This phone number is already linked to another account. Use another phone number or sign in to your existing account."
    );
  });
});
