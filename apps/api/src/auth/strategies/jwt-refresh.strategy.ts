import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import * as bcrypt from "bcrypt";
import type { Request } from "express";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "../../prisma/prisma.service.js";
import { matchSessionDigest, revokeAllSessions } from "../auth-session.store.js";
import type { JwtPayload } from "../interfaces/index.js";
import { resolveJwtSecret } from "../jwt-secret.util.js";
import { hashRefreshToken, isHashedRefreshToken } from "../refresh-token.util.js";

/** Extra fields this strategy attaches to the payload for AuthController.refresh. */
export type RefreshValidationContext = {
  /** Digest of the presented refresh token (rotation is conditional on it). */
  refreshDigest?: string;
  /** True when the token was the session's previous one, inside the grace window. */
  refreshGrace?: boolean;
};

/**
 * JWT Refresh Token Strategy
 *
 * Extracts refresh token from HttpOnly cookie "refresh_token".
 * Validates against the stored refresh token hash in the database
 * to support refresh token rotation.
 */
@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, "jwt-refresh") {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        // Extract from HttpOnly cookie
        (req: Request) => {
          const token = req?.cookies?.refresh_token;
          if (token) return token;
          return null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: resolveJwtSecret(),
      passReqToCallback: true,
    });
  }

  /**
   * Validate refresh token against database.
   * Ensures the refresh token hasn't been rotated (revoked).
   */
  async validate(
    req: Request,
    payload: JwtPayload
  ): Promise<JwtPayload & RefreshValidationContext> {
    const refreshToken = req?.cookies?.refresh_token;

    if (!refreshToken) {
      throw new UnauthorizedException("Refresh token not found");
    }

    if (typeof payload.sid === "string" && payload.sid.length > 0) {
      return this.validateSessionToken(refreshToken, payload);
    }

    // Verify the refresh token matches what's stored in the database
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        refreshToken: true,
        refreshTokenExp: true,
      },
    });

    if (!user || !user.refreshToken) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    if (!user.isActive) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          refreshToken: null,
          refreshTokenExp: null,
        },
      });
      throw new UnauthorizedException("Account is no longer active");
    }

    const refreshTokenDigest = hashRefreshToken(refreshToken);
    const matchesDigestToken = isHashedRefreshToken(user.refreshToken)
      ? user.refreshToken === refreshTokenDigest
      : false;

    // Legacy fallback: support plaintext and bcrypt-stored tokens until they rotate naturally.
    const matchesLegacyToken = !matchesDigestToken && user.refreshToken === refreshToken;
    let matchesLegacyHashedToken = false;

    if (!matchesDigestToken && !matchesLegacyToken) {
      try {
        matchesLegacyHashedToken = await bcrypt.compare(refreshToken, user.refreshToken);
      } catch {
        matchesLegacyHashedToken = false;
      }
    }

    if (!matchesDigestToken && !matchesLegacyToken && !matchesLegacyHashedToken) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    if (user.refreshTokenExp && user.refreshTokenExp < new Date()) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          refreshToken: null,
          refreshTokenExp: null,
        },
      });
      throw new UnauthorizedException("Refresh token expired");
    }

    return {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
  }

  /**
   * Session-scoped refresh (tokens carrying `sid`). Legacy tokens without it
   * fall through to the User.refreshToken checks above until they expire.
   */
  private async validateSessionToken(
    refreshToken: string,
    payload: JwtPayload
  ): Promise<JwtPayload & RefreshValidationContext> {
    const session = await this.prisma.authSession.findFirst({
      where: { id: payload.sid, userId: payload.sub },
      select: {
        tokenDigest: true,
        previousDigest: true,
        rotatedAt: true,
        expiresAt: true,
        user: { select: { id: true, email: true, role: true, isActive: true } },
      },
    });

    if (!session) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    if (!session.user.isActive) {
      await revokeAllSessions(this.prisma, session.user.id);
      throw new UnauthorizedException("Account is no longer active");
    }

    if (session.expiresAt < new Date()) {
      await this.prisma.authSession.deleteMany({ where: { id: payload.sid } });
      throw new UnauthorizedException("Refresh token expired");
    }

    const digest = hashRefreshToken(refreshToken);
    const match = matchSessionDigest(session, digest);
    if (match === "none") {
      throw new UnauthorizedException("Invalid refresh token");
    }

    return {
      sub: session.user.id,
      email: session.user.email,
      role: session.user.role,
      sid: payload.sid,
      refreshDigest: digest,
      refreshGrace: match === "grace",
    };
  }
}
