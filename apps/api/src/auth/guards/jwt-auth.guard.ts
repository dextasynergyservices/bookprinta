import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

/**
 * JWT Access Token Guard
 *
 * Apply to routes that require authentication.
 * Extracts and validates the access_token cookie.
 *
 * Usage: @UseGuards(JwtAuthGuard)
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {}
