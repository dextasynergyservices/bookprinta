/// <reference types="jest" />
import { PaymentProvider, PaymentStatus, PaymentType } from "../generated/prisma/enums.js";
import { QuotesService } from "./quotes.service.js";

function createService() {
  const tx = {
    customQuote: {
      update: jest.fn(),
    },
    payment: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  };

  const prisma = {
    customQuote: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
      callback(tx)
    ),
  };

  const paymentsService = {
    initialize: jest.fn(),
  };

  const service = new QuotesService(prisma as never, paymentsService as never);

  return {
    service,
    prisma,
    tx,
    paymentsService,
  };
}

describe("QuotesService payByToken", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FRONTEND_URL = "https://bookprinta.test";
  });

  it("reuses existing awaiting-approval custom quote bank transfer payment", async () => {
    const { service, prisma, tx } = createService();

    prisma.customQuote.findUnique.mockResolvedValue({
      id: "cmquote1",
      workingTitle: "A Journey",
      fullName: "Ada Lovelace",
      email: "ada@example.com",
      phone: "+2348012345678",
      status: "PAYMENT_LINK_SENT",
      bookPrintSize: "A5",
      quantity: 120,
      finalPrice: 180000,
      paymentLinkExpiresAt: new Date(Date.now() + 60_000),
      order: null,
    });

    tx.payment.findFirst.mockResolvedValue({
      id: "pay_existing",
      status: PaymentStatus.AWAITING_APPROVAL,
    });

    const result = await service.payByToken("tok_123", { provider: "BANK_TRANSFER" });

    expect(tx.payment.create).not.toHaveBeenCalled();
    expect(result).toEqual({
      quoteId: "cmquote1",
      orderId: null,
      status: "PENDING_PAYMENT_APPROVAL",
      redirectTo: "https://bookprinta.test/pay/tok_123?status=awaiting-approval",
      skipFormatting: true,
    });
  });

  it("returns PAID and avoids creating duplicate payment when custom quote payment already succeeded", async () => {
    const { service, prisma, tx } = createService();

    prisma.customQuote.findUnique.mockResolvedValue({
      id: "cmquote2",
      workingTitle: "A Journey",
      fullName: "Ada Lovelace",
      email: "ada@example.com",
      phone: "+2348012345678",
      status: "PAYMENT_LINK_SENT",
      bookPrintSize: "A5",
      quantity: 120,
      finalPrice: 180000,
      paymentLinkExpiresAt: new Date(Date.now() + 60_000),
      order: {
        id: "order_2",
        status: "PENDING_PAYMENT",
      },
    });

    tx.payment.findFirst.mockResolvedValue({
      id: "pay_success",
      status: PaymentStatus.SUCCESS,
    });

    const result = await service.payByToken("tok_paid", { provider: "BANK_TRANSFER" });

    expect(tx.payment.create).not.toHaveBeenCalled();
    expect(tx.customQuote.update).not.toHaveBeenCalled();
    expect(result).toEqual({
      quoteId: "cmquote2",
      orderId: "order_2",
      status: "PAID",
      redirectTo: "https://bookprinta.test/dashboard/orders/order_2",
      skipFormatting: true,
    });
  });

  it("creates a custom quote bank transfer payment with NGN snapshot values when none exists", async () => {
    const { service, prisma, tx } = createService();

    prisma.customQuote.findUnique.mockResolvedValue({
      id: "cmquote3",
      workingTitle: "A Journey",
      fullName: "Ada Lovelace",
      email: "ada@example.com",
      phone: "+2348012345678",
      status: "PAYMENT_LINK_SENT",
      bookPrintSize: "A5",
      quantity: 120,
      finalPrice: 180000,
      paymentLinkExpiresAt: new Date(Date.now() + 60_000),
      order: {
        id: "order_3",
        status: "PENDING_PAYMENT",
      },
    });

    tx.payment.findFirst.mockResolvedValue(null);

    await service.payByToken("tok_new", { provider: "BANK_TRANSFER" });

    expect(tx.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        provider: PaymentProvider.BANK_TRANSFER,
        type: PaymentType.CUSTOM_QUOTE,
        amount: 180000,
        currency: "NGN",
        status: PaymentStatus.AWAITING_APPROVAL,
        payerName: "Ada Lovelace",
        payerEmail: "ada@example.com",
        payerPhone: "+2348012345678",
      }),
    });
  });

  it("rejects expired payment link tokens", async () => {
    const { service, prisma } = createService();

    prisma.customQuote.findUnique.mockResolvedValue({
      id: "cmquote_expired",
      workingTitle: "Old Link",
      fullName: "Ada Lovelace",
      email: "ada@example.com",
      phone: "+2348012345678",
      status: "PAYMENT_LINK_SENT",
      bookPrintSize: "A5",
      quantity: 120,
      finalPrice: 180000,
      paymentLinkExpiresAt: new Date(Date.now() - 1_000),
      order: {
        id: "order_expired",
        status: "PENDING_PAYMENT",
      },
    });

    await expect(service.payByToken("tok_expired", { provider: "PAYSTACK" })).rejects.toThrow(
      "This payment link has expired."
    );
  });

  it("initializes online payment in NGN without creating checkout entities before success", async () => {
    const { service, prisma, tx, paymentsService } = createService();

    prisma.customQuote.findUnique.mockResolvedValue({
      id: "cmquote_online",
      workingTitle: "A Journey",
      fullName: "Ada Lovelace",
      email: "ada@example.com",
      phone: "+2348012345678",
      status: "PAYMENT_LINK_SENT",
      bookPrintSize: "A5",
      quantity: 120,
      finalPrice: 180000,
      paymentLinkExpiresAt: new Date(Date.now() + 60_000),
      order: null,
    });

    paymentsService.initialize.mockResolvedValue({
      authorizationUrl: "https://pay.example/checkout",
      reference: "ref_123",
      provider: "PAYSTACK",
    });

    const result = await service.payByToken("tok_online", { provider: "PAYSTACK" });

    expect(tx.payment.create).not.toHaveBeenCalled();
    expect(paymentsService.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "PAYSTACK",
        amount: 180000,
        currency: "NGN",
        metadata: expect.objectContaining({
          paymentFlow: "CUSTOM_QUOTE",
          customQuoteId: "cmquote_online",
          quoteFinalPrice: 180000,
        }),
      })
    );
    expect(result).toEqual({
      quoteId: "cmquote_online",
      orderId: null,
      status: "PENDING_PAYMENT",
      redirectTo: "https://pay.example/checkout",
      skipFormatting: true,
    });
  });
});
