import { renderContactAdminEmail, renderContactConfirmEmail } from "@bookprinta/emails/render";
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Resend } from "resend";
import { verifyRecaptchaToken } from "../common/recaptcha.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { RedisService } from "../redis/index.js";
import type { CreateContactDto } from "./dto/create-contact.dto.js";
import type { ReplyContactDto } from "./dto/reply-contact.dto.js";

/** Submitter-provided text is interpolated into HTML below — escape it. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Subject enum → human-readable labels for emails.
 */
const SUBJECT_LABELS: Record<string, Record<string, string>> = {
  en: {
    GENERAL_INQUIRY: "General Inquiry",
    CUSTOM_QUOTE: "Custom Quote",
    PARTNERSHIP: "Partnership",
    SUPPORT: "Support",
    OTHER: "Other",
  },
  fr: {
    GENERAL_INQUIRY: "Renseignement général",
    CUSTOM_QUOTE: "Devis personnalisé",
    PARTNERSHIP: "Partenariat",
    SUPPORT: "Support",
    OTHER: "Autre",
  },
  es: {
    GENERAL_INQUIRY: "Consulta general",
    CUSTOM_QUOTE: "Cotización personalizada",
    PARTNERSHIP: "Asociación",
    SUPPORT: "Soporte",
    OTHER: "Otro",
  },
};

/**
 * Rate limit config for contact form submissions.
 * 3 submissions per IP per hour via Redis.
 */
const RATE_LIMIT = {
  maxRequests: 3,
  windowSeconds: 3600, // 1 hour
  keyPrefix: "contact_rl:",
};

/**
 * Race a promise against a timeout. Used to cap Redis/DB operations
 * that may hang after Render cold starts (maxRetriesPerRequest: null
 * means ioredis retries forever if connection is reconnecting).
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);
  /** Null when RESEND_API_KEY is unset — emails are skipped, the API still boots. */
  private readonly resend: Resend | null;
  private readonly contactFromEmail =
    process.env.CONTACT_FROM_EMAIL || "BookPrinta <info@bookprinta.com>";
  private readonly contactAdminEmail = process.env.CONTACT_ADMIN_EMAIL || "info@bookprinta.com";

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService
  ) {
    this.resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
  }

  // ── Rate Limiting (Redis-backed) ────────────────────────────────────

  /**
   * Check and enforce rate limit using Redis INCR + EXPIRE.
   * Returns true if allowed, throws TooManyRequestsException if blocked.
   */
  private async checkRateLimit(ip: string): Promise<void> {
    const redis = this.redisService.getClient();
    if (!redis) {
      // Redis not available — fall back to allowing (lossy, per CLAUDE.md)
      this.logger.warn("Redis unavailable — skipping rate limit check");
      return;
    }

    try {
      const key = `${RATE_LIMIT.keyPrefix}${ip}`;
      // 3s timeout — prevents hanging when Redis is reconnecting after cold start
      // (maxRetriesPerRequest: null means ioredis retries forever by default)
      const current = await withTimeout(redis.incr(key), 3000, "Redis rate limit");

      // Set expiry on first request in window
      if (current === 1) {
        // Fire-and-forget — expiry is best-effort
        redis.expire(key, RATE_LIMIT.windowSeconds).catch(() => {});
      }

      if (current > RATE_LIMIT.maxRequests) {
        this.logger.warn(`Rate limit exceeded for IP ${ip} (${current}/${RATE_LIMIT.maxRequests})`);
        throw new HttpException(
          "Too many contact submissions. Please try again in an hour.",
          HttpStatus.TOO_MANY_REQUESTS
        );
      }
    } catch (error) {
      // If it's our own rate limit error, re-throw it
      if (error instanceof HttpException) {
        throw error;
      }
      // Redis timed out or errored — allow the request (lossy rate limiting)
      this.logger.warn(`Rate limit check failed, allowing request: ${error}`);
    }
  }

  // ── reCAPTCHA v3 Verification ───────────────────────────────────────

  /** reCAPTCHA check — fails closed in production (see common/recaptcha.ts). */
  private verifyRecaptcha(token: string): Promise<boolean> {
    return verifyRecaptchaToken(token, this.logger);
  }

  // ── Email Sending ───────────────────────────────────────────────────

  /**
   * Send admin notification + user confirmation emails after a contact submission.
   * Uses pre-rendered email helpers from @bookprinta/emails/render.
   */
  private async sendEmails(submission: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    subject: string;
    subjectOther: string | null;
    message: string;
  }): Promise<void> {
    const locale = "en";
    const subjectLabel =
      submission.subject === "OTHER" && submission.subjectOther
        ? submission.subjectOther
        : (SUBJECT_LABELS[locale]?.[submission.subject] ?? submission.subject);

    const firstName = submission.name.split(" ")[0] ?? submission.name;
    const adminPanelUrl = `${process.env.FRONTEND_URL || "https://bookprinta.com"}/admin/contact/${submission.id}`;

    try {
      // 1. Admin notification — rendered via helper (avoids JSX in API)
      const admin = await renderContactAdminEmail({
        locale,
        fullName: submission.name,
        email: submission.email,
        phone: submission.phone ?? undefined,
        subject: submission.subject,
        subjectLabel,
        message: submission.message,
        submissionId: submission.id,
        adminPanelUrl,
      });

      const adminResult = await this.sendEmail({
        from: this.contactFromEmail,
        to: this.contactAdminEmail,
        subject: admin.subject,
        html: admin.html,
      });

      if (adminResult.error) {
        this.logger.error(
          `Resend admin email failed: ${adminResult.error.name} — ${adminResult.error.message}`
        );
      } else {
        this.logger.log(
          `Admin notification sent for submission ${submission.id} (Resend ID: ${adminResult.data?.id})`
        );
      }

      // 2. User confirmation — rendered via helper
      const confirm = await renderContactConfirmEmail({
        locale,
        firstName,
        subject: submission.subject,
        subjectLabel,
        message: submission.message,
      });

      const confirmResult = await this.sendEmail({
        from: this.contactFromEmail,
        to: submission.email,
        subject: confirm.subject,
        html: confirm.html,
      });

      if (confirmResult.error) {
        this.logger.error(
          `Resend user email failed: ${confirmResult.error.name} — ${confirmResult.error.message}`
        );
      } else {
        this.logger.log(
          `User confirmation sent to ${submission.email} (Resend ID: ${confirmResult.data?.id})`
        );
      }
    } catch (error) {
      // Don't fail the entire request if email sending fails.
      // The submission is already saved to the database.
      const errMsg = error instanceof Error ? error.message : String(error);
      const errStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to send contact emails: ${errMsg}`, errStack);
    }
  }

  // ── Public: Create Submission ───────────────────────────────────────

  /**
   * Create a new contact submission.
   * - Redis rate limited (3/IP/hour)
   * - reCAPTCHA v3 verified
   * - Saved to Prisma
   * - Sends admin + user emails
   */
  async create(dto: CreateContactDto, clientIp: string) {
    // 1. Rate limit check
    await this.checkRateLimit(clientIp);

    // 2. Verify reCAPTCHA
    const isHuman = await this.verifyRecaptcha(dto.recaptchaToken);
    if (!isHuman) {
      throw new BadRequestException("reCAPTCHA verification failed. Please try again.");
    }

    // 3. Validate "OTHER" subject requires subjectOther
    if (dto.subject === "OTHER" && (!dto.subjectOther || dto.subjectOther.trim().length < 2)) {
      throw new BadRequestException("Please specify your subject");
    }

    // 4. Save to database (10s timeout — Neon cold start can take up to 8s)
    const submission = await withTimeout(
      this.prisma.contactSubmission.create({
        data: {
          name: dto.name.trim(),
          email: dto.email.trim().toLowerCase(),
          phone: dto.phone?.trim() || null,
          subject: dto.subject,
          subjectOther: dto.subject === "OTHER" ? dto.subjectOther?.trim() : null,
          message: dto.message.trim(),
        },
      }),
      10000,
      "Database save"
    );

    this.logger.log(`New contact submission: ${submission.id} from ${submission.email}`);

    // 5. Send emails (fire-and-forget — don't block the response)
    this.sendEmails(submission).catch((err) => {
      this.logger.error("Background email send failed", err);
    });

    return {
      success: true,
      message: "Your message has been sent successfully.",
      id: submission.id,
    };
  }

  // ── Admin: Reply to Submission ──────────────────────────────────────

  /**
   * Admin replies to a contact submission.
   * Sends a reply email to the original submitter and records it in the DB.
   */
  async reply(dto: ReplyContactDto) {
    // 1. Find the original submission
    const submission = await this.prisma.contactSubmission.findUnique({
      where: { id: dto.submissionId },
    });

    if (!submission) {
      throw new NotFoundException("Contact submission not found");
    }

    // 2. Update with admin reply
    await this.prisma.contactSubmission.update({
      where: { id: dto.submissionId },
      data: {
        adminReply: dto.replyMessage,
        repliedAt: new Date(),
      },
    });

    // 3. Send reply email to the submitter
    const replySubject = dto.replySubject || `Re: ${submission.subject} — BookPrinta`;

    try {
      await this.sendEmail({
        from: this.contactFromEmail,
        to: submission.email,
        subject: replySubject,
        html: `
          <div style="font-family: 'DM Sans', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px;">
            <p style="font-size: 15px; line-height: 24px; color: #2A2A2A;">Hi ${escapeHtml(submission.name.split(" ")[0] ?? "")},</p>
            <div style="font-size: 15px; line-height: 24px; color: #2A2A2A; white-space: pre-wrap;">${escapeHtml(dto.replyMessage)}</div>
            <hr style="border-top: 1px solid #ededed; margin: 24px 0;" />
            <p style="font-size: 13px; color: #6b7280;">Best regards,<br />The BookPrinta Team</p>
          </div>
        `,
      });

      this.logger.log(`Admin reply sent for submission ${dto.submissionId} to ${submission.email}`);
    } catch (error) {
      this.logger.error("Failed to send admin reply email", error);
      throw new BadRequestException("Reply saved but email delivery failed. Please try again.");
    }

    return {
      success: true,
      message: "Reply sent successfully.",
    };
  }

  /**
   * Send through Resend, or report a not-configured error in the same shape so
   * callers' existing `result.error` handling logs it. A missing key used to
   * throw in the constructor and take the whole API down at boot.
   */
  private async sendEmail(payload: Parameters<Resend["emails"]["send"]>[0]) {
    if (!this.resend) {
      return {
        data: null,
        error: { name: "not_configured", message: "RESEND_API_KEY is not set; email skipped" },
      };
    }
    return this.resend.emails.send(payload);
  }
}
