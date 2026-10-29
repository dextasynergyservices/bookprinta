import type { ThrottlerGetTrackerFunction } from "@nestjs/throttler";
import jwt from "jsonwebtoken";
import { resolveJwtSecret } from "../auth/jwt-secret.util.js";

/**
 * Rate-limit identity.
 *
 * ─── Why this changed ──────────────────────────────────────────────────────
 *
 * Every request reaches the API as  browser → Vercel rewrite → Render proxy →
 * Nest. Without `trust proxy`, `req.ip` is Render's internal proxy address —
 * the SAME value for every visitor — so the global 10/min limit was shared by
 * the whole site. The old per-route tracker went the other way and trusted the
 * first `X-Forwarded-For` entry, which any client can set when calling the
 * onrender.com URL directly.
 *
 * Now:
 *  - `req.ip` is resolved by Express using `trust proxy` (see
 *    `resolveTrustProxySetting` / main.ts), which walks X-Forwarded-For from the
 *    right and stops at the first untrusted hop. A client can prepend entries
 *    but cannot displace the ones our proxies append.
 *  - Signed-in requests are keyed by the user id from a *verified* access token,
 *    so an account has its own bucket regardless of network topology, and
 *    forging an IP header buys an attacker nothing on authenticated routes.
 */

type RequestLike = Record<string, unknown> & {
  body?: unknown;
  ip?: unknown;
  cookies?: unknown;
  headers?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

/** The client IP as resolved by Express under the configured `trust proxy`. */
export function extractRequestIp(req: RequestLike): string {
  if (typeof req.ip === "string") {
    const normalized = req.ip.trim();
    if (normalized.length > 0) return normalized;
  }
  return "unknown";
}

function extractAccessToken(req: RequestLike): string | null {
  const cookieToken = asRecord(req.cookies)?.access_token;
  if (typeof cookieToken === "string" && cookieToken.length > 0) return cookieToken;

  const authorization = asRecord(req.headers)?.authorization;
  if (typeof authorization === "string" && authorization.startsWith("Bearer ")) {
    const token = authorization.slice("Bearer ".length).trim();
    return token.length > 0 ? token : null;
  }
  return null;
}

/**
 * The user id from a valid, unexpired access token, or null. Verification is a
 * single HMAC — cheap enough to run on every request, and it means a forged or
 * expired cookie falls back to the IP bucket instead of choosing its own key.
 */
export function extractAuthenticatedUserId(req: RequestLike): string | null {
  const token = extractAccessToken(req);
  if (!token) return null;
  try {
    const payload = jwt.verify(token, resolveJwtSecret());
    if (payload && typeof payload === "object" && typeof payload.sub === "string") {
      return payload.sub;
    }
  } catch {
    // Expired / invalid — treat as anonymous.
  }
  return null;
}

/** `user:<id>` for signed-in requests, otherwise `ip:<address>`. */
export function resolveRequestTracker(req: RequestLike): string {
  const userId = extractAuthenticatedUserId(req);
  return userId ? `user:${userId}` : `ip:${extractRequestIp(req)}`;
}

export const getIpTracker: ThrottlerGetTrackerFunction = (req) => {
  return `ip:${extractRequestIp(req as RequestLike)}`;
};

export const getNormalizedEmailTracker: ThrottlerGetTrackerFunction = (req) => {
  const request = req as RequestLike;
  const body = asRecord(request.body);
  const email = body ? normalizeEmail(body.email) : null;

  if (email) {
    return `email:${email}`;
  }

  return `ip:${extractRequestIp(request)}`;
};

/**
 * Login identity: the `identifier` field (email or phone). Emails are
 * lower-cased; phone numbers reduced to digits so "+234 801…" and "0801…"
 * formatting variants cannot be used to multiply an attacker's attempts.
 */
export const getLoginIdentifierTracker: ThrottlerGetTrackerFunction = (req) => {
  const request = req as RequestLike;
  const identifier = asRecord(request.body)?.identifier;
  if (typeof identifier === "string" && identifier.trim().length > 0) {
    const trimmed = identifier.trim().toLowerCase();
    if (trimmed.includes("@")) return `login:${trimmed}`;
    const digits = trimmed.replace(/\D/g, "");
    if (digits.length >= 7) return `login:phone:${digits.slice(-10)}`;
  }
  return `ip:${extractRequestIp(request)}`;
};

/**
 * Express `trust proxy` value from TRUST_PROXY_HOPS.
 *
 * Production default is 2: Vercel's rewrite sets X-Forwarded-For to the real
 * client, and Render's proxy appends Vercel's address. Trusting two hops makes
 * `req.ip` the client. Override with TRUST_PROXY_HOPS if the topology changes
 * (e.g. 1 when calling Render directly, 3 behind Cloudflare + Vercel), and
 * confirm with `GET /api/v1/health/client-ip`.
 */
export function resolveTrustProxySetting(env: NodeJS.ProcessEnv = process.env): number | false {
  const raw = env.TRUST_PROXY_HOPS?.trim();
  if (raw !== undefined && raw !== "") {
    const hops = Number(raw);
    if (Number.isInteger(hops) && hops >= 0) return hops === 0 ? false : hops;
  }
  return env.NODE_ENV === "production" ? 2 : false;
}
