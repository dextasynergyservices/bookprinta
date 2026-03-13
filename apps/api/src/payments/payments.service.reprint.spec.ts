/// <reference types="jest" />
import { BadRequestException } from "@nestjs/common";
import { PaymentsService } from "./payments.service.js";

function createService() {
  process.env.FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

  const prisma = {
    paymentGateway: {
      findUnique: jest.fn(),
    },
    systemSetting: {
      findUnique: jest.fn(),
    },
    book: {
      findFirst: jest.fn(),
    },
    payment: {
      create: jest.fn(),
      update: jest.fn(),
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

  return { prisma, paystackService, service };
}

describe("PaymentsService reprint initialization", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates a REPRINT payment using the authenticated user's email and server-side price", async () => {
    const { service, prisma, paystackService } = createService();

    prisma.paymentGateway.findUnique.mockResolvedValue({ isEnabled: true });
    prisma.systemSetting.findUnique.mockResolvedValue({ value: "10" });
    prisma.book.findFirst.mockResolvedValue({
      id: "cmbook1",
      orderId: "cmorder1",
      status: "DELIVERED",
      pageCount: 128,
      finalPdfUrl: "https://example.com/final.pdf",
      user: {
        email: "author@example.com",
      },
    });
    prisma.payment.create.mockResolvedValue({ id: "cmpay_reprint_1" });
    paystackService.initialize.mockResolvedValue({
      authorization_url: "https://checkout.paystack.com/reprint",
      reference: "rp_ref_1",
      access_code: "access_rp_1",
    });

    const result = await service.payReprint({
      sourceBookId: "cmbook1",
      copies: 30,
      bookSize: "A4",
      paperColor: "white",
      lamination: "gloss",
      provider: "PAYSTACK",
      userId: "user_1",
      callbackUrl: "https://app.bookprinta.com/en/dashboard/books?bookId=cmbook1&reprint=same",
    });

    expect(prisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider: "PAYSTACK",
          type: "REPRINT",
          amount: 76800,
          userId: "user_1",
          payerEmail: "author@example.com",
          metadata: expect.objectContaining({
            sourceBookId: "cmbook1",
            sourceOrderId: "cmorder1",
            orderType: "REPRINT_SAME",
            copies: 30,
            bookSize: "A4",
            paperColor: "white",
            lamination: "gloss",
            pageCount: 128,
            unitCostPerPage: 20,
          }),
        }),
      })
    );
    expect(paystackService.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "author@example.com",
        amount: 76800,
        callbackUrl: "https://app.bookprinta.com/en/dashboard/books?bookId=cmbook1&reprint=same",
        metadata: expect.objectContaining({
          paymentId: "cmpay_reprint_1",
        }),
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        authorizationUrl: "https://checkout.paystack.com/reprint",
        reference: "rp_ref_1",
        provider: "PAYSTACK",
        paymentId: "cmpay_reprint_1",
      })
    );
  });

  it("blocks same-file reprint payment when the source book has no final PDF", async () => {
    const { service, prisma } = createService();

    prisma.paymentGateway.findUnique.mockResolvedValue({ isEnabled: true });
    prisma.book.findFirst.mockResolvedValue({
      id: "cmbook1",
      orderId: "cmorder1",
      status: "DELIVERED",
      pageCount: 128,
      finalPdfUrl: null,
      user: {
        email: "author@example.com",
      },
    });

    await expect(
      service.payReprint({
        sourceBookId: "cmbook1",
        copies: 30,
        bookSize: "A5",
        paperColor: "white",
        lamination: "gloss",
        provider: "PAYSTACK",
        userId: "user_1",
      })
    ).rejects.toThrow(BadRequestException);

    expect(prisma.payment.create).not.toHaveBeenCalled();
  });
});
