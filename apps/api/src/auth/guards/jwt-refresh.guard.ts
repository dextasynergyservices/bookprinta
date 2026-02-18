import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

/**
 * JWT Refresh Token Guard
 *
 * Apply to the /auth/refresh endpoint.
 * Extracts and validates the refresh_token cookie
 * against the database for token rotation.
 *
 * Usage: @UseGuards(JwtRefreshGuard)
 */
@Injectable()
export class JwtRefreshGuard extends AuthGuard("jwt-refresh") {}
