import type { Locale } from "@bookprinta/emails";
import {
  renderQuoteAdminNotificationEmail,
  renderQuoteReceivedEmail,
} from "@bookprinta/emails/render";
import type {
  CreateQuoteInput,
  CreateQuoteResponse,
  QuoteEstimateInput,
  QuoteEstimateResponse,
} from "@bookprinta/shared";
import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { Resend } from "resend";
import { PrismaService } from "../prisma/prisma.service.js";

const DEFAULT_QUOTE_COST_PER_PAGE = 10;
const DEFAULT_QUOTE_COVER_COST = 500;
const QUOTE_COST_PER_PAGE_KEY = "quote_cost_per_page";
const QUOTE_COVER_COST_KEY = "quote_cover_cost";
const ESTIMATE_RANGE_MARGIN = 5000;
const PLATFORM_MARGIN = 1.35;
const WORDS_PER_PAGE = 200;

interface QuoteEstimatorSettings {
  costPerPage: number;
  coverCost: number;
}

export interface QuoteSubmissionContext {
  ip: string;
  nextLocale?: string;
  acceptLanguage?: string;
}

@Injectable()
export class QuotesService {
  private readonly logger = new Logger(QuotesService.name);
  private readonly resend: Resend | null;
  private readonly quoteFromEmail: string | null;
  private readonly quoteAdminRecipients: string[];
  private readonly frontendBaseUrl: string;

  constructor(private readonly prisma: PrismaService) {
    this.resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
    this.quoteFromEmail = this.resolveQuoteFromEmail();
    this.quoteAdminRecipients = this.resolveQuoteAdminRecipients();
    this.frontendBaseUrl = this.resolveFrontendBaseUrl();
  }

  /**
   * Price estimator endpoint (Path B).
   *
   * Formula from CLAUDE.md Section 8:
   * NP = Math.ceil(estimatedWordCount / 200)
   * A5 Total = ((NP + 10) * CPP + C) * Q * 1.35
   * A4 Total = A5 Total * 2
   * A6 Total = A5 Total / 2
   * Low  = Math.round(Total - 5000)
   * High = Math.round(Total + 5000)
   */
  async estimate(input: QuoteEstimateInput): Promise<QuoteEstimateResponse> {
    const settings = await this.getEstimatorSettings();

    const estimatedPages = Math.ceil(input.estimatedWordCount / WORDS_PER_PAGE);
    const a5Total =
      ((estimatedPages + 10) * settings.costPerPage + settings.coverCost) *
      input.quantity *
      PLATFORM_MARGIN;

    const total = this.applyBookSizeMultiplier(a5Total, input.bookSize);
    const estimatedPriceLow = Math.max(0, Math.round(total - ESTIMATE_RANGE_MARGIN));
    const estimatedPriceHigh = Math.max(0, Math.round(total + ESTIMATE_RANGE_MARGIN));

    return {
      estimatedPriceLow,
      estimatedPriceHigh,
    };
  }

  /**
   * Quote submission endpoint (Path B).
   */
  async create(
    input: CreateQuoteInput,
    context: QuoteSubmissionContext
  ): Promise<CreateQuoteResponse> {
    const locale = this.resolveLocale(context.nextLocale, context.acceptLanguage);
    const isHuman = await this.verifyRecaptcha(input.recaptchaToken);
    if (!isHuman) {
      throw new BadRequestException("reCAPTCHA verification failed. Please try again.");
    }

    const specialRequirements = this.normalizeSpecialRequirements(
      input.specialRequirements,
      input.hasSpecialReqs
    );
    const hasOtherSpecialRequirement = specialRequirements.includes("other");
    const normalizedWorkingTitle = input.workingTitle.trim();
    const normalizedFullName = input.fullName.trim();
    const normalizedEmail = input.email.trim().toLowerCase();
    const normalizedPhone = input.phone.trim();
    const normalizedSpecialRequirementsOther = hasOtherSpecialRequirement
      ? this.normalizeText(input.specialRequirementsOther)
      : null;
    const calculatedEstimate = input.hasSpecialReqs
      ? null
      : await this.estimate({
          estimatedWordCount: input.estimatedWordCount,
          bookSize: input.bookSize,
          quantity: input.quantity,
        });
    const estimatedPriceLow = input.hasSpecialReqs
      ? null
      : (calculatedEstimate?.estimatedPriceLow ?? null);
    const estimatedPriceHigh = input.hasSpecialReqs
      ? null
      : (calculatedEstimate?.estimatedPriceHigh ?? null);

    const createdQuote = await this.prisma.customQuote.create({
      data: {
        workingTitle: normalizedWorkingTitle,
        estimatedWordCount: input.estimatedWordCount,
        bookPrintSize: input.bookSize,
        quantity: input.quantity,
        coverType: input.coverType,
        hasSpecialReqs: input.hasSpecialReqs,
        specialReqs: specialRequirements,
        specialReqsOther: normalizedSpecialRequirementsOther,
        fullName: normalizedFullName,
        email: normalizedEmail,
        phone: normalizedPhone,
        estimatedPriceLow,
        estimatedPriceHigh,
        status: "PENDING",
      },
      select: {
        id: true,
        status: true,
      },
    });

    this.logger.log(
      `Custom quote submitted: ${createdQuote.id} (locale=${locale}, ip=${context.ip || "unknown"})`
    );

    await this.sendQuoteEmails({
      quoteId: createdQuote.id,
      locale,
      workingTitle: normalizedWorkingTitle,
      estimatedWordCount: input.estimatedWordCount,
      bookSize: input.bookSize,
      quantity: input.quantity,
      coverType: input.coverType,
      hasSpecialReqs: input.hasSpecialReqs,
      specialRequirements,
      specialRequirementsOther: normalizedSpecialRequirementsOther,
      fullName: normalizedFullName,
      email: normalizedEmail,
      phone: normalizedPhone,
      estimatedPriceLow,
      estimatedPriceHigh,
    });

    return {
      id: createdQuote.id,
      status: createdQuote.status,
      message: "Custom quote submitted successfully.",
    };
  }

  private async sendQuoteEmails(params: {
    quoteId: string;
    locale: Locale;
    workingTitle: string;
    estimatedWordCount: number;
    bookSize: CreateQuoteInput["bookSize"];
    quantity: number;
    coverType: CreateQuoteInput["coverType"];
    hasSpecialReqs: boolean;
    specialRequirements: CreateQuoteInput["specialRequirements"];
    specialRequirementsOther: string | null;
    fullName: string;
    email: string;
    phone: string;
    estimatedPriceLow: number | null;
    estimatedPriceHigh: number | null;
  }): Promise<void> {
    if (!this.resend) {
      this.logger.warn("RESEND_API_KEY not set - quote emails skipped");
      return;
    }

    if (!this.quoteFromEmail) {
      this.logger.warn("Quote sender email not configured in env - quote emails skipped");
      return;
    }

    try {
      const firstName = params.fullName.split(/\s+/)[0] || params.fullName;
      const userRendered = await renderQuoteReceivedEmail({
        locale: params.locale,
        referenceNumber: params.quoteId,
        userName: firstName,
        email: params.email,
        phone: params.phone,
        workingTitle: params.workingTitle,
        estimatedWordCount: params.estimatedWordCount,
        bookSize: params.bookSize,
        quantity: params.quantity,
        coverType: params.coverType,
        hasSpecialReqs: params.hasSpecialReqs,
        specialRequirements: params.specialRequirements,
        specialRequirementsOther: params.specialRequirementsOther,
        estimatedPriceLow: params.estimatedPriceLow,
        estimatedPriceHigh: params.estimatedPriceHigh,
      });

      const userSendResult = await this.resend.emails.send({
        from: this.quoteFromEmail,
        to: params.email,
        subject: userRendered.subject,
        html: userRendered.html,
      });

      if (userSendResult.error) {
        this.logger.error(
          `Failed to send quote user email: ${userSendResult.error.name} - ${userSendResult.error.message}`
        );
      }
    } catch (error) {
      this.logger.error("Failed to send quote user email", error);
    }

    if (this.quoteAdminRecipients.length === 0) {
      this.logger.warn("Quote admin recipient email not configured in env - admin email skipped");
      return;
    }

    try {
      const adminRendered = await renderQuoteAdminNotificationEmail({
        locale: params.locale,
        referenceNumber: params.quoteId,
        fullName: params.fullName,
        email: params.email,
        phone: params.phone,
        workingTitle: params.workingTitle,
        estimatedWordCount: params.estimatedWordCount,
        bookSize: params.bookSize,
        quantity: params.quantity,
        coverType: params.coverType,
        hasSpecialReqs: params.hasSpecialReqs,
        specialRequirements: params.specialRequirements,
        specialRequirementsOther: params.specialRequirementsOther,
        estimatedPriceLow: params.estimatedPriceLow,
        estimatedPriceHigh: params.estimatedPriceHigh,
        adminPanelUrl: this.buildQuoteAdminPanelUrl(params.quoteId),
      });

      const adminSendResult = await this.resend.emails.send({
        from: this.quoteFromEmail,
        to: this.quoteAdminRecipients,
        subject: adminRendered.subject,
        html: adminRendered.html,
      });

      if (adminSendResult.error) {
        this.logger.error(
          `Failed to send quote admin email: ${adminSendResult.error.name} - ${adminSendResult.error.message}`
        );
      }
    } catch (error) {
      this.logger.error("Failed to send quote admin email", error);
    }
  }

  private resolveQuoteFromEmail(): string | null {
    const candidates = [
      process.env.QUOTE_FROM_EMAIL,
      process.env.ADMIN_FROM_EMAIL,
      process.env.CONTACT_FROM_EMAIL,
      process.env.DEFAULT_FROM_EMAIL,
    ];

    for (const candidate of candidates) {
      if (candidate && candidate.trim().length > 0) {
        return candidate.trim();
      }
    }

    return null;
  }

  private resolveQuoteAdminRecipients(): string[] {
    const sources = [
      process.env.QUOTE_ADMIN_EMAILS,
      process.env.ADMIN_NOTIFICATION_EMAIL,
      process.env.CONTACT_ADMIN_EMAIL,
      process.env.ADMIN_FROM_EMAIL,
    ];

    const recipients = sources
      .filter((value): value is string => Boolean(value && value.trim().length > 0))
      .flatMap((value) => value.split(","))
      .map((value) => this.extractEmailAddress(value))
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase());

    return Array.from(new Set(recipients));
  }

  private extractEmailAddress(value: string): string | null {
    const normalized = value.trim();
    if (!normalized) return null;

    const bracketMatch = normalized.match(/<([^>]+)>/);
    const candidate = bracketMatch?.[1]?.trim() || normalized;
    if (!candidate.includes("@")) return null;
    return candidate;
  }

  private resolveFrontendBaseUrl(): string {
    const raw =
      process.env.FRONTEND_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_WEB_URL ||
      "";
    const normalized = raw.trim().replace(/\/+$/, "");
    if (!normalized) return "";
    if (/^https?:\/\//i.test(normalized)) return normalized;
    return `https://${normalized}`;
  }

  private buildQuoteAdminPanelUrl(quoteId: string): string {
    if (!this.frontendBaseUrl) return "";
    return `${this.frontendBaseUrl}/admin/quotes/${quoteId}`;
  }

  private async getEstimatorSettings(): Promise<QuoteEstimatorSettings> {
    const rows = await this.prisma.systemSetting.findMany({
      where: {
        key: { in: [QUOTE_COST_PER_PAGE_KEY, QUOTE_COVER_COST_KEY] },
      },
      select: {
        key: true,
        value: true,
      },
    });

    const values = new Map(rows.map((row) => [row.key, row.value]));

    return {
      costPerPage: this.parseSettingNumber(
        values.get(QUOTE_COST_PER_PAGE_KEY),
        DEFAULT_QUOTE_COST_PER_PAGE
      ),
      coverCost: this.parseSettingNumber(
        values.get(QUOTE_COVER_COST_KEY),
        DEFAULT_QUOTE_COVER_COST
      ),
    };
  }

  private parseSettingNumber(value: string | undefined, fallback: number): number {
    if (value == null) return fallback;

    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return fallback;
    }

    return parsed;
  }

  private applyBookSizeMultiplier(
    totalA5: number,
    bookSize: QuoteEstimateInput["bookSize"]
  ): number {
    if (bookSize === "A4") {
      return totalA5 * 2;
    }

    if (bookSize === "A6") {
      return totalA5 / 2;
    }

    return totalA5;
  }

  private normalizeSpecialRequirements(
    specialRequirements: CreateQuoteInput["specialRequirements"],
    hasSpecialReqs: boolean
  ): CreateQuoteInput["specialRequirements"] {
    if (!hasSpecialReqs) {
      return [];
    }

    return Array.from(new Set(specialRequirements));
  }

  private normalizeText(value: string | null | undefined): string | null {
    const normalized = value?.trim();
    if (!normalized) return null;
    return normalized;
  }

  private resolveLocale(nextLocale?: string, acceptLanguage?: string): Locale {
    const fromCookie = this.normalizeLocale(nextLocale);
    if (fromCookie) return fromCookie;

    if (acceptLanguage) {
      const candidates = acceptLanguage
        .split(",")
        .map((part) => part.split(";")[0]?.trim())
        .filter(Boolean);

      for (const candidate of candidates) {
        const normalized = this.normalizeLocale(candidate);
        if (normalized) return normalized;

        const shortCode = candidate.toLowerCase().slice(0, 2);
        const normalizedShortCode = this.normalizeLocale(shortCode);
        if (normalizedShortCode) return normalizedShortCode;
      }
    }

    return "en";
  }

  private normalizeLocale(value: string | undefined): Locale | null {
    const normalized = value?.trim().toLowerCase();
    if (!normalized) return null;
    if (normalized === "fr") return "fr";
    if (normalized === "es") return "es";
    if (normalized === "en") return "en";
    return null;
  }

  /**
   * Optional reCAPTCHA check for the public quote form.
   * - No secret key: skip verification
   * - Non-production: skip verification
   * - No token provided: skip verification (optional)
   */
  private async verifyRecaptcha(token?: string): Promise<boolean> {
    const secretKey = process.env.RECAPTCHA_SECRET_KEY;
    if (!secretKey) {
      this.logger.warn("RECAPTCHA_SECRET_KEY not set — skipping verification");
      return true;
    }

    if (process.env.NODE_ENV !== "production") {
      this.logger.warn("Development mode — skipping reCAPTCHA verification");
      return true;
    }

    const normalizedToken = token?.trim();
    if (!normalizedToken) {
      return true;
    }

    try {
      const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret: secretKey, response: normalizedToken }),
        signal: AbortSignal.timeout(5000),
      });

      const data = (await response.json()) as { success?: boolean; score?: number };
      return data.success === true && (data.score === undefined || data.score >= 0.5);
    } catch (error) {
      this.logger.error("reCAPTCHA verification failed", error);
      return false;
    }
  }
}
