import type { Locale } from "@bookprinta/emails";
import { DEFAULT_CURRENCY } from "@bookprinta/shared";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import { normalizePhoneNumber } from "../../auth/phone-number.util.js";
import type { Prisma } from "../../generated/prisma/client.js";
import {
  BookStatus,
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
  PaymentType,
} from "../../generated/prisma/enums.js";
import { NotificationsService } from "../../notifications/notifications.service.js";
import { WhatsappNotificationsService } from "../../notifications/whatsapp-notifications.service.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { resolvePackageFromCheckoutMetadata } from "../checkout-package.js";
import {
  asNumber,
  asRecord,
  asString,
  type CheckoutMetadata,
  type CustomQuoteCheckoutMetadata,
  extractCheckoutMetadata,
  extractCustomQuoteCheckoutMetadata,
  formatNaira,
  generateSecureToken,
  isPrismaUniqueViolation,
  isPrismaUniqueViolationForField,
  normalizeWebhookMetadata,
  pickDisplayName,
  resolveLocale,
  splitFullName,
  toCurrency,
} from "../payment-metadata.js";
import { CheckoutMetadataPricingService } from "./checkout-metadata-pricing.service.js";
import { ExtraPagesPaymentService } from "./extra-pages-payment.service.js";
import { PaymentNotificationsService } from "./payment-notifications.service.js";
import { ReprintPaymentService } from "./reprint-payment.service.js";
import { SignupLinkDeliveryService } from "./signup-link-delivery.service.js";

export const MAX_SIGNUP_TOKEN_HOURS = 24;

export const PHONE_ALREADY_IN_USE_MESSAGE =
  "This phone number is already linked to another account. Use another phone number or sign in to your existing account.";

export const EMAIL_PHONE_IDENTITY_CONFLICT_MESSAGE =
  "This email and phone number belong to different accounts. Sign in to the correct account or use a different phone number.";

export const DEACTIVATED_CHECKOUT_ACCOUNT_MESSAGE =
  "This account has been deactivated. Reactivate your account first using the recovery flow, or contact support or an administrator before continuing with payment or account setup.";

export type CheckoutFinalizationInfo = {
  userId: string;
  orderId: string;
  email: string;
  name: string;
  locale: Locale;
  signupToken: string | null;
  phone: string | null;
  whatsAppNotificationsEnabled: boolean;
  orderNumber: string;
  packageName: string;
  amountPaid: string;
  addons: string[];
};

/**
 * Turns a confirmed payment into what the customer paid for.
 *
 * For a first checkout that means the account (pay first, sign up later), the
 * order, the book and its addons; for a reprint, the reprint order and book;
 * for a custom quote, the quote's order. Extra-page and reprint payments are
 * handed to their own services.
 *
 * A payment is claimed atomically before anything is created (`processedAt` is
 * set only while it is still null) and released again if creation fails, so a
 * retried webhook, the browser redirect and reconciliation can all arrive for
 * one charge and only one order is created.
 */
@Injectable()
export class CheckoutFulfillmentService {
  private readonly logger = new Logger(CheckoutFulfillmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly paymentNotifications: PaymentNotificationsService,
    private readonly signupLinkDelivery: SignupLinkDeliveryService,
    private readonly metadataPricing: CheckoutMetadataPricingService,
    private readonly extraPagesService: ExtraPagesPaymentService,
    private readonly reprintPaymentService: ReprintPaymentService,
    @Optional() private readonly whatsappNotificationsService: WhatsappNotificationsService | null
  ) {}

  /**
   * Create a Payment record from a verified webhook.
   * Called by handlePaystackWebhook / handleStripeWebhook after
   * signature verification and idempotency check pass.
   *
   * For initial checkout payments this creates/links:
   *   Payment → User (pending) → Order → Book
   * and sends a signup link email as a network fallback.
   *
   * For pre-created payments this updates the existing pending record to
   * SUCCESS, then runs any follow-up fulfillment required for that payment type.
   */
  async createPaymentFromWebhook(data: {
    provider: PaymentProvider;
    providerRef: string;
    amount: number;
    currency: string;
    payerEmail: string | null;
    gatewayResponse: Record<string, unknown>;
    metadata: Record<string, unknown> | null;
  }) {
    const metadata = normalizeWebhookMetadata(data.metadata);

    const existingPayment = await this.prisma.payment.findUnique({
      where: { providerRef: data.providerRef },
      select: {
        id: true,
        type: true,
        userId: true,
        orderId: true,
        processedAt: true,
        metadata: true,
        payerEmail: true,
      },
    });

    if (existingPayment) {
      if (existingPayment.processedAt) {
        this.logger.log(`Payment ${data.providerRef} already processed — skipping`);
        return;
      }

      const persistedMetadata = asRecord(existingPayment.metadata);
      const mergedMetadata =
        persistedMetadata || metadata
          ? {
              // Persisted metadata is authoritative because initialize-time
              // dashboard payments store the full checkout context before the
              // provider webhook can truncate or reshape it.
              ...(metadata ?? {}),
              ...(persistedMetadata ?? {}),
            }
          : null;

      // Atomic claim: only update if processedAt is still null.
      // This prevents a race between the webhook handler and the
      // verify-polling endpoint both calling createPaymentFromWebhook
      // concurrently — only the first caller's update will match.
      const claimed = await this.prisma.payment.updateMany({
        where: { id: existingPayment.id, processedAt: null },
        data: {
          status: PaymentStatus.SUCCESS,
          processedAt: new Date(),
          amount: data.amount,
          currency: data.currency,
          payerEmail: data.payerEmail ?? existingPayment.payerEmail,
          gatewayResponse: data.gatewayResponse as Prisma.InputJsonValue,
          metadata: (mergedMetadata ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });

      if (claimed.count === 0) {
        this.logger.log(`Payment ${data.providerRef} claimed by another process — skipping`);
        return;
      }

      const shouldCreateReprintEntities =
        existingPayment.type === PaymentType.REPRINT && !existingPayment.orderId;

      if (shouldCreateReprintEntities) {
        try {
          const reprintResult = await this.reprintPaymentService.createReprintEntitiesFromMetadata({
            paymentId: existingPayment.id,
            userId: existingPayment.userId,
            payerEmail: data.payerEmail ?? existingPayment.payerEmail,
            metadata: mergedMetadata,
            amount: data.amount,
            currency: data.currency,
          });

          if (reprintResult) {
            await this.paymentNotifications.sendOnlinePaymentAdminEmail({
              orderNumber: reprintResult.orderNumber,
              packageName: reprintResult.packageName,
              amountPaid: reprintResult.amountPaid,
              addons: reprintResult.addons,
              payerEmail: reprintResult.email,
              provider: data.provider,
              reference: data.providerRef,
            });

            await this.reprintPaymentService.sendReprintConfirmationEmails({
              locale: reprintResult.locale,
              userName: reprintResult.name,
              userEmail: reprintResult.email,
              orderNumber: reprintResult.orderNumber,
              bookTitle: reprintResult.bookTitle,
              copies: reprintResult.copies,
              costPerCopy: reprintResult.costPerCopy,
              bookSize: reprintResult.bookSize,
              paperColor: reprintResult.paperColor,
              lamination: reprintResult.lamination,
              totalPrice: reprintResult.amountPaid,
            });

            await this.paymentNotifications.sendPaymentConfirmationWhatsApp({
              userName: reprintResult.name,
              phoneNumber: reprintResult.phone,
              preferredLanguage: reprintResult.locale,
              whatsAppNotificationsEnabled: reprintResult.whatsAppNotificationsEnabled,
              orderNumber: reprintResult.orderNumber,
              packageName: reprintResult.packageName,
              amountPaid: reprintResult.amountPaid,
              addons: reprintResult.addons,
              variant: "reprint",
              dashboardUrl: this.paymentNotifications.buildLocalizedDashboardUrl(
                reprintResult.locale
              ),
            });
          }
        } catch (error) {
          this.logger.error(
            `Failed to create reprint entities for payment ${existingPayment.id} — reverting processedAt so retry is possible: ${error instanceof Error ? error.message : error}`,
            error instanceof Error ? error.stack : undefined
          );
          await this.prisma.payment.update({
            where: { id: existingPayment.id },
            data: { processedAt: null, status: PaymentStatus.PENDING },
          });
          throw error;
        }
        return;
      }

      const shouldCreateCheckoutEntities =
        existingPayment.type === PaymentType.INITIAL &&
        (!existingPayment.userId || !existingPayment.orderId);

      const shouldFinalizeCustomQuoteLinkedCheckout =
        existingPayment.type === PaymentType.CUSTOM_QUOTE &&
        Boolean(existingPayment.userId) &&
        Boolean(existingPayment.orderId);

      if (shouldFinalizeCustomQuoteLinkedCheckout) {
        const quoteCheckoutResult = await this.buildCheckoutFinalizationInfoForLinkedPayment({
          paymentId: existingPayment.id,
          userId: existingPayment.userId as string,
          orderId: existingPayment.orderId as string,
          payerEmail: data.payerEmail ?? existingPayment.payerEmail,
          payerName: null,
          metadata: mergedMetadata,
        });

        if (quoteCheckoutResult) {
          await this.paymentNotifications.sendOnlinePaymentAdminEmail({
            orderNumber: quoteCheckoutResult.orderNumber,
            packageName: quoteCheckoutResult.packageName,
            amountPaid: quoteCheckoutResult.amountPaid,
            addons: quoteCheckoutResult.addons,
            payerEmail: quoteCheckoutResult.email,
            provider: data.provider,
            reference: data.providerRef,
          });

          if (quoteCheckoutResult.signupToken) {
            await this.signupLinkDelivery.attemptSignupLinkDelivery({
              paymentId: existingPayment.id,
              paymentReference: data.providerRef,
              baseMetadata: mergedMetadata,
              source: "WEBHOOK",
              email: quoteCheckoutResult.email,
              locale: quoteCheckoutResult.locale,
              name: quoteCheckoutResult.name,
              token: quoteCheckoutResult.signupToken,
              phoneNumber: quoteCheckoutResult.phone,
              orderNumber: quoteCheckoutResult.orderNumber,
              packageName: quoteCheckoutResult.packageName,
              amountPaid: quoteCheckoutResult.amountPaid,
              addons: quoteCheckoutResult.addons,
            });
          }

          await this.paymentNotifications.sendPaymentConfirmationWhatsApp({
            userName: quoteCheckoutResult.name,
            phoneNumber: quoteCheckoutResult.phone,
            preferredLanguage: quoteCheckoutResult.locale,
            whatsAppNotificationsEnabled: quoteCheckoutResult.whatsAppNotificationsEnabled,
            orderNumber: quoteCheckoutResult.orderNumber,
            packageName: quoteCheckoutResult.packageName,
            amountPaid: quoteCheckoutResult.amountPaid,
            addons: quoteCheckoutResult.addons,
            variant: "quote",
            dashboardUrl: this.paymentNotifications.buildLocalizedDashboardUrl(
              quoteCheckoutResult.locale
            ),
          });
        }

        return;
      }

      if (!shouldCreateCheckoutEntities) {
        if (existingPayment.type === PaymentType.EXTRA_PAGES && existingPayment.orderId) {
          await this.extraPagesService.reconcileExtraPagesBillingGate(existingPayment.orderId);
          await this.extraPagesService.sendExtraPagesPaymentConfirmationWhatsApp(
            existingPayment.orderId,
            this.whatsappNotificationsService
          );
        }
        return;
      }

      const checkoutResult = await this.createCheckoutEntitiesFromMetadata({
        paymentId: existingPayment.id,
        payerEmail: data.payerEmail ?? existingPayment.payerEmail,
        metadata: mergedMetadata,
        amount: data.amount,
        currency: data.currency,
        // Only the DB-recorded owner (set server-side at initialize) is trusted
        // here; a metadata dashboardUserId is honoured only when signed.
        existingUserId: existingPayment.userId ?? undefined,
      });

      const isDashboardOrder = asString(mergedMetadata?.source) === "dashboard";

      if (checkoutResult && isDashboardOrder) {
        // Dashboard order: user already has an account — send new-book confirmation emails
        await this.paymentNotifications.sendNewBookOrderEmails({
          paymentId: existingPayment.id,
          baseMetadata: mergedMetadata,
          locale: checkoutResult.locale,
          userName: checkoutResult.name,
          userEmail: checkoutResult.email,
          orderNumber: checkoutResult.orderNumber,
          packageName: checkoutResult.packageName,
          amountPaid: checkoutResult.amountPaid,
          addons: checkoutResult.addons,
          provider: data.provider,
          reference: data.providerRef,
        });
      } else if (checkoutResult) {
        await this.paymentNotifications.sendOnlinePaymentAdminEmail({
          orderNumber: checkoutResult.orderNumber,
          packageName: checkoutResult.packageName,
          amountPaid: checkoutResult.amountPaid,
          addons: checkoutResult.addons,
          payerEmail: checkoutResult.email,
          provider: data.provider,
          reference: data.providerRef,
        });
      }

      if (checkoutResult?.signupToken && !isDashboardOrder) {
        await this.signupLinkDelivery.attemptSignupLinkDelivery({
          paymentId: existingPayment.id,
          paymentReference: data.providerRef,
          baseMetadata: mergedMetadata,
          source: "WEBHOOK",
          email: checkoutResult.email,
          locale: checkoutResult.locale,
          name: checkoutResult.name,
          token: checkoutResult.signupToken,
          phoneNumber: checkoutResult.phone,
          orderNumber: checkoutResult.orderNumber,
          packageName: checkoutResult.packageName,
          amountPaid: checkoutResult.amountPaid,
          addons: checkoutResult.addons,
        });
      }

      if (checkoutResult) {
        await this.paymentNotifications.sendPaymentConfirmationWhatsApp({
          userName: checkoutResult.name,
          phoneNumber: checkoutResult.phone,
          preferredLanguage: checkoutResult.locale,
          whatsAppNotificationsEnabled: checkoutResult.whatsAppNotificationsEnabled,
          orderNumber: checkoutResult.orderNumber,
          packageName: checkoutResult.packageName,
          amountPaid: checkoutResult.amountPaid,
          addons: checkoutResult.addons,
          variant: "standard",
          dashboardUrl: this.paymentNotifications.buildLocalizedDashboardUrl(checkoutResult.locale),
        });
      }
      return;
    }

    // No existing payment record — create one. The unique constraint on
    // providerRef means if two concurrent callers race here, only one
    // will succeed; the other will throw a unique constraint error which
    // we catch and treat as "already processed".
    let payment: { id: string };
    try {
      payment = await this.prisma.payment.create({
        data: {
          provider: data.provider,
          type: PaymentType.INITIAL,
          amount: data.amount,
          currency: data.currency,
          status: PaymentStatus.SUCCESS,
          providerRef: data.providerRef,
          processedAt: new Date(),
          payerEmail: data.payerEmail,
          gatewayResponse: data.gatewayResponse,
          metadata: metadata ?? undefined,
        } as Prisma.PaymentUncheckedCreateInput,
      });
    } catch (error) {
      // Prisma unique constraint violation (P2002) means another process
      // already created this payment — safe to skip.
      if (isPrismaUniqueViolation(error)) {
        this.logger.log(
          `Payment ${data.providerRef} already created by another process — skipping`
        );
        return;
      }
      throw error;
    }

    const checkoutResult = await this.createCheckoutEntitiesFromMetadata({
      paymentId: payment.id,
      payerEmail: data.payerEmail,
      metadata,
      amount: data.amount,
      currency: data.currency,
    });

    const isDashboardNewPayment = asString(metadata?.source) === "dashboard";

    if (checkoutResult && isDashboardNewPayment) {
      await this.paymentNotifications.sendNewBookOrderEmails({
        paymentId: payment.id,
        baseMetadata: metadata,
        locale: checkoutResult.locale,
        userName: checkoutResult.name,
        userEmail: checkoutResult.email,
        orderNumber: checkoutResult.orderNumber,
        packageName: checkoutResult.packageName,
        amountPaid: checkoutResult.amountPaid,
        addons: checkoutResult.addons,
        provider: data.provider,
        reference: data.providerRef,
      });
    } else if (checkoutResult) {
      await this.paymentNotifications.sendOnlinePaymentAdminEmail({
        orderNumber: checkoutResult.orderNumber,
        packageName: checkoutResult.packageName,
        amountPaid: checkoutResult.amountPaid,
        addons: checkoutResult.addons,
        payerEmail: checkoutResult.email,
        provider: data.provider,
        reference: data.providerRef,
      });
    }

    if (checkoutResult?.signupToken && !isDashboardNewPayment) {
      await this.signupLinkDelivery.attemptSignupLinkDelivery({
        paymentId: payment.id,
        paymentReference: data.providerRef,
        baseMetadata: metadata,
        source: "WEBHOOK",
        email: checkoutResult.email,
        locale: checkoutResult.locale,
        name: checkoutResult.name,
        token: checkoutResult.signupToken,
        phoneNumber: checkoutResult.phone,
        orderNumber: checkoutResult.orderNumber,
        packageName: checkoutResult.packageName,
        amountPaid: checkoutResult.amountPaid,
        addons: checkoutResult.addons,
      });
    }

    if (checkoutResult) {
      await this.paymentNotifications.sendPaymentConfirmationWhatsApp({
        userName: checkoutResult.name,
        phoneNumber: checkoutResult.phone,
        preferredLanguage: checkoutResult.locale,
        whatsAppNotificationsEnabled: checkoutResult.whatsAppNotificationsEnabled,
        orderNumber: checkoutResult.orderNumber,
        packageName: checkoutResult.packageName,
        amountPaid: checkoutResult.amountPaid,
        addons: checkoutResult.addons,
        variant: "standard",
        dashboardUrl: this.paymentNotifications.buildLocalizedDashboardUrl(checkoutResult.locale),
      });
    }
  }

  async ensureBankTransferApprovalSignupInfo(params: {
    paymentId: string;
    payerEmail: string | null;
    payerName: string | null;
    amount: number;
    currency: string;
    metadata: Record<string, unknown> | null;
    userId: string | null;
    orderId: string | null;
  }): Promise<CheckoutFinalizationInfo | null> {
    let resolvedUserId = params.userId;
    let resolvedOrderId = params.orderId;

    if (resolvedOrderId && !resolvedUserId) {
      const existingOrder = await this.prisma.order.findUnique({
        where: { id: resolvedOrderId },
        select: { userId: true },
      });

      if (existingOrder?.userId) {
        resolvedUserId = existingOrder.userId;
      } else {
        resolvedOrderId = null;
      }
    }

    if (resolvedUserId && resolvedOrderId) {
      const linkedCheckout = await this.buildCheckoutFinalizationInfoForLinkedPayment({
        paymentId: params.paymentId,
        userId: resolvedUserId,
        orderId: resolvedOrderId,
        payerEmail: params.payerEmail,
        payerName: params.payerName,
        metadata: params.metadata,
      });

      if (linkedCheckout) {
        return linkedCheckout;
      }

      resolvedOrderId = null;
    }

    return this.createCheckoutEntitiesFromMetadata({
      paymentId: params.paymentId,
      payerEmail: params.payerEmail,
      metadata: params.metadata,
      amount: params.amount,
      currency: params.currency,
      existingUserId: resolvedUserId,
    });
  }

  private async buildCheckoutFinalizationInfoForLinkedPayment(params: {
    paymentId: string;
    userId: string;
    orderId: string;
    payerEmail: string | null;
    payerName: string | null;
    metadata: Record<string, unknown> | null;
  }): Promise<CheckoutFinalizationInfo | null> {
    const checkout = extractCheckoutMetadata(params.metadata);
    const signupTokenExpiry = new Date(Date.now() + MAX_SIGNUP_TOKEN_HOURS * 60 * 60 * 1000);

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: params.orderId },
        select: {
          id: true,
          userId: true,
          orderNumber: true,
          totalAmount: true,
          currency: true,
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
      });

      if (!order) return null;

      let user = await tx.user.findUnique({
        where: { id: params.userId },
      });

      if (!user) return null;
      if (!user.isActive) {
        throw new ConflictException(DEACTIVATED_CHECKOUT_ACCOUNT_MESSAGE);
      }

      if (order.userId !== user.id) {
        throw new ConflictException("Payment is linked to a mismatched checkout owner.");
      }

      const locale = resolveLocale(checkout?.locale ?? user.preferredLanguage);
      const displayEmail = params.payerEmail?.trim().toLowerCase() || user.email;
      const fullName = pickDisplayName(
        checkout?.fullName || params.payerName || `${user.firstName} ${user.lastName ?? ""}`.trim(),
        displayEmail
      );
      const splitName = splitFullName(fullName);
      const normalizedPhone = checkout?.phone?.trim() || user.phoneNumber || null;
      const normalizedPhoneLookup = normalizePhoneNumber(normalizedPhone);
      const needsSignupToken = !user.password || !user.isVerified;
      let signupToken: string | null = null;

      if (needsSignupToken) {
        signupToken = generateSecureToken();
      }

      user = await tx.user.update({
        where: { id: user.id },
        data: {
          firstName: user.firstName || splitName.firstName,
          lastName: user.lastName ?? splitName.lastName,
          phoneNumber: user.phoneNumber || normalizedPhone,
          phoneNumberNormalized: user.phoneNumberNormalized || normalizedPhoneLookup,
          preferredLanguage: locale,
          ...(needsSignupToken
            ? {
                verificationToken: signupToken,
                tokenExpiry: signupTokenExpiry,
              }
            : {}),
        },
      });

      await tx.payment.update({
        where: { id: params.paymentId },
        data: {
          userId: user.id,
          orderId: order.id,
        },
      });

      return {
        userId: user.id,
        orderId: order.id,
        email: user.email,
        name: user.firstName,
        locale: resolveLocale(user.preferredLanguage),
        signupToken,
        phone: user.phoneNumber ?? null,
        whatsAppNotificationsEnabled: user.whatsAppNotificationsEnabled,
        orderNumber: order.orderNumber,
        packageName: order.package.name,
        amountPaid: formatNaira(Number(order.totalAmount)),
        addons: order.addons
          .map((entry) => entry.addon.name)
          .filter((value): value is string => value.trim().length > 0),
      };
    });
  }

  private async createCheckoutEntitiesFromMetadata(params: {
    paymentId: string;
    payerEmail: string | null;
    metadata: Record<string, unknown> | null;
    amount: number;
    currency: string;
    existingUserId?: string | null;
  }): Promise<CheckoutFinalizationInfo | null> {
    if (!params.payerEmail && !params.existingUserId) return null;

    const customQuoteCheckout = extractCustomQuoteCheckoutMetadata(params.metadata);
    if (customQuoteCheckout) {
      return this.createCustomQuoteEntitiesFromMetadata({
        ...params,
        customQuote: customQuoteCheckout,
      });
    }

    const rawCheckout = extractCheckoutMetadata(params.metadata);
    if (!rawCheckout) return null;

    const pkg = await this.resolvePackageFromCheckoutMetadata(rawCheckout);
    if (!pkg) {
      this.logger.warn(
        `Webhook payment ${params.paymentId}: package could not be resolved from metadata, skipping order creation`
      );
      return null;
    }

    // Never build an Order from pricing the server did not compute, and never
    // for less than that price. Throws ConflictException on underpayment, which
    // the webhook ACKs and leaves as an orphaned payment for admin review.
    const trusted = await this.metadataPricing.resolveTrustedCheckout({
      paymentId: params.paymentId,
      checkout: rawCheckout,
      paidAmount: params.amount,
      currency: params.currency,
    });
    const checkout = trusted.checkout;
    const existingUserId = params.existingUserId ?? trusted.dashboardUserId;

    const locale = resolveLocale(checkout.locale);
    const normalizedPhone = checkout.phone?.trim() || null;
    const normalizedPhoneLookup = normalizePhoneNumber(normalizedPhone);
    const signupTokenExpiry = new Date(Date.now() + MAX_SIGNUP_TOKEN_HOURS * 60 * 60 * 1000);

    try {
      return await this.prisma.$transaction(async (tx) => {
        let user = existingUserId
          ? await tx.user.findUnique({
              where: { id: existingUserId },
            })
          : null;

        const normalizedEmail =
          user?.email?.trim().toLowerCase() || params.payerEmail?.trim().toLowerCase();
        if (!normalizedEmail) return null;

        await this.assertCheckoutIdentityConflict({
          email: normalizedEmail,
          phone: normalizedPhone,
          tx,
        });

        if (!user) {
          user = await tx.user.findFirst({
            where: {
              email: {
                equals: normalizedEmail,
                mode: "insensitive",
              },
            },
          });
        }

        if (user && !user.isActive) {
          throw new ConflictException(DEACTIVATED_CHECKOUT_ACCOUNT_MESSAGE);
        }

        const fullName = pickDisplayName(
          checkout.fullName ||
            [user?.firstName, user?.lastName]
              .filter((value): value is string => Boolean(value))
              .join(" ") ||
            undefined,
          normalizedEmail
        );
        const splitName = splitFullName(fullName);

        let signupToken: string | null = null;

        if (!user) {
          signupToken = generateSecureToken();
          user = await tx.user.create({
            data: {
              email: normalizedEmail,
              firstName: splitName.firstName,
              lastName: splitName.lastName,
              phoneNumber: normalizedPhone,
              phoneNumberNormalized: normalizedPhoneLookup,
              preferredLanguage: locale,
              isActive: true,
              isVerified: false,
              verificationToken: signupToken,
              tokenExpiry: signupTokenExpiry,
            },
          });
        } else {
          const needsSignupToken = !user.password || !user.isVerified;
          if (needsSignupToken) {
            signupToken = generateSecureToken();
          }

          user = await tx.user.update({
            where: { id: user.id },
            data: {
              firstName: user.firstName || splitName.firstName,
              lastName: user.lastName ?? splitName.lastName,
              phoneNumber: user.phoneNumber || normalizedPhone,
              phoneNumberNormalized: user.phoneNumberNormalized || normalizedPhoneLookup,
              preferredLanguage: locale,
              ...(needsSignupToken
                ? {
                    verificationToken: signupToken,
                    tokenExpiry: signupTokenExpiry,
                  }
                : {}),
            },
          });
        }

        const orderNumber = await this.generateOrderNumber(tx);
        const totalAmount = toCurrency(checkout.totalPrice ?? params.amount);
        const initialAmount = toCurrency(params.amount);
        const appliedCoupon = await this.metadataPricing.resolveAppliedCouponForOrder(
          tx,
          checkout,
          initialAmount,
          {
            honorDiscount: trusted.signed ? (checkout.discountAmount ?? 0) : 0,
          }
        );
        const discountAmount = appliedCoupon?.discountAmount ?? 0;

        const order = await tx.order.create({
          data: {
            orderNumber,
            userId: user.id,
            packageId: pkg.id,
            orderType: "STANDARD",
            packagePriceSnap: Number(pkg.basePrice),
            hasCoverDesign: checkout.hasCover ?? true,
            hasFormatting: checkout.hasFormatting ?? true,
            bookSize: checkout.bookSize ?? "A5",
            paperColor: checkout.paperColor ?? "white",
            lamination: checkout.lamination ?? "gloss",
            status: OrderStatus.PAID,
            initialAmount,
            extraAmount: 0,
            couponId: appliedCoupon?.id ?? null,
            discountAmount,
            totalAmount: Math.max(totalAmount, initialAmount),
            currency: (params.currency || DEFAULT_CURRENCY).toUpperCase(),
          } as Prisma.OrderUncheckedCreateInput,
        });

        await this.createOrderAddonsFromMetadata(tx, order.id, checkout);

        // Resolve addon names for confirmation display
        const addonNames = await this.resolveAddonNamesFromMetadata(tx, checkout);

        const book = await tx.book.create({
          data: {
            orderId: order.id,
            userId: user.id,
            status: BookStatus.PAYMENT_RECEIVED,
            productionStatus: BookStatus.PAYMENT_RECEIVED,
            productionStatusUpdatedAt: new Date(),
            pageSize: checkout.bookSize ?? "A5",
          },
        });

        await tx.auditLog.createMany({
          data: [
            {
              userId: user.id,
              action: "ORDER_STATUS_REACHED",
              entityType: "ORDER_TRACKING",
              entityId: order.id,
              details: {
                source: "order",
                status: OrderStatus.PAID,
                reachedAt: order.createdAt.toISOString(),
                label: "Paid",
              },
            },
            {
              userId: user.id,
              action: "ORDER_STATUS_REACHED",
              entityType: "ORDER_TRACKING",
              entityId: order.id,
              details: {
                source: "book",
                status: BookStatus.PAYMENT_RECEIVED,
                reachedAt: book.createdAt.toISOString(),
                label: "Payment Received",
              },
            },
          ],
        });

        await tx.payment.update({
          where: { id: params.paymentId },
          data: {
            userId: user.id,
            orderId: order.id,
          },
        });

        await this.notificationsService.createOrderStatusNotification(
          {
            userId: user.id,
            orderId: order.id,
            orderNumber,
            status: OrderStatus.PAID,
            source: "order",
            bookId: book.id,
          },
          tx
        );

        return {
          userId: user.id,
          orderId: order.id,
          email: user.email,
          name: user.firstName,
          locale: resolveLocale(user.preferredLanguage),
          signupToken,
          phone: user.phoneNumber ?? null,
          whatsAppNotificationsEnabled: user.whatsAppNotificationsEnabled,
          orderNumber,
          packageName: pkg.name,
          amountPaid: formatNaira(params.amount),
          addons: addonNames,
        };
      });
    } catch (error) {
      if (isPrismaUniqueViolationForField(error, "phoneNumberNormalized")) {
        throw new ConflictException(PHONE_ALREADY_IN_USE_MESSAGE);
      }

      throw error;
    }
  }

  async assertCheckoutIdentityConflict(params: {
    email: string;
    phone: string | null;
    tx?: Prisma.TransactionClient | PrismaService;
    allowUserId?: string | null;
  }): Promise<void> {
    const normalizedEmail = params.email.trim().toLowerCase();
    const normalizedPhone = normalizePhoneNumber(params.phone);
    if (!normalizedEmail) return;

    const db = params.tx ?? this.prisma;
    const emailUser = await db.user.findFirst({
      where: {
        email: {
          equals: normalizedEmail,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
        email: true,
        isActive: true,
      },
    });

    if (emailUser && emailUser.id !== params.allowUserId && !emailUser.isActive) {
      throw new ConflictException(DEACTIVATED_CHECKOUT_ACCOUNT_MESSAGE);
    }

    if (!normalizedPhone) {
      return;
    }

    const phoneUsers = await db.user.findMany({
      where: {
        phoneNumberNormalized: normalizedPhone,
      },
      select: {
        id: true,
        email: true,
      },
      take: 3,
    });

    const emailOwnerId = emailUser && emailUser.id !== params.allowUserId ? emailUser.id : null;
    const conflictingPhoneUsers = phoneUsers.filter((user) => user.id !== params.allowUserId);

    if (conflictingPhoneUsers.length === 0) {
      return;
    }

    if (emailOwnerId && conflictingPhoneUsers.every((user) => user.id === emailOwnerId)) {
      return;
    }

    if (emailOwnerId) {
      throw new ConflictException(EMAIL_PHONE_IDENTITY_CONFLICT_MESSAGE);
    }

    throw new ConflictException(PHONE_ALREADY_IN_USE_MESSAGE);
  }

  private async createOrderAddonsFromMetadata(
    tx: Prisma.TransactionClient,
    orderId: string,
    checkout: CheckoutMetadata
  ): Promise<void> {
    const addonInputs = checkout.addons ?? [];
    if (addonInputs.length === 0) return;

    const addonIds = addonInputs
      .map((addon) => asString(addon.id))
      .filter((value): value is string => Boolean(value));
    const addonSlugs = addonInputs
      .map((addon) => asString(addon.slug))
      .filter((value): value is string => Boolean(value));

    if (addonIds.length === 0 && addonSlugs.length === 0) return;

    const addons = await tx.addon.findMany({
      where: {
        OR: [{ id: { in: addonIds } }, { slug: { in: addonSlugs } }],
      },
      select: {
        id: true,
        slug: true,
        pricingType: true,
      },
    });

    const addonById = new Map(addons.map((addon) => [addon.id, addon]));
    const addonBySlug = new Map(addons.map((addon) => [addon.slug, addon]));

    const rows: Prisma.OrderAddonCreateManyInput[] = [];
    for (const addonInput of addonInputs) {
      const addonId = asString(addonInput.id);
      const addonSlug = asString(addonInput.slug);
      const resolvedAddon =
        (addonId ? addonById.get(addonId) : undefined) ||
        (addonSlug ? addonBySlug.get(addonSlug) : undefined);

      if (!resolvedAddon) continue;

      const price = toCurrency(asNumber(addonInput.price) ?? 0);
      if (price <= 0) continue;

      rows.push({
        orderId,
        addonId: resolvedAddon.id,
        priceSnap: price,
        wordCount:
          resolvedAddon.pricingType === "per_word" ? (checkout.formattingWordCount ?? null) : null,
      });
    }

    if (rows.length > 0) {
      await tx.orderAddon.createMany({
        data: rows,
        skipDuplicates: true,
      });
    }
  }

  /**
   * Resolves addon names from checkout metadata (used for confirmation email/page).
   */
  async resolveAddonNamesFromMetadata(
    tx: Pick<Prisma.TransactionClient, "addon">,
    checkout: CheckoutMetadata
  ): Promise<string[]> {
    const addonInputs = checkout.addons ?? [];
    if (addonInputs.length === 0) return [];

    const addonIds = addonInputs
      .map((addon) => asString(addon.id))
      .filter((value): value is string => Boolean(value));
    const addonSlugs = addonInputs
      .map((addon) => asString(addon.slug))
      .filter((value): value is string => Boolean(value));

    if (addonIds.length === 0 && addonSlugs.length === 0) return [];

    const addons = await tx.addon.findMany({
      where: {
        OR: [{ id: { in: addonIds } }, { slug: { in: addonSlugs } }],
      },
      select: { name: true },
    });

    return addons.map((a) => a.name).filter(Boolean);
  }

  /** Kept as a method so specs can stub package lookup (see checkout-package.ts). */
  async resolvePackageFromCheckoutMetadata(checkout: CheckoutMetadata) {
    return resolvePackageFromCheckoutMetadata(this.prisma, checkout);
  }

  private async generateOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
      const candidate = `BP-${new Date().getFullYear()}-${randomPart}`;

      const existing = await tx.order.findUnique({
        where: { orderNumber: candidate },
        select: { id: true },
      });
      if (!existing) return candidate;
    }

    throw new ServiceUnavailableException("Unable to generate a unique order number");
  }

  private async createCustomQuoteEntitiesFromMetadata(params: {
    paymentId: string;
    payerEmail: string | null;
    metadata: Record<string, unknown> | null;
    amount: number;
    currency: string;
    existingUserId?: string | null;
    customQuote: CustomQuoteCheckoutMetadata;
  }): Promise<CheckoutFinalizationInfo | null> {
    const normalizedEmail = params.payerEmail?.trim().toLowerCase();
    if (!normalizedEmail) return null;

    const signupTokenExpiry = new Date(Date.now() + MAX_SIGNUP_TOKEN_HOURS * 60 * 60 * 1000);

    return this.prisma.$transaction(async (tx) => {
      const quote = await tx.customQuote.findUnique({
        where: { id: params.customQuote.customQuoteId },
        select: {
          id: true,
          finalPrice: true,
          order: {
            select: {
              id: true,
              orderNumber: true,
              totalAmount: true,
              currency: true,
              status: true,
              userId: true,
              package: { select: { name: true } },
            },
          },
        },
      });

      if (!quote) {
        this.logger.warn(
          `Webhook payment ${params.paymentId}: custom quote ${params.customQuote.customQuoteId} not found`
        );
        return null;
      }

      // The quote's price lives in our DB, set by an admin. Metadata's
      // quoteFinalPrice is only a copy and is never the basis for acceptance.
      const agreedPrice = toCurrency(Number(quote.finalPrice ?? 0));
      this.metadataPricing.assertPaidAmountCovers({
        paymentId: params.paymentId,
        paidAmount: params.amount,
        expectedAmount: agreedPrice > 0 ? agreedPrice : params.customQuote.quoteFinalPrice,
        currency: params.currency,
      });
      params.customQuote.quoteFinalPrice =
        agreedPrice > 0 ? agreedPrice : params.customQuote.quoteFinalPrice;

      if (quote.order) {
        const existingUser = await tx.user.findUnique({
          where: { id: quote.order.userId },
          select: {
            id: true,
            email: true,
            firstName: true,
            preferredLanguage: true,
            phoneNumber: true,
            whatsAppNotificationsEnabled: true,
            password: true,
            isVerified: true,
            isActive: true,
            verificationToken: true,
          },
        });

        if (!existingUser) return null;
        if (!existingUser.isActive) {
          throw new ConflictException(DEACTIVATED_CHECKOUT_ACCOUNT_MESSAGE);
        }

        await tx.payment.update({
          where: { id: params.paymentId },
          data: {
            userId: existingUser.id,
            orderId: quote.order.id,
          },
        });

        if (quote.order.status !== OrderStatus.PAID) {
          await tx.order.update({
            where: { id: quote.order.id },
            data: {
              status: OrderStatus.PAID,
              totalAmount: toCurrency(params.customQuote.quoteFinalPrice || params.amount),
              currency: (params.currency || DEFAULT_CURRENCY).toUpperCase(),
            },
          });
        }

        await tx.customQuote.update({
          where: { id: quote.id },
          data: {
            userId: existingUser.id,
            status: "PAID",
          },
        });

        await tx.book.updateMany({
          where: {
            orderId: quote.order.id,
          },
          data: {
            status: BookStatus.PAYMENT_RECEIVED,
            productionStatus: BookStatus.PAYMENT_RECEIVED,
            productionStatusUpdatedAt: new Date(),
          },
        });

        return {
          userId: existingUser.id,
          orderId: quote.order.id,
          email: existingUser.email,
          name: existingUser.firstName,
          locale: resolveLocale(existingUser.preferredLanguage),
          signupToken: existingUser.verificationToken ?? null,
          phone: existingUser.phoneNumber ?? null,
          whatsAppNotificationsEnabled: existingUser.whatsAppNotificationsEnabled,
          orderNumber: quote.order.orderNumber,
          packageName: quote.order.package.name,
          amountPaid: formatNaira(Number(quote.order.totalAmount)),
          addons: [],
        };
      }

      let user = params.existingUserId
        ? await tx.user.findUnique({ where: { id: params.existingUserId } })
        : null;

      await this.assertCheckoutIdentityConflict({
        email: normalizedEmail,
        phone: params.customQuote.phone,
        tx,
      });

      if (!user) {
        user = await tx.user.findFirst({
          where: {
            email: {
              equals: normalizedEmail,
              mode: "insensitive",
            },
          },
        });
      }

      if (user && !user.isActive) {
        throw new ConflictException(DEACTIVATED_CHECKOUT_ACCOUNT_MESSAGE);
      }

      const fullName = pickDisplayName(params.customQuote.fullName ?? undefined, normalizedEmail);
      const splitName = splitFullName(fullName);
      const normalizedPhone = params.customQuote.phone?.trim() || user?.phoneNumber || null;
      const normalizedPhoneLookup = normalizePhoneNumber(normalizedPhone);
      let signupToken: string | null = null;

      if (!user) {
        signupToken = generateSecureToken();
        user = await tx.user.create({
          data: {
            email: normalizedEmail,
            firstName: splitName.firstName,
            lastName: splitName.lastName,
            phoneNumber: normalizedPhone,
            phoneNumberNormalized: normalizedPhoneLookup,
            preferredLanguage: params.customQuote.locale,
            isActive: true,
            isVerified: false,
            verificationToken: signupToken,
            tokenExpiry: signupTokenExpiry,
          },
        });
      } else {
        const needsSignupToken = !user.password || !user.isVerified;
        if (needsSignupToken) {
          signupToken = generateSecureToken();
        }

        user = await tx.user.update({
          where: { id: user.id },
          data: {
            firstName: user.firstName || splitName.firstName,
            lastName: user.lastName ?? splitName.lastName,
            phoneNumber: user.phoneNumber || normalizedPhone,
            phoneNumberNormalized: user.phoneNumberNormalized || normalizedPhoneLookup,
            preferredLanguage: params.customQuote.locale,
            ...(needsSignupToken
              ? {
                  verificationToken: signupToken,
                  tokenExpiry: signupTokenExpiry,
                }
              : {}),
          },
        });
      }

      const fallbackPackage = await tx.package.findFirst({
        where: {
          isActive: true,
          category: {
            isActive: true,
          },
        },
        orderBy: [{ basePrice: "asc" }, { sortOrder: "asc" }],
      });

      if (!fallbackPackage) {
        throw new BadRequestException(
          "No active package is configured for custom quote checkout fulfillment."
        );
      }

      const orderNumber = await this.generateOrderNumber(tx);
      const paidAmount = toCurrency(params.customQuote.quoteFinalPrice || params.amount);

      const order = await tx.order.create({
        data: {
          orderNumber,
          userId: user.id,
          packageId: fallbackPackage.id,
          customQuoteId: params.customQuote.customQuoteId,
          skipFormatting: true,
          orderType: "STANDARD",
          packagePriceSnap: Number(fallbackPackage.basePrice),
          hasCoverDesign: true,
          hasFormatting: true,
          bookSize: params.customQuote.quotePrintSize,
          paperColor: "white",
          lamination: "gloss",
          status: OrderStatus.PAID,
          initialAmount: paidAmount,
          extraAmount: 0,
          discountAmount: 0,
          totalAmount: paidAmount,
          currency: (params.currency || DEFAULT_CURRENCY).toUpperCase(),
        } as Prisma.OrderUncheckedCreateInput,
      });

      await tx.book.create({
        data: {
          orderId: order.id,
          userId: user.id,
          status: BookStatus.PAYMENT_RECEIVED,
          title: params.customQuote.quoteTitle,
          pageSize: params.customQuote.quotePrintSize,
          pageCount: null,
          estimatedPages: null,
        },
      });

      await tx.customQuote.update({
        where: { id: params.customQuote.customQuoteId },
        data: {
          userId: user.id,
          status: "PAID",
        },
      });

      await tx.payment.update({
        where: { id: params.paymentId },
        data: {
          userId: user.id,
          orderId: order.id,
        },
      });

      return {
        userId: user.id,
        orderId: order.id,
        email: user.email,
        name: user.firstName,
        locale: resolveLocale(user.preferredLanguage),
        signupToken,
        phone: user.phoneNumber ?? null,
        whatsAppNotificationsEnabled: user.whatsAppNotificationsEnabled,
        orderNumber: order.orderNumber,
        packageName: fallbackPackage.name,
        amountPaid: formatNaira(paidAmount),
        addons: [],
      };
    });
  }
}
