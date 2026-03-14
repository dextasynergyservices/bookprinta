import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { AuthService } from "./auth.service.js";

function expectDeactivatedAuthError(error: unknown) {
  expect(error).toBeInstanceOf(UnauthorizedException);
  expect((error as UnauthorizedException).getResponse()).toEqual(
    expect.objectContaining({
      message:
        "This account has been deactivated. Please contact support or an administrator for assistance.",
      errorCode: "AUTH_ACCOUNT_DEACTIVATED",
    })
  );
}

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
      isActive: true,
      isVerified: true,
    });
    prisma.user.update.mockResolvedValue({});

    jest.spyOn(global, "fetch").mockResolvedValue({
      json: async () => ({ success: true, score: 0.9 }),
    } as Response);

    const result = await service.login(
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

    expect(result.user).toEqual(
      expect.objectContaining({
        firstName: "Writer",
        lastName: "Example",
        displayName: "Writer Example",
        initials: "WE",
      })
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
        isActive: true,
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

  it("builds a trimmed session displayName and initials from stored names", async () => {
    const { prisma, service } = buildService();

    prisma.user.findUnique.mockResolvedValue({
      id: "user-session-1",
      email: "writer@example.com",
      role: "ADMIN",
      firstName: "  Ada   ",
      lastName: "  Okafor  ",
      isActive: true,
    });

    await expect(service.getSessionUser("user-session-1")).resolves.toEqual({
      id: "user-session-1",
      email: "writer@example.com",
      role: "ADMIN",
      firstName: "  Ada   ",
      lastName: "  Okafor  ",
      displayName: "Ada Okafor",
      initials: "AO",
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "user-session-1" },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
      },
    });
  });

  it("rejects login attempts for deactivated accounts", async () => {
    const { prisma, pinoLogger, service } = buildService();
    const storedPasswordHash = await bcrypt.hash("Password123!", 4);

    prisma.user.findFirst.mockResolvedValue({
      id: "user-inactive-1",
      email: "inactive@example.com",
      role: "USER",
      firstName: "Inactive",
      lastName: "Writer",
      password: storedPasswordHash,
      isActive: false,
      isVerified: true,
    });

    jest.spyOn(global, "fetch").mockResolvedValue({
      json: async () => ({ success: true, score: 0.96 }),
    } as Response);

    try {
      await service.login(
        {
          identifier: "inactive@example.com",
          password: "Password123!",
          recaptchaToken: "recaptcha-token",
        } as never,
        {
          correlationId: "corr-inactive-login",
          clientRecaptchaDurationMs: 177,
        }
      );
      throw new Error("Expected inactive account login to be rejected.");
    } catch (error) {
      expectDeactivatedAuthError(error);
    }

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(pinoLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        correlationId: "corr-inactive-login",
        outcome: "failure",
        errorCode: "AUTH_ACCOUNT_DEACTIVATED",
      }),
      "Auth login timing"
    );
  });

  it("rejects inactive session lookups", async () => {
    const { prisma, service } = buildService();

    prisma.user.findUnique.mockResolvedValue({
      id: "user-session-2",
      email: "inactive@example.com",
      role: "EDITOR",
      firstName: "Inactive",
      lastName: "Editor",
      isActive: false,
    });

    try {
      await service.getSessionUser("user-session-2");
      throw new Error("Expected inactive session lookup to be rejected.");
    } catch (error) {
      expectDeactivatedAuthError(error);
    }
  });

  it.each([
    "ADMIN",
    "SUPER_ADMIN",
    "EDITOR",
    "MANAGER",
  ] as const)("uses 1-hour refresh cookie max age for %s", (role) => {
    const { service } = buildService();

    expect(service.getRefreshTokenCookieOptions(role).maxAge).toBe(60 * 60 * 1000);
  });

  it.each([
    "EDITOR",
    "MANAGER",
  ] as const)("persists the admin refresh-token expiry window for %s logins", async (role) => {
    const { prisma, service } = buildService();
    const storedPasswordHash = await bcrypt.hash("Password123!", 4);

    prisma.user.findFirst.mockResolvedValue({
      id: `user-${role.toLowerCase()}`,
      email: `${role.toLowerCase()}@example.com`,
      role,
      firstName: role,
      lastName: "User",
      password: storedPasswordHash,
      isActive: true,
      isVerified: true,
    });
    prisma.user.update.mockResolvedValue({});

    jest.spyOn(global, "fetch").mockResolvedValue({
      json: async () => ({ success: true, score: 0.95 }),
    } as Response);

    const loginStartedAt = Date.now();

    await service.login(
      {
        identifier: `${role.toLowerCase()}@example.com`,
        password: "Password123!",
        recaptchaToken: "recaptcha-token",
      } as never,
      {
        correlationId: `corr-${role.toLowerCase()}`,
        clientRecaptchaDurationMs: 144,
      }
    );

    expect(prisma.user.update).toHaveBeenCalled();

    const refreshTokenExp = prisma.user.update.mock.calls.at(-1)?.[0]?.data?.refreshTokenExp;
    const refreshTokenLifetimeMs = refreshTokenExp.getTime() - loginStartedAt;

    expect(refreshTokenExp).toBeInstanceOf(Date);
    expect(refreshTokenLifetimeMs).toBeLessThanOrEqual(60 * 60 * 1000 + 5_000);
    expect(refreshTokenLifetimeMs).toBeGreaterThan(55 * 60 * 1000);
  });
});
