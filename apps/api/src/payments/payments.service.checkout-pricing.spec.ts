/// <reference types="jest" />
import { ConflictException } from "@nestjs/common";
import { withSignedCheckoutPricing } from "../../test/helpers/checkout-pricing.js";
import { PaymentsService } from "./payments.service.js";

/**
 * End-to-end guarantees of server-side checkout pricing (audit finding #1):
 * the browser can no longer choose what it pays, and an Order is never created
 * for less than the server's price.
 */

const PACKAGE = {
  id: "pkg_legacy",
  slug: "legacy",
  name: "Legacy",
  basePrice: 150000,
  includesISBN: false,
  categoryId: "cat_1",
};

type Private = {
  createCheckoutEntitiesFromMetadata: (params: {
    paymentId: string;
    payerEmail: string | null;
    metadata: Record<string, unknown> | null;
    amount: number;
    currency: string;
    existingUserId?: string | null;
  }) => Promise<unknown>;
};

function createService() {
  process.env.FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

  const prisma = {
    paymentGateway: { findUnique: jest.fn().mockResolvedValue({ isEnabled: true }) },
    user: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    payment: { create: jest.fn() },
    package: { findFirst: jest.fn().mockResolvedValue(PACKAGE) },
    addon: { findMany: jest.fn().mockResolvedValue([]) },
    coupon: { findUnique: jest.fn().mockResolvedValue(null) },
    customQuote: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };

  const paystackService = {
    isAvailable: true,
    initialize: jest.fn().mockResolvedValue({
      authorization_url: "https://paystack.test/checkout",
      reference: "ref_1",
      access_code: "ac_1",
    }),
  };

  const service = new PaymentsService(
    prisma as never,
    paystackService as never,
    { isAvailable: true, initialize: jest.fn() } as never,
    { isAvailable: true, initialize: jest.fn() } as never,
    {} as never,
    {} as never,
    { sendRegistrationLink: jest.fn() } as never,
    { createOrderStatusNotification: jest.fn() } as never,
    {} as never,
    null,
    null
  );

  return {
    service,
    prisma,
    paystackService,
    createEntities: (service as unknown as Private).createCheckoutEntitiesFromMetadata.bind(
      service
    ),
  };
}

const checkoutMetadata = {
  paymentFlow: "CHECKOUT",
  packageId: "pkg_legacy",
  packageSlug: "legacy",
  fullName: "Ada Okafor",
  phone: "+2348012345678",
  addons: [],
};

describe("PaymentsService server-side checkout pricing", () => {
  beforeEach(() => jest.clearAllMocks());

  it("charges the server price and signs the metadata sent to the provider", async () => {
    const { service, paystackService } = createService();

    await service.initializePublic({
      provider: "PAYSTACK",
      email: "ada@example.com",
      amount: 150000,
      currency: "NGN",
      metadata: { ...checkoutMetadata, totalPrice: 150000, basePrice: 150000 },
    });

    const call = paystackService.initialize.mock.calls[0][0];
    expect(call.amount).toBe(150000);
    expect(call.currency).toBe("NGN");
    expect(call.metadata).toEqual(
      expect.objectContaining({
        totalPrice: 150000,
        basePrice: 150000,
        pricingVersion: 1,
        pricingSignature: expect.stringMatching(/^[0-9a-f]{64}$/),
      })
    );
  });

  it("refuses a tampered amount instead of charging it", async () => {
    const { service, paystackService } = createService();

    await expect(
      service.initializePublic({
        provider: "PAYSTACK",
        email: "ada@example.com",
        amount: 100,
        currency: "NGN",
        metadata: { ...checkoutMetadata, totalPrice: 100, basePrice: 100 },
      })
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        errorCode: "CHECKOUT_PRICE_MISMATCH",
        expectedAmount: 150000,
      }),
    });
    expect(paystackService.initialize).not.toHaveBeenCalled();
  });

  it("refuses a non-NGN currency", async () => {
    const { service, paystackService } = createService();

    await expect(
      service.initializePublic({
        provider: "PAYSTACK",
        email: "ada@example.com",
        amount: 150000,
        currency: "USD",
        metadata: checkoutMetadata,
      })
    ).rejects.toMatchObject({
      response: expect.objectContaining({ errorCode: "CHECKOUT_CURRENCY_UNSUPPORTED" }),
    });
    expect(paystackService.initialize).not.toHaveBeenCalled();
  });

  it("ignores a client-asserted dashboardUserId on the public endpoint", async () => {
    const { service, prisma, paystackService } = createService();

    await service.initializePublic({
      provider: "PAYSTACK",
      email: "attacker@example.com",
      amount: 150000,
      currency: "NGN",
      metadata: { ...checkoutMetadata, source: "dashboard", dashboardUserId: "user_victim" },
    });

    expect(prisma.payment.create).not.toHaveBeenCalled();
    const sent = paystackService.initialize.mock.calls[0][0].metadata;
    expect(sent.dashboardUserId).toBeUndefined();
    expect(sent.source).toBeUndefined();
  });

  it("ignores pre-signed pricing smuggled in by the client", async () => {
    const { service, paystackService } = createService();
    const forged = withSignedCheckoutPricing({ ...checkoutMetadata, totalPrice: 150000 });

    await service.initializePublic({
      provider: "PAYSTACK",
      email: "ada@example.com",
      amount: 150000,
      currency: "NGN",
      metadata: { ...forged, checkout_state: JSON.stringify({ totalPrice: 1 }) },
    });

    const sent = paystackService.initialize.mock.calls[0][0].metadata;
    expect(sent.checkout_state).toBeUndefined();
    expect(sent.totalPrice).toBe(150000);
  });

  it("charges the admin-set quote price for custom-quote checkouts", async () => {
    const { service, prisma, paystackService } = createService();
    prisma.customQuote.findUnique.mockResolvedValue({ finalPrice: 420000 });

    await expect(
      service.initializePublic({
        provider: "PAYSTACK",
        email: "ada@example.com",
        amount: 1000,
        currency: "NGN",
        metadata: {
          paymentFlow: "CUSTOM_QUOTE",
          customQuoteId: "quote_1",
          quoteTitle: "My Story",
          quoteQuantity: 100,
          quotePrintSize: "A5",
          quoteFinalPrice: 1000,
        },
      })
    ).rejects.toBeInstanceOf(ConflictException);
    expect(paystackService.initialize).not.toHaveBeenCalled();
  });

  describe("fulfilment", () => {
    it("creates no order when a signed checkout was underpaid", async () => {
      const { createEntities, prisma } = createService();

      await expect(
        createEntities({
          paymentId: "pay_1",
          payerEmail: "ada@example.com",
          metadata: withSignedCheckoutPricing({ ...checkoutMetadata, totalPrice: 150000 }),
          amount: 100,
          currency: "NGN",
        })
      ).rejects.toMatchObject({
        response: expect.objectContaining({ errorCode: "CHECKOUT_UNDERPAID" }),
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("re-prices unsigned metadata from the database and blocks the underpayment", async () => {
      const { createEntities, prisma } = createService();

      // A charge created outside our initialize flow with a fake low total.
      await expect(
        createEntities({
          paymentId: "pay_forged",
          payerEmail: "ada@example.com",
          metadata: { ...checkoutMetadata, totalPrice: 100, basePrice: 100 },
          amount: 100,
          currency: "NGN",
        })
      ).rejects.toMatchObject({
        response: expect.objectContaining({ errorCode: "CHECKOUT_UNDERPAID" }),
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("blocks a correctly-sized payment made in the wrong currency", async () => {
      const { createEntities } = createService();

      await expect(
        createEntities({
          paymentId: "pay_usd",
          payerEmail: "ada@example.com",
          metadata: withSignedCheckoutPricing({ ...checkoutMetadata, totalPrice: 150000 }),
          amount: 150000,
          currency: "USD",
        })
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("proceeds to create the order when the payment covers the signed price", async () => {
      const { createEntities, prisma } = createService();
      prisma.$transaction.mockResolvedValue({ orderNumber: "BP-1" });

      await createEntities({
        paymentId: "pay_ok",
        payerEmail: "ada@example.com",
        metadata: withSignedCheckoutPricing({ ...checkoutMetadata, totalPrice: 150000 }),
        amount: 150000,
        currency: "NGN",
      });

      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });
});
