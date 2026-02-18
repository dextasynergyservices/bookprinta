import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import type { Request } from "express";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "../../prisma/prisma.service.js";
import type { JwtPayload } from "../interfaces/index.js";

/**
 * JWT Refresh Token Strategy
 *
 * Extracts refresh token from HttpOnly cookie "refresh_token".
 * Validates against the stored refresh token in the database
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
      secretOrKey: process.env.JWT_SECRET || "fallback-dev-secret-change-me",
      passReqToCallback: true,
    });
  }

  /**
   * Validate refresh token against database.
   * Ensures the refresh token hasn't been rotated (revoked).
   */
  async validate(req: Request, payload: JwtPayload): Promise<JwtPayload> {
    const refreshToken = req?.cookies?.refresh_token;

    if (!refreshToken) {
      throw new UnauthorizedException("Refresh token not found");
    }

    // Verify the refresh token matches what's stored in the database
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        refreshToken: true,
        refreshTokenExp: true,
      },
    });

    if (!user || user.refreshToken !== refreshToken) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    if (user.refreshTokenExp && user.refreshTokenExp < new Date()) {
      throw new UnauthorizedException("Refresh token expired");
    }

    return {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
  }
}
