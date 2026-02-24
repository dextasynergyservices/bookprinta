import { z } from "zod";

// ==========================================
// Payment Schemas — Source of Truth
// Shared between frontend & backend
// ==========================================

/**
 * Default currency for all BookPrinta transactions.
 * All charges are in Nigerian Naira — see CLAUDE.md Section 21.
 * Using a constant instead of hardcoding "NGN" everywhere
 * so future multi-currency support has a single place to update.
 */
export const DEFAULT_CURRENCY = "NGN";

// ──────────────────────────────────────────────
// Enums (aligned with Prisma schema)
// ──────────────────────────────────────────────

export const PaymentProviderSchema = z.enum(["PAYSTACK", "STRIPE", "PAYPAL", "BANK_TRANSFER"]);
export type PaymentProvider = z.infer<typeof PaymentProviderSchema>;

export const PaymentStatusSchema = z.enum([
  "PENDING",
  "SUCCESS",
  "AWAITING_APPROVAL",
  "FAILED",
  "REFUNDED",
]);
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

export const PaymentTypeSchema = z.enum([
  "INITIAL",
  "EXTRA_PAGES",
  "MANUAL_ADJUSTMENT",
  "CUSTOM_QUOTE",
  "REFUND",
  "REPRINT",
]);
export type PaymentType = z.infer<typeof PaymentTypeSchema>;

// ──────────────────────────────────────────────
// Request Schemas
// ──────────────────────────────────────────────

/**
 * POST /api/v1/payments/initialize
 * Initialize a payment session with Paystack or Stripe.
 *
 * `orderId` is optional for guest checkout — the order is created
 * after payment succeeds via the webhook.
 */
export const InitializePaymentSchema = z.object({
  provider: z.enum(["PAYSTACK", "STRIPE"]),
  email: z.string().email("Please enter a valid email address"),
  amount: z
    .number()
    .positive("Amount must be greater than zero")
    .max(10_000_000, "Amount cannot exceed ₦10,000,000"),
  currency: z.string().length(3, "Currency must be a 3-letter ISO code").default(DEFAULT_CURRENCY),
  orderId: z.string().cuid().optional(),
  callbackUrl: z.string().url("Callback URL must be a valid URL").optional(),
  metadata: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Checkout state: hasCover, hasFormatting, tier, addons, etc."),
});
export type InitializePaymentInput = z.infer<typeof InitializePaymentSchema>;

/**
 * POST /api/v1/payments/bank-transfer
 * Submit a bank transfer receipt for admin approval.
 * The receipt URL comes from a prior Cloudinary signed upload.
 */
export const BankTransferSchema = z.object({
  payerName: z.string().min(2, "Name must be at least 2 characters").max(100, "Name is too long"),
  payerEmail: z.string().email("Please enter a valid email address"),
  payerPhone: z.string().min(7, "Phone number is too short").max(20, "Phone number is too long"),
  amount: z.number().positive("Amount must be greater than zero"),
  currency: z.string().length(3).default(DEFAULT_CURRENCY),
  receiptUrl: z.string().url("Receipt URL must be a valid URL"),
  orderId: z.string().cuid().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type BankTransferInput = z.infer<typeof BankTransferSchema>;

/**
 * POST /api/v1/payments/extra-pages
 * Pay for pages exceeding the bundle limit (billing gate).
 */
export const ExtraPagesPaymentSchema = z.object({
  bookId: z.string().cuid(),
  provider: z.enum(["PAYSTACK", "STRIPE"]),
  extraPages: z.number().int().positive("Must have at least 1 extra page"),
  callbackUrl: z.string().url().optional(),
});
export type ExtraPagesPaymentInput = z.infer<typeof ExtraPagesPaymentSchema>;

/**
 * POST /api/v1/payments/reprint
 * Pay for a reprint order.
 */
export const ReprintPaymentSchema = z.object({
  orderId: z.string().cuid(),
  provider: z.enum(["PAYSTACK", "STRIPE"]),
  callbackUrl: z.string().url().optional(),
});
export type ReprintPaymentInput = z.infer<typeof ReprintPaymentSchema>;

// ──────────────────────────────────────────────
// Response Schemas
// ──────────────────────────────────────────────

/** Shape returned by GET or after payment operations. */
export const PaymentResponseSchema = z.object({
  id: z.string(),
  orderId: z.string().nullable(),
  provider: PaymentProviderSchema,
  type: PaymentTypeSchema,
  amount: z.number(),
  currency: z.string(),
  status: PaymentStatusSchema,
  providerRef: z.string().nullable(),
  receiptUrl: z.string().nullable(),
  payerName: z.string().nullable(),
  payerEmail: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type PaymentResponse = z.infer<typeof PaymentResponseSchema>;

/** Shape returned by POST /payments/initialize. */
export const InitializePaymentResponseSchema = z.object({
  authorizationUrl: z.string().url(),
  accessCode: z.string().optional(),
  reference: z.string(),
  provider: z.enum(["PAYSTACK", "STRIPE"]),
});
export type InitializePaymentResponse = z.infer<typeof InitializePaymentResponseSchema>;

/** Shape of a payment gateway (admin-configurable). */
export const PaymentGatewayResponseSchema = z.object({
  id: z.string(),
  provider: PaymentProviderSchema,
  name: z.string(),
  isEnabled: z.boolean(),
  isTestMode: z.boolean(),
  bankDetails: z.record(z.string(), z.unknown()).nullable(),
  instructions: z.string().nullable(),
  priority: z.number(),
});
export type PaymentGatewayResponse = z.infer<typeof PaymentGatewayResponseSchema>;
