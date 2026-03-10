import { createHmac } from "node:crypto";

const DIGEST_PREFIX = "rt1:";

function resolveRefreshTokenSecret(): string {
  const configured = process.env.REFRESH_TOKEN_HMAC_SECRET?.trim();
  if (configured) return configured;

  return process.env.JWT_SECRET || "fallback-dev-secret-change-me";
}

export function hashRefreshToken(token: string): string {
  const digest = createHmac("sha256", resolveRefreshTokenSecret()).update(token).digest("hex");
  return `${DIGEST_PREFIX}${digest}`;
}

export function isHashedRefreshToken(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(DIGEST_PREFIX);
}
