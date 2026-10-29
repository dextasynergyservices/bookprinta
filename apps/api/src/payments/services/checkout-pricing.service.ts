import { createHmac, timingSafeEqual } from "node:crypto";
import { DEFAULT_CURRENCY } from "@bookprinta/shared";
import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { resolveJwtSecret } from "../../auth/jwt-secret.util.js";
import { DiscountType } from "../../generated/prisma/enums.js";
import { PrismaService } from "../../prisma/prisma.service.js";

/**
 * Checkout pricing — the server-side source of truth for what a checkout costs.
 *
 * ─── Why this exists ───────────────────────────────────────────────────────
 *
 * The price used to be computed only in the browser (Zustand) and sent to
 * `POST /payments/initialize` as `amount` + metadata. The server charged that
 * amount and later built the Order from the same metadata, so a modified
 * request could buy any package for ₦100.
 *
 * Now:
 *  1. `quote()` re-prices the checkout from the database (package base price,
 *     addon prices, ISBN inclusion, per-word formatting, coupon).
 *  2. `initialize` charges the quoted amount and refuses a client amount that
 *     disagrees, so the customer is never silently charged a different figure.
 *  3. The quote is written into the provider metadata and HMAC-signed.
 *  4. When the payment comes back (webhook / verify / reconciliation / bank
 *     transfer approval), `assertPaymentCovers()` checks the amount actually
 *     paid against the signed total — or, for unsigned metadata, against a
 *     fresh quote — before any Order is created.
 *
 * The signature matters because provider metadata is not trustworthy on its
 * own: a charge can be created against our public key with arbitrary metadata.
 * It also lets us honour a coupon that was valid when the customer paid but was
 * exhausted by the time the webhook arrived.
 */

export const CHECKOUT_PRICING_VERSION = 1;
export const CHECKOUT_PRICING_SIGNATURE_KEY = "pricingSignature";
export const CHECKOUT_PRICING_VERSION_KEY = "pricingVersion";

/** Paid amounts within this many naira of the expected total are accepted (rounding). */
const AMOUNT_TOLERANCE_NGN = 0.5;

export type CheckoutPricingAddonInput = {
  id?: string | null;
  slug?: string | null;
  wordCount?: number | null;
};

export type CheckoutPricingInput = {
  packageId?: string | null;
  packageSlug?: string | null;
  addons?: CheckoutPricingAddonInput[];
  formattingWordCount?: number | null;
  couponCode?: string | null;
};

export type CheckoutQuoteLine = {
  id: string;
  slug: string;
  name: string;
  pricingType: "fixed" | "per_word";
  price: number;
  wordCount: number | null;
};

export type CheckoutQuote = {
  packageId: string;
  packageSlug: string;
  packageName: string;
  basePrice: number;
  lines: CheckoutQuoteLine[];
  addonTotal: number;
  subtotal: number;
  couponCode: string | null;
  couponId: string | null;
  discountAmount: number;
  totalPrice: number;
  currency: string;
  formattingWordCount: number | null;
};

/** The subset of a quote that is signed and later trusted. */
export type SignedCheckoutPricing = {
  packageId: string;
  addons: Array<{ id: string; price: number; wordCount: number | null }>;
  couponCode: string | null;
  discountAmount: number;
  totalPrice: number;
  currency: string;
  dashboardUserId: string | null;
};

@Injectable()
export class CheckoutPricingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Price a standard checkout from the database. Throws BadRequestException
   * when the package, an addon or the coupon is not valid for purchase.
   */
  async quote(input: CheckoutPricingInput): Promise<CheckoutQuote> {
    const pkg = await this.resolvePackage(input);
    if (!pkg) {
      throw new BadRequestException({
        message:
          "Checkout package is missing or invalid. Return to pricing and select a package again.",
        errorCode: "CHECKOUT_PACKAGE_INVALID",
      });
    }

    const basePrice = toCurrency(Number(pkg.basePrice));
    const lines = await this.resolveAddonLines(input, pkg.includesISBN);
    const addonTotal = toCurrency(lines.reduce((sum, line) => sum + line.price, 0));
    const subtotal = toCurrency(basePrice + addonTotal);

    const coupon = await this.resolveCoupon(input.couponCode, {
      id: pkg.id,
      categoryId: pkg.categoryId,
    });
    const discountAmount = coupon
      ? toCurrency(
          Math.min(
            subtotal,
            Math.max(
              0,
              coupon.type === DiscountType.PERCENTAGE
                ? subtotal * (Number(coupon.value) / 100)
                : Number(coupon.value)
            )
          )
        )
      : 0;

    const formattingLine = lines.find((line) => line.pricingType === "per_word");

    return {
      packageId: pkg.id,
      packageSlug: pkg.slug,
      packageName: pkg.name,
      basePrice,
      lines,
      addonTotal,
      subtotal,
      couponCode: coupon?.code ?? null,
      couponId: coupon?.id ?? null,
      discountAmount,
      totalPrice: toCurrency(Math.max(0, subtotal - discountAmount)),
      currency: DEFAULT_CURRENCY,
      formattingWordCount: formattingLine?.wordCount ?? null,
    };
  }

  /** Throw a 409 when the browser's total disagrees with the server's. */
  assertClientAmountMatches(clientAmount: number, expected: number): void {
    if (Math.abs(toCurrency(clientAmount) - toCurrency(expected)) > AMOUNT_TOLERANCE_NGN) {
      throw new ConflictException({
        message:
          "The price of your order has changed. Please review your order summary and try again.",
        errorCode: "CHECKOUT_PRICE_MISMATCH",
        expectedAmount: toCurrency(expected),
      });
    }
  }

  assertCurrency(currency: string | null | undefined): void {
    const normalized = (currency ?? DEFAULT_CURRENCY).toUpperCase();
    if (normalized !== DEFAULT_CURRENCY) {
      throw new BadRequestException({
        message: `All BookPrinta charges are in ${DEFAULT_CURRENCY}.`,
        errorCode: "CHECKOUT_CURRENCY_UNSUPPORTED",
      });
    }
  }

  /** True when `paid` covers `expected` (within rounding tolerance). */
  covers(paid: number, expected: number): boolean {
    return toCurrency(paid) + AMOUNT_TOLERANCE_NGN >= toCurrency(expected);
  }

  toSignedPricing(quote: CheckoutQuote, dashboardUserId: string | null): SignedCheckoutPricing {
    return {
      packageId: quote.packageId,
      addons: quote.lines.map((line) => ({
        id: line.id,
        price: line.price,
        wordCount: line.wordCount,
      })),
      couponCode: quote.couponCode,
      discountAmount: quote.discountAmount,
      totalPrice: quote.totalPrice,
      currency: quote.currency,
      dashboardUserId,
    };
  }

  /**
   * Rebuild the signed shape from checkout metadata fields, applying the same
   * defaults on both sides of the signature (initialize and fulfilment).
   */
  fromCheckoutFields(fields: {
    packageId?: string | null;
    addons?: Array<{ id?: string | null; price?: number | null; wordCount?: number | null }>;
    couponCode?: string | null;
    discountAmount?: number | null;
    totalPrice?: number | null;
    dashboardUserId?: string | null;
  }): SignedCheckoutPricing {
    return {
      packageId: fields.packageId ?? "",
      addons: (fields.addons ?? [])
        .filter((addon): addon is typeof addon & { id: string } => Boolean(addon.id))
        .map((addon) => ({
          id: addon.id,
          price: addon.price ?? 0,
          wordCount: addon.wordCount ?? null,
        })),
      couponCode: fields.couponCode ?? null,
      discountAmount: fields.discountAmount ?? 0,
      totalPrice: fields.totalPrice ?? 0,
      currency: DEFAULT_CURRENCY,
      dashboardUserId: fields.dashboardUserId ?? null,
    };
  }

  sign(pricing: SignedCheckoutPricing): string {
    return createHmac("sha256", this.signingKey()).update(canonicalize(pricing)).digest("hex");
  }

  verify(pricing: SignedCheckoutPricing, signature: string | null | undefined): boolean {
    if (typeof signature !== "string" || !/^[0-9a-f]{64}$/i.test(signature)) return false;
    const expected = Buffer.from(this.sign(pricing), "hex");
    const provided = Buffer.from(signature, "hex");
    return expected.length === provided.length && timingSafeEqual(expected, provided);
  }

  private signingKey(): Buffer {
    const secret = process.env.CHECKOUT_PRICING_SECRET?.trim() || resolveJwtSecret();
    // Domain-separate from JWT signing so the two keys are never interchangeable.
    return createHmac("sha256", secret).update("bookprinta:checkout-pricing:v1").digest();
  }

  private async resolvePackage(input: CheckoutPricingInput) {
    const select = {
      id: true,
      slug: true,
      name: true,
      basePrice: true,
      includesISBN: true,
      categoryId: true,
    } as const;
    const where = { isActive: true, category: { isActive: true } } as const;

    const packageId = normalizeString(input.packageId);
    if (packageId) {
      const byId = await this.prisma.package.findFirst({
        where: { ...where, id: packageId },
        select,
      });
      if (byId) return byId;
    }

    const slug = normalizeString(input.packageSlug);
    if (!slug) return null;
    return this.prisma.package.findFirst({ where: { ...where, slug }, select });
  }

  private async resolveAddonLines(
    input: CheckoutPricingInput,
    packageIncludesIsbn: boolean
  ): Promise<CheckoutQuoteLine[]> {
    const requested = (input.addons ?? []).filter(
      (addon) => normalizeString(addon.id) || normalizeString(addon.slug)
    );
    if (requested.length === 0) return [];

    const ids = requested.map((a) => normalizeString(a.id)).filter(isString);
    const slugs = requested.map((a) => normalizeString(a.slug)).filter(isString);
    const addons = await this.prisma.addon.findMany({
      where: { isActive: true, OR: [{ id: { in: ids } }, { slug: { in: slugs } }] },
      select: {
        id: true,
        slug: true,
        name: true,
        price: true,
        pricingType: true,
        pricePerWord: true,
      },
    });
    const byId = new Map(addons.map((addon) => [addon.id, addon]));
    const bySlug = new Map(addons.map((addon) => [addon.slug, addon]));

    const lines = new Map<string, CheckoutQuoteLine>();
    for (const item of requested) {
      const id = normalizeString(item.id);
      const slug = normalizeString(item.slug);
      const addon = (id ? byId.get(id) : undefined) ?? (slug ? bySlug.get(slug) : undefined);
      if (!addon) {
        throw new BadRequestException({
          message:
            "One of the selected extra services is no longer available. Please review your order.",
          errorCode: "CHECKOUT_ADDON_INVALID",
        });
      }
      if (lines.has(addon.id)) continue;

      // ISBN is free when the package includes it (CLAUDE.md gotcha #42).
      if (packageIncludesIsbn && isIsbnAddon(addon)) continue;

      if (addon.pricingType === "per_word") {
        const wordCount = toPositiveInt(item.wordCount) ?? toPositiveInt(input.formattingWordCount);
        if (!wordCount) {
          throw new BadRequestException({
            message: "Enter your estimated word count for the formatting service.",
            errorCode: "CHECKOUT_WORD_COUNT_REQUIRED",
          });
        }
        const price = toCurrency(wordCount * Number(addon.pricePerWord ?? 0));
        if (price <= 0) continue;
        lines.set(addon.id, {
          id: addon.id,
          slug: addon.slug,
          name: addon.name,
          pricingType: "per_word",
          price,
          wordCount,
        });
        continue;
      }

      const price = toCurrency(Number(addon.price));
      if (price <= 0) continue;
      lines.set(addon.id, {
        id: addon.id,
        slug: addon.slug,
        name: addon.name,
        pricingType: "fixed",
        price,
        wordCount: null,
      });
    }

    return [...lines.values()];
  }

  private async resolveCoupon(
    rawCode: string | null | undefined,
    pkg: { id: string; categoryId: string }
  ) {
    const code = normalizeString(rawCode)?.toUpperCase();
    if (!code) return null;

    const coupon = await this.prisma.coupon.findUnique({
      where: { code },
      select: {
        id: true,
        code: true,
        type: true,
        value: true,
        usageLimit: true,
        usageCount: true,
        expiresAt: true,
        isActive: true,
        appliesToAll: true,
        packageScopes: { select: { packageId: true } },
        categoryScopes: { select: { categoryId: true } },
      },
    });

    const reject = (message: string, errorCode: string): never => {
      throw new BadRequestException({ message, errorCode });
    };

    if (!coupon) return reject("This discount code is invalid.", "CHECKOUT_COUPON_INVALID");
    if (!coupon.isActive)
      return reject("This discount code is inactive.", "CHECKOUT_COUPON_INACTIVE");
    if (coupon.expiresAt && coupon.expiresAt.getTime() <= Date.now()) {
      return reject("This discount code has expired.", "CHECKOUT_COUPON_EXPIRED");
    }
    if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
      return reject("This discount code has reached its usage limit.", "CHECKOUT_COUPON_MAXED_OUT");
    }
    const applies =
      coupon.appliesToAll ||
      coupon.packageScopes.some((scope) => scope.packageId === pkg.id) ||
      coupon.categoryScopes.some((scope) => scope.categoryId === pkg.categoryId);
    if (!applies) {
      return reject(
        "This discount code does not apply to this package.",
        "CHECKOUT_COUPON_NOT_APPLICABLE"
      );
    }

    return coupon;
  }
}

function canonicalize(pricing: SignedCheckoutPricing): string {
  // Fixed field order + sorted addons so the same pricing always hashes the same.
  return JSON.stringify([
    CHECKOUT_PRICING_VERSION,
    pricing.packageId,
    [...pricing.addons]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((addon) => [addon.id, toCurrency(addon.price), addon.wordCount ?? null]),
    pricing.couponCode ?? null,
    toCurrency(pricing.discountAmount),
    toCurrency(pricing.totalPrice),
    pricing.currency.toUpperCase(),
    pricing.dashboardUserId ?? null,
  ]);
}

function isIsbnAddon(addon: { slug: string; name: string }): boolean {
  return `${addon.slug} ${addon.name}`.toLowerCase().includes("isbn");
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isString(value: string | null): value is string {
  return value !== null;
}

function toPositiveInt(value: unknown): number | null {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed)) return null;
  const int = Math.floor(parsed);
  return int > 0 ? int : null;
}

export function toCurrency(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(Math.max(0, value).toFixed(2));
}
