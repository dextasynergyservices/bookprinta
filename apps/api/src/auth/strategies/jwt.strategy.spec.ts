import { UnauthorizedException } from "@nestjs/common";
import { JwtStrategy } from "./jwt.strategy.js";

describe("JwtStrategy", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      JWT_SECRET: "jwt-secret",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it("loads the current active user from the database", async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: "user-1",
          email: "writer@example.com",
          role: "ADMIN",
          isActive: true,
        }),
      },
    };

    const strategy = new JwtStrategy(prisma as never);

    await expect(
      strategy.validate({
        sub: "user-1",
        email: "stale@example.com",
        role: "USER",
      })
    ).resolves.toEqual({
      sub: "user-1",
      email: "writer@example.com",
      role: "ADMIN",
    });
  });

  it("rejects tokens for deactivated accounts", async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: "user-2",
          email: "inactive@example.com",
          role: "USER",
          isActive: false,
        }),
      },
    };

    const strategy = new JwtStrategy(prisma as never);

    await expect(
      strategy.validate({
        sub: "user-2",
        email: "inactive@example.com",
        role: "USER",
      })
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
