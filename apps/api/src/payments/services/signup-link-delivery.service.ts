import type { Locale } from "@bookprinta/emails";
import { Injectable, Logger } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import type { Prisma } from "../../generated/prisma/client.js";
import { PaymentStatus, PaymentType } from "../../generated/prisma/enums.js";
import { SignupNotificationsService } from "../../notifications/signup-notifications.service.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { resolveCustomerFacingFromEmail, resolveFrontendBaseUrl } from "../payment-config.js";
import {
  asBoolean,
  asInteger,
  asRecord,
  asString,
  formatNaira,
  pickDisplayName,
  resolveLocale,
} from "../payment-metadata.js";

export const SIGNUP_LINK_DELIVERY_METADATA_KEY = "signupLinkDelivery";

export const SIGNUP_LINK_DELIVERY_MAX_ATTEMPTS = 3;

export type SignupLinkDeliveryStatus = "DELIVERED" | "PARTIAL" | "FAILED";

export type SignupLinkDeliveryAttemptSource = "BANK_TRANSFER_APPROVAL" | "WEBHOOK" | "VERIFY_RETRY";

export type SignupLinkDeliverySnapshot = {
  status: SignupLinkDeliveryStatus;
  emailDelivered: boolean;
  whatsappDelivered: boolean;
  emailFailureReason: string | null;
  whatsappFailureReason: string | null;
  attemptCount: number;
  lastAttemptAt: string | null;
  lastSuccessfulAt: string | null;
  lastAttemptSource: SignupLinkDeliveryAttemptSource;
};

export type PublicSignupLinkDeliveryStatus = {
  status: SignupLinkDeliveryStatus;
  emailDelivered: boolean;
  whatsappDelivered: boolean;
  attemptCount: number;
  lastAttemptAt: string | null;
  retryEligible: boolean;
};

/**
 * Delivery of the "finish your signup" link after a first payment (pay first,
 * sign up later).
 *
 * The link is the only way a paying guest reaches their account, so every
 * attempt is recorded on the payment's metadata (channel results, attempt
 * count) and an undeliverable link is reported to Sentry rather than only
 * logged.
 */
@Injectable()
export class SignupLinkDeliveryService {
  private readonly logger = new Logger(SignupLinkDeliveryService.name);
  private readonly frontendBaseUrl = resolveFrontendBaseUrl();
  private readonly customerPaymentsFromEmail = resolveCustomerFacingFromEmail();

  constructor(
    private readonly prisma: PrismaService,
    private readonly signupNotificationsService: SignupNotificationsService
  ) {}

  /**
   * Surface a paying customer who cannot complete signup.
   *
   * Each of these branches means the same thing: money was taken, the signup link
   * failed to deliver, and no further automated attempt will be made. Logging
   * alone is not enough — Pino writes to stdout and never reaches Sentry, so
   * these would otherwise scroll past unnoticed while a customer sits stranded.
   *
   * Deliberately captured as a message (nothing threw) with the payment
   * reference in the fingerprint-relevant fields so occurrences group by cause
   * rather than flooding one issue.
   */
  private captureStrandedSignup(
    reference: string,
    paymentId: string,
    reason: string,
    extra: Record<string, unknown> = {}
  ): void {
    Sentry.captureMessage(`Signup link undeliverable for paid order (${reason})`, {
      level: "error",
      tags: { area: "signup_delivery", reason },
      extra: { reference, paymentId, ...extra },
    });
  }

  async attemptSignupLinkDelivery(params: {
    paymentId: string;
    paymentReference: string;
    baseMetadata?: Record<string, unknown> | null;
    source: SignupLinkDeliveryAttemptSource;
    email: string;
    name: string;
    locale: Locale;
    token: string;
    phoneNumber?: string | null;
    orderNumber?: string;
    packageName?: string;
    amountPaid?: string;
    addons?: string[];
  }): Promise<SignupLinkDeliverySnapshot> {
    const delivery = await this.signupNotificationsService.sendRegistrationLink({
      email: params.email,
      name: params.name,
      locale: params.locale,
      token: params.token,
      phoneNumber: params.phoneNumber,
      fromEmail: this.customerPaymentsFromEmail,
      orderNumber: params.orderNumber,
      packageName: params.packageName,
      amountPaid: params.amountPaid,
      addons: params.addons,
    });
    const metadata =
      params.baseMetadata ??
      asRecord(
        (
          await this.prisma.payment.findUnique({
            where: { id: params.paymentId },
            select: { metadata: true },
          })
        )?.metadata
      );
    const previous = this.readSignupLinkDeliverySnapshot(metadata);
    const attemptedAt = asString(delivery.attemptedAt) ?? new Date().toISOString();
    const delivered = delivery.emailDelivered || delivery.whatsappDelivered;
    const snapshot: SignupLinkDeliverySnapshot = {
      status: delivered
        ? delivery.emailDelivered && delivery.whatsappDelivered
          ? "DELIVERED"
          : "PARTIAL"
        : "FAILED",
      emailDelivered: delivery.emailDelivered,
      whatsappDelivered: delivery.whatsappDelivered,
      emailFailureReason: this.truncateSignupLinkFailureReason(delivery.emailFailureReason),
      whatsappFailureReason: this.truncateSignupLinkFailureReason(delivery.whatsappFailureReason),
      attemptCount: (previous?.attemptCount ?? 0) + 1,
      lastAttemptAt: attemptedAt,
      lastSuccessfulAt: delivered ? attemptedAt : (previous?.lastSuccessfulAt ?? null),
      lastAttemptSource: params.source,
    };
    const nextMetadata = {
      ...(metadata ?? {}),
      [SIGNUP_LINK_DELIVERY_METADATA_KEY]: snapshot,
    };

    await this.prisma.payment.update({
      where: { id: params.paymentId },
      data: {
        metadata: nextMetadata as Prisma.InputJsonValue,
      },
    });

    if (snapshot.status === "FAILED") {
      this.logger.warn(
        `Signup link delivery failed for payment ${params.paymentReference} ` +
          `(attempt ${snapshot.attemptCount}, source ${params.source}). ` +
          `emailReason=${snapshot.emailFailureReason ?? "none"}, ` +
          `whatsappReason=${snapshot.whatsappFailureReason ?? "none"}`
      );
    } else {
      const channels =
        snapshot.emailDelivered && snapshot.whatsappDelivered
          ? "email and WhatsApp"
          : snapshot.emailDelivered
            ? "email"
            : "WhatsApp";
      this.logger.log(
        `Signup link delivered for payment ${params.paymentReference} via ${channels} ` +
          `(attempt ${snapshot.attemptCount}, source ${params.source})`
      );
    }

    return snapshot;
  }

  private readSignupLinkDeliverySnapshot(
    metadata: Record<string, unknown> | null
  ): SignupLinkDeliverySnapshot | null {
    const raw = asRecord(metadata?.[SIGNUP_LINK_DELIVERY_METADATA_KEY]);
    if (!raw) return null;

    const status = asString(raw.status);
    if (status !== "DELIVERED" && status !== "PARTIAL" && status !== "FAILED") {
      return null;
    }

    return {
      status,
      emailDelivered: asBoolean(raw.emailDelivered) ?? false,
      whatsappDelivered: asBoolean(raw.whatsappDelivered) ?? false,
      emailFailureReason: asString(raw.emailFailureReason) ?? null,
      whatsappFailureReason: asString(raw.whatsappFailureReason) ?? null,
      attemptCount: asInteger(raw.attemptCount) ?? 0,
      lastAttemptAt: asString(raw.lastAttemptAt) ?? null,
      lastSuccessfulAt: asString(raw.lastSuccessfulAt) ?? null,
      lastAttemptSource:
        asString(raw.lastAttemptSource) === "BANK_TRANSFER_APPROVAL" ||
        asString(raw.lastAttemptSource) === "VERIFY_RETRY"
          ? (asString(raw.lastAttemptSource) as SignupLinkDeliveryAttemptSource)
          : "WEBHOOK",
    };
  }

  private toPublicSignupLinkDeliveryStatus(
    snapshot: SignupLinkDeliverySnapshot | null
  ): PublicSignupLinkDeliveryStatus | null {
    if (!snapshot) return null;

    return {
      status: snapshot.status,
      emailDelivered: snapshot.emailDelivered,
      whatsappDelivered: snapshot.whatsappDelivered,
      attemptCount: snapshot.attemptCount,
      lastAttemptAt: snapshot.lastAttemptAt,
      retryEligible: this.isSignupLinkDeliveryRetryEligible(snapshot),
    };
  }

  private isSignupLinkDeliveryRetryEligible(snapshot: SignupLinkDeliverySnapshot | null): boolean {
    if (!snapshot) return false;
    return (
      snapshot.status === "FAILED" && snapshot.attemptCount < SIGNUP_LINK_DELIVERY_MAX_ATTEMPTS
    );
  }

  private truncateSignupLinkFailureReason(value?: string | null): string | null {
    const normalized = asString(value);
    if (!normalized) return null;
    return normalized.length > 220 ? `${normalized.slice(0, 217)}...` : normalized;
  }

  async resolveSignupFollowUpForReference(
    reference: string,
    options: {
      retryFailedDelivery?: boolean;
    } = {}
  ): Promise<{
    signupUrl: string | null;
    signupDelivery: PublicSignupLinkDeliveryStatus | null;
  }> {
    const payment = await this.prisma.payment.findUnique({
      where: { providerRef: reference },
      select: {
        id: true,
        type: true,
        status: true,
        metadata: true,
        user: {
          select: {
            email: true,
            firstName: true,
            phoneNumber: true,
            isActive: true,
            verificationToken: true,
            tokenExpiry: true,
            preferredLanguage: true,
          },
        },
        order: {
          select: {
            orderNumber: true,
            totalAmount: true,
            package: {
              select: {
                name: true,
              },
            },
            addons: {
              select: {
                addon: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!payment || payment.status !== PaymentStatus.SUCCESS) {
      return {
        signupUrl: null,
        signupDelivery: null,
      };
    }

    const supportsSignupFollowUp =
      payment.type === PaymentType.INITIAL || payment.type === PaymentType.CUSTOM_QUOTE;

    if (!supportsSignupFollowUp) {
      return {
        signupUrl: null,
        signupDelivery: null,
      };
    }

    const metadata = asRecord(payment.metadata);
    let snapshot = this.readSignupLinkDeliverySnapshot(metadata);
    const token = payment.user?.verificationToken?.trim();
    const tokenExpired = Boolean(
      payment.user?.tokenExpiry && payment.user.tokenExpiry < new Date()
    );
    const userInactive = payment.user?.isActive === false;
    const locale = resolveLocale(payment.user?.preferredLanguage);

    if (options.retryFailedDelivery && snapshot?.status === "FAILED") {
      if (!token) {
        this.logger.warn(
          `Signup link retry skipped for payment ${reference}: verification token missing`
        );
        this.captureStrandedSignup(reference, payment.id, "verification_token_missing");
      } else if (userInactive) {
        // Deliberately NOT captured: the account was deactivated, so having no
        // signup link is the intended outcome rather than a stranded customer.
        this.logger.warn(`Signup link retry skipped for payment ${reference}: user is inactive`);
      } else if (tokenExpired) {
        this.logger.warn(
          `Signup link retry skipped for payment ${reference}: verification token expired`
        );
        this.captureStrandedSignup(reference, payment.id, "verification_token_expired");
      } else if (!this.isSignupLinkDeliveryRetryEligible(snapshot)) {
        this.logger.warn(
          `Signup link retry skipped for payment ${reference}: max attempts reached (${snapshot.attemptCount})`
        );
        this.captureStrandedSignup(reference, payment.id, "max_delivery_attempts_reached", {
          attemptCount: snapshot.attemptCount,
        });
      } else if (!payment.user?.email || !payment.order) {
        this.logger.warn(
          `Signup link retry skipped for payment ${reference}: payment follow-up context incomplete`
        );
        this.captureStrandedSignup(reference, payment.id, "follow_up_context_incomplete");
      } else {
        snapshot = await this.attemptSignupLinkDelivery({
          paymentId: payment.id,
          paymentReference: reference,
          baseMetadata: metadata,
          source: "VERIFY_RETRY",
          email: payment.user.email,
          name: payment.user.firstName?.trim() || pickDisplayName(undefined, payment.user.email),
          locale,
          token,
          phoneNumber: payment.user.phoneNumber ?? null,
          orderNumber: payment.order.orderNumber,
          packageName: payment.order.package.name,
          amountPaid: formatNaira(Number(payment.order.totalAmount)),
          addons: payment.order.addons
            .map((entry) => entry.addon.name)
            .filter((value): value is string => value.trim().length > 0),
        });
      }
    }

    if (!token || tokenExpired || userInactive) {
      return {
        signupUrl: null,
        signupDelivery: this.toPublicSignupLinkDeliveryStatus(snapshot),
      };
    }

    return {
      signupUrl: this.buildSignupFinishUrl(token, locale),
      signupDelivery: this.toPublicSignupLinkDeliveryStatus(snapshot),
    };
  }

  private buildSignupFinishUrl(token: string, locale: Locale): string {
    return `${this.frontendBaseUrl}/${locale}/signup/finish?token=${encodeURIComponent(token)}`;
  }
}
