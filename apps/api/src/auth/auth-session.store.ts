import { randomUUID, timingSafeEqual } from "node:crypto";
import type { Prisma } from "../generated/prisma/client.js";

/**
 * Persistence for signed-in devices (AuthSession rows).
 *
 * ─── Why this exists ───────────────────────────────────────────────────────
 *
 * Refresh tokens used to live in a single User.refreshToken column, so every
 * login replaced the previous one: signing in on a phone logged the laptop
 * out, and an admin on two machines kept bouncing. Each device now has its own
 * row, identified by the `sid` claim in its tokens.
 *
 * Rotation keeps the previous digest for ROTATION_GRACE_MS. Browser tabs share
 * one cookie jar but refresh independently, so two tabs whose access tokens
 * expire together both present the same refresh token; the loser of that race
 * would otherwise be logged out. Inside the grace window the loser gets a new
 * access token only (its jar already holds the winner's new refresh token).
 */

/** Oldest sessions beyond this per user are dropped on login. */
export const MAX_SESSIONS_PER_USER = 10;
export const ROTATION_GRACE_MS = 30_000;

type SessionClient = Pick<Prisma.TransactionClient, "authSession">;

export function newSessionId(): string {
  return randomUUID();
}

export async function createSession(
  prisma: SessionClient,
  params: {
    id: string;
    userId: string;
    tokenDigest: string;
    expiresAt: Date;
    userAgent?: string | null;
    ipAddress?: string | null;
  }
): Promise<void> {
  // Housekeeping for this user only: expired rows, then anything past the cap.
  await prisma.authSession.deleteMany({
    where: { userId: params.userId, expiresAt: { lt: new Date() } },
  });

  await prisma.authSession.create({
    data: {
      id: params.id,
      userId: params.userId,
      tokenDigest: params.tokenDigest,
      expiresAt: params.expiresAt,
      userAgent: params.userAgent?.slice(0, 300) ?? null,
      ipAddress: params.ipAddress?.slice(0, 64) ?? null,
    },
  });

  const overflow = await prisma.authSession.findMany({
    where: { userId: params.userId },
    orderBy: { lastUsedAt: "desc" },
    skip: MAX_SESSIONS_PER_USER,
    select: { id: true },
  });
  if (overflow.length > 0) {
    await prisma.authSession.deleteMany({ where: { id: { in: overflow.map((row) => row.id) } } });
  }
}

/**
 * Swap a session's digest. Conditional on the digest the caller validated, so
 * two concurrent refreshes cannot both rotate. Returns false if another
 * request rotated first (the caller then falls back to the grace path).
 */
export async function rotateSession(
  prisma: SessionClient,
  params: { id: string; userId: string; expectedDigest: string; nextDigest: string }
): Promise<boolean> {
  const result = await prisma.authSession.updateMany({
    where: { id: params.id, userId: params.userId, tokenDigest: params.expectedDigest },
    data: {
      tokenDigest: params.nextDigest,
      previousDigest: params.expectedDigest,
      rotatedAt: new Date(),
      lastUsedAt: new Date(),
    },
  });
  return result.count === 1;
}

export type SessionMatch = "current" | "grace" | "none";

/** Compare a presented refresh-token digest with a session row. */
export function matchSessionDigest(
  session: { tokenDigest: string; previousDigest: string | null; rotatedAt: Date | null },
  presentedDigest: string,
  now = Date.now()
): SessionMatch {
  if (safeEqual(session.tokenDigest, presentedDigest)) return "current";
  if (
    session.previousDigest &&
    session.rotatedAt &&
    now - session.rotatedAt.getTime() <= ROTATION_GRACE_MS &&
    safeEqual(session.previousDigest, presentedDigest)
  ) {
    return "grace";
  }
  return "none";
}

export async function revokeSession(
  prisma: SessionClient,
  params: { id: string; userId: string }
): Promise<void> {
  await prisma.authSession.deleteMany({ where: { id: params.id, userId: params.userId } });
}

/** Sign the user out everywhere (password change, deactivation, admin action). */
export async function revokeAllSessions(prisma: SessionClient, userId: string): Promise<void> {
  await prisma.authSession.deleteMany({ where: { userId } });
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
