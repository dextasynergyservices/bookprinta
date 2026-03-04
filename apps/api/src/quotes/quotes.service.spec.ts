/// <reference types="jest" />
import type { CreateQuoteInput } from "@bookprinta/shared";
import { BadRequestException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { PrismaService } from "../prisma/prisma.service.js";
import { QuotesService } from "./quotes.service.js";

const mockPrismaService = {
  systemSetting: {
    findMany: jest.fn(),
  },
  customQuote: {
    create: jest.fn(),
  },
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
  const originalFetch = global.fetch;

  beforeEach(async () => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.RECAPTCHA_SECRET_KEY = originalRecaptchaSecretKey;
    process.env.RESEND_API_KEY = "";
    global.fetch = originalFetch;

    const module: TestingModule = await Test.createTestingModule({
      providers: [QuotesService, { provide: PrismaService, useValue: mockPrismaService }],
    }).compile();

    service = module.get<QuotesService>(QuotesService);
    jest.clearAllMocks();
    mockPrismaService.systemSetting.findMany.mockResolvedValue([]);
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.RECAPTCHA_SECRET_KEY = originalRecaptchaSecretKey;
    process.env.RESEND_API_KEY = originalResendApiKey;
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
});
