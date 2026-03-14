import { UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { hashRefreshToken } from "../refresh-token.util.js";
import { JwtRefreshStrategy } from "./jwt-refresh.strategy.js";

describe("JwtRefreshStrategy", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      JWT_SECRET: "jwt-secret",
      REFRESH_TOKEN_HMAC_SECRET: "refresh-hmac-secret",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it("accepts digest-stored refresh tokens without bcrypt comparison", async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: "user-1",
          email: "writer@example.com",
          role: "USER",
          isActive: true,
          refreshToken: hashRefreshToken("refresh-token-value"),
          refreshTokenExp: new Date(Date.now() + 60_000),
        }),
        update: jest.fn(),
      },
    };

    const strategy = new JwtRefreshStrategy(prisma as never);

    const result = await strategy.validate(
      { cookies: { refresh_token: "refresh-token-value" } } as never,
      { sub: "user-1", email: "writer@example.com", role: "USER" }
    );

    expect(result).toEqual({
      sub: "user-1",
      email: "writer@example.com",
      role: "USER",
    });
  });

  it("still accepts legacy bcrypt refresh tokens until they rotate", async () => {
    const legacyHash = await bcrypt.hash("legacy-refresh-token", 4);
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: "user-1",
          email: "writer@example.com",
          role: "USER",
          isActive: true,
          refreshToken: legacyHash,
          refreshTokenExp: new Date(Date.now() + 60_000),
        }),
        update: jest.fn(),
      },
    };

    const strategy = new JwtRefreshStrategy(prisma as never);

    const result = await strategy.validate(
      { cookies: { refresh_token: "legacy-refresh-token" } } as never,
      { sub: "user-1", email: "writer@example.com", role: "USER" }
    );

    expect(result).toEqual({
      sub: "user-1",
      email: "writer@example.com",
      role: "USER",
    });
  });

  it("revokes refresh tokens for deactivated accounts", async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: "user-1",
          email: "writer@example.com",
          role: "USER",
          isActive: false,
          refreshToken: hashRefreshToken("refresh-token-value"),
          refreshTokenExp: new Date(Date.now() + 60_000),
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    const strategy = new JwtRefreshStrategy(prisma as never);

    await expect(
      strategy.validate({ cookies: { refresh_token: "refresh-token-value" } } as never, {
        sub: "user-1",
        email: "writer@example.com",
        role: "USER",
      })
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        refreshToken: null,
        refreshTokenExp: null,
      },
    });
  });
});
