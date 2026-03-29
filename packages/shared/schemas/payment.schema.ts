import { z } from "zod";
import {
  AdminAuditEntrySchema,
  AdminRefundTypeSchema,
  AdminSortDirectionSchema,
  IsoDateOnlySchema,
} from "./admin.schema.ts";
import { BookStatusSchema, OrderStatusSchema, RefundPolicySnapshotSchema } from "./order.schema.ts";

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
 * Initialize a payment session with Paystack, Stripe, or PayPal.
 *
 * `orderId` is optional for guest checkout — the order is created
 * after payment succeeds via the webhook.
 */
export const InitializePaymentSchema = z.object({
  provider: z.enum(["PAYSTACK", "STRIPE", "PAYPAL"]),
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
  receiptUrl: z.string().url("Receipt URL must be a valid URL").optional(),
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
 * Initialize payment for a same-PDF reprint.
 *
 * The backend pulls bookSize, paperColor, and lamination from the
 * original order — the user cannot change these for a reprint.
 * Cost is calculated as: ((pageCount × CPP) + COC) × copies.
 */
export const ReprintPaymentSchema = z.object({
  sourceBookId: z.string().cuid(),
  copies: z.number().int().min(25, "Minimum 25 copies required"),
  provider: z.enum(["PAYSTACK", "STRIPE", "BANK_TRANSFER"]),
  callbackUrl: z.string().url().optional(),
});
export type ReprintPaymentInput = z.infer<typeof ReprintPaymentSchema>;

/**
 * POST /api/v1/admin/payments/:id/refund
 * Process a full, policy-partial, or custom refund from the admin panel.
 */
export const AdminRefundProcessingModeSchema = z.enum(["gateway", "manual"]);
export type AdminRefundProcessingMode = z.infer<typeof AdminRefundProcessingModeSchema>;

export const PendingBankTransferSlaStateSchema = z.enum(["green", "yellow", "red"]);
export type PendingBankTransferSlaState = z.infer<typeof PendingBankTransferSlaStateSchema>;

export const AdminPaymentSortFieldSchema = z.enum([
  "orderReference",
  "customerName",
  "customerEmail",
  "amount",
  "provider",
  "status",
  "createdAt",
]);
export type AdminPaymentSortField = z.infer<typeof AdminPaymentSortFieldSchema>;

export const AdminRefundRequestSchema = z
  .object({
    type: AdminRefundTypeSchema,
    reason: z.string().trim().min(1).max(1000),
    note: z.string().trim().min(1).max(1000).optional(),
    customAmount: z.number().positive().optional(),
    expectedOrderVersion: z.number().int().min(1),
    expectedBookVersion: z.number().int().min(1).optional(),
    policySnapshot: RefundPolicySnapshotSchema,
  })
  .superRefine((value, ctx) => {
    if (value.type === "CUSTOM" && value.customAmount === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customAmount"],
        message: "customAmount is required when refund type is CUSTOM",
      });
    }

    if (value.type !== "CUSTOM" && value.customAmount !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customAmount"],
        message: "customAmount is only allowed when refund type is CUSTOM",
      });
    }
  });
export type AdminRefundRequestInput = z.infer<typeof AdminRefundRequestSchema>;

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
  provider: z.enum(["PAYSTACK", "STRIPE", "PAYPAL"]),
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

export const AdminRefundResponseSchema = z.object({
  orderId: z.string().cuid(),
  paymentId: z.string().cuid(),
  refundPaymentId: z.string().cuid(),
  provider: PaymentProviderSchema,
  processingMode: AdminRefundProcessingModeSchema,
  refundType: AdminRefundTypeSchema,
  refundedAmount: z.number().nonnegative(),
  currency: z.string().length(3),
  paymentStatus: PaymentStatusSchema,
  providerRefundReference: z.string().nullable(),
  orderStatus: OrderStatusSchema,
  bookStatus: BookStatusSchema.nullable(),
  refundedAt: z.string().datetime(),
  refundReason: z.string().trim().min(1).max(1000),
  orderVersion: z.number().int().min(1),
  bookVersion: z.number().int().min(1).nullable(),
  emailSent: z.boolean(),
  policySnapshot: RefundPolicySnapshotSchema,
  audit: AdminAuditEntrySchema,
});
export type AdminRefundResponse = z.infer<typeof AdminRefundResponseSchema>;

// ==========================================
// Admin Payment Management Contracts
// ==========================================

export const AdminPaymentCustomerSummarySchema = z.object({
  fullName: z.string().trim().min(1).max(200).nullable(),
  email: z.string().email().nullable(),
  phoneNumber: z.string().trim().min(1).max(40).nullable(),
  preferredLanguage: z.string().trim().min(2).max(10).nullable(),
});
export type AdminPaymentCustomerSummary = z.infer<typeof AdminPaymentCustomerSummarySchema>;

export const AdminPaymentRefundabilitySchema = z.object({
  isRefundable: z.boolean(),
  processingMode: AdminRefundProcessingModeSchema,
  reason: z.string().trim().min(1).max(240).nullable(),
  policySnapshot: RefundPolicySnapshotSchema.nullable(),
  orderVersion: z.number().int().min(1).nullable(),
  bookVersion: z.number().int().min(1).nullable(),
});
export type AdminPaymentRefundability = z.infer<typeof AdminPaymentRefundabilitySchema>;

/**
 * GET /api/v1/admin/payments?cursor=&limit=&status=&provider=&dateFrom=&dateTo=&q=&sortBy=&sortDirection=
 */
export const AdminPaymentsListQuerySchema = z
  .object({
    cursor: z.string().cuid().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    status: PaymentStatusSchema.optional(),
    provider: PaymentProviderSchema.optional(),
    dateFrom: IsoDateOnlySchema.optional(),
    dateTo: IsoDateOnlySchema.optional(),
    q: z.string().trim().max(200).optional(),
    sortBy: AdminPaymentSortFieldSchema.default("createdAt"),
    sortDirection: AdminSortDirectionSchema.default("desc"),
  })
  .superRefine((value, ctx) => {
    if (value.dateFrom && value.dateTo && value.dateFrom > value.dateTo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dateTo"],
        message: "dateTo must be on or after dateFrom",
      });
    }
  });
export type AdminPaymentsListQuery = z.infer<typeof AdminPaymentsListQuerySchema>;

export const AdminPaymentsListItemSchema = z.object({
  id: z.string().cuid(),
  orderReference: z.string().trim().min(1).max(120),
  orderNumber: z.string().nullable(),
  orderId: z.string().cuid().nullable(),
  userId: z.string().cuid().nullable(),
  customer: AdminPaymentCustomerSummarySchema,
  provider: PaymentProviderSchema,
  type: PaymentTypeSchema,
  status: PaymentStatusSchema,
  amount: z.number(),
  currency: z.string().length(3),
  providerRef: z.string().nullable(),
  receiptUrl: z.string().url().nullable(),
  payerName: z.string().trim().min(1).max(200).nullable(),
  payerEmail: z.string().email().nullable(),
  payerPhone: z.string().trim().min(1).max(40).nullable(),
  adminNote: z.string().nullable(),
  hasAdminNote: z.boolean(),
  approvedAt: z.string().datetime().nullable(),
  approvedBy: z.string().nullable(),
  processedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  refundability: AdminPaymentRefundabilitySchema,
});
export type AdminPaymentsListItem = z.infer<typeof AdminPaymentsListItemSchema>;

export const AdminPaymentsListResponseSchema = z.object({
  items: z.array(AdminPaymentsListItemSchema),
  nextCursor: z.string().cuid().nullable(),
  hasMore: z.boolean(),
  totalItems: z.number().int().min(0),
  limit: z.number().int().min(1).max(50),
  sortBy: AdminPaymentSortFieldSchema,
  sortDirection: AdminSortDirectionSchema,
  sortableFields: z.array(AdminPaymentSortFieldSchema),
});
export type AdminPaymentsListResponse = z.infer<typeof AdminPaymentsListResponseSchema>;

export const AdminPendingBankTransferSlaSnapshotSchema = z.object({
  ageMinutes: z.number().int().min(0),
  state: PendingBankTransferSlaStateSchema,
});
export type AdminPendingBankTransferSlaSnapshot = z.infer<
  typeof AdminPendingBankTransferSlaSnapshotSchema
>;

export const AdminPendingBankTransferItemSchema = AdminPaymentsListItemSchema.extend({
  provider: z.literal("BANK_TRANSFER"),
  status: z.literal("AWAITING_APPROVAL"),
  slaSnapshot: AdminPendingBankTransferSlaSnapshotSchema,
});
export type AdminPendingBankTransferItem = z.infer<typeof AdminPendingBankTransferItemSchema>;

/**
 * GET /api/v1/payments/bank-transfer/pending
 */
export const AdminPendingBankTransfersResponseSchema = z.object({
  items: z.array(AdminPendingBankTransferItemSchema),
  totalItems: z.number().int().min(0),
  refreshedAt: z.string().datetime(),
});
export type AdminPendingBankTransfersResponse = z.infer<
  typeof AdminPendingBankTransfersResponseSchema
>;
