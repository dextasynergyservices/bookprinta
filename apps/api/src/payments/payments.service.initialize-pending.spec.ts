/// <reference types="jest" />
import { PaymentsService } from "./payments.service.js";

function createService() {
  process.env.FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

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
    paystackService,
    service,
  };
}

describe("PaymentsService initialize pending payments", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("pre-creates a PENDING INITIAL payment for dashboard checkout initialization", async () => {
    const { service, prisma, paystackService } = createService();

    prisma.paymentGateway.findUnique.mockResolvedValue({ isEnabled: true });
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.findMany.mockResolvedValue([]);
    prisma.package.findFirst.mockResolvedValue({
      id: "pkg_dashboard_1",
      name: "Starter",
      basePrice: 15000,
    });
    prisma.payment.create.mockResolvedValue({ id: "payment_dashboard_1" });
    paystackService.initialize.mockResolvedValue({
      authorization_url: "https://paystack.test/dashboard-checkout",
      reference: "pay_ref_dashboard_1",
      access_code: "access_dashboard_1",
    });

    const result = await service.initialize({
      provider: "PAYSTACK",
      email: "author@example.com",
      amount: 15000,
      currency: "NGN",
      metadata: {
        source: "dashboard",
        dashboardUserId: "user_dashboard_1",
        paymentFlow: "CHECKOUT",
        packageId: "pkg_dashboard_1",
        packageSlug: "starter",
        packageName: "Starter",
        fullName: "Author Example",
        phone: "+2348012345678",
        totalPrice: 15000,
        addons: [],
      },
    });

    expect(prisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider: "PAYSTACK",
          type: "INITIAL",
          amount: 15000,
          currency: "NGN",
          status: "PENDING",
          providerRef: "pay_ref_dashboard_1",
          payerEmail: "author@example.com",
          userId: "user_dashboard_1",
          metadata: expect.objectContaining({
            source: "dashboard",
            dashboardUserId: "user_dashboard_1",
            paymentFlow: "CHECKOUT",
            packageId: "pkg_dashboard_1",
          }),
        }),
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        authorizationUrl: "https://paystack.test/dashboard-checkout",
        reference: "pay_ref_dashboard_1",
        provider: "PAYSTACK",
      })
    );
  });

  it("does not pre-create a payment for public checkout initialization", async () => {
    const { service, prisma, paystackService } = createService();

    prisma.paymentGateway.findUnique.mockResolvedValue({ isEnabled: true });
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.findMany.mockResolvedValue([]);
    prisma.package.findFirst.mockResolvedValue({
      id: "pkg_public_1",
      name: "Starter",
      basePrice: 15000,
    });
    paystackService.initialize.mockResolvedValue({
      authorization_url: "https://paystack.test/public-checkout",
      reference: "pay_ref_public_1",
      access_code: "access_public_1",
    });

    await service.initialize({
      provider: "PAYSTACK",
      email: "public@example.com",
      amount: 15000,
      currency: "NGN",
      metadata: {
        paymentFlow: "CHECKOUT",
        packageId: "pkg_public_1",
        packageSlug: "starter",
        packageName: "Starter",
        fullName: "Public Author",
        phone: "+2348012345678",
        totalPrice: 15000,
        addons: [],
      },
    });

    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it("does not pre-create an INITIAL payment for dashboard custom-quote initialization", async () => {
    const { service, prisma, paystackService } = createService();

    prisma.paymentGateway.findUnique.mockResolvedValue({ isEnabled: true });
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.findMany.mockResolvedValue([]);
    paystackService.initialize.mockResolvedValue({
      authorization_url: "https://paystack.test/custom-quote",
      reference: "pay_ref_quote_1",
      access_code: "access_quote_1",
    });

    const result = await service.initialize({
      provider: "PAYSTACK",
      email: "quote@example.com",
      amount: 50000,
      currency: "NGN",
      metadata: {
        source: "dashboard",
        dashboardUserId: "user_dashboard_1",
        paymentFlow: "CUSTOM_QUOTE",
        customQuoteId: "quote_1",
        quoteTitle: "Special Quote Project",
        quoteQuantity: 200,
        quotePrintSize: "A5",
        quoteFinalPrice: 50000,
        fullName: "Quote Author",
        phone: "+2348012345678",
      },
    });

    expect(prisma.payment.create).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        authorizationUrl: "https://paystack.test/custom-quote",
        reference: "pay_ref_quote_1",
        provider: "PAYSTACK",
      })
    );
  });
});
