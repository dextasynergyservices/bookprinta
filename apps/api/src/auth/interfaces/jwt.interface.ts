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
  /** AuthSession id (the signed-in device). Absent on pre-session legacy tokens. */
  sid?: string;
}

/**
 * Token pair returned after login/refresh
 */
export interface TokenPair {
  accessToken: string;
  /**
   * New refresh token, or null when only the access token was reissued (the
   * multi-tab rotation grace path — the cookie jar already holds the newer one).
   */
  refreshToken: string | null;
}

/**
 * Cookie configuration constants
 */
export const ACCESS_TOKEN_COOKIE = "access_token";
export const REFRESH_TOKEN_COOKIE = "refresh_token";
/** Non-sensitive "probably signed in" marker readable by the web app (no token). */
export const SESSION_MARKER_COOKIE = "bp_session";
