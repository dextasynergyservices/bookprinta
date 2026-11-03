import { DEFAULT_CURRENCY } from "@bookprinta/shared";
import { BadRequestException, ConflictException, Injectable, Logger } from "@nestjs/common";
import { normalizePhoneNumber } from "../../auth/phone-number.util.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { BookStatus, OrderStatus } from "../../generated/prisma/enums.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { generateOrderNumber } from "../order-number.js";
import {
  type CustomQuoteCheckoutMetadata,
  formatNaira,
  generateSecureToken,
  pickDisplayName,
  resolveLocale,
  splitFullName,
  toCurrency,
} from "../payment-metadata.js";
import {
  type CheckoutFinalizationInfo,
  MAX_SIGNUP_TOKEN_HOURS,
} from "./checkout-fulfillment.types.js";
import {
  CheckoutIdentityService,
  DEACTIVATED_CHECKOUT_ACCOUNT_MESSAGE,
} from "./checkout-identity.service.js";
import { CheckoutMetadataPricingService } from "./checkout-metadata-pricing.service.js";

/**
 * Fulfilment of a paid custom quote (Path B): the price was agreed with an
 * admin, so the payment is checked against the quote's final price, then the
 * account, the quote's order and its book are created and the quote is marked
 * paid. The book skips AI formatting and the billing gate.
 */
@Injectable()
export class CustomQuoteFulfillmentService {
  private readonly logger = new Logger(CustomQuoteFulfillmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metadataPricing: CheckoutMetadataPricingService,
    private readonly checkoutIdentity: CheckoutIdentityService
  ) {}

  async createCustomQuoteEntitiesFromMetadata(params: {
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

      await this.checkoutIdentity.assertCheckoutIdentityConflict({
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

      const orderNumber = await generateOrderNumber(tx);
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
