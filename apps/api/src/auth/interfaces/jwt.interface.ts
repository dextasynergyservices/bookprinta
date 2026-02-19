import type { UserRole } from "../../generated/prisma/enums.js";

/**
 * JWT Payload — stored inside both access and refresh tokens
 */
export interface JwtPayload {
  /** User CUID */
  sub: string;
  /** User email */
  email: string;
  /** User role for RBAC */
  role: UserRole;
}

/**
 * Token pair returned after login/refresh
 */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Cookie configuration constants
 */
export const ACCESS_TOKEN_COOKIE = "access_token";
export const REFRESH_TOKEN_COOKIE = "refresh_token";
