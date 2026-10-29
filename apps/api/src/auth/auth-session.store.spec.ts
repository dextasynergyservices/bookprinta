/// <reference types="jest" />
import {
  createSession,
  MAX_SESSIONS_PER_USER,
  matchSessionDigest,
  ROTATION_GRACE_MS,
  rotateSession,
} from "./auth-session.store.js";
import { hashRefreshToken } from "./refresh-token.util.js";
import { JwtRefreshStrategy } from "./strategies/jwt-refresh.strategy.js";

describe("auth session store", () => {
  describe("matchSessionDigest", () => {
    const now = Date.now();
    const session = { tokenDigest: "new", previousDigest: "old", rotatedAt: new Date(now - 1_000) };

    it("matches the current digest", () => {
      expect(matchSessionDigest(session, "new", now)).toBe("current");
    });

    it("accepts the just-rotated digest inside the grace window (second tab)", () => {
      expect(matchSessionDigest(session, "old", now)).toBe("grace");
    });

    it("rejects the previous digest once the grace window has passed (replay)", () => {
      expect(matchSessionDigest(session, "old", now + ROTATION_GRACE_MS + 1)).toBe("none");
    });

    it("rejects anything else", () => {
      expect(matchSessionDigest(session, "forged", now)).toBe("none");
    });
  });

  it("rotates only when the digest is still the one that was validated", async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const rotated = await rotateSession({ authSession: { updateMany } } as never, {
      id: "s1",
      userId: "u1",
      expectedDigest: "seen",
      nextDigest: "next",
    });
    expect(rotated).toBe(false);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "s1", userId: "u1", tokenDigest: "seen" } })
    );
  });

  it("caps sessions per user, dropping the least recently used", async () => {
    const authSession = {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([{ id: "stale_1" }, { id: "stale_2" }]),
    };
    await createSession({ authSession } as never, {
      id: "s_new",
      userId: "u1",
      tokenDigest: "d",
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(authSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: MAX_SESSIONS_PER_USER, orderBy: { lastUsedAt: "desc" } })
    );
    expect(authSession.deleteMany).toHaveBeenLastCalledWith({
      where: { id: { in: ["stale_1", "stale_2"] } },
    });
  });
});

describe("JwtRefreshStrategy — session tokens", () => {
  const token = "refresh.jwt.value";
  const digest = hashRefreshToken(token);
  const payload = { sub: "u1", email: "a@b.co", role: "USER", sid: "s1" } as never;
  const req = { cookies: { refresh_token: token } } as never;

  function strategyWith(session: unknown) {
    const prisma = {
      authSession: {
        findFirst: jest.fn().mockResolvedValue(session),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    return { strategy: new JwtRefreshStrategy(prisma as never), prisma };
  }

  const activeUser = { id: "u1", email: "a@b.co", role: "USER", isActive: true };

  it("accepts the current token and reports its digest for conditional rotation", async () => {
    const { strategy } = strategyWith({
      tokenDigest: digest,
      previousDigest: null,
      rotatedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: activeUser,
    });
    await expect(strategy.validate(req, payload)).resolves.toMatchObject({
      sub: "u1",
      sid: "s1",
      refreshDigest: digest,
      refreshGrace: false,
    });
  });

  it("flags a just-rotated token as grace rather than rejecting it", async () => {
    const { strategy } = strategyWith({
      tokenDigest: "someone-else-rotated",
      previousDigest: digest,
      rotatedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      user: activeUser,
    });
    await expect(strategy.validate(req, payload)).resolves.toMatchObject({ refreshGrace: true });
  });

  it("rejects a token for a session that was logged out", async () => {
    const { strategy } = strategyWith(null);
    await expect(strategy.validate(req, payload)).rejects.toThrow("Invalid refresh token");
  });

  it("rejects and deletes an expired session", async () => {
    const { strategy, prisma } = strategyWith({
      tokenDigest: digest,
      previousDigest: null,
      rotatedAt: null,
      expiresAt: new Date(Date.now() - 1),
      user: activeUser,
    });
    await expect(strategy.validate(req, payload)).rejects.toThrow("expired");
    expect(prisma.authSession.deleteMany).toHaveBeenCalledWith({ where: { id: "s1" } });
  });

  it("revokes every session of a deactivated account", async () => {
    const { strategy, prisma } = strategyWith({
      tokenDigest: digest,
      previousDigest: null,
      rotatedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { ...activeUser, isActive: false },
    });
    await expect(strategy.validate(req, payload)).rejects.toThrow("no longer active");
    expect(prisma.authSession.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
  });
});
