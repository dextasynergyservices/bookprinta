import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import type { Request } from "express";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { JwtPayload } from "../interfaces/index.js";

/**
 * JWT Access Token Strategy
 *
 * Extracts JWT from HttpOnly cookie "access_token".
 * Falls back to Authorization Bearer header (for Swagger/Postman testing).
 * Validates the payload and attaches user info to request.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        // Primary: HttpOnly cookie
        (req: Request) => {
          const token = req?.cookies?.access_token;
          if (token) return token;
          return null;
        },
        // Fallback: Bearer token header (Swagger/Postman)
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || "fallback-dev-secret-change-me",
    });
  }

  /**
   * Called after JWT is verified. Return value is attached to req.user
   */
  validate(payload: JwtPayload): JwtPayload {
    if (!payload.sub || !payload.email) {
      throw new UnauthorizedException("Invalid token payload");
    }
    return {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
    };
  }
}
