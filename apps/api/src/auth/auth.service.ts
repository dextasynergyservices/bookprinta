import * as crypto from "node:crypto";
import type { Locale } from "@bookprinta/emails";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import * as bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import type { UserRole } from "../generated/prisma/enums.js";
import { SignupNotificationsService } from "../notifications/signup-notifications.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type {
  FinishSignupDto,
  ForgotPasswordDto,
  LoginDto,
  ResendSignupLinkDto,
  ResetPasswordDto,
  SignupContextDto,
  VerifyEmailDto,
} from "./dto/index.js";
import type { JwtPayload, TokenPair } from "./interfaces/index.js";

/**
 * Auth Service — Core authentication and authorization logic.
 *
 * Implements:
 * - "Pay First, Signup Later" flow (finish signup via unique link)
 * - JWT access/refresh tokens with HttpOnly cookies
 * - Refresh token rotation (new pair on each refresh)
 * - Differentiated token expiry: 15min access, 7d refresh (users) / 1h refresh (admins)
 * - Password hashing via bcrypt
 * - Email verification via 6-digit code
 * - Password reset via token link
 * - Resend signup link (rate limited at controller level)
 */
@Injectable()
export class AuthService {
  private readonly SALT_ROUNDS = 12;
  private readonly JWT_SECRET: string;
  private readonly ACCESS_TOKEN_EXPIRY: string;
  private readonly REFRESH_TOKEN_EXPIRY_USER: string;
  private readonly REFRESH_TOKEN_EXPIRY_ADMIN: string;
  private readonly fromEmail: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly signupNotificationsService: SignupNotificationsService
  ) {
    this.JWT_SECRET = process.env.JWT_SECRET || "fallback-dev-secret-change-me";
    this.ACCESS_TOKEN_EXPIRY = process.env.JWT_ACCESS_EXPIRY || "15m";
    this.REFRESH_TOKEN_EXPIRY_USER = process.env.JWT_REFRESH_EXPIRY_USER || "7d";
    this.REFRESH_TOKEN_EXPIRY_ADMIN = process.env.JWT_REFRESH_EXPIRY_ADMIN || "1h";
    this.fromEmail =
      process.env.AUTH_FROM_EMAIL ||
      process.env.PAYMENTS_FROM_EMAIL ||
      "BookPrinta <onboarding@resend.dev>";
  }

  // ==========================================
  // SIGNUP CONTEXT (POST /auth/signup/context)
  // ==========================================

  /**
   * Resolve signup identity details from a valid signup token.
   * Used to prefill /signup/finish form fields.
   */
  async getSignupContext(dto: SignupContextDto): Promise<{
    email: string;
    firstName: string;
    lastName: string | null;
    phoneNumber: string | null;
    nextStep: "password" | "verify";
  }> {
    const user = await this.prisma.user.findUnique({
      where: { verificationToken: dto.token },
      select: {
        email: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        password: true,
        isVerified: true,
        tokenExpiry: true,
      },
    });

    if (!user) {
      throw new NotFoundException("Invalid or expired signup link");
    }

    if (user.tokenExpiry && user.tokenExpiry < new Date()) {
      throw new BadRequestException("Signup link has expired. Please request a new one.");
    }

    if (user.password && user.isVerified) {
      throw new ConflictException("Account setup already completed. Please log in.");
    }

    return {
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber,
      nextStep: user.password ? "verify" : "password",
    };
  }

  // ==========================================
  // FINISH SIGNUP (POST /auth/signup/finish)
  // ==========================================

  /**
   * Complete account setup after payment.
   * User arrives via unique email link with verification token.
   * Sets password and generates a verification code for email confirmation.
   */
  async finishSignup(dto: FinishSignupDto): Promise<{ message: string; email: string }> {
    // Find user by verification token
    const user = await this.prisma.user.findUnique({
      where: { verificationToken: dto.token },
      select: {
        id: true,
        email: true,
        firstName: true,
        preferredLanguage: true,
        phoneNumber: true,
        password: true,
        isVerified: true,
        tokenExpiry: true,
      },
    });

    if (!user) {
      throw new NotFoundException("Invalid or expired signup link");
    }

    // Check if token has expired
    if (user.tokenExpiry && user.tokenExpiry < new Date()) {
      throw new BadRequestException("Signup link has expired. Please request a new one.");
    }

    // Check if user already completed signup
    if (user.password) {
      throw new ConflictException("Account setup already completed. Please log in.");
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(dto.password, this.SALT_ROUNDS);

    // Generate a 6-digit email verification code
    const verificationCode = this.generateVerificationCode();
    const verificationToken = dto.token;
    const codeExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Update user: set password, generate verification code, keep token for verify-step reopen
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        verificationCode,
        verificationToken,
        tokenExpiry: codeExpiry, // Shared expiry for code + token
      },
    });

    try {
      await this.signupNotificationsService.sendVerificationChallenge({
        email: user.email,
        name: user.firstName || user.email.split("@")[0] || "Author",
        locale: this.resolveLocale(user.preferredLanguage),
        verificationCode,
        verificationToken,
        phoneNumber: user.phoneNumber,
        fromEmail: this.fromEmail,
      });
    } catch {
      throw new ServiceUnavailableException(
        "We couldn't send your verification code and link right now. Please try again."
      );
    }

    return {
      message: "Password set successfully. Please verify your email with the code sent.",
      email: user.email,
    };
  }

  // ==========================================
  // VERIFY EMAIL (POST /auth/verify-email)
  // ==========================================

  /**
   * Verify email with 6-digit code sent after signup.
   * On success: marks user as verified, issues token pair.
   */
  async verifyEmail(dto: VerifyEmailDto): Promise<{ user: SafeUser; tokens: TokenPair }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        preferredLanguage: true,
        isVerified: true,
        verificationCode: true,
        tokenExpiry: true,
      },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    if (user.isVerified) {
      throw new ConflictException("Email already verified");
    }

    if (!user.verificationCode) {
      throw new BadRequestException("No verification code found. Please complete signup first.");
    }

    // Check code expiry
    if (user.tokenExpiry && user.tokenExpiry < new Date()) {
      throw new BadRequestException("Verification code has expired. Please request a new one.");
    }

    // Verify the code
    if (user.verificationCode !== dto.code) {
      throw new BadRequestException("Invalid verification code");
    }

    // Mark user as verified, clear code
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        verificationCode: null,
        verificationToken: null,
        tokenExpiry: null,
      },
    });

    // Generate tokens and set refresh token in database
    const tokens = await this.generateTokenPair(user.id, user.email, user.role);

    // Best-effort welcome email after successful verification.
    void this.signupNotificationsService.sendWelcomeEmail({
      email: user.email,
      name: user.firstName || user.email.split("@")[0] || "Author",
      locale: this.resolveLocale(user.preferredLanguage),
      fromEmail: this.fromEmail,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
      tokens,
    };
  }

  // ==========================================
  // LOGIN (POST /auth/login)
  // ==========================================

  /**
   * Authenticate user with email and password.
   * Returns token pair + user info on success.
   */
  async login(dto: LoginDto): Promise<{ user: SafeUser; tokens: TokenPair }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        password: true,
        isVerified: true,
      },
    });

    if (!user || !user.password) {
      throw new UnauthorizedException("Invalid email or password");
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException("Invalid email or password");
    }

    // Check if email is verified
    if (!user.isVerified) {
      throw new UnauthorizedException(
        "Please verify your email before logging in. Check your inbox for the verification code."
      );
    }

    // Generate tokens and set refresh token in database
    const tokens = await this.generateTokenPair(user.id, user.email, user.role);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
      tokens,
    };
  }

  // ==========================================
  // LOGOUT (POST /auth/logout)
  // ==========================================

  /**
   * Invalidate refresh token in database.
   * Cookies are cleared at the controller level.
   */
  async logout(userId: string): Promise<{ message: string }> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        refreshToken: null,
        refreshTokenExp: null,
      },
    });

    return { message: "Logged out successfully" };
  }

  // ==========================================
  // REFRESH (POST /auth/refresh)
  // ==========================================

  /**
   * Rotate refresh token and issue new token pair.
   *
   * Refresh token rotation:
   * 1. Validate current refresh token (done by JwtRefreshGuard)
   * 2. Invalidate old refresh token
   * 3. Issue new access + refresh token pair
   * 4. Store new refresh token in database
   */
  async refresh(userId: string, email: string, role: UserRole): Promise<TokenPair> {
    return this.generateTokenPair(userId, email, role);
  }

  // ==========================================
  // FORGOT PASSWORD (POST /auth/forgot-password)
  // ==========================================

  /**
   * Generate password reset token and send email.
   * Always returns success to prevent email enumeration.
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true, email: true, isVerified: true },
    });

    // Always return success to prevent email enumeration
    if (!user || !user.isVerified) {
      return { message: "If the email exists, a password reset link has been sent." };
    }

    // Generate reset token
    const resetToken = this.generateSecureToken();
    const tokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken,
        tokenExpiry,
      },
    });

    // TODO: Send password reset email (Resend + React Email template)
    // const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    // await this.emailService.sendPasswordReset(user.email, resetUrl, locale);

    return { message: "If the email exists, a password reset link has been sent." };
  }

  // ==========================================
  // RESET PASSWORD (POST /auth/reset-password)
  // ==========================================

  /**
   * Reset password using the token from the reset email.
   */
  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { resetToken: dto.token },
      select: { id: true, tokenExpiry: true },
    });

    if (!user) {
      throw new NotFoundException("Invalid or expired reset link");
    }

    if (user.tokenExpiry && user.tokenExpiry < new Date()) {
      throw new BadRequestException("Reset link has expired. Please request a new one.");
    }

    const hashedPassword = await bcrypt.hash(dto.password, this.SALT_ROUNDS);

    // Update password, clear reset token, invalidate all refresh tokens
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        tokenExpiry: null,
        refreshToken: null, // Force re-login on all devices
        refreshTokenExp: null,
      },
    });

    return { message: "Password reset successfully. Please log in with your new password." };
  }

  // ==========================================
  // RESEND SIGNUP LINK (POST /auth/resend-signup-link)
  // ==========================================

  /**
   * Generate a new signup/verification token and resend the link.
   * Rate limited at the controller level (3/hour).
   */
  async resendSignupLink(dto: ResendSignupLinkDto): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: {
        id: true,
        email: true,
        firstName: true,
        phoneNumber: true,
        preferredLanguage: true,
        isVerified: true,
        password: true,
      },
    });

    // Always return success to prevent email enumeration
    if (!user) {
      return { message: "If the email exists, a new signup link has been sent." };
    }

    // If already verified and has password, they should just log in
    if (user.isVerified && user.password) {
      return { message: "If the email exists, a new signup link has been sent." };
    }

    if (user.password && !user.isVerified) {
      const verificationCode = this.generateVerificationCode();
      const verificationToken = this.generateSecureToken();
      const codeExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          verificationCode,
          verificationToken,
          tokenExpiry: codeExpiry,
        },
      });

      try {
        await this.signupNotificationsService.sendVerificationChallenge({
          email: user.email,
          name: user.firstName || user.email.split("@")[0] || "Author",
          locale: this.resolveLocale(user.preferredLanguage),
          verificationCode,
          verificationToken,
          phoneNumber: user.phoneNumber,
          fromEmail: this.fromEmail,
        });
      } catch {
        throw new ServiceUnavailableException(
          "We couldn't resend your verification code and link right now. Please try again."
        );
      }

      return { message: "If the email exists, a new signup link has been sent." };
    }

    // Generate new verification token (invalidates old one)
    const verificationToken = this.generateSecureToken();
    const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        verificationToken,
        tokenExpiry,
      },
    });

    try {
      await this.signupNotificationsService.sendRegistrationLink(
        {
          email: user.email,
          token: verificationToken,
          locale: this.resolveLocale(user.preferredLanguage),
          name: user.firstName || user.email.split("@")[0] || "Author",
          phoneNumber: user.phoneNumber,
          fromEmail: this.fromEmail,
        },
        { requireDelivery: true }
      );
    } catch {
      throw new ServiceUnavailableException(
        "We couldn't resend your signup link right now. Please try again."
      );
    }

    return { message: "If the email exists, a new signup link has been sent." };
  }

  // ==========================================
  // HELPER: Generate Token Pair
  // ==========================================

  /**
   * Generate access + refresh token pair.
   * Stores refresh token in database for rotation.
   *
   * Expiry rules from CLAUDE.md:
   * - Access token: 15min
   * - Refresh token (USER): 7 days
   * - Refresh token (ADMIN/SUPER_ADMIN): 1 hour
   */
  private async generateTokenPair(
    userId: string,
    email: string,
    role: UserRole
  ): Promise<TokenPair> {
    const payload: JwtPayload = { sub: userId, email, role };

    // Determine refresh token expiry based on role
    // CLAUDE.md: 15min access, 7d refresh (users), 1h refresh (admins)
    const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN";
    const accessExpiryMs = this.parseExpiryToMs(this.ACCESS_TOKEN_EXPIRY);
    const refreshExpiryMs = isAdmin
      ? this.parseExpiryToMs(this.REFRESH_TOKEN_EXPIRY_ADMIN)
      : this.parseExpiryToMs(this.REFRESH_TOKEN_EXPIRY_USER);

    // Sign access token (expiresIn as seconds — jsonwebtoken v9 requires number)
    const accessToken = jwt.sign(payload, this.JWT_SECRET, {
      expiresIn: Math.floor(accessExpiryMs / 1000),
    });

    // Sign refresh token
    const refreshToken = jwt.sign(payload, this.JWT_SECRET, {
      expiresIn: Math.floor(refreshExpiryMs / 1000),
    });

    // Calculate refresh token expiry date for database storage
    const refreshTokenExp = new Date(Date.now() + refreshExpiryMs);

    // Store refresh token in database (rotation: replaces old token)
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        refreshToken,
        refreshTokenExp,
      },
    });

    return { accessToken, refreshToken };
  }

  // ==========================================
  // HELPER: Cookie Configuration
  // ==========================================

  /**
   * Get HttpOnly cookie options for access token.
   */
  getAccessTokenCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      maxAge: 15 * 60 * 1000, // 15 minutes in ms
    };
  }

  /**
   * Get HttpOnly cookie options for refresh token.
   * Uses role to determine max age.
   */
  getRefreshTokenCookieOptions(role: string): CookieOptions {
    const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN";
    const maxAge = isAdmin
      ? 60 * 60 * 1000 // 1 hour for admins
      : 7 * 24 * 60 * 60 * 1000; // 7 days for users

    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/api/v1/auth", // Only sent to auth endpoints (e.g. /refresh)
      maxAge,
    };
  }

  /**
   * Get cleared cookie options (for logout).
   */
  getClearedCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      maxAge: 0,
    };
  }

  // ==========================================
  // PRIVATE HELPERS
  // ==========================================

  private resolveLocale(value: string | null | undefined): Locale {
    const normalized = value?.trim().toLowerCase();
    if (normalized === "fr" || normalized === "es") return normalized;
    return "en";
  }

  /**
   * Generate a cryptographically secure random token.
   */
  private generateSecureToken(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  /**
   * Generate a 6-digit verification code.
   */
  private generateVerificationCode(): string {
    return crypto.randomInt(100000, 999999).toString();
  }

  /**
   * Parse expiry string (e.g., "15m", "7d", "1h") to milliseconds.
   */
  private parseExpiryToMs(expiry: string): number {
    const match = expiry.match(/^(\d+)([smhd])$/);

    if (!match) {
      // Default to 7 days if format is unrecognized
      return 7 * 24 * 60 * 60 * 1000;
    }

    const value = Number.parseInt(match[1], 10);
    const unit = match[2];

    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return value * (multipliers[unit] ?? 0);
  }
}

// ==========================================
// TYPES
// ==========================================

/**
 * Safe user object (no password or sensitive fields)
 */
export interface SafeUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string | null;
  role: string;
}

/**
 * Cookie options (subset of Express CookieOptions)
 */
interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax" | "strict" | "none";
  path: string;
  maxAge: number;
}
