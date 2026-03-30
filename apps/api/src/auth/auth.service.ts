import * as crypto from "node:crypto";
import type { Locale } from "@bookprinta/emails";
import { renderPasswordResetEmail } from "@bookprinta/emails/render";
import { isAdminRole } from "@bookprinta/shared";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import * as bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { PinoLogger } from "nestjs-pino";
import { Resend } from "resend";
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
  ValidateResetPasswordTokenDto,
  VerifyEmailDto,
  VerifyEmailLinkDto,
} from "./dto/index.js";
import type { JwtPayload, TokenPair } from "./interfaces/index.js";
import { normalizePhoneNumber } from "./phone-number.util.js";
import { hashRefreshToken } from "./refresh-token.util.js";

const AUTH_ACCOUNT_DEACTIVATED_MESSAGE =
  "This account has been deactivated. Use the account recovery/reactivation flow, or contact support or an administrator for assistance.";

const AUTH_ACCOUNT_DELETED_MESSAGE =
  "This account has been permanently deleted. If you believe this is an error, please contact support.";

/**
 * Auth Service — Core authentication and authorization logic.
 *
 * Implements:
 * - "Pay First, Signup Later" flow (finish signup via unique link)
 * - JWT access/refresh tokens with HttpOnly cookies
 * - Refresh token rotation (new pair on each refresh)
 * - Absolute refresh-session window (refresh rotation does not extend initial expiry)
 * - Differentiated token expiry: 15min access, 7d refresh (users) / 1h refresh (admin roles)
 * - Password hashing via bcrypt
 * - Email verification via 6-digit code
 * - Password reset via token link
 * - Resend signup link (rate limited at controller level)
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly resend: Resend | null;
  private readonly SALT_ROUNDS = 12;
  private readonly JWT_SECRET: string;
  private readonly ACCESS_TOKEN_EXPIRY: string;
  private readonly REFRESH_TOKEN_EXPIRY_USER: string;
  private readonly REFRESH_TOKEN_EXPIRY_ADMIN: string;
  private readonly frontendBaseUrl: string;
  private readonly fromEmail: string;
  private readonly cookieSameSite: CookieOptions["sameSite"];
  private readonly cookieDomain: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly signupNotificationsService: SignupNotificationsService,
    private readonly pinoLogger: PinoLogger
  ) {
    this.pinoLogger.setContext(AuthService.name);
    this.resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
    this.JWT_SECRET = process.env.JWT_SECRET || "fallback-dev-secret-change-me";
    this.ACCESS_TOKEN_EXPIRY = process.env.JWT_ACCESS_EXPIRY || "15m";
    this.REFRESH_TOKEN_EXPIRY_USER = process.env.JWT_REFRESH_EXPIRY_USER || "7d";
    this.REFRESH_TOKEN_EXPIRY_ADMIN = process.env.JWT_REFRESH_EXPIRY_ADMIN || "1h";
    this.frontendBaseUrl = this.resolveFrontendBaseUrl();
    this.fromEmail = this.resolveFromEmail();
    this.cookieSameSite = this.resolveCookieSameSite();
    this.cookieDomain = this.resolveCookieDomain();

    this.logger.log(
      `Cookie config — sameSite: ${String(this.cookieSameSite)}, domain: ${this.cookieDomain ?? "(auto)"}, secure: ${process.env.NODE_ENV === "production"}, partitioned: ${this.cookieSameSite === "none" && process.env.NODE_ENV === "production"}`
    );
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
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        password: true,
        isActive: true,
        isDeleted: true,
        isVerified: true,
        tokenExpiry: true,
      },
    });

    if (!user) {
      throw new NotFoundException("Invalid or expired signup link");
    }

    await this.ensureAccountIsActive(user);

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
        isActive: true,
        isDeleted: true,
        isVerified: true,
        tokenExpiry: true,
      },
    });

    if (!user) {
      throw new NotFoundException("Invalid or expired signup link");
    }

    await this.ensureAccountIsActive(user);

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
        emailNotificationsEnabled: true,
        isActive: true,
        isDeleted: true,
        isVerified: true,
        verificationCode: true,
        tokenExpiry: true,
      },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    await this.ensureAccountIsActive(user);

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

    return this.completeEmailVerification(user);
  }

  // ==========================================
  // VERIFY EMAIL LINK (POST /auth/verify-email-link)
  // ==========================================

  /**
   * Verify email directly from tokenized verification link.
   * Token expiry is shared with the 6-digit code window (15 minutes).
   */
  async verifyEmailLink(dto: VerifyEmailLinkDto): Promise<{ user: SafeUser; tokens: TokenPair }> {
    const user = await this.prisma.user.findUnique({
      where: { verificationToken: dto.token },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        preferredLanguage: true,
        emailNotificationsEnabled: true,
        isActive: true,
        isDeleted: true,
        isVerified: true,
        password: true,
        tokenExpiry: true,
      },
    });

    if (!user) {
      throw new NotFoundException("Invalid or expired verification link");
    }

    await this.ensureAccountIsActive(user);

    if (user.isVerified) {
      throw new ConflictException("Email already verified");
    }

    if (!user.password) {
      throw new BadRequestException("Please complete signup first before verifying your email.");
    }

    if (user.tokenExpiry && user.tokenExpiry < new Date()) {
      throw new BadRequestException("Verification link has expired. Please request a new one.");
    }

    return this.completeEmailVerification(user);
  }

  private async completeEmailVerification(user: {
    id: string;
    email: string;
    role: UserRole;
    firstName: string;
    lastName: string | null;
    preferredLanguage: string | null;
    emailNotificationsEnabled: boolean;
  }): Promise<{ user: SafeUser; tokens: TokenPair }> {
    // Mark user as verified, clear challenge artifacts.
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        verificationCode: null,
        verificationToken: null,
        tokenExpiry: null,
      },
    });

    // Generate tokens and set refresh token in database.
    const tokens = await this.generateTokenPair(user.id, user.email, user.role);

    const latestOrder = await this.getLatestOrderSummary(user.id);

    // Best-effort welcome email after successful verification.
    void this.signupNotificationsService.sendWelcomeEmail({
      email: user.email,
      name: user.firstName || user.email.split("@")[0] || "Author",
      locale: this.resolveLocale(user.preferredLanguage),
      fromEmail: this.fromEmail,
      emailNotificationsEnabled: user.emailNotificationsEnabled,
      orderNumber: latestOrder?.orderNumber,
      packageName: latestOrder?.packageName,
      amountPaid: latestOrder
        ? new Intl.NumberFormat("en-NG", {
            style: "currency",
            currency: latestOrder.currency,
            maximumFractionDigits: 0,
          }).format(Number(latestOrder.totalAmount))
        : undefined,
      addons: latestOrder?.addons,
    });

    return {
      user: this.serializeSafeUser(user),
      tokens,
    };
  }

  // ==========================================
  // LOGIN (POST /auth/login)
  // ==========================================

  /**
   * Authenticate user with email/phone and password.
   * Returns token pair + user info on success.
   */
  async login(
    dto: LoginDto,
    context: AuthLoginInstrumentationContext = {}
  ): Promise<{ user: SafeUser; tokens: TokenPair }> {
    const loginTiming: AuthLoginTimingLog = {
      event: "auth.login.timing",
      correlationId: context.correlationId ?? null,
      clientRecaptchaDurationMs: context.clientRecaptchaDurationMs ?? null,
      identifierType: null,
      userLookupDurationMs: null,
      passwordCompareDurationMs: null,
      verifyRecaptchaDurationMs: null,
      refreshTokenHashDurationMs: null,
      refreshTokenPersistDurationMs: null,
      totalDurationMs: null,
      phoneLookupStrategy: null,
      phoneMatchCount: null,
      refreshTokenStorageStrategy: "digest",
      userFound: false,
      outcome: "failure",
      errorCode: null,
      errorMessage: null,
    };
    const loginStartedAt = performance.now();
    const identifier = dto.identifier.trim();
    loginTiming.identifierType = this.isEmailIdentifier(identifier) ? "email" : "phone";
    loginTiming.phoneLookupStrategy =
      loginTiming.identifierType === "phone" ? "normalized_exact" : null;

    let user: {
      id: string;
      email: string;
      role: UserRole;
      firstName: string;
      lastName: string | null;
      password: string | null;
      isActive: boolean;
      isDeleted: boolean;
      isVerified: boolean;
    } | null = null;

    try {
      const recaptchaStartedAt = performance.now();
      const isHuman = await this.verifyRecaptcha(dto.recaptchaToken);
      loginTiming.verifyRecaptchaDurationMs = this.roundDuration(
        performance.now() - recaptchaStartedAt
      );
      if (!isHuman) {
        throw new BadRequestException({
          message: "reCAPTCHA verification failed. Please try again.",
          errorCode: "AUTH_RECAPTCHA_FAILED",
        });
      }

      if (loginTiming.identifierType === "email") {
        const userLookupStartedAt = performance.now();
        user = await this.findUserForEmailLogin(identifier);
        loginTiming.userLookupDurationMs = this.roundDuration(
          performance.now() - userLookupStartedAt
        );
        loginTiming.userFound = Boolean(user?.password);

        if (!user || !user.password) {
          throw new UnauthorizedException({
            message: "Invalid email or password",
            errorCode: "AUTH_INVALID_CREDENTIALS",
          });
        }

        const passwordCompareStartedAt = performance.now();
        const isPasswordValid = await bcrypt.compare(dto.password, user.password);
        loginTiming.passwordCompareDurationMs = this.roundDuration(
          performance.now() - passwordCompareStartedAt
        );
        if (!isPasswordValid) {
          throw new UnauthorizedException({
            message: "Invalid email or password",
            errorCode: "AUTH_INVALID_CREDENTIALS",
          });
        }
      } else {
        const phoneLoginResult = await this.findUserForPhoneLogin(identifier, dto.password);
        user = phoneLoginResult.user;
        loginTiming.userLookupDurationMs = phoneLoginResult.userLookupDurationMs;
        loginTiming.passwordCompareDurationMs = phoneLoginResult.passwordCompareDurationMs;
        loginTiming.phoneMatchCount = phoneLoginResult.phoneMatchCount;
        loginTiming.userFound = Boolean(user);

        if (!user) {
          throw new UnauthorizedException({
            message: "Invalid email or password",
            errorCode: "AUTH_INVALID_CREDENTIALS",
          });
        }
      }

      await this.ensureAccountIsActive(user);

      // Check if email is verified
      if (!user.isVerified) {
        throw new UnauthorizedException({
          message: "Please complete your account setup. Check your email for the signup link.",
          errorCode: "AUTH_UNVERIFIED_ACCOUNT",
          resendEmail: user.email,
        });
      }

      // Generate tokens and set refresh token in database
      const tokens = await this.generateTokenPair(user.id, user.email, user.role, {
        timing: loginTiming,
      });
      loginTiming.outcome = "success";

      return {
        user: this.serializeSafeUser(user),
        tokens,
      };
    } catch (error) {
      loginTiming.errorCode = this.extractAuthErrorCode(error);
      loginTiming.errorMessage = this.extractAuthErrorMessage(error);
      throw error;
    } finally {
      loginTiming.totalDurationMs = this.roundDuration(performance.now() - loginStartedAt);
      this.logLoginTiming(loginTiming);
    }
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

  async getSessionUser(userId: string): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        role: true,
        isActive: true,
        isDeleted: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    await this.ensureAccountIsActive(user);

    return this.serializeSafeUser(user);
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
   *
   * Important: refresh preserves the original refresh-session expiry window.
   * It rotates the token value, but does not extend session lifetime forever.
   */
  async refresh(userId: string, email: string, role: UserRole): Promise<TokenPair> {
    const session = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isActive: true, isDeleted: true, refreshTokenExp: true },
    });

    if (!session?.refreshTokenExp) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    await this.ensureAccountIsActive(session, {
      revokeRefreshToken: true,
    });

    const refreshTokenExpiresAt = new Date(session.refreshTokenExp);
    const remainingMs = refreshTokenExpiresAt.getTime() - Date.now();

    if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
      throw new UnauthorizedException("Refresh token expired");
    }

    return this.generateTokenPair(userId, email, role, {
      refreshTokenExpiresAt,
    });
  }

  // ==========================================
  // FORGOT PASSWORD (POST /auth/forgot-password)
  // ==========================================

  /**
   * Generate password reset token and send email.
   * Always returns success to prevent email enumeration.
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const isHuman = await this.verifyRecaptcha(dto.recaptchaToken);
    if (!isHuman) {
      throw new BadRequestException({
        message: "reCAPTCHA verification failed. Please try again.",
        errorCode: "AUTH_RECAPTCHA_FAILED",
      });
    }

    const normalizedEmail = dto.email.trim().toLowerCase();

    const user = await this.prisma.user.findFirst({
      where: {
        email: {
          equals: normalizedEmail,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        preferredLanguage: true,
        isActive: true,
        isDeleted: true,
        isVerified: true,
      },
    });

    // Always return success to prevent email enumeration
    if (!user || !user.isVerified || !user.isActive || user.isDeleted) {
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

    try {
      await this.sendPasswordResetEmail({
        email: user.email,
        name: user.firstName || user.email.split("@")[0] || "Author",
        token: resetToken,
        locale: this.resolveLocale(user.preferredLanguage),
      });
    } catch (error) {
      this.logger.error(
        `Password reset email send failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return { message: "If the email exists, a password reset link has been sent." };
  }

  // ==========================================
  // RESET PASSWORD (GET/POST /auth/reset-password)
  // ==========================================

  /**
   * Validate reset token before showing reset-password form.
   */
  async validateResetPasswordToken(dto: ValidateResetPasswordTokenDto): Promise<{ valid: true }> {
    await this.getValidResetTokenUser(dto.token);
    return { valid: true };
  }

  /**
   * Reset password using the token from the reset email.
   */
  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    if (dto.recaptchaToken) {
      const isHuman = await this.verifyRecaptcha(dto.recaptchaToken);
      if (!isHuman) {
        throw new BadRequestException("reCAPTCHA verification failed. Please try again.");
      }
    }

    const user = await this.getValidResetTokenUser(dto.token);

    const hashedPassword = await bcrypt.hash(dto.newPassword, this.SALT_ROUNDS);

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
        isActive: true,
        isDeleted: true,
        isVerified: true,
        password: true,
      },
    });

    // Always return success to prevent email enumeration
    if (!user || !user.isActive || user.isDeleted) {
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

    const latestOrder = await this.getLatestOrderSummary(user.id);

    try {
      await this.signupNotificationsService.sendRegistrationLink(
        {
          email: user.email,
          token: verificationToken,
          locale: this.resolveLocale(user.preferredLanguage),
          name: user.firstName || user.email.split("@")[0] || "Author",
          phoneNumber: user.phoneNumber,
          fromEmail: this.fromEmail,
          orderNumber: latestOrder?.orderNumber,
          packageName: latestOrder?.packageName,
          amountPaid: latestOrder
            ? new Intl.NumberFormat("en-NG", {
                style: "currency",
                currency: latestOrder.currency,
                maximumFractionDigits: 0,
              }).format(Number(latestOrder.totalAmount))
            : undefined,
          addons: latestOrder?.addons,
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
   * - Refresh token (admin roles): 1 hour
   *
   * Session rule:
   * - During refresh rotation, reuse the existing refresh expiry (absolute cap)
   *   instead of sliding it forward on every refresh.
   */
  private async generateTokenPair(
    userId: string,
    email: string,
    role: UserRole,
    options: {
      refreshTokenExpiresAt?: Date;
      timing?: AuthLoginTimingLog;
    } = {}
  ): Promise<TokenPair> {
    const payload: JwtPayload = { sub: userId, email, role };

    const accessExpiryMs = this.parseExpiryToMs(this.ACCESS_TOKEN_EXPIRY);
    let refreshTokenExp: Date;

    if (options.refreshTokenExpiresAt) {
      refreshTokenExp = new Date(options.refreshTokenExpiresAt);

      if (!Number.isFinite(refreshTokenExp.getTime()) || refreshTokenExp <= new Date()) {
        throw new UnauthorizedException("Refresh token expired");
      }
    } else {
      // Determine refresh token expiry based on role
      // CLAUDE.md: 15min access, 7d refresh (users), 1h refresh (admin roles)
      const refreshExpiryMsByRole = isAdminRole(role)
        ? this.parseExpiryToMs(this.REFRESH_TOKEN_EXPIRY_ADMIN)
        : this.parseExpiryToMs(this.REFRESH_TOKEN_EXPIRY_USER);
      refreshTokenExp = new Date(Date.now() + refreshExpiryMsByRole);
    }

    const refreshExpiryMs = refreshTokenExp.getTime() - Date.now();
    if (!Number.isFinite(refreshExpiryMs) || refreshExpiryMs <= 0) {
      throw new UnauthorizedException("Refresh token expired");
    }

    // Sign access token (expiresIn as seconds — jsonwebtoken v9 requires number)
    const accessToken = jwt.sign(payload, this.JWT_SECRET, {
      expiresIn: Math.floor(accessExpiryMs / 1000),
    });

    // Sign refresh token
    const refreshToken = jwt.sign(payload, this.JWT_SECRET, {
      expiresIn: Math.max(1, Math.floor(refreshExpiryMs / 1000)),
    });
    const refreshHashStartedAt = performance.now();
    const hashedRefreshToken = hashRefreshToken(refreshToken);
    if (options.timing) {
      options.timing.refreshTokenHashDurationMs = this.roundDuration(
        performance.now() - refreshHashStartedAt
      );
    }

    // Store hashed refresh token in database (rotation: replaces old token)
    const refreshPersistStartedAt = performance.now();
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        refreshToken: hashedRefreshToken,
        refreshTokenExp,
      },
    });
    if (options.timing) {
      options.timing.refreshTokenPersistDurationMs = this.roundDuration(
        performance.now() - refreshPersistStartedAt
      );
    }

    return { accessToken, refreshToken };
  }

  // ==========================================
  // HELPER: Cookie Configuration
  // ==========================================

  /**
   * Get HttpOnly cookie options for access token.
   */
  getAccessTokenCookieOptions(): CookieOptions {
    const secure = process.env.NODE_ENV === "production";
    const usePartitioned = this.cookieSameSite === "none" && secure;
    return {
      httpOnly: true,
      secure,
      sameSite: this.cookieSameSite,
      domain: this.cookieDomain,
      path: "/",
      maxAge: 15 * 60 * 1000, // 15 minutes in ms
      ...(usePartitioned ? { partitioned: true } : {}),
    };
  }

  /**
   * Get HttpOnly cookie options for refresh token.
   * Uses role to determine max age.
   */
  getRefreshTokenCookieOptions(role: string): CookieOptions {
    const maxAge = isAdminRole(role)
      ? 60 * 60 * 1000 // 1 hour for admin roles
      : 7 * 24 * 60 * 60 * 1000; // 7 days for users

    const secure = process.env.NODE_ENV === "production";
    const usePartitioned = this.cookieSameSite === "none" && secure;
    return {
      httpOnly: true,
      secure,
      sameSite: this.cookieSameSite,
      domain: this.cookieDomain,
      path: "/api/v1/auth", // Only sent to auth endpoints (e.g. /refresh)
      maxAge,
      ...(usePartitioned ? { partitioned: true } : {}),
    };
  }

  /**
   * Get cleared cookie options (for logout).
   */
  getClearedCookieOptions(): CookieOptions {
    const secure = process.env.NODE_ENV === "production";
    const usePartitioned = this.cookieSameSite === "none" && secure;
    return {
      httpOnly: true,
      secure,
      sameSite: this.cookieSameSite,
      domain: this.cookieDomain,
      path: "/",
      maxAge: 0,
      ...(usePartitioned ? { partitioned: true } : {}),
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

  private serializeSafeUser(user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string | null;
    phoneNumber?: string | null;
    role: UserRole;
  }): SafeUser {
    const displayName = this.buildDisplayName(user.firstName, user.lastName, user.email);

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phoneNumber ?? null,
      role: user.role,
      displayName,
      initials: this.buildInitials(displayName, user.email),
    };
  }

  private buildDisplayName(firstName: string, lastName: string | null, email: string): string {
    const displayName = [firstName, lastName]
      .map((value) => value?.replace(/\s+/g, " ").trim() ?? "")
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    return displayName || this.buildEmailDisplayName(email);
  }

  private buildEmailDisplayName(email: string): string {
    const cleaned = (email.split("@")[0] || "")
      .replace(/[._-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!cleaned) return "Account";

    return cleaned
      .split(" ")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  private buildInitials(displayName: string, email: string): string {
    const source = displayName || this.buildEmailDisplayName(email);
    const words = source.split(" ").filter(Boolean);

    if (words.length === 0) return "AC";
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();

    return `${words[0].charAt(0)}${words[1].charAt(0)}`.toUpperCase();
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

  private async findUserForEmailLogin(identifier: string): Promise<{
    id: string;
    email: string;
    role: UserRole;
    firstName: string;
    lastName: string | null;
    password: string | null;
    isActive: boolean;
    isDeleted: boolean;
    isVerified: boolean;
  } | null> {
    const select = {
      id: true,
      email: true,
      role: true,
      firstName: true,
      lastName: true,
      password: true,
      isActive: true,
      isDeleted: true,
      isVerified: true,
    } as const;

    return this.prisma.user.findFirst({
      where: {
        email: {
          equals: identifier,
          mode: "insensitive",
        },
      },
      select,
    });
  }

  private async findUserForPhoneLogin(
    identifier: string,
    password: string
  ): Promise<{
    user: {
      id: string;
      email: string;
      role: UserRole;
      firstName: string;
      lastName: string | null;
      password: string | null;
      isActive: boolean;
      isDeleted: boolean;
      isVerified: boolean;
    } | null;
    userLookupDurationMs: number;
    passwordCompareDurationMs: number;
    phoneMatchCount: number;
  }> {
    const userLookupStartedAt = performance.now();
    const normalizedPhone = normalizePhoneNumber(identifier);
    const trimmedIdentifier = identifier.trim();
    if (!normalizedPhone && !trimmedIdentifier) {
      return {
        user: null,
        userLookupDurationMs: this.roundDuration(performance.now() - userLookupStartedAt),
        passwordCompareDurationMs: 0,
        phoneMatchCount: 0,
      };
    }

    const users = await this.prisma.user.findMany({
      where: {
        OR: [
          ...(normalizedPhone ? [{ phoneNumberNormalized: normalizedPhone }] : []),
          ...(trimmedIdentifier ? [{ phoneNumber: trimmedIdentifier }] : []),
        ],
      },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        password: true,
        isActive: true,
        isDeleted: true,
        isVerified: true,
      },
    });
    const userLookupDurationMs = this.roundDuration(performance.now() - userLookupStartedAt);

    let passwordCompareDurationMs = 0;
    for (const candidate of users) {
      if (!candidate.password) continue;
      const passwordCompareStartedAt = performance.now();
      const isPasswordValid = await bcrypt.compare(password, candidate.password);
      passwordCompareDurationMs += performance.now() - passwordCompareStartedAt;
      if (isPasswordValid) {
        return {
          user: candidate,
          userLookupDurationMs,
          passwordCompareDurationMs: this.roundDuration(passwordCompareDurationMs),
          phoneMatchCount: users.length,
        };
      }
    }

    return {
      user: null,
      userLookupDurationMs,
      passwordCompareDurationMs: this.roundDuration(passwordCompareDurationMs),
      phoneMatchCount: users.length,
    };
  }

  private roundDuration(value: number): number {
    return Math.max(0, Math.round(value));
  }

  private extractAuthErrorCode(error: unknown): string | null {
    if (error instanceof BadRequestException || error instanceof UnauthorizedException) {
      const response = error.getResponse();
      if (typeof response === "object" && response && "errorCode" in response) {
        const errorCode = response.errorCode;
        return typeof errorCode === "string" ? errorCode : null;
      }
    }

    return error instanceof Error ? error.name : null;
  }

  private extractAuthErrorMessage(error: unknown): string | null {
    if (error instanceof Error) {
      return error.message;
    }

    return null;
  }

  private logLoginTiming(timing: AuthLoginTimingLog) {
    this.pinoLogger.info(timing, "Auth login timing");
  }

  private isEmailIdentifier(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  private async getValidResetTokenUser(
    token: string
  ): Promise<{ id: string; isActive: boolean; isDeleted: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { resetToken: token },
      select: { id: true, isActive: true, isDeleted: true, tokenExpiry: true },
    });

    if (!user) {
      throw new BadRequestException("Invalid or expired reset link");
    }

    await this.ensureAccountIsActive(user);

    if (user.tokenExpiry && user.tokenExpiry < new Date()) {
      throw new BadRequestException("Reset link has expired. Please request a new one.");
    }

    return { id: user.id, isActive: user.isActive, isDeleted: user.isDeleted };
  }

  private async ensureAccountIsActive(
    user: { id: string; isActive: boolean; isDeleted?: boolean },
    options: { revokeRefreshToken?: boolean } = {}
  ): Promise<void> {
    if (user.isDeleted) {
      if (options.revokeRefreshToken) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { refreshToken: null, refreshTokenExp: null },
        });
      }

      throw new UnauthorizedException({
        message: AUTH_ACCOUNT_DELETED_MESSAGE,
        errorCode: "AUTH_ACCOUNT_DELETED",
      });
    }

    if (user.isActive) {
      return;
    }

    if (options.revokeRefreshToken) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          refreshToken: null,
          refreshTokenExp: null,
        },
      });
    }

    throw new UnauthorizedException({
      message: AUTH_ACCOUNT_DEACTIVATED_MESSAGE,
      errorCode: "AUTH_ACCOUNT_DEACTIVATED",
    });
  }

  private async sendPasswordResetEmail(params: {
    email: string;
    name: string;
    locale: Locale;
    token: string;
  }): Promise<boolean> {
    if (!this.resend) {
      this.logger.warn("RESEND_API_KEY not set — password reset email skipped");
      return false;
    }

    const rendered = await renderPasswordResetEmail({
      locale: params.locale,
      userName: params.name,
      resetUrl: this.buildResetPasswordUrl(params.token),
    });

    const result = await this.resend.emails.send({
      from: this.fromEmail,
      to: params.email,
      subject: rendered.subject,
      html: rendered.html,
    });

    if (result.error) {
      this.logger.error(
        `Failed to send password reset email: ${result.error.name} — ${result.error.message}`
      );
      return false;
    }

    return true;
  }

  private buildResetPasswordUrl(token: string): string {
    return `${this.frontendBaseUrl}/reset-password?token=${encodeURIComponent(token)}`;
  }

  private resolveFromEmail(): string {
    const configured =
      process.env.CONTACT_FROM_EMAIL ||
      process.env.DEFAULT_FROM_EMAIL ||
      process.env.ADMIN_FROM_EMAIL ||
      "BookPrinta <info@bookprinta.com>";

    const normalized = configured.trim();
    return normalized.length > 0 ? normalized : "BookPrinta <info@bookprinta.com>";
  }

  private resolveCookieSameSite(): CookieOptions["sameSite"] {
    const configured = process.env.AUTH_COOKIE_SAME_SITE?.trim().toLowerCase();
    if (configured === "strict" || configured === "lax" || configured === "none") {
      return configured;
    }

    return process.env.NODE_ENV === "production" ? "none" : "lax";
  }

  private resolveCookieDomain(): string | undefined {
    const configured = process.env.AUTH_COOKIE_DOMAIN?.trim();
    if (!configured) return undefined;
    return configured;
  }

  /**
   * Validate reCAPTCHA token with Google's API.
   * Skips verification in development or when secret key is missing.
   */
  private async verifyRecaptcha(token: string): Promise<boolean> {
    const secretKey = process.env.RECAPTCHA_SECRET_KEY;
    if (!secretKey) {
      this.logger.warn("RECAPTCHA_SECRET_KEY not set — skipping verification");
      return true;
    }

    if (process.env.NODE_ENV !== "production") {
      this.logger.warn("Development mode — skipping reCAPTCHA verification");
      return true;
    }

    try {
      const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret: secretKey, response: token }),
        signal: AbortSignal.timeout(5000),
      });

      const data = (await response.json()) as {
        success?: boolean;
        score?: number;
        "error-codes"?: string[];
      };

      if (!data.success) {
        this.logger.warn(
          `reCAPTCHA rejected — success: ${data.success}, score: ${data.score}, errors: ${JSON.stringify(data["error-codes"])}`
        );
      }

      return data.success === true && (data.score === undefined || data.score >= 0.5);
    } catch (error) {
      this.logger.error("reCAPTCHA verification network error", error);
      return false;
    }
  }

  private resolveFrontendBaseUrl(): string {
    const raw = process.env.FRONTEND_URL?.trim();
    if (!raw) {
      this.logger.warn("FRONTEND_URL not set — using http://localhost:3000 for reset links");
      return "http://localhost:3000";
    }

    return raw.replace(/\/+$/, "");
  }

  private async getLatestOrderSummary(userId: string): Promise<{
    orderNumber: string;
    packageName: string;
    totalAmount: number;
    currency: string;
    addons: string[];
  } | null> {
    const latestOrder = await this.prisma.order.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        orderNumber: true,
        totalAmount: true,
        currency: true,
        package: { select: { name: true } },
      },
    });

    if (!latestOrder) return null;

    const orderAddons = await this.prisma.orderAddon.findMany({
      where: { orderId: latestOrder.id },
      select: { addon: { select: { name: true } } },
    });

    return {
      orderNumber: latestOrder.orderNumber,
      packageName: latestOrder.package?.name ?? "BookPrinta Package",
      totalAmount: Number(latestOrder.totalAmount),
      currency: latestOrder.currency || "NGN",
      addons: orderAddons.map((item) => item.addon.name).filter(Boolean),
    };
  }
}

// ==========================================
// TYPES
// ==========================================

type AuthLoginIdentifierType = "email" | "phone";

type AuthLoginInstrumentationContext = {
  correlationId?: string | null;
  clientRecaptchaDurationMs?: number | null;
};

type AuthLoginTimingLog = {
  event: "auth.login.timing";
  correlationId: string | null;
  clientRecaptchaDurationMs: number | null;
  identifierType: AuthLoginIdentifierType | null;
  userLookupDurationMs: number | null;
  passwordCompareDurationMs: number | null;
  verifyRecaptchaDurationMs: number | null;
  refreshTokenHashDurationMs: number | null;
  refreshTokenPersistDurationMs: number | null;
  totalDurationMs: number | null;
  phoneLookupStrategy: "normalized_exact" | null;
  phoneMatchCount: number | null;
  refreshTokenStorageStrategy: "digest";
  userFound: boolean;
  outcome: "success" | "failure";
  errorCode: string | null;
  errorMessage: string | null;
};

/**
 * Safe user object (no password or sensitive fields)
 */
export interface SafeUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  role: UserRole;
  displayName: string;
  initials: string;
}

/**
 * Cookie options (subset of Express CookieOptions)
 */
interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax" | "strict" | "none";
  domain?: string;
  path: string;
  maxAge: number;
  partitioned?: boolean;
}
