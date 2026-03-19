/// <reference types="jest" />
import {
  type CreateQuoteInput,
  QUOTE_PAYMENT_LINK_VALIDITY_DAYS,
  QUOTE_PAYMENT_LINK_VALIDITY_MS,
} from "@bookprinta/shared";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { WhatsappService } from "../notifications/whatsapp.service.js";
import { PaymentsService } from "../payments/payments.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { QuotesService } from "./quotes.service.js";

const mockPrismaService = {
  systemSetting: {
    findMany: jest.fn(),
  },
  customQuote: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  auditLog: {
    create: jest.fn(),
    findFirst: jest.fn(),
  },
};

const mockPaymentsService = {
  initialize: jest.fn(),
};

type QuoteDeliverySpyTarget = {
  sendQuoteProposalEmail: (params: {
    locale: "en" | "fr" | "es";
    userName: string;
    email: string;
    paymentUrl: string;
    finalPrice: number;
    adminNotes: string | null;
    proposalPdfUrl?: string;
    quoteId: string;
  }) => Promise<{ attempted: boolean; delivered: boolean; failureReason: string | null }>;
  sendQuoteProposalWhatsApp: (params: {
    locale: "en" | "fr" | "es";
    userName: string;
    phone: string;
    paymentUrl: string;
    finalPrice: number;
    quoteId: string;
  }) => Promise<{ attempted: boolean; delivered: boolean; failureReason: string | null }>;
};

function makeCreateQuoteInput(overrides: Partial<CreateQuoteInput> = {}): CreateQuoteInput {
  return {
    workingTitle: "  Test Manuscript  ",
    estimatedWordCount: 5000,
    bookSize: "A5",
    quantity: 100,
    coverType: "paperback",
    hasSpecialReqs: false,
    specialRequirements: [],
    specialRequirementsOther: "",
    fullName: "  Ada Lovelace  ",
    email: " ADA@Example.com ",
    phone: "  +2348012345678  ",
    estimatedPriceLow: 100000,
    estimatedPriceHigh: 110000,
    ...overrides,
  };
}

describe("QuotesService", () => {
  let service: QuotesService;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalRecaptchaSecretKey = process.env.RECAPTCHA_SECRET_KEY;
  const originalResendApiKey = process.env.RESEND_API_KEY;
  const originalFrontendUrl = process.env.FRONTEND_URL;
  const originalNextPublicAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const originalNextPublicWebUrl = process.env.NEXT_PUBLIC_WEB_URL;
  const originalInfobipBaseUrl = process.env.INFOBIP_BASE_URL;
  const originalInfobipApiBaseUrl = process.env.INFOBIP_API_BASE_URL;
  const originalInfobipBaseUrlAlt = process.env.INFOBIP_BASEURL;
  const originalInfobipApiKey = process.env.INFOBIP_API_KEY;
  const originalInfobipKey = process.env.INFOBIP_KEY;
  const originalInfobipApiKeyAlt = process.env.INFOBIP_APIKEY;
  const originalInfobipWhatsAppFrom = process.env.INFOBIP_WHATSAPP_FROM;
  const originalInfobipWhatsAppSender = process.env.INFOBIP_WHATSAPP_SENDER;
  const originalInfobipWhatsAppNumber = process.env.INFOBIP_WHATSAPP_NUMBER;
  const originalFetch = global.fetch;

  beforeEach(async () => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.RECAPTCHA_SECRET_KEY = originalRecaptchaSecretKey;
    process.env.RESEND_API_KEY = "";
    process.env.FRONTEND_URL = "https://bookprinta.test";
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_WEB_URL;
    delete process.env.INFOBIP_BASE_URL;
    delete process.env.INFOBIP_API_BASE_URL;
    delete process.env.INFOBIP_BASEURL;
    delete process.env.INFOBIP_API_KEY;
    delete process.env.INFOBIP_KEY;
    delete process.env.INFOBIP_APIKEY;
    delete process.env.INFOBIP_WHATSAPP_FROM;
    delete process.env.INFOBIP_WHATSAPP_SENDER;
    delete process.env.INFOBIP_WHATSAPP_NUMBER;
    global.fetch = originalFetch;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotesService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: PaymentsService, useValue: mockPaymentsService },
        WhatsappService,
      ],
    }).compile();

    service = module.get<QuotesService>(QuotesService);
    jest.clearAllMocks();
    mockPrismaService.systemSetting.findMany.mockResolvedValue([]);
    mockPaymentsService.initialize.mockReset();
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.RECAPTCHA_SECRET_KEY = originalRecaptchaSecretKey;
    process.env.RESEND_API_KEY = originalResendApiKey;
    process.env.FRONTEND_URL = originalFrontendUrl;
    process.env.NEXT_PUBLIC_APP_URL = originalNextPublicAppUrl;
    process.env.NEXT_PUBLIC_WEB_URL = originalNextPublicWebUrl;
    process.env.INFOBIP_BASE_URL = originalInfobipBaseUrl;
    process.env.INFOBIP_API_BASE_URL = originalInfobipApiBaseUrl;
    process.env.INFOBIP_BASEURL = originalInfobipBaseUrlAlt;
    process.env.INFOBIP_API_KEY = originalInfobipApiKey;
    process.env.INFOBIP_KEY = originalInfobipKey;
    process.env.INFOBIP_APIKEY = originalInfobipApiKeyAlt;
    process.env.INFOBIP_WHATSAPP_FROM = originalInfobipWhatsAppFrom;
    process.env.INFOBIP_WHATSAPP_SENDER = originalInfobipWhatsAppSender;
    process.env.INFOBIP_WHATSAPP_NUMBER = originalInfobipWhatsAppNumber;
    global.fetch = originalFetch;
  });

  describe("estimate", () => {
    it("uses default estimator settings when SystemSetting values are missing", async () => {
      mockPrismaService.systemSetting.findMany.mockResolvedValue([]);

      const result = await service.estimate({
        estimatedWordCount: 400,
        bookSize: "A5",
        quantity: 2,
      });

      expect(result).toEqual({
        estimatedPriceLow: 0,
        estimatedPriceHigh: 6674,
      });
      expect(mockPrismaService.systemSetting.findMany).toHaveBeenCalledWith({
        where: {
          key: { in: ["quote_cost_per_page", "quote_cover_cost"] },
        },
        select: {
          key: true,
          value: true,
        },
      });
    });

    it("uses persisted estimator settings when available", async () => {
      mockPrismaService.systemSetting.findMany.mockResolvedValue([
        { key: "quote_cost_per_page", value: "100" },
        { key: "quote_cover_cost", value: "3000" },
      ]);

      const result = await service.estimate({
        estimatedWordCount: 200,
        bookSize: "A5",
        quantity: 1,
      });

      expect(result).toEqual({
        estimatedPriceLow: 535,
        estimatedPriceHigh: 10535,
      });
    });

    it("falls back to defaults when SystemSetting values are invalid", async () => {
      mockPrismaService.systemSetting.findMany.mockResolvedValue([
        { key: "quote_cost_per_page", value: "-5" },
        { key: "quote_cover_cost", value: "not-a-number" },
      ]);

      const result = await service.estimate({
        estimatedWordCount: 200,
        bookSize: "A5",
        quantity: 1,
      });

      expect(result).toEqual({
        estimatedPriceLow: 0,
        estimatedPriceHigh: 5824,
      });
    });

    it("applies A4 and A6 size multipliers", async () => {
      mockPrismaService.systemSetting.findMany.mockResolvedValue([]);

      const a4Result = await service.estimate({
        estimatedWordCount: 400,
        bookSize: "A4",
        quantity: 2,
      });
      const a6Result = await service.estimate({
        estimatedWordCount: 400,
        bookSize: "A6",
        quantity: 2,
      });

      expect(a4Result).toEqual({
        estimatedPriceLow: 0,
        estimatedPriceHigh: 8348,
      });
      expect(a6Result).toEqual({
        estimatedPriceLow: 0,
        estimatedPriceHigh: 5837,
      });
    });
  });

  describe("create", () => {
    it("persists a pending quote with null estimates when hasSpecialReqs is true", async () => {
      mockPrismaService.customQuote.create.mockResolvedValue({
        id: "cmquote00001",
        status: "PENDING",
      });

      const result = await service.create(
        makeCreateQuoteInput({
          hasSpecialReqs: true,
          specialRequirements: ["hardback", "other"],
          specialRequirementsOther: "  Please use premium paper. ",
          estimatedPriceLow: null,
          estimatedPriceHigh: null,
        }),
        { ip: "127.0.0.1", nextLocale: "fr", acceptLanguage: "es-ES,es;q=0.8" }
      );

      expect(result).toEqual({
        id: "cmquote00001",
        status: "PENDING",
        message: "Custom quote submitted successfully.",
      });
      expect(mockPrismaService.customQuote.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: "PENDING",
          workingTitle: "Test Manuscript",
          fullName: "Ada Lovelace",
          email: "ada@example.com",
          phone: "+2348012345678",
          specialReqs: ["hardback", "other"],
          specialReqsOther: "Please use premium paper.",
          estimatedPriceLow: null,
          estimatedPriceHigh: null,
        }),
        select: {
          id: true,
          status: true,
        },
      });
    });

    it("calculates estimate server-side when hasSpecialReqs is false", async () => {
      mockPrismaService.customQuote.create.mockResolvedValue({
        id: "cmquote00002",
        status: "PENDING",
      });

      await service.create(makeCreateQuoteInput(), {
        ip: "127.0.0.1",
        nextLocale: undefined,
        acceptLanguage: "es-ES,es;q=0.9",
      });

      expect(mockPrismaService.customQuote.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          hasSpecialReqs: false,
          specialReqs: [],
          specialReqsOther: null,
          estimatedPriceLow: 109750,
          estimatedPriceHigh: 119750,
        }),
        select: {
          id: true,
          status: true,
        },
      });
    });

    it("skips reCAPTCHA verification when token is missing (optional) even in production", async () => {
      process.env.NODE_ENV = "production";
      process.env.RECAPTCHA_SECRET_KEY = "test-secret";
      global.fetch = jest.fn() as unknown as typeof fetch;
      mockPrismaService.customQuote.create.mockResolvedValue({
        id: "cmquote00003",
        status: "PENDING",
      });

      await service.create(
        makeCreateQuoteInput({
          recaptchaToken: undefined,
        }),
        { ip: "127.0.0.1" }
      );

      expect(global.fetch).not.toHaveBeenCalled();
      expect(mockPrismaService.customQuote.create).toHaveBeenCalledTimes(1);
    });

    it("throws BadRequestException when provided reCAPTCHA token fails verification", async () => {
      process.env.NODE_ENV = "production";
      process.env.RECAPTCHA_SECRET_KEY = "test-secret";
      global.fetch = jest.fn().mockResolvedValue({
        json: async () => ({ success: false, score: 0.1 }),
      }) as unknown as typeof fetch;

      const submissionPromise = service.create(
        makeCreateQuoteInput({
          recaptchaToken: "invalid-token",
        }),
        { ip: "127.0.0.1" }
      );

      await expect(submissionPromise).rejects.toThrow(BadRequestException);
      await expect(submissionPromise).rejects.toThrow(
        "reCAPTCHA verification failed. Please try again."
      );
      expect(mockPrismaService.customQuote.create).not.toHaveBeenCalled();
    });
  });

  describe("admin payment links", () => {
    it("throws NotFoundException when generating a payment link for an unknown quote", async () => {
      mockPrismaService.customQuote.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.generatePaymentLink(
          "cmunknown000000000000000001",
          { finalPrice: 150000 },
          "cmadmin000000000000000001"
        )
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("throws BadRequestException when generating a payment link for a paid quote", async () => {
      mockPrismaService.customQuote.findUnique.mockResolvedValueOnce({
        id: "cmquotepaid000000000000001",
        status: "PAID",
        finalPrice: 150000,
        paymentLinkToken: null,
        paymentLinkExpiresAt: null,
      });

      await expect(
        service.generatePaymentLink(
          "cmquotepaid000000000000001",
          { finalPrice: 150000 },
          "cmadmin000000000000000001"
        )
      ).rejects.toThrow(BadRequestException);

      expect(mockPrismaService.customQuote.update).not.toHaveBeenCalled();
    });

    it("throws BadRequestException when generating a payment link for a non-payable quote status", async () => {
      mockPrismaService.customQuote.findUnique.mockResolvedValueOnce({
        id: "cmquoterejected0000000001",
        status: "REJECTED",
        finalPrice: null,
        paymentLinkToken: null,
        paymentLinkExpiresAt: null,
      });

      await expect(
        service.generatePaymentLink(
          "cmquoterejected0000000001",
          { finalPrice: 145000 },
          "cmadmin000000000000000001"
        )
      ).rejects.toThrow(BadRequestException);

      expect(mockPrismaService.customQuote.update).not.toHaveBeenCalled();
    });

    it("prevents duplicate active payment token generation", async () => {
      mockPrismaService.customQuote.findUnique.mockResolvedValueOnce({
        id: "cmquotesentactive00000001",
        status: "PAYMENT_LINK_SENT",
        finalPrice: 170000,
        paymentLinkToken: "existing-active-token",
        paymentLinkExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      await expect(
        service.generatePaymentLink(
          "cmquotesentactive00000001",
          { finalPrice: 170000 },
          "cmadmin000000000000000001"
        )
      ).rejects.toThrow(BadRequestException);

      expect(mockPrismaService.customQuote.update).not.toHaveBeenCalled();
    });

    it("throws BadRequestException when frontend URL is not configured for payment-link generation", async () => {
      process.env.FRONTEND_URL = "";
      delete process.env.NEXT_PUBLIC_APP_URL;
      delete process.env.NEXT_PUBLIC_WEB_URL;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          QuotesService,
          { provide: PrismaService, useValue: mockPrismaService },
          { provide: PaymentsService, useValue: mockPaymentsService },
          WhatsappService,
        ],
      }).compile();
      const noFrontendService = module.get<QuotesService>(QuotesService);

      mockPrismaService.customQuote.findUnique.mockResolvedValueOnce({
        id: "cmquotepending000000000001",
        status: "PENDING",
        finalPrice: null,
        paymentLinkToken: null,
        paymentLinkExpiresAt: null,
        fullName: "Ada Lovelace",
        email: "ada@example.com",
        phone: "+2348012345678",
        adminNotes: null,
      });

      await expect(
        noFrontendService.generatePaymentLink(
          "cmquotepending000000000001",
          { finalPrice: 120000 },
          "cmadmin000000000000000001"
        )
      ).rejects.toThrow(BadRequestException);

      expect(mockPrismaService.customQuote.update).not.toHaveBeenCalled();
      process.env.FRONTEND_URL = "https://bookprinta.test";
    });

    it("generates a payment link with PAYMENT_LINK_SENT status and audit metadata", async () => {
      mockPrismaService.customQuote.findUnique
        .mockResolvedValueOnce({
          id: "cmquotepending000000000001",
          status: "PENDING",
          finalPrice: null,
          paymentLinkToken: null,
          paymentLinkExpiresAt: null,
          fullName: "Ada Lovelace",
          email: "ada@example.com",
          phone: "+2348012345678",
          adminNotes: "Please complete payment within 7 days.",
        })
        .mockResolvedValueOnce(null);

      const now = new Date("2026-03-16T12:00:00.000Z");
      mockPrismaService.customQuote.update.mockResolvedValueOnce({
        id: "cmquotepending000000000001",
        status: "PAYMENT_LINK_SENT",
        paymentLinkToken: "test-token",
        paymentLinkUrl: "https://bookprinta.test/pay/test-token",
        paymentLinkExpiresAt: new Date("2026-03-23T12:00:00.000Z"),
        updatedAt: now,
      });

      const result = await service.generatePaymentLink(
        "cmquotepending000000000001",
        { finalPrice: 170000 },
        "cmadmin000000000000000001"
      );

      expect(result).toMatchObject({
        id: "cmquotepending000000000001",
        status: "PAYMENT_LINK_SENT",
        paymentLink: {
          token: "test-token",
          url: "https://bookprinta.test/pay/test-token",
          displayStatus: "SENT",
          validityDays: QUOTE_PAYMENT_LINK_VALIDITY_DAYS,
        },
        delivery: {
          email: {
            attempted: false,
            delivered: false,
          },
          whatsapp: {
            attempted: false,
            delivered: false,
          },
        },
      });

      expect(mockPrismaService.customQuote.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "cmquotepending000000000001" },
          data: expect.objectContaining({
            finalPrice: 170000,
            status: "PAYMENT_LINK_SENT",
            paymentLinkUrl: expect.stringContaining("/pay/"),
          }),
        })
      );

      expect(mockPrismaService.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "CUSTOM_QUOTE_PAYMENT_LINK_GENERATED",
            entityType: "CUSTOM_QUOTE",
            entityId: "cmquotepending000000000001",
            details: expect.objectContaining({
              finalPrice: 170000,
              validityDays: QUOTE_PAYMENT_LINK_VALIDITY_DAYS,
            }),
          }),
        })
      );
    });

    it("retries token generation when an initial token collides", async () => {
      mockPrismaService.customQuote.findUnique
        .mockResolvedValueOnce({
          id: "cmquotecollision0000000001",
          status: "PENDING",
          finalPrice: null,
          paymentLinkToken: null,
          paymentLinkExpiresAt: null,
          fullName: "Ada Lovelace",
          email: "ada@example.com",
          phone: "+2348012345678",
          adminNotes: null,
        })
        .mockResolvedValueOnce({ id: "taken-token" })
        .mockResolvedValueOnce(null);

      mockPrismaService.customQuote.update.mockResolvedValueOnce({
        id: "cmquotecollision0000000001",
        status: "PAYMENT_LINK_SENT",
        paymentLinkToken: "retried-token",
        paymentLinkUrl: "https://bookprinta.test/pay/retried-token",
        paymentLinkExpiresAt: new Date("2026-03-23T12:00:00.000Z"),
        updatedAt: new Date("2026-03-16T12:00:00.000Z"),
      });

      await service.generatePaymentLink(
        "cmquotecollision0000000001",
        { finalPrice: 190000 },
        "cmadmin000000000000000001"
      );

      expect(mockPrismaService.customQuote.findUnique).toHaveBeenCalledTimes(3);
      expect(mockPrismaService.customQuote.findUnique).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ where: { id: "cmquotecollision0000000001" } })
      );
      expect(mockPrismaService.customQuote.findUnique).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: expect.objectContaining({ paymentLinkToken: expect.any(String) }),
        })
      );
      expect(mockPrismaService.customQuote.findUnique).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({
          where: expect.objectContaining({ paymentLinkToken: expect.any(String) }),
        })
      );
    });

    it("sets payment-link expiry to exactly 7 days from generation time", async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2026-03-16T12:00:00.000Z"));

      mockPrismaService.customQuote.findUnique
        .mockResolvedValueOnce({
          id: "cmquoteexpiry000000000001",
          status: "PENDING",
          finalPrice: null,
          paymentLinkToken: null,
          paymentLinkExpiresAt: null,
          fullName: "Ada Lovelace",
          email: "ada@example.com",
          phone: "+2348012345678",
          adminNotes: null,
        })
        .mockResolvedValueOnce(null);

      mockPrismaService.customQuote.update.mockImplementation(async ({ data }) => ({
        id: "cmquoteexpiry000000000001",
        status: "PAYMENT_LINK_SENT",
        paymentLinkToken: data.paymentLinkToken,
        paymentLinkUrl: data.paymentLinkUrl,
        paymentLinkExpiresAt: data.paymentLinkExpiresAt,
        updatedAt: new Date(),
      }));

      const response = await service.generatePaymentLink(
        "cmquoteexpiry000000000001",
        { finalPrice: 170000 },
        "cmadmin000000000000000001"
      );

      const updateCall = mockPrismaService.customQuote.update.mock.calls[0]?.[0] as
        | { data?: { paymentLinkExpiresAt?: Date } }
        | undefined;

      expect(updateCall?.data?.paymentLinkExpiresAt?.getTime()).toBe(
        new Date("2026-03-16T12:00:00.000Z").getTime() + QUOTE_PAYMENT_LINK_VALIDITY_MS
      );
      expect(response.paymentLink.validityDays).toBe(QUOTE_PAYMENT_LINK_VALIDITY_DAYS);

      jest.useRealTimers();
    });

    it("returns success when link is created even if one delivery channel fails", async () => {
      mockPrismaService.customQuote.findUnique
        .mockResolvedValueOnce({
          id: "cmquotedelivery0000000001",
          status: "PENDING",
          finalPrice: null,
          paymentLinkToken: null,
          paymentLinkExpiresAt: null,
          fullName: "Ada Lovelace",
          email: "ada@example.com",
          phone: "+2348012345678",
          adminNotes: null,
        })
        .mockResolvedValueOnce(null);

      mockPrismaService.customQuote.update.mockResolvedValueOnce({
        id: "cmquotedelivery0000000001",
        status: "PAYMENT_LINK_SENT",
        paymentLinkToken: "delivery-token",
        paymentLinkUrl: "https://bookprinta.test/pay/delivery-token",
        paymentLinkExpiresAt: new Date("2026-03-23T12:00:00.000Z"),
        updatedAt: new Date("2026-03-16T12:00:00.000Z"),
      });

      const deliveryTarget = service as unknown as QuoteDeliverySpyTarget;
      jest.spyOn(deliveryTarget, "sendQuoteProposalEmail").mockResolvedValue({
        attempted: true,
        delivered: false,
        failureReason: "SMTP unavailable",
      });
      jest
        .spyOn(deliveryTarget, "sendQuoteProposalWhatsApp")
        .mockResolvedValue({ attempted: true, delivered: true, failureReason: null });

      const result = await service.generatePaymentLink(
        "cmquotedelivery0000000001",
        { finalPrice: 180000 },
        "cmadmin000000000000000001"
      );

      expect(result.status).toBe("PAYMENT_LINK_SENT");
      expect(result.delivery).toMatchObject({
        email: {
          attempted: true,
          delivered: false,
          failureReason: "SMTP unavailable",
        },
        whatsapp: {
          attempted: true,
          delivered: true,
          failureReason: null,
        },
      });
    });

    it("throws NotFoundException when revoking a payment link for an unknown quote", async () => {
      mockPrismaService.customQuote.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.revokePaymentLink(
          "cmunknown000000000000000001",
          { reason: "Regenerate with updated customer contact", notifyCustomer: false },
          "cmadmin000000000000000001"
        )
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("throws BadRequestException when revoking a payment link for a paid quote", async () => {
      mockPrismaService.customQuote.findUnique.mockResolvedValueOnce({
        id: "cmquotepaid000000000000001",
        status: "PAID",
        paymentLinkToken: "token-paid",
        fullName: "Paid User",
        email: "paid@example.com",
      });

      await expect(
        service.revokePaymentLink(
          "cmquotepaid000000000000001",
          { reason: "No longer needed", notifyCustomer: false },
          "cmadmin000000000000000001"
        )
      ).rejects.toThrow(BadRequestException);

      expect(mockPrismaService.customQuote.update).not.toHaveBeenCalled();
    });

    it("revokes a sent payment link and transitions quote status back to REVIEWING", async () => {
      mockPrismaService.customQuote.findUnique.mockResolvedValueOnce({
        id: "cmquotesent00000000000001",
        status: "PAYMENT_LINK_SENT",
        paymentLinkToken: "token-to-revoke",
        fullName: "Ada",
        email: "ada@example.com",
      });
      mockPrismaService.customQuote.update.mockResolvedValueOnce({
        id: "cmquotesent00000000000001",
        status: "REVIEWING",
        paymentLinkToken: null,
        paymentLinkUrl: null,
        paymentLinkExpiresAt: null,
        updatedAt: new Date("2026-03-16T12:05:00.000Z"),
      });

      const result = await service.revokePaymentLink(
        "cmquotesent00000000000001",
        {
          reason: "Customer reported mismatched email and phone",
          notifyCustomer: false,
        },
        "cmadmin000000000000000001"
      );

      expect(result).toMatchObject({
        id: "cmquotesent00000000000001",
        status: "REVIEWING",
        revoked: true,
        paymentLink: {
          token: null,
          url: null,
          displayStatus: "NOT_SENT",
        },
        delivery: {
          email: {
            attempted: false,
            delivered: false,
            failureReason: null,
          },
        },
      });

      expect(mockPrismaService.customQuote.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "REVIEWING",
            paymentLinkToken: null,
            paymentLinkUrl: null,
            paymentLinkExpiresAt: null,
          }),
        })
      );

      expect(mockPrismaService.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "CUSTOM_QUOTE_PAYMENT_LINK_REVOKED",
            entityId: "cmquotesent00000000000001",
            details: expect.objectContaining({
              revokedToken: "token-to-revoke",
              reason: "Customer reported mismatched email and phone",
              notifyCustomer: false,
            }),
          }),
        })
      );
    });

    it("sets quote status to REVIEWING after revoke even when current status is not PAYMENT_LINK_SENT", async () => {
      mockPrismaService.customQuote.findUnique.mockResolvedValueOnce({
        id: "cmquotepending00000000001",
        status: "PENDING",
        paymentLinkToken: "token-pending",
        fullName: "Pending User",
        email: "pending@example.com",
      });
      mockPrismaService.customQuote.update.mockResolvedValueOnce({
        id: "cmquotepending00000000001",
        status: "REVIEWING",
        paymentLinkToken: null,
        paymentLinkUrl: null,
        paymentLinkExpiresAt: null,
        updatedAt: new Date("2026-03-16T12:06:00.000Z"),
      });

      await service.revokePaymentLink(
        "cmquotepending00000000001",
        { reason: "Reissuing updated quote", notifyCustomer: false },
        "cmadmin000000000000000001"
      );

      expect(mockPrismaService.customQuote.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "REVIEWING",
          }),
        })
      );
    });

    it("allows soft-delete for REVIEWING quotes when no active payment link exists", async () => {
      mockPrismaService.auditLog.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      mockPrismaService.customQuote.findUnique.mockResolvedValueOnce({
        id: "cmquotereview000000000001",
        status: "REVIEWING",
        paymentLinkToken: null,
        order: null,
      });

      const result = await service.deleteQuote(
        "cmquotereview000000000001",
        {
          reason: "Customer asked to cancel after revoking the old link",
          confirmText: "DELETE",
        },
        "cmadmin000000000000000001"
      );

      expect(result).toMatchObject({
        id: "cmquotereview000000000001",
        deleted: true,
      });
      expect(mockPrismaService.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "CUSTOM_QUOTE_SOFT_DELETED",
            entityId: "cmquotereview000000000001",
          }),
        })
      );
    });

    it("rejects soft-delete for REVIEWING quotes that still have an active payment link token", async () => {
      mockPrismaService.auditLog.findFirst.mockResolvedValueOnce(null);
      mockPrismaService.customQuote.findUnique.mockResolvedValueOnce({
        id: "cmquotereviewtoken0000001",
        status: "REVIEWING",
        paymentLinkToken: "still-active-token",
        order: null,
      });

      await expect(
        service.deleteQuote(
          "cmquotereviewtoken0000001",
          {
            reason: "Should not delete with active link token",
            confirmText: "DELETE",
          },
          "cmadmin000000000000000001"
        )
      ).rejects.toThrow(BadRequestException);
    });

    it("allows soft-delete for PAYMENT_LINK_SENT quotes when token was cleared", async () => {
      mockPrismaService.auditLog.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      mockPrismaService.customQuote.findUnique.mockResolvedValueOnce({
        id: "cmquotepaymentsent0000001",
        status: "PAYMENT_LINK_SENT",
        paymentLinkToken: null,
        order: null,
      });

      const result = await service.deleteQuote(
        "cmquotepaymentsent0000001",
        {
          reason: "Link revoked and quote should be removed",
          confirmText: "DELETE",
        },
        "cmadmin000000000000000001"
      );

      expect(result).toMatchObject({
        id: "cmquotepaymentsent0000001",
        deleted: true,
      });
    });

    it("rejects soft-delete for PAYMENT_LINK_SENT quotes with active token", async () => {
      mockPrismaService.auditLog.findFirst.mockResolvedValueOnce(null);
      mockPrismaService.customQuote.findUnique.mockResolvedValueOnce({
        id: "cmquotepaymentsenttoken0001",
        status: "PAYMENT_LINK_SENT",
        paymentLinkToken: "active-token",
        order: null,
      });

      await expect(
        service.deleteQuote(
          "cmquotepaymentsenttoken0001",
          {
            reason: "Should not delete with active payment link",
            confirmText: "DELETE",
          },
          "cmadmin000000000000000001"
        )
      ).rejects.toThrow(BadRequestException);
    });
  });
});
