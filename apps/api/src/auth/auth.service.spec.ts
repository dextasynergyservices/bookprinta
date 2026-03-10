import { BadRequestException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { AuthService } from "./auth.service.js";

describe("AuthService login instrumentation", () => {
  const originalEnv = { ...process.env };

  const buildService = () => {
    const prisma = {
      user: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
      },
      order: {
        findFirst: jest.fn(),
      },
      orderAddon: {
        findMany: jest.fn(),
      },
    };

    const signupNotificationsService = {
      sendVerificationChallenge: jest.fn(),
      sendWelcomeEmail: jest.fn(),
      sendRegistrationLink: jest.fn(),
    };

    const pinoLogger = {
      setContext: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    const service = new AuthService(
      prisma as never,
      signupNotificationsService as never,
      pinoLogger as never
    );

    return {
      prisma,
      pinoLogger,
      service,
    };
  };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      JWT_SECRET: "test-secret",
      NODE_ENV: "production",
      FRONTEND_URL: "http://localhost:3000",
      RECAPTCHA_SECRET_KEY: "recaptcha-secret",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it("logs structured timing data for a successful email login", async () => {
    const { prisma, pinoLogger, service } = buildService();
    const storedPasswordHash = await bcrypt.hash("Password123!", 4);

    prisma.user.findFirst.mockResolvedValue({
      id: "user-1",
      email: "writer@example.com",
      role: "USER",
      firstName: "Writer",
      lastName: "Example",
      password: storedPasswordHash,
      isVerified: true,
    });
    prisma.user.update.mockResolvedValue({});

    jest.spyOn(global, "fetch").mockResolvedValue({
      json: async () => ({ success: true, score: 0.9 }),
    } as Response);

    await service.login(
      {
        identifier: "writer@example.com",
        password: "Password123!",
        recaptchaToken: "recaptcha-token",
      } as never,
      {
        correlationId: "corr-success",
        clientRecaptchaDurationMs: 412,
      }
    );

    expect(pinoLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "auth.login.timing",
        correlationId: "corr-success",
        clientRecaptchaDurationMs: 412,
        identifierType: "email",
        outcome: "success",
        errorCode: null,
        refreshTokenStorageStrategy: "digest",
        userFound: true,
        verifyRecaptchaDurationMs: expect.any(Number),
        userLookupDurationMs: expect.any(Number),
        passwordCompareDurationMs: expect.any(Number),
        refreshTokenHashDurationMs: expect.any(Number),
        refreshTokenPersistDurationMs: expect.any(Number),
        totalDurationMs: expect.any(Number),
      }),
      "Auth login timing"
    );
  });

  it("logs structured timing data when reCAPTCHA verification fails", async () => {
    const { pinoLogger, service } = buildService();

    jest.spyOn(global, "fetch").mockResolvedValue({
      json: async () => ({ success: false, score: 0.1 }),
    } as Response);

    await expect(
      service.login(
        {
          identifier: "writer@example.com",
          password: "Password123!",
          recaptchaToken: "recaptcha-token",
        } as never,
        {
          correlationId: "corr-recaptcha-failure",
          clientRecaptchaDurationMs: 188,
        }
      )
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(pinoLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "auth.login.timing",
        correlationId: "corr-recaptcha-failure",
        clientRecaptchaDurationMs: 188,
        identifierType: "email",
        outcome: "failure",
        errorCode: "AUTH_RECAPTCHA_FAILED",
        refreshTokenStorageStrategy: "digest",
        refreshTokenHashDurationMs: null,
        refreshTokenPersistDurationMs: null,
        totalDurationMs: expect.any(Number),
      }),
      "Auth login timing"
    );
  });

  it("uses normalized exact phone lookup instead of multi-candidate fanout", async () => {
    const { prisma, pinoLogger, service } = buildService();
    const storedPasswordHash = await bcrypt.hash("Password123!", 4);

    prisma.user.findMany.mockResolvedValue([
      {
        id: "user-phone-1",
        email: "phone@example.com",
        role: "USER",
        firstName: "Phone",
        lastName: "User",
        password: storedPasswordHash,
        isVerified: true,
      },
    ]);
    prisma.user.update.mockResolvedValue({});

    jest.spyOn(global, "fetch").mockResolvedValue({
      json: async () => ({ success: true, score: 0.92 }),
    } as Response);

    await service.login(
      {
        identifier: "0801 234 5678",
        password: "Password123!",
        recaptchaToken: "recaptcha-token",
      } as never,
      {
        correlationId: "corr-phone-success",
        clientRecaptchaDurationMs: 205,
      }
    );

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ phoneNumberNormalized: "+2348012345678" }, { phoneNumber: "0801 234 5678" }],
        },
      })
    );

    expect(pinoLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationId: "corr-phone-success",
        identifierType: "phone",
        phoneLookupStrategy: "normalized_exact",
        phoneMatchCount: 1,
        outcome: "success",
      }),
      "Auth login timing"
    );
  });
});
