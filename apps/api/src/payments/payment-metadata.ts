/**
 * Pure helpers for payment metadata and values: no I/O, no Nest dependencies.
 *
 * Provider metadata (Paystack/Stripe/PayPal) and client request bodies arrive
 * as untyped JSON, so everything here coerces defensively and returns
 * `undefined`/`null` rather than throwing.
 */
import { randomBytes } from "node:crypto";
import type { Locale } from "@bookprinta/emails";
import { DEFAULT_CURRENCY } from "@bookprinta/shared";
import { PaymentProvider } from "../generated/prisma/enums.js";
import { PAYSTACK_PRODUCT_TAG, PAYSTACK_PRODUCT_TAG_KEY } from "./constants.js";
import {
  CHECKOUT_PRICING_SIGNATURE_KEY,
  CHECKOUT_PRICING_VERSION_KEY,
} from "./services/checkout-pricing.service.js";

export const REPRINT_MIN_COPIES = 1;

export type CheckoutAddonMetadata = {
  id?: string | null;
  slug?: string;
  name?: string;
  price?: number;
  wordCount?: number | null;
};

export type CheckoutMetadata = {
  locale?: Locale;
  fullName?: string;
  phone?: string;
  couponCode?: string;
  packageId?: string;
  packageSlug?: string;
  packageName?: string;
  tier?: string;
  hasCover?: boolean;
  hasFormatting?: boolean;
  bookSize?: string;
  paperColor?: string;
  lamination?: string;
  formattingWordCount?: number;
  basePrice?: number;
  addonTotal?: number;
  discountAmount?: number;
  totalPrice?: number;
  addons?: CheckoutAddonMetadata[];
  paymentFlow?: string;
  customQuoteId?: string;
  quoteTitle?: string;
  quoteQuantity?: number;
  quotePrintSize?: string;
  quoteFinalPrice?: number;
  /** "dashboard" when order placed by authenticated user from dashboard */
  source?: string;
  /** User ID when order placed from dashboard (set server-side by DashboardService) */
  dashboardUserId?: string;
  /** HMAC over the server-computed pricing — see CheckoutPricingService. */
  pricingSignature?: string;
};

export type CustomQuoteCheckoutMetadata = {
  customQuoteId: string;
  quoteTitle: string;
  quotePrintSize: string;
  quoteQuantity: number;
  quoteFinalPrice: number;
  fullName: string | null;
  phone: string | null;
  locale: Locale;
};

export type ReprintMetadata = {
  sourceBookId: string;
  sourceOrderId: string | null;
  copies: number;
  bookSize: string | null;
  paperColor: string | null;
  lamination: string | null;
  pageCount: number | null;
  finalPdfUrl: string | null;
};

export type DashboardOrderEmailDeliverySnapshot = {
  userSentAt?: string | null;
  adminSentAt?: string | null;
  lastAttemptAt?: string | null;
};

/** True when Paystack metadata carries BookPrinta's product tag (constants.ts). */
export function hasBookPrintaProductTag(
  metadata: Record<string, unknown> | string | null | undefined
): boolean {
  const record = typeof metadata === "string" ? parseJsonRecord(metadata) : asRecord(metadata);
  return record?.[PAYSTACK_PRODUCT_TAG_KEY] === PAYSTACK_PRODUCT_TAG;
}

export function normalizeWebhookMetadata(
  metadata: Record<string, unknown> | null
): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== "object") return null;
  return metadata;
}

/**
 * Metadata keys only the server may set. Stripped from every public request
 * body so a guest cannot attach a payment to another user's account or
 * smuggle in pre-signed pricing.
 */
export function stripClientTrustedMetadata(
  metadata: Record<string, unknown> | null
): Record<string, unknown> | null {
  if (!metadata) return null;
  const {
    dashboardUserId: _dashboardUserId,
    source: _source,
    checkout_state: _checkoutState,
    [CHECKOUT_PRICING_SIGNATURE_KEY]: _signature,
    [CHECKOUT_PRICING_VERSION_KEY]: _version,
    ...rest
  } = metadata;
  return rest;
}

export function extractCheckoutMetadata(
  metadata: Record<string, unknown> | null
): CheckoutMetadata | null {
  if (!metadata || typeof metadata !== "object") return null;

  const merged: Record<string, unknown> = { ...metadata };
  const checkoutState = asString(metadata.checkout_state);
  if (checkoutState) {
    const parsed = parseJsonRecord(checkoutState);
    if (parsed) Object.assign(merged, parsed);
  }

  const addonsRaw = Array.isArray(merged.addons)
    ? merged.addons
    : parseJsonArray(asString(merged.addons));

  const addons = (addonsRaw ?? [])
    .map((value) => asRecord(value))
    .filter((value): value is Record<string, unknown> => Boolean(value))
    .map((addon) => ({
      id: asString(addon.id),
      slug: asString(addon.slug),
      name: asString(addon.name),
      price: asNumber(addon.price),
      wordCount: asInteger(addon.wordCount) ?? null,
    }));

  return {
    locale: resolveLocale(asString(merged.locale)),
    fullName: asString(merged.fullName),
    phone: asString(merged.phone),
    paymentFlow: asString(merged.paymentFlow),
    customQuoteId: asString(merged.customQuoteId),
    quoteTitle: asString(merged.quoteTitle),
    quoteQuantity: asInteger(merged.quoteQuantity),
    quotePrintSize: asString(merged.quotePrintSize),
    quoteFinalPrice: asNumber(merged.quoteFinalPrice),
    couponCode: asString(merged.couponCode),
    packageId: asString(merged.packageId),
    packageSlug: asString(merged.packageSlug),
    packageName: asString(merged.packageName),
    tier: asString(merged.tier),
    hasCover: asBoolean(merged.hasCover),
    hasFormatting: asBoolean(merged.hasFormatting),
    bookSize: asString(merged.bookSize),
    paperColor: asString(merged.paperColor),
    lamination: asString(merged.lamination),
    formattingWordCount: asInteger(merged.formattingWordCount),
    basePrice: asNumber(merged.basePrice),
    addonTotal: asNumber(merged.addonTotal),
    discountAmount: asNumber(merged.discountAmount),
    totalPrice: asNumber(merged.totalPrice),
    addons,
    source: asString(merged.source),
    dashboardUserId: asString(merged.dashboardUserId),
    pricingSignature: asString(merged[CHECKOUT_PRICING_SIGNATURE_KEY]),
  };
}

export function deriveTitleFromFileName(fileName: string | null | undefined): string | null {
  if (typeof fileName !== "string") return null;
  const trimmed = fileName.trim();
  if (!trimmed) return null;

  const normalized = trimmed
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.length > 0 ? normalized : null;
}

export function extractReprintMetadata(
  metadata: Record<string, unknown> | null
): ReprintMetadata | null {
  if (!metadata || typeof metadata !== "object") return null;

  const sourceBookId = asString(metadata.sourceBookId);
  const copies = asInteger(metadata.copies);

  if (!sourceBookId || typeof copies !== "number" || copies < REPRINT_MIN_COPIES) {
    return null;
  }

  return {
    sourceBookId,
    sourceOrderId: asString(metadata.sourceOrderId) ?? null,
    copies,
    bookSize: asString(metadata.bookSize) ?? null,
    paperColor: asString(metadata.paperColor) ?? null,
    lamination: asString(metadata.lamination) ?? null,
    pageCount: asInteger(metadata.pageCount) ?? null,
    finalPdfUrl: asString(metadata.finalPdfUrl) ?? null,
  };
}

export function extractCustomQuoteCheckoutMetadata(
  metadata: Record<string, unknown> | null
): CustomQuoteCheckoutMetadata | null {
  const checkout = extractCheckoutMetadata(metadata);
  if (!checkout) return null;

  if ((checkout.paymentFlow || "").toUpperCase() !== "CUSTOM_QUOTE") {
    return null;
  }

  const customQuoteId = asString(checkout.customQuoteId);
  const quoteTitle = asString(checkout.quoteTitle);
  const quotePrintSize = asString(checkout.quotePrintSize) || "A5";
  const quoteQuantity = asInteger(checkout.quoteQuantity);
  const quoteFinalPrice = asNumber(checkout.quoteFinalPrice);

  if (!customQuoteId || !quoteTitle || !quoteQuantity || !quoteFinalPrice) {
    return null;
  }

  return {
    customQuoteId,
    quoteTitle,
    quotePrintSize,
    quoteQuantity,
    quoteFinalPrice,
    fullName: asString(checkout.fullName) ?? null,
    phone: asString(checkout.phone) ?? null,
    locale: resolveLocale(asString(checkout.locale)),
  };
}

export function parseDataUrl(
  dataUrl: string
): { buffer: Buffer; mimeType: string; extension: string } | null {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/i);
  if (!match) return null;

  const mimeType = match[1].trim().toLowerCase();
  const base64Data = match[2].trim();
  if (!base64Data) return null;

  const buffer = Buffer.from(base64Data, "base64");
  if (buffer.length === 0) return null;

  const extension =
    mimeType === "application/pdf"
      ? "pdf"
      : mimeType === "image/png"
        ? "png"
        : mimeType === "image/jpeg"
          ? "jpg"
          : "bin";

  return { buffer, mimeType, extension };
}

export function mimeToExtension(mimeType: string): string {
  switch (mimeType.toLowerCase()) {
    case "application/pdf":
      return "pdf";
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return "docx";
    case "application/msword":
      return "doc";
    default:
      return "bin";
  }
}

export function extractDashboardOrderEmailDelivery(
  metadata: Record<string, unknown> | null
): DashboardOrderEmailDeliverySnapshot {
  const snapshot = asRecord(metadata?.dashboardOrderEmailDelivery);
  return {
    userSentAt: asString(snapshot?.userSentAt),
    adminSentAt: asString(snapshot?.adminSentAt),
    lastAttemptAt: asString(snapshot?.lastAttemptAt),
  };
}

export function withDashboardOrderEmailDelivery(
  metadata: Record<string, unknown>,
  delivery: DashboardOrderEmailDeliverySnapshot
): Record<string, unknown> {
  return {
    ...metadata,
    dashboardOrderEmailDelivery: {
      ...asRecord(metadata.dashboardOrderEmailDelivery),
      ...delivery,
    },
  };
}

export function pickDisplayName(fullName: string | undefined, email: string): string {
  if (fullName?.trim()) return fullName.trim();
  return email.split("@")[0] || "Author";
}

export function splitFullName(name: string): { firstName: string; lastName: string | null } {
  const normalized = name.trim().replace(/\s+/g, " ");
  const [first, ...rest] = normalized.split(" ");
  return {
    firstName: first || "Author",
    lastName: rest.length > 0 ? rest.join(" ") : null,
  };
}

/** A unique payment reference: `<prefix>_<base36 time>_<random>`. */
export function generatePaymentReference(prefix = "bp"): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${prefix}_${timestamp}_${random}`;
}

export function generateSecureToken(): string {
  return randomBytes(32).toString("hex");
}

export function formatNaira(amount: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: DEFAULT_CURRENCY,
    maximumFractionDigits: 0,
  }).format(toCurrency(amount));
}

export function resolveLocale(value: unknown): Locale {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "fr" || normalized === "es") return normalized;
  return "en";
}

export function toCurrency(value: unknown): number {
  const amount = asNumber(value) ?? 0;
  if (!Number.isFinite(amount)) return 0;
  return Number(Math.max(0, amount).toFixed(2));
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function isPrismaUniqueViolation(error: unknown): boolean {
  if (error && typeof error === "object" && "code" in error) {
    return (error as { code: string }).code === "P2002";
  }
  return false;
}

export function isPrismaUniqueViolationForField(error: unknown, field: string): boolean {
  if (!isPrismaUniqueViolation(error)) {
    return false;
  }

  if (
    !error ||
    typeof error !== "object" ||
    !("meta" in error) ||
    !(error as { meta?: { target?: unknown } }).meta
  ) {
    return false;
  }

  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  if (Array.isArray(target)) {
    return target.some((value) => value === field);
  }

  return typeof target === "string" && target.includes(field);
}

export function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return undefined;
}

export function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (
    value &&
    typeof value === "object" &&
    "toNumber" in value &&
    typeof (value as { toNumber: unknown }).toNumber === "function"
  ) {
    const parsed = (value as { toNumber: () => number }).toNumber();
    if (Number.isFinite(parsed)) return parsed;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export function asInteger(value: unknown): number | undefined {
  const parsed = asNumber(value);
  if (parsed === undefined) return undefined;
  return Math.max(0, Math.floor(parsed));
}

export function parseJsonRecord(value?: string): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return asRecord(parsed);
  } catch {
    return null;
  }
}

export function parseJsonArray(value?: string): unknown[] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function parseProviderHint(value?: string): PaymentProvider | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toUpperCase();
  if (normalized === PaymentProvider.PAYSTACK) return PaymentProvider.PAYSTACK;
  if (normalized === PaymentProvider.STRIPE) return PaymentProvider.STRIPE;
  if (normalized === PaymentProvider.PAYPAL) return PaymentProvider.PAYPAL;
  return undefined;
}
