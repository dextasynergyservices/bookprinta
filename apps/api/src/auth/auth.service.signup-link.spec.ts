/// <reference types="jest" />
import { NotFoundException, UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { AuthService } from "./auth.service.js";

type MutableUserState = {
  id: string;
  email: string;
  role: "USER";
  firstName: string;
  lastName: string | null;
  phoneNumber: string | null;
  preferredLanguage: "en" | "fr" | "es";
  isActive: boolean;
  isVerified: boolean;
  password: string | null;
  verificationCode: string | null;
  verificationToken: string | null;
  tokenExpiry: Date | null;
  refreshToken: string | null;
  refreshTokenExp: Date | null;
};

type AuthServicePrivate = {
  generateSecureToken: () => string;
  generateVerificationCode: () => string;
};

function getAuthServicePrivate(service: AuthService) {
  return service as unknown as AuthServicePrivate;
}

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

function buildService(initialState: Partial<MutableUserState> = {}) {
  const userState: MutableUserState = {
    id: "user_signup_1",
    email: "ada@example.com",
    role: "USER",
    firstName: "Ada",
    lastName: "Okafor",
    phoneNumber: "+2348012345678",
    preferredLanguage: "en",
    isActive: true,
    isVerified: false,
    password: null,
    verificationCode: null,
    verificationToken: "signup-token-old",
    tokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
    refreshToken: null,
    refreshTokenExp: null,
    ...initialState,
  };

  const latestOrder = {
    id: "order_signup_1",
    orderNumber: "BP-2026-0101",
    totalAmount: 125000,
    currency: "NGN",
    package: {
      name: "Legacy",
    },
  };

  const prisma = {
    user: {
      findUnique: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (typeof where.verificationToken === "string") {
          return userState.verificationToken === where.verificationToken ? { ...userState } : null;
        }

        if (typeof where.email === "string") {
          return userState.email === where.email ? { ...userState } : null;
        }

        if (typeof where.id === "string") {
          return userState.id === where.id ? { ...userState } : null;
        }

        return null;
      }),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }) => {
          if (typeof where.id === "string" && where.id !== userState.id) {
            throw new Error(`Unexpected user id ${String(where.id)}`);
          }

          Object.assign(userState, data);
          return { ...userState };
        }
      ),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    order: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (where.userId !== userState.id) return null;
        return latestOrder;
      }),
    },
    orderAddon: {
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        if (where.orderId !== latestOrder.id) return [];
        return [{ addon: { name: "ISBN Registration" } }];
      }),
    },
  };

  const signupNotificationsService = {
    sendVerificationChallenge: jest.fn().mockResolvedValue(undefined),
    sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
    sendRegistrationLink: jest.fn().mockResolvedValue({
      emailDelivered: true,
      whatsappDelivered: false,
    }),
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
    service,
    prisma,
    signupNotificationsService,
    userState,
  };
}

describe("AuthService signup link lifecycle", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      JWT_SECRET: "test-secret",
      NODE_ENV: "test",
      FRONTEND_URL: "http://localhost:3000",
    };
    jest.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it("blocks inactive accounts across signup-link and verification flows", async () => {
    const { service, signupNotificationsService, userState } = buildService({
      isActive: false,
    });

    const assertDeactivated = async (execute: () => Promise<unknown>) => {
      try {
        await execute();
        throw new Error("Expected inactive account flow to be rejected.");
      } catch (error) {
        expectDeactivatedAuthError(error);
      }
    };

    if (!userState.verificationToken) {
      throw new Error("Expected an existing signup token for the inactive account test.");
    }

    const signupToken = userState.verificationToken;

    await assertDeactivated(() =>
      service.getSignupContext({
        token: signupToken,
      } as never)
    );
    await assertDeactivated(() =>
      service.finishSignup({
        token: signupToken,
        password: "Password123!",
        confirmPassword: "Password123!",
      } as never)
    );
    await assertDeactivated(() =>
      service.verifyEmail({
        email: userState.email,
        code: "123456",
      } as never)
    );
    await assertDeactivated(() =>
      service.verifyEmailLink({
        token: signupToken,
      } as never)
    );

    await expect(
      service.resendSignupLink({
        email: userState.email,
      } as never)
    ).resolves.toEqual({
      message: "If the email exists, a new signup link has been sent.",
    });

    expect(signupNotificationsService.sendRegistrationLink).not.toHaveBeenCalled();
    expect(signupNotificationsService.sendVerificationChallenge).not.toHaveBeenCalled();
  });

  it("resendSignupLink rotates approval-issued signup tokens and invalidates the previous /signup/finish link", async () => {
    const { service, signupNotificationsService, userState } = buildService();
    const oldToken = userState.verificationToken;

    if (!oldToken) {
      throw new Error("Expected an existing signup token before resending the link.");
    }

    jest
      .spyOn(getAuthServicePrivate(service), "generateSecureToken")
      .mockReturnValue("signup-token-new");

    const result = await service.resendSignupLink({
      email: userState.email,
    } as never);

    expect(result).toEqual({
      message: "If the email exists, a new signup link has been sent.",
    });
    expect(userState.verificationToken).toBe("signup-token-new");
    expect(userState.verificationToken).not.toBe(oldToken);
    expect(userState.tokenExpiry).toBeInstanceOf(Date);
    expect(signupNotificationsService.sendRegistrationLink).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "ada@example.com",
        token: "signup-token-new",
        locale: "en",
        orderNumber: "BP-2026-0101",
        packageName: "Legacy",
      }),
      { requireDelivery: true }
    );

    await expect(
      service.getSignupContext({
        token: oldToken,
      } as never)
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      service.finishSignup({
        token: oldToken,
        password: "Password123!",
        confirmPassword: "Password123!",
      } as never)
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      service.getSignupContext({
        token: "signup-token-new",
      } as never)
    ).resolves.toEqual({
      email: "ada@example.com",
      firstName: "Ada",
      lastName: "Okafor",
      phoneNumber: "+2348012345678",
      nextStep: "password",
    });
  });

  it("clears verificationToken and tokenExpiry after signup is completed and email verification succeeds", async () => {
    const { service, signupNotificationsService, userState } = buildService();

    jest
      .spyOn(getAuthServicePrivate(service), "generateVerificationCode")
      .mockReturnValue("123456");

    await expect(
      service.finishSignup({
        token: "signup-token-old",
        password: "Password123!",
        confirmPassword: "Password123!",
      } as never)
    ).resolves.toEqual({
      message: "Password set successfully. Please verify your email with the code sent.",
      email: "ada@example.com",
    });

    expect(userState.password).toEqual(expect.any(String));
    if (!userState.password) {
      throw new Error("Expected the signup flow to persist the hashed password.");
    }
    await expect(bcrypt.compare("Password123!", userState.password)).resolves.toBe(true);
    expect(userState.verificationToken).toBe("signup-token-old");
    expect(userState.verificationCode).toBe("123456");
    expect(signupNotificationsService.sendVerificationChallenge).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "ada@example.com",
        verificationCode: "123456",
        verificationToken: "signup-token-old",
      })
    );

    await expect(
      service.verifyEmail({
        email: "ada@example.com",
        code: "123456",
      } as never)
    ).resolves.toEqual(
      expect.objectContaining({
        user: expect.objectContaining({
          email: "ada@example.com",
        }),
        tokens: expect.objectContaining({
          accessToken: expect.any(String),
          refreshToken: expect.any(String),
        }),
      })
    );

    expect(userState.isVerified).toBe(true);
    expect(userState.verificationCode).toBeNull();
    expect(userState.verificationToken).toBeNull();
    expect(userState.tokenExpiry).toBeNull();

    await expect(
      service.getSignupContext({
        token: "signup-token-old",
      } as never)
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      service.finishSignup({
        token: "signup-token-old",
        password: "AnotherPassword123!",
        confirmPassword: "AnotherPassword123!",
      } as never)
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("keeps the resend flow compatible after /signup/finish by rotating the verification link and code", async () => {
    const { service, signupNotificationsService, userState } = buildService();

    const generateVerificationCode = jest
      .spyOn(getAuthServicePrivate(service), "generateVerificationCode")
      .mockReturnValueOnce("111111")
      .mockReturnValueOnce("222222");

    await service.finishSignup({
      token: "signup-token-old",
      password: "Password123!",
      confirmPassword: "Password123!",
    } as never);

    expect(userState.password).toEqual(expect.any(String));
    if (!userState.password) {
      throw new Error("Expected the signup flow to persist the hashed password.");
    }
    await expect(bcrypt.compare("Password123!", userState.password)).resolves.toBe(true);
    expect(userState.verificationToken).toBe("signup-token-old");
    expect(userState.verificationCode).toBe("111111");

    jest
      .spyOn(getAuthServicePrivate(service), "generateSecureToken")
      .mockReturnValueOnce("signup-token-verify-new");

    await expect(
      service.resendSignupLink({
        email: "ada@example.com",
      } as never)
    ).resolves.toEqual({
      message: "If the email exists, a new signup link has been sent.",
    });

    expect(userState.verificationToken).toBe("signup-token-verify-new");
    expect(userState.verificationCode).toBe("222222");
    expect(signupNotificationsService.sendVerificationChallenge).toHaveBeenLastCalledWith(
      expect.objectContaining({
        email: "ada@example.com",
        verificationCode: "222222",
        verificationToken: "signup-token-verify-new",
      })
    );

    await expect(
      service.getSignupContext({
        token: "signup-token-old",
      } as never)
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      service.verifyEmailLink({
        token: "signup-token-old",
      } as never)
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      service.verifyEmail({
        email: "ada@example.com",
        code: "222222",
      } as never)
    ).resolves.toEqual(
      expect.objectContaining({
        user: expect.objectContaining({
          email: "ada@example.com",
        }),
      })
    );

    expect(userState.isVerified).toBe(true);
    expect(userState.verificationToken).toBeNull();
    expect(userState.tokenExpiry).toBeNull();
    expect(generateVerificationCode).toHaveBeenCalledTimes(2);
  });
});
