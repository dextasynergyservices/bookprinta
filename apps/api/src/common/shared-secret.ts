import { timingSafeEqual } from "node:crypto";
import type { Request } from "express";

/**
 * Shared-secret helpers for machine-authenticated endpoints (external cron,
 * monitoring probes, temporary instrumentation).
 *
 * These endpoints are called by machines with no user session, so they use a
 * pre-shared token rather than the JWT admin guard. Keeping them off the auth
 * module also means a leaked monitoring/cron token cannot be replayed against
 * admin APIs.
 */

/**
 * Constant-time comparison of a configured secret against a presented value.
 *
 * Returns false — never throws — for any mismatch, including length. A plain
 * `===` leaks, via early-exit timing, how many leading characters matched, so
 * every secret check in the codebase must route through here.
 */
export function matchesSharedSecret(
  expected: string | undefined | null,
  presented: string | undefined | null
): boolean {
  const expectedValue = expected?.trim();
  const presentedValue = presented?.trim();

  if (!expectedValue || !presentedValue) return false;

  const expectedBuffer = Buffer.from(expectedValue, "utf8");
  const presentedBuffer = Buffer.from(presentedValue, "utf8");

  // timingSafeEqual throws on differing lengths, so guard first. A wrong-length
  // token is simply invalid.
  if (expectedBuffer.length !== presentedBuffer.length) return false;

  return timingSafeEqual(expectedBuffer, presentedBuffer);
}

/**
 * Extract a shared-secret token from a request, accepting either:
 *   Authorization: Bearer <token>
 *   <headerName>: <token>            (default: X-Cron-Token)
 *
 * Two forms because not every cron/monitoring provider allows custom
 * `Authorization` values on free tiers.
 */
export function extractSharedSecret(request: Request, headerName = "x-cron-token"): string | null {
  const authorization = request.headers.authorization;
  if (authorization) {
    const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
    if (match?.[1]) return match[1].trim();
  }

  const header = request.headers[headerName.toLowerCase()];
  const raw = Array.isArray(header) ? header[0] : header;
  const trimmed = raw?.trim();

  return trimmed && trimmed.length > 0 ? trimmed : null;
}
