import { DEFAULT_CURRENCY } from "@bookprinta/shared";
import { BadRequestException, ConflictException, Injectable, Logger } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import type { Prisma } from "../../generated/prisma/client.js";
import { DiscountType } from "../../generated/prisma/enums.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import {
  asString,
  type CheckoutMetadata,
  extractCheckoutMetadata,
  extractCustomQuoteCheckoutMetadata,
  // Not the number-only toCurrency in checkout-pricing.service.ts: this one
  // accepts Prisma Decimals and strings, as PaymentsService always did.
  toCurrency,
} from "../payment-metadata.js";
import {
  CHECKOUT_PRICING_SIGNATURE_KEY,
  CHECKOUT_PRICING_VERSION,
  CHECKOUT_PRICING_VERSION_KEY,
  CheckoutPricingService,
} from "./checkout-pricing.service.js";

/**
 * Applies the checkout pricing engine (CheckoutPricingService) at the payment
 * boundary, where pricing travels as provider metadata:
 *
 * - before payment: price the checkout on the server and sign the result into
 *   the metadata (the browser's amount is only compared, never charged);
 * - at fulfilment: trust signed pricing, re-price unsigned pricing from the
 *   database, and refuse a payment that does not cover the price;
 * - for the order: resolve the coupon whose discount the order records.
 */
@Injectable()
export class CheckoutMetadataPricingService {
  private readonly logger = new Logger(CheckoutMetadataPricingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly checkoutPricing: CheckoutPricingService
  ) {}

  /**
   * Price a checkout on the server and return the amount to charge together
   * with metadata whose pricing fields are the server's (and signed).
   *
   * Callers pass `metadata.dashboardUserId` only when it is server-derived
   * (DashboardService, QuotesService, an authenticated session); public request
   * bodies go through `stripClientTrustedMetadata` first.
   */
  async priceCheckoutMetadata(params: {
    metadata: Record<string, unknown> | null;
    clientAmount: number;
    currency?: string | null;
  }): Promise<{ amount: number; metadata: Record<string, unknown> }> {
    this.checkoutPricing.assertCurrency(params.currency);

    const {
      checkout_state: _checkoutState,
      [CHECKOUT_PRICING_SIGNATURE_KEY]: _signature,
      [CHECKOUT_PRICING_VERSION_KEY]: _version,
      ...base
    } = params.metadata ?? {};

    const checkout = extractCheckoutMetadata(base);
    if (!checkout) {
      throw new BadRequestException(
        "Checkout metadata is missing. Return to pricing and try again."
      );
    }

    const customQuote = extractCustomQuoteCheckoutMetadata(base);
    if (customQuote) {
      const quote = await this.prisma.customQuote.findUnique({
        where: { id: customQuote.customQuoteId },
        select: { finalPrice: true },
      });
      const finalPrice = toCurrency(Number(quote?.finalPrice ?? 0));
      if (!quote || finalPrice <= 0) {
        throw new BadRequestException(
          "This quote is not ready for payment yet. Please use the payment link from your email."
        );
      }
      this.checkoutPricing.assertClientAmountMatches(params.clientAmount, finalPrice);
      return { amount: finalPrice, metadata: { ...base, quoteFinalPrice: finalPrice } };
    }

    const quote = await this.checkoutPricing.quote({
      packageId: checkout.packageId,
      packageSlug: checkout.packageSlug ?? checkout.tier,
      addons: (checkout.addons ?? []).map((addon) => ({
        id: addon.id,
        slug: addon.slug,
        wordCount: addon.wordCount,
      })),
      formattingWordCount: checkout.formattingWordCount,
      couponCode: checkout.couponCode,
    });
    this.checkoutPricing.assertClientAmountMatches(params.clientAmount, quote.totalPrice);

    const dashboardUserId = checkout.dashboardUserId ?? null;
    const signature = this.checkoutPricing.sign(
      this.checkoutPricing.toSignedPricing(quote, dashboardUserId)
    );

    return {
      amount: quote.totalPrice,
      metadata: {
        ...base,
        packageId: quote.packageId,
        packageSlug: quote.packageSlug,
        packageName: quote.packageName,
        tier: quote.packageSlug,
        basePrice: quote.basePrice,
        addonTotal: quote.addonTotal,
        discountAmount: quote.discountAmount,
        totalPrice: quote.totalPrice,
        couponCode: quote.couponCode,
        formattingWordCount: quote.formattingWordCount ?? 0,
        addons: quote.lines.map((line) => ({
          id: line.id,
          slug: line.slug,
          name: line.name,
          price: line.price,
          wordCount: line.wordCount,
        })),
        addonBreakdown: quote.lines.map((line) => ({ name: line.name, price: line.price })),
        ...(dashboardUserId ? { dashboardUserId } : {}),
        [CHECKOUT_PRICING_VERSION_KEY]: CHECKOUT_PRICING_VERSION,
        [CHECKOUT_PRICING_SIGNATURE_KEY]: signature,
      },
    };
  }

  /**
   * Decide which pricing to trust for a paid checkout and enforce that the
   * payment covers it.
   *
   * - Signed metadata (written by `priceCheckoutMetadata`) is trusted as-is,
   *   including its discount and dashboard owner.
   * - Unsigned metadata — legacy in-flight payments, or a charge created
   *   outside our initialize flow — is re-priced from the database, and its
   *   claimed dashboard owner is ignored.
   */
  async resolveTrustedCheckout(params: {
    paymentId: string;
    checkout: CheckoutMetadata;
    paidAmount: number;
    currency: string;
  }): Promise<{ checkout: CheckoutMetadata; dashboardUserId: string | null; signed: boolean }> {
    const { checkout } = params;
    const signedCandidate = this.checkoutPricing.fromCheckoutFields(checkout);

    if (this.checkoutPricing.verify(signedCandidate, checkout.pricingSignature)) {
      this.assertPaidAmountCovers({
        paymentId: params.paymentId,
        paidAmount: params.paidAmount,
        expectedAmount: signedCandidate.totalPrice,
        currency: params.currency,
      });
      return { checkout, dashboardUserId: signedCandidate.dashboardUserId, signed: true };
    }

    this.logger.warn(
      `Payment ${params.paymentId}: checkout pricing is unsigned or does not verify — re-pricing from the database`
    );

    const quoteInput = {
      packageId: checkout.packageId,
      packageSlug: checkout.packageSlug ?? checkout.tier,
      addons: (checkout.addons ?? []).map((addon) => ({
        id: addon.id,
        slug: addon.slug,
        wordCount: addon.wordCount,
      })),
      formattingWordCount: checkout.formattingWordCount,
      couponCode: checkout.couponCode,
    };
    let quote: Awaited<ReturnType<CheckoutPricingService["quote"]>>;
    try {
      quote = await this.checkoutPricing.quote(quoteInput);
    } catch (error) {
      if (!(error instanceof BadRequestException) || !checkout.couponCode) {
        throw new ConflictException(
          `Checkout for payment ${params.paymentId} cannot be priced: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      // An unsigned coupon that no longer validates simply does not apply.
      quote = await this.checkoutPricing.quote({ ...quoteInput, couponCode: null });
    }

    this.assertPaidAmountCovers({
      paymentId: params.paymentId,
      paidAmount: params.paidAmount,
      expectedAmount: quote.totalPrice,
      currency: params.currency,
    });

    return {
      checkout: {
        ...checkout,
        packageId: quote.packageId,
        packageSlug: quote.packageSlug,
        basePrice: quote.basePrice,
        addonTotal: quote.addonTotal,
        discountAmount: quote.discountAmount,
        totalPrice: quote.totalPrice,
        couponCode: quote.couponCode ?? undefined,
        formattingWordCount: quote.formattingWordCount ?? undefined,
        addons: quote.lines.map((line) => ({
          id: line.id,
          slug: line.slug,
          name: line.name,
          price: line.price,
          wordCount: line.wordCount,
        })),
        dashboardUserId: undefined,
      },
      dashboardUserId: null,
      signed: false,
    };
  }

  /**
   * Refuse to fulfil a payment that does not cover the expected price.
   * ConflictException is the deterministic business-rule failure the webhook
   * ACKs, leaving the payment recorded without an order for admin review.
   */
  assertPaidAmountCovers(params: {
    paymentId: string;
    paidAmount: number;
    expectedAmount: number;
    currency: string;
  }): void {
    const currency = (params.currency || DEFAULT_CURRENCY).toUpperCase();
    if (
      currency === DEFAULT_CURRENCY &&
      this.checkoutPricing.covers(params.paidAmount, params.expectedAmount)
    ) {
      return;
    }

    const message =
      `Payment ${params.paymentId} paid ${currency} ${params.paidAmount} but the order costs ` +
      `${DEFAULT_CURRENCY} ${params.expectedAmount}. No order was created.`;
    this.logger.error(message);
    Sentry.captureMessage("Underpaid checkout blocked", {
      level: "error",
      tags: { area: "payments", reason: "underpaid_checkout" },
      extra: { ...params, currency },
    });
    throw new ConflictException({ message, errorCode: "CHECKOUT_UNDERPAID" });
  }

  /**
   * Resolve and claim the coupon for a paid checkout.
   *
   * `honorDiscount` is the discount from server-signed pricing: the customer
   * already paid on that basis, so if the coupon expired or ran out between
   * checkout and the webhook we still record that discount rather than book an
   * order whose total disagrees with what was charged.
   */
  async resolveAppliedCouponForOrder(
    tx: Prisma.TransactionClient,
    checkout: CheckoutMetadata,
    amountPaid: number,
    options: { honorDiscount?: number } = {}
  ): Promise<{ id: string; discountAmount: number } | null> {
    const rawCode = asString(checkout.couponCode);
    if (!rawCode) return null;

    const honorDiscount = toCurrency(options.honorDiscount ?? 0);
    const honored = async (reason: string) => {
      if (honorDiscount <= 0) return null;
      const existing = await tx.coupon.findUnique({
        where: { code: rawCode.trim().toUpperCase() },
        select: { id: true },
      });
      if (!existing) return null;
      this.logger.warn(
        `Coupon "${rawCode}" ${reason} after checkout — honouring the signed discount of ₦${honorDiscount}.`
      );
      return { id: existing.id, discountAmount: honorDiscount };
    };

    const code = rawCode.trim().toUpperCase();
    const coupon = await tx.coupon.findUnique({
      where: { code },
      select: {
        id: true,
        type: true,
        value: true,
        usageLimit: true,
        usageCount: true,
        expiresAt: true,
        isActive: true,
        appliesToAll: true,
        packageScopes: {
          select: {
            packageId: true,
          },
        },
        categoryScopes: {
          select: {
            categoryId: true,
          },
        },
      },
    });

    if (!coupon) {
      this.logger.warn(`Coupon "${code}" not found. Skipping coupon application.`);
      return null;
    }

    const now = new Date();
    if (!coupon.isActive) {
      this.logger.warn(`Coupon "${code}" is inactive. Skipping coupon application.`);
      return honored("became inactive");
    }
    if (coupon.expiresAt && coupon.expiresAt.getTime() <= now.getTime()) {
      this.logger.warn(`Coupon "${code}" is expired. Skipping coupon application.`);
      return honored("expired");
    }
    if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
      this.logger.warn(`Coupon "${code}" reached usage limit. Skipping coupon application.`);
      return honored("reached its usage limit");
    }

    const packageContext = await this.resolveCheckoutPackageContext(tx, checkout);
    if (!this.isCouponApplicableToCheckout(coupon, packageContext)) {
      this.logger.warn(
        `Coupon "${code}" does not apply to package context. Skipping coupon application.`
      );
      return null;
    }

    const subtotal = this.resolveCouponSubtotal(checkout, amountPaid);
    const discountValue = toCurrency(coupon.value);
    const rawDiscount =
      coupon.type === DiscountType.PERCENTAGE ? subtotal * (discountValue / 100) : discountValue;
    const discountAmount = toCurrency(Math.min(subtotal, Math.max(0, rawDiscount)));

    if (discountAmount <= 0) {
      return null;
    }

    // Atomic claim to avoid over-consuming usage-limited coupons under concurrency.
    const claimed = await tx.coupon.updateMany({
      where: {
        id: coupon.id,
        isActive: true,
        ...(coupon.expiresAt ? { expiresAt: { gt: now } } : {}),
        ...(coupon.usageLimit === null
          ? {}
          : {
              usageCount: { lt: coupon.usageLimit },
            }),
      },
      data: {
        usageCount: { increment: 1 },
      },
    });

    if (claimed.count === 0) {
      this.logger.warn(`Coupon "${code}" could not be claimed. Skipping coupon application.`);
      return honored("could not be claimed");
    }

    return {
      id: coupon.id,
      discountAmount: honorDiscount > 0 ? honorDiscount : discountAmount,
    };
  }

  private resolveCouponSubtotal(checkout: CheckoutMetadata, amountPaid: number): number {
    const basePlusAddons = toCurrency((checkout.basePrice ?? 0) + (checkout.addonTotal ?? 0));
    if (basePlusAddons > 0) return basePlusAddons;

    const totalPlusDiscount = toCurrency(
      (checkout.totalPrice ?? 0) + (checkout.discountAmount ?? 0)
    );
    if (totalPlusDiscount > 0) return totalPlusDiscount;

    return toCurrency(amountPaid);
  }

  private async resolveCheckoutPackageContext(
    tx: Prisma.TransactionClient,
    checkout: CheckoutMetadata
  ): Promise<{ id: string; categoryId: string } | null> {
    const packageId = asString(checkout.packageId);
    if (packageId) {
      const pkg = await tx.package.findUnique({
        where: { id: packageId },
        select: {
          id: true,
          categoryId: true,
        },
      });

      if (pkg) {
        return pkg;
      }
    }

    const packageSlug = asString(checkout.packageSlug) ?? asString(checkout.tier);
    if (!packageSlug) {
      return null;
    }

    const pkg = await tx.package.findFirst({
      where: {
        slug: packageSlug,
      },
      select: {
        id: true,
        categoryId: true,
      },
    });

    return pkg ?? null;
  }

  private isCouponApplicableToCheckout(
    coupon: {
      appliesToAll: boolean;
      packageScopes: Array<{ packageId: string }>;
      categoryScopes: Array<{ categoryId: string }>;
    },
    packageContext: { id: string; categoryId: string } | null
  ): boolean {
    if (coupon.appliesToAll) {
      return true;
    }

    if (!packageContext) {
      return false;
    }

    const packageMatch = coupon.packageScopes.some(
      (scope) => scope.packageId === packageContext.id
    );
    if (packageMatch) {
      return true;
    }

    return coupon.categoryScopes.some((scope) => scope.categoryId === packageContext.categoryId);
  }
}
