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
      findMany: jest.fn(),
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

  it("creates a REPRINT payment using flat cost formula: ((pageCount × CPP) + COC) × copies", async () => {
    const { service, prisma, paystackService } = createService();

    prisma.paymentGateway.findUnique.mockResolvedValue({ isEnabled: true });
    prisma.systemSetting.findMany.mockResolvedValue([
      { key: "reprint_cost_per_page", value: "15" },
      { key: "reprint_cover_cost", value: "300" },
    ]);
    prisma.book.findFirst.mockResolvedValue({
      id: "cmbook1",
      orderId: "cmorder1",
      status: "DELIVERED",
      productionStatus: "DELIVERED",
      pageCount: 128,
      finalPdfUrl: "https://example.com/final.pdf",
      title: "My Novel",
      user: {
        email: "author@example.com",
        firstName: "Alice",
        phoneNumber: "+2348000000000",
      },
      order: {
        id: "cmorder1",
        bookSize: "A5",
        paperColor: "white",
        lamination: "gloss",
      },
    });
    prisma.payment.create.mockResolvedValue({ id: "cmpay_reprint_1" });
    paystackService.initialize.mockResolvedValue({
      authorization_url: "https://checkout.paystack.com/reprint",
      reference: "rp_ref_1",
      access_code: "access_rp_1",
    });

    // costPerCopy = (128 × 15) + 300 = 2220
    // total = 2220 × 30 = 66600
    const result = await service.payReprint({
      sourceBookId: "cmbook1",
      copies: 30,
      provider: "PAYSTACK",
      userId: "user_1",
      callbackUrl: "https://app.bookprinta.com/en/dashboard/books/cmbook1?reprint=same",
    });

    expect(prisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider: "PAYSTACK",
          type: "REPRINT",
          amount: 66600,
          userId: "user_1",
          payerEmail: "author@example.com",
          metadata: expect.objectContaining({
            sourceBookId: "cmbook1",
            sourceOrderId: "cmorder1",
            orderType: "REPRINT",
            copies: 30,
            bookSize: "A5",
            paperColor: "white",
            lamination: "gloss",
            pageCount: 128,
            costPerPage: 15,
            coverCost: 300,
            costPerCopy: 2220,
          }),
        }),
      })
    );
    expect(paystackService.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "author@example.com",
        amount: 66600,
        callbackUrl: "https://app.bookprinta.com/en/dashboard/books/cmbook1?reprint=same",
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
      productionStatus: "DELIVERED",
      pageCount: 128,
      finalPdfUrl: null,
      title: "My Novel",
      user: {
        email: "author@example.com",
        firstName: "Alice",
        phoneNumber: null,
      },
      order: {
        id: "cmorder1",
        bookSize: "A5",
        paperColor: "white",
        lamination: "gloss",
      },
    });

    await expect(
      service.payReprint({
        sourceBookId: "cmbook1",
        copies: 30,
        provider: "PAYSTACK",
        userId: "user_1",
      })
    ).rejects.toThrow(BadRequestException);

    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it("rejects reprint payment when the source book is not DELIVERED or COMPLETED", async () => {
    const { service, prisma } = createService();

    prisma.paymentGateway.findUnique.mockResolvedValue({ isEnabled: true });
    prisma.book.findFirst.mockResolvedValue({
      id: "cmbook1",
      orderId: "cmorder1",
      status: "PRINTING",
      productionStatus: null,
      pageCount: 128,
      finalPdfUrl: "https://example.com/final.pdf",
      title: "My Novel",
      user: {
        email: "author@example.com",
        firstName: "Alice",
        phoneNumber: null,
      },
      order: {
        id: "cmorder1",
        bookSize: "A5",
        paperColor: "white",
        lamination: "gloss",
      },
    });

    await expect(
      service.payReprint({
        sourceBookId: "cmbook1",
        copies: 5,
        provider: "PAYSTACK",
        userId: "user_1",
      })
    ).rejects.toThrow("Only delivered books can start a reprint from the dashboard.");

    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it("allows reprint when status is not eligible but productionStatus is DELIVERED", async () => {
    const { service, prisma, paystackService } = createService();

    prisma.paymentGateway.findUnique.mockResolvedValue({ isEnabled: true });
    prisma.systemSetting.findMany.mockResolvedValue([
      { key: "reprint_cost_per_page", value: "15" },
      { key: "reprint_cover_cost", value: "300" },
    ]);
    prisma.book.findFirst.mockResolvedValue({
      id: "cmbook1",
      orderId: "cmorder1",
      status: "IN_PRODUCTION",
      productionStatus: "DELIVERED",
      pageCount: 20,
      finalPdfUrl: "https://example.com/final.pdf",
      title: "My Novel",
      user: {
        email: "author@example.com",
        firstName: "Alice",
        phoneNumber: null,
      },
      order: {
        id: "cmorder1",
        bookSize: "A5",
        paperColor: "white",
        lamination: "gloss",
      },
    });
    prisma.payment.create.mockResolvedValue({ id: "cmpay_prod_status" });
    paystackService.initialize.mockResolvedValue({
      authorization_url: "https://checkout.paystack.com/prod",
      reference: "rp_prod_1",
      access_code: "access_prod_1",
    });

    // costPerCopy = (20 × 15) + 300 = 600
    // total = 600 × 2 = 1200
    const result = await service.payReprint({
      sourceBookId: "cmbook1",
      copies: 2,
      provider: "PAYSTACK",
      userId: "user_1",
    });

    expect(prisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 1200,
          type: "REPRINT",
        }),
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        authorizationUrl: "https://checkout.paystack.com/prod",
        paymentId: "cmpay_prod_status",
      })
    );
  });

  it("accepts copies = 1 (minimum) and calculates cost correctly", async () => {
    const { service, prisma, paystackService } = createService();

    prisma.paymentGateway.findUnique.mockResolvedValue({ isEnabled: true });
    prisma.systemSetting.findMany.mockResolvedValue([
      { key: "reprint_cost_per_page", value: "15" },
      { key: "reprint_cover_cost", value: "300" },
    ]);
    prisma.book.findFirst.mockResolvedValue({
      id: "cmbook1",
      orderId: "cmorder1",
      status: "DELIVERED",
      productionStatus: "DELIVERED",
      pageCount: 100,
      finalPdfUrl: "https://example.com/final.pdf",
      title: "My Novel",
      user: {
        email: "author@example.com",
        firstName: "Alice",
        phoneNumber: null,
      },
      order: {
        id: "cmorder1",
        bookSize: "A5",
        paperColor: "white",
        lamination: "gloss",
      },
    });
    prisma.payment.create.mockResolvedValue({ id: "cmpay_single" });
    paystackService.initialize.mockResolvedValue({
      authorization_url: "https://checkout.paystack.com/single",
      reference: "rp_single_1",
      access_code: "access_single_1",
    });

    // costPerCopy = (100 × 15) + 300 = 1800
    // total = 1800 × 1 = 1800
    const result = await service.payReprint({
      sourceBookId: "cmbook1",
      copies: 1,
      provider: "PAYSTACK",
      userId: "user_1",
    });

    expect(prisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 1800,
          type: "REPRINT",
          metadata: expect.objectContaining({
            copies: 1,
            costPerCopy: 1800,
          }),
        }),
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        authorizationUrl: "https://checkout.paystack.com/single",
        paymentId: "cmpay_single",
      })
    );
  });

  it("creates an AWAITING_APPROVAL payment for bank transfer reprint", async () => {
    const { service, prisma } = createService();

    prisma.paymentGateway.findUnique.mockResolvedValue({ isEnabled: true });
    prisma.systemSetting.findMany.mockResolvedValue([
      { key: "reprint_cost_per_page", value: "15" },
      { key: "reprint_cover_cost", value: "300" },
    ]);
    prisma.book.findFirst.mockResolvedValue({
      id: "cmbook1",
      orderId: "cmorder1",
      status: "DELIVERED",
      productionStatus: "DELIVERED",
      pageCount: 200,
      finalPdfUrl: "https://example.com/final.pdf",
      title: "My Novel",
      user: {
        email: "author@example.com",
        firstName: "Alice",
        phoneNumber: null,
      },
      order: {
        id: "cmorder1",
        bookSize: "A5",
        paperColor: "white",
        lamination: "gloss",
      },
    });
    prisma.payment.create.mockResolvedValue({ id: "cmpay_bank_reprint" });

    // costPerCopy = (200 × 15) + 300 = 3300
    // total = 3300 × 10 = 33000
    const result = await service.payReprint({
      sourceBookId: "cmbook1",
      copies: 10,
      provider: "BANK_TRANSFER",
      userId: "user_1",
    });

    expect(prisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider: "BANK_TRANSFER",
          type: "REPRINT",
          amount: 33000,
          status: "AWAITING_APPROVAL",
        }),
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        provider: "BANK_TRANSFER",
        paymentId: "cmpay_bank_reprint",
        amount: 33000,
        status: "AWAITING_APPROVAL",
        bankTransfer: true,
      })
    );
  });

  it("pulls bookSize, paperColor, and lamination from the source order, not the request", async () => {
    const { service, prisma, paystackService } = createService();

    prisma.paymentGateway.findUnique.mockResolvedValue({ isEnabled: true });
    prisma.systemSetting.findMany.mockResolvedValue([
      { key: "reprint_cost_per_page", value: "15" },
      { key: "reprint_cover_cost", value: "300" },
    ]);
    prisma.book.findFirst.mockResolvedValue({
      id: "cmbook1",
      orderId: "cmorder1",
      status: "COMPLETED",
      productionStatus: "COMPLETED",
      pageCount: 50,
      finalPdfUrl: "https://example.com/final.pdf",
      title: "My Novel",
      user: {
        email: "author@example.com",
        firstName: "Alice",
        phoneNumber: null,
      },
      order: {
        id: "cmorder1",
        bookSize: "A4",
        paperColor: "cream",
        lamination: "matt",
      },
    });
    prisma.payment.create.mockResolvedValue({ id: "cmpay_props" });
    paystackService.initialize.mockResolvedValue({
      authorization_url: "https://checkout.paystack.com/props",
      reference: "rp_props_1",
      access_code: "access_props_1",
    });

    await service.payReprint({
      sourceBookId: "cmbook1",
      copies: 5,
      provider: "PAYSTACK",
      userId: "user_1",
    });

    expect(prisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            bookSize: "A4",
            paperColor: "cream",
            lamination: "matt",
          }),
        }),
      })
    );
  });
});
