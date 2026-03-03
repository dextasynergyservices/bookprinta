import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiBody, ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service.js";
import { CurrentUser } from "./decorators/index.js";
import {
  FinishSignupDto,
  ForgotPasswordDto,
  LoginDto,
  ResendSignupLinkDto,
  ResetPasswordDto,
  SignupContextDto,
  ValidateResetPasswordTokenDto,
  VerifyEmailDto,
  VerifyEmailLinkDto,
} from "./dto/index.js";
import { JwtAuthGuard, JwtRefreshGuard } from "./guards/index.js";
import type { JwtPayload } from "./interfaces/index.js";
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "./interfaces/index.js";

/**
 * Auth Controller — All authentication endpoints.
 *
 * JWT stored in HttpOnly cookies (NEVER localStorage).
 * Refresh token rotation on every /refresh call.
 * Differentiated expiry for admins (1h refresh) vs users (7d refresh).
 *
 * Endpoints:
 * - GET /auth/me                — Return current authenticated user payload
 * - POST /auth/signup/finish     — Complete signup (set password) via unique link
 * - POST /auth/verify-email      — Verify 6-digit email code
 * - POST /auth/login             — Login → JWT in HttpOnly cookie
 * - POST /auth/logout            — Invalidate refresh token, clear cookies
 * - POST /auth/refresh           — Silent token refresh (rotation)
 * - POST /auth/forgot-password   — Send password reset email
 * - GET /auth/reset-password     — Validate reset password token
 * - POST /auth/reset-password    — Reset password with token
 * - POST /auth/resend-signup-link — Resend signup link (rate limited: 3/hour)
 */
@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ==========================================
  // GET /auth/me
  // ==========================================
  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth("access_token")
  @ApiOperation({
    summary: "Get current authenticated user",
    description: "Returns user identity from the validated access_token cookie.",
  })
  @ApiResponse({ status: 200, description: "Current user returned" })
  @ApiResponse({ status: 401, description: "Not authenticated" })
  getMe(@CurrentUser() user: JwtPayload) {
    return {
      user: {
        id: user.sub,
        email: user.email,
        role: user.role,
      },
    };
  }

  // ==========================================
  // POST /auth/signup/context
  // ==========================================
  @Post("signup/context")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Get signup context from token",
    description:
      "Resolves prefill data (name + email) for /signup/finish using the unique signup token.",
  })
  @ApiBody({ type: SignupContextDto })
  @ApiResponse({ status: 200, description: "Signup context resolved" })
  @ApiResponse({ status: 404, description: "Invalid or expired signup link" })
  @ApiResponse({ status: 400, description: "Signup link expired" })
  @ApiResponse({ status: 409, description: "Account setup already completed" })
  async signupContext(@Body() dto: SignupContextDto) {
    return this.authService.getSignupContext(dto);
  }

  // ==========================================
  // POST /auth/signup/finish
  // ==========================================
  @Post("signup/finish")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Complete account setup",
    description:
      "Set password after payment. User arrives via unique email link with token. " +
      "Generates a 6-digit email verification code.",
  })
  @ApiBody({ type: FinishSignupDto })
  @ApiResponse({ status: 200, description: "Password set, verification code sent" })
  @ApiResponse({ status: 404, description: "Invalid or expired signup link" })
  @ApiResponse({ status: 409, description: "Account already set up" })
  async finishSignup(@Body() dto: FinishSignupDto) {
    return this.authService.finishSignup(dto);
  }

  // ==========================================
  // POST /auth/verify-email
  // ==========================================
  @Post("verify-email")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Verify email with 6-digit code",
    description:
      "Verify the 6-digit code sent after signup. " +
      "On success, sets JWT tokens in HttpOnly cookies and returns user info.",
  })
  @ApiBody({ type: VerifyEmailDto })
  @ApiResponse({ status: 200, description: "Email verified, tokens set" })
  @ApiResponse({ status: 400, description: "Invalid or expired code" })
  @ApiResponse({ status: 404, description: "User not found" })
  async verifyEmail(@Body() dto: VerifyEmailDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.verifyEmail(dto);

    // Set tokens in HttpOnly cookies
    this.setTokenCookies(
      res,
      result.tokens.accessToken,
      result.tokens.refreshToken,
      result.user.role
    );

    return { user: result.user };
  }

  // ==========================================
  // POST /auth/verify-email-link
  // ==========================================
  @Post("verify-email-link")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Verify email from secure tokenized link",
    description:
      "Verifies email directly using the signup verification token and sets JWT tokens in HttpOnly cookies.",
  })
  @ApiBody({ type: VerifyEmailLinkDto })
  @ApiResponse({ status: 200, description: "Email verified, tokens set" })
  @ApiResponse({ status: 400, description: "Invalid or expired verification link" })
  @ApiResponse({ status: 404, description: "Invalid or expired verification link" })
  @ApiResponse({ status: 409, description: "Email already verified" })
  async verifyEmailLink(
    @Body() dto: VerifyEmailLinkDto,
    @Res({ passthrough: true }) res: Response
  ) {
    const result = await this.authService.verifyEmailLink(dto);

    this.setTokenCookies(
      res,
      result.tokens.accessToken,
      result.tokens.refreshToken,
      result.user.role
    );

    return { user: result.user };
  }

  // ==========================================
  // POST /auth/login
  // ==========================================
  @Post("login")
  @Throttle({
    short: { limit: 10, ttl: 60_000 },
    long: { limit: 100, ttl: 3_600_000 },
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Login with email/phone & password",
    description:
      "Authenticate user by email or phone number. Returns user info and sets JWT tokens in HttpOnly cookies. " +
      "Access token: 15min. Refresh token: 7d (users) / 1h (admins).",
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, description: "Login successful, tokens set in cookies" })
  @ApiResponse({
    status: 400,
    description:
      "reCAPTCHA verification failed. Response includes errorCode=AUTH_RECAPTCHA_FAILED.",
  })
  @ApiResponse({
    status: 401,
    description:
      "Invalid credentials or unverified account. Unverified response includes errorCode=AUTH_UNVERIFIED_ACCOUNT.",
  })
  @ApiResponse({
    status: 429,
    description: "Too many login attempts. Response includes retryAfterSeconds.",
  })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const result = await this.authService.login(dto, this.getClientIp(req));

    // Set tokens in HttpOnly cookies
    this.setTokenCookies(
      res,
      result.tokens.accessToken,
      result.tokens.refreshToken,
      result.user.role
    );

    return { user: result.user };
  }

  // ==========================================
  // POST /auth/logout
  // ==========================================
  @Post("logout")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth("access_token")
  @ApiOperation({
    summary: "Logout — invalidate tokens",
    description: "Invalidates refresh token in database and clears HttpOnly cookies.",
  })
  @ApiResponse({ status: 200, description: "Logged out successfully" })
  @ApiResponse({ status: 401, description: "Not authenticated" })
  async logout(@CurrentUser("sub") userId: string, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.logout(userId);

    // Clear both cookies
    const clearedOpts = this.authService.getClearedCookieOptions();
    res.cookie(ACCESS_TOKEN_COOKIE, "", clearedOpts);
    res.cookie(REFRESH_TOKEN_COOKIE, "", { ...clearedOpts, path: "/api/v1/auth" });

    return result;
  }

  // ==========================================
  // POST /auth/refresh
  // ==========================================
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtRefreshGuard)
  @ApiCookieAuth("refresh_token")
  @ApiOperation({
    summary: "Silent token refresh (rotation)",
    description:
      "Refreshes the access token using the refresh token cookie. " +
      "Implements refresh token rotation: old token is invalidated, new pair issued. " +
      "If refresh token is expired/invalid, returns 401 → redirect to login.",
  })
  @ApiResponse({ status: 200, description: "New token pair set in cookies" })
  @ApiResponse({ status: 401, description: "Invalid or expired refresh token" })
  async refresh(@CurrentUser() user: JwtPayload, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.authService.refresh(user.sub, user.email, user.role);

    // Set new tokens in HttpOnly cookies
    this.setTokenCookies(res, tokens.accessToken, tokens.refreshToken, user.role);

    return { message: "Token refreshed successfully" };
  }

  // ==========================================
  // POST /auth/forgot-password
  // ==========================================
  @Post("forgot-password")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Request password reset",
    description:
      "Sends a password reset email if the account exists. " +
      "Always returns success to prevent email enumeration.",
  })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse({ status: 200, description: "Reset link sent (if email exists)" })
  @ApiResponse({
    status: 400,
    description:
      "reCAPTCHA verification failed. Response includes errorCode=AUTH_RECAPTCHA_FAILED.",
  })
  @ApiResponse({
    status: 429,
    description:
      "Too many password reset requests. Response includes errorCode=AUTH_FORGOT_PASSWORD_RATE_LIMIT and retryAfterSeconds.",
  })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  // ==========================================
  // GET /auth/reset-password
  // ==========================================
  @Get("reset-password")
  @Throttle({
    short: { limit: 10, ttl: 60_000 },
    long: { limit: 100, ttl: 3_600_000 },
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Validate password reset token",
    description: "Validates a reset token before rendering reset form. Returns 200 if valid.",
  })
  @ApiResponse({ status: 200, description: "Reset token is valid" })
  @ApiResponse({ status: 400, description: "Invalid or expired reset token" })
  @ApiResponse({
    status: 429,
    description:
      "Too many reset attempts. Response includes errorCode=AUTH_RESET_PASSWORD_RATE_LIMIT and retryAfterSeconds.",
  })
  async validateResetPasswordToken(
    @Query() dto: ValidateResetPasswordTokenDto,
    @Req() req: Request
  ) {
    return this.authService.validateResetPasswordToken(dto, this.getClientIp(req));
  }

  // ==========================================
  // POST /auth/reset-password
  // ==========================================
  @Post("reset-password")
  @Throttle({
    short: { limit: 10, ttl: 60_000 },
    long: { limit: 100, ttl: 3_600_000 },
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Reset password with token",
    description:
      "Reset password using the token from the reset email. " +
      "Invalidates all existing sessions (forces re-login).",
  })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({ status: 200, description: "Password reset successfully" })
  @ApiResponse({ status: 400, description: "Invalid or expired reset token" })
  @ApiResponse({
    status: 429,
    description:
      "Too many reset attempts. Response includes errorCode=AUTH_RESET_PASSWORD_RATE_LIMIT and retryAfterSeconds.",
  })
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    return this.authService.resetPassword(dto, this.getClientIp(req));
  }

  // ==========================================
  // POST /auth/resend-signup-link
  // ==========================================
  @Post("resend-signup-link")
  @HttpCode(HttpStatus.OK)
  @Throttle({
    short: { limit: 3, ttl: 3_600_000 },
    long: { limit: 3, ttl: 3_600_000 },
  })
  @ApiOperation({
    summary: "Resend signup link",
    description:
      "Generates a new verification token and sends a fresh signup link. " +
      "Rate limited: 3 per hour. Always returns success to prevent email enumeration.",
  })
  @ApiBody({ type: ResendSignupLinkDto })
  @ApiResponse({ status: 200, description: "Link sent (if email exists)" })
  async resendSignupLink(@Body() dto: ResendSignupLinkDto) {
    return this.authService.resendSignupLink(dto);
  }

  // ==========================================
  // PRIVATE: Request metadata helpers
  // ==========================================

  private getClientIp(req: Request): string {
    const forwardedFor = req.headers["x-forwarded-for"];

    if (typeof forwardedFor === "string" && forwardedFor.trim().length > 0) {
      return forwardedFor.split(",")[0]?.trim() || "unknown";
    }

    if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
      return forwardedFor[0] || "unknown";
    }

    return req.ip || req.socket?.remoteAddress || "unknown";
  }

  // ==========================================
  // PRIVATE: Set token cookies
  // ==========================================

  /**
   * Set access_token and refresh_token as HttpOnly cookies.
   */
  private setTokenCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
    role: string
  ): void {
    res.cookie(ACCESS_TOKEN_COOKIE, accessToken, this.authService.getAccessTokenCookieOptions());
    res.cookie(
      REFRESH_TOKEN_COOKIE,
      refreshToken,
      this.authService.getRefreshTokenCookieOptions(role)
    );
  }
}
