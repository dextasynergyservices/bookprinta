import { createHmac } from "node:crypto";
import { resolveJwtSecret } from "./jwt-secret.util.js";

const DIGEST_PREFIX = "rt1:";

function resolveRefreshTokenSecret(): string {
  const configured = process.env.REFRESH_TOKEN_HMAC_SECRET?.trim();
  if (configured) return configured;

  // Falls back to the signing secret, which is itself validated and will
  // throw rather than yield a placeholder in a deployed environment.
  return resolveJwtSecret();
}

export function hashRefreshToken(token: string): string {
  const digest = createHmac("sha256", resolveRefreshTokenSecret()).update(token).digest("hex");
  return `${DIGEST_PREFIX}${digest}`;
}

export function isHashedRefreshToken(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(DIGEST_PREFIX);
}
