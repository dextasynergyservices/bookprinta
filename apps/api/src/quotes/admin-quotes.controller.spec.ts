/// <reference types="jest" />
import { Test, type TestingModule } from "@nestjs/testing";
import { AdminQuotesController } from "./admin-quotes.controller.js";
import { QuotesService } from "./quotes.service.js";

const quotesServiceMock = {
  findAdminQuotes: jest.fn(),
  findAdminQuoteById: jest.fn(),
  updateAdminQuote: jest.fn(),
  generatePaymentLink: jest.fn(),
  revokePaymentLink: jest.fn(),
};

describe("AdminQuotesController", () => {
  let controller: AdminQuotesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminQuotesController],
      providers: [
        {
          provide: QuotesService,
          useValue: quotesServiceMock,
        },
      ],
    }).compile();

    controller = module.get<AdminQuotesController>(AdminQuotesController);
    jest.resetAllMocks();
  });

  it("delegates GET /admin/quotes to the service with validated query", async () => {
    const query = {
      limit: 20,
      q: "ada",
      status: "PENDING",
      sortBy: "createdAt",
      sortDirection: "desc",
    } as const;

    quotesServiceMock.findAdminQuotes.mockResolvedValue({
      items: [
        {
          id: "cmquote0000000000000000001",
          fullName: "Ada Lovelace",
          email: "ada@example.com",
          workingTitle: "My Book",
          bookPrintSize: "A5",
          quantity: 100,
          estimate: {
            mode: "RANGE",
            estimatedPriceLow: 100000,
            estimatedPriceHigh: 110000,
            label: "NGN 100,000 - NGN 110,000",
          },
          status: "PENDING",
          paymentLinkStatus: "NOT_SENT",
          createdAt: "2026-03-16T10:00:00.000Z",
          updatedAt: "2026-03-16T10:00:00.000Z",
        },
      ],
      nextCursor: null,
      hasMore: false,
      totalItems: 1,
      limit: 20,
      sortBy: "createdAt",
      sortDirection: "desc",
      sortableFields: ["createdAt", "updatedAt"],
    });

    await expect(controller.findAdminQuotes(query)).resolves.toMatchObject({
      totalItems: 1,
      items: [
        expect.objectContaining({
          fullName: "Ada Lovelace",
          status: "PENDING",
        }),
      ],
    });

    expect(quotesServiceMock.findAdminQuotes).toHaveBeenCalledWith(query);
  });

  it("delegates GET /admin/quotes/:id to the service", async () => {
    const quoteId = "cmquote0000000000000000001";
    quotesServiceMock.findAdminQuoteById.mockResolvedValue({
      id: quoteId,
      status: "PENDING",
      manuscript: {
        workingTitle: "My Book",
        estimatedWordCount: 10000,
      },
      print: {
        bookPrintSize: "A5",
        quantity: 100,
        coverType: "paperback",
      },
      specialRequirements: {
        hasSpecialReqs: false,
        specialReqs: [],
        specialReqsOther: null,
      },
      contact: {
        fullName: "Ada Lovelace",
        email: "ada@example.com",
        phone: "+2348012345678",
      },
      estimate: {
        mode: "RANGE",
        estimatedPriceLow: 100000,
        estimatedPriceHigh: 110000,
        label: "NGN 100,000 - NGN 110,000",
      },
      adminNotes: null,
      finalPrice: null,
      paymentLink: {
        token: null,
        url: null,
        expiresAt: null,
        generatedAt: null,
        displayStatus: "NOT_SENT",
        validityDays: 7,
      },
      createdAt: "2026-03-16T10:00:00.000Z",
      updatedAt: "2026-03-16T10:00:00.000Z",
    });

    await expect(controller.findAdminQuoteById({ id: quoteId })).resolves.toMatchObject({
      id: quoteId,
      contact: expect.objectContaining({
        fullName: "Ada Lovelace",
      }),
    });

    expect(quotesServiceMock.findAdminQuoteById).toHaveBeenCalledWith(quoteId);
  });

  it("delegates PATCH /admin/quotes/:id with quote id, patch body, and acting admin id", async () => {
    const quoteId = "cmquote0000000000000000001";
    const adminId = "cmadmin000000000000000001";
    const body = {
      adminNotes: "Customer asked for premium paper",
      finalPrice: 190000,
    } as const;

    quotesServiceMock.updateAdminQuote.mockResolvedValue({
      id: quoteId,
      status: "REVIEWING",
      adminNotes: body.adminNotes,
      finalPrice: body.finalPrice,
      updatedAt: "2026-03-16T10:30:00.000Z",
    });

    await expect(
      controller.updateAdminQuote({ id: quoteId }, body, adminId)
    ).resolves.toMatchObject({
      id: quoteId,
      status: "REVIEWING",
    });

    expect(quotesServiceMock.updateAdminQuote).toHaveBeenCalledWith(quoteId, body, adminId);
  });

  it("delegates POST /admin/quotes/:id/payment-link with quote id, body, and acting admin id", async () => {
    const quoteId = "cmquote0000000000000000001";
    const adminId = "cmadmin000000000000000001";
    const body = { finalPrice: 210000 } as const;

    quotesServiceMock.generatePaymentLink.mockResolvedValue({
      id: quoteId,
      status: "PAYMENT_LINK_SENT",
      paymentLink: {
        token: "token-123",
        url: "https://bookprinta.test/pay/token-123",
        expiresAt: "2026-03-23T10:00:00.000Z",
        generatedAt: "2026-03-16T10:00:00.000Z",
        displayStatus: "SENT",
        validityDays: 7,
      },
    });

    await expect(
      controller.generatePaymentLink({ id: quoteId }, body, adminId)
    ).resolves.toMatchObject({
      id: quoteId,
      status: "PAYMENT_LINK_SENT",
      paymentLink: expect.objectContaining({
        displayStatus: "SENT",
      }),
    });

    expect(quotesServiceMock.generatePaymentLink).toHaveBeenCalledWith(quoteId, body, adminId);
  });

  it("delegates DELETE /admin/quotes/:id/payment-link with quote id and acting admin id", async () => {
    const quoteId = "cmquote0000000000000000001";
    const adminId = "cmadmin000000000000000001";
    const body = {
      reason: "Customer requested an updated payment link",
      notifyCustomer: false,
      customerMessage: null,
    };

    quotesServiceMock.revokePaymentLink.mockResolvedValue({
      id: quoteId,
      status: "REVIEWING",
      paymentLink: {
        token: null,
        url: null,
        expiresAt: null,
        generatedAt: null,
        displayStatus: "NOT_SENT",
        validityDays: 7,
      },
      delivery: {
        email: {
          attempted: false,
          delivered: false,
          failureReason: null,
        },
      },
      revoked: true,
    });

    await expect(
      controller.revokePaymentLink({ id: quoteId }, body, adminId)
    ).resolves.toMatchObject({
      id: quoteId,
      revoked: true,
    });

    expect(quotesServiceMock.revokePaymentLink).toHaveBeenCalledWith(quoteId, body, adminId);
  });
});
