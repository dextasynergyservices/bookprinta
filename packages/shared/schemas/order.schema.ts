import { z } from "zod";

// ==========================================
// Order Schemas — Source of Truth
// Shared between frontend & backend
// ==========================================

export const OrderStatusSchema = z.enum([
  "PENDING_PAYMENT",
  "PENDING_PAYMENT_APPROVAL",
  "PAID",
  "PROCESSING",
  "AWAITING_UPLOAD",
  "FORMATTING",
  "ACTION_REQUIRED",
  "PREVIEW_READY",
  "PENDING_EXTRA_PAYMENT",
  "APPROVED",
  "IN_PRODUCTION",
  "COMPLETED",
  "CANCELLED",
  "REFUNDED",
]);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const BookStatusSchema = z.enum([
  "AWAITING_UPLOAD",
  "UPLOADED",
  "PAYMENT_RECEIVED",
  "AI_PROCESSING",
  "DESIGNING",
  "DESIGNED",
  "FORMATTING",
  "FORMATTED",
  "FORMATTING_REVIEW",
  "PREVIEW_READY",
  "REVIEW",
  "APPROVED",
  "REJECTED",
  "IN_PRODUCTION",
  "PRINTING",
  "PRINTED",
  "SHIPPING",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
]);
export type BookStatus = z.infer<typeof BookStatusSchema>;

export const OrderTypeSchema = z.enum(["STANDARD", "REPRINT_SAME", "REPRINT_REVISED"]);
export type OrderType = z.infer<typeof OrderTypeSchema>;

/**
 * GET /api/v1/orders?page=1&limit=10
 */
export const OrdersListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
export type OrdersListQueryInput = z.infer<typeof OrdersListQuerySchema>;

/**
 * Common path param for /orders/:id routes
 */
export const OrderParamsSchema = z.object({
  id: z.string().cuid(),
});
export type OrderParamsInput = z.infer<typeof OrderParamsSchema>;

export const OrderPackageSummarySchema = z.object({
  id: z.string().cuid(),
  name: z.string(),
  slug: z.string(),
});
export type OrderPackageSummary = z.infer<typeof OrderPackageSummarySchema>;

export const OrderBookSummarySchema = z.object({
  id: z.string().cuid(),
  status: BookStatusSchema,
});
export type OrderBookSummary = z.infer<typeof OrderBookSummarySchema>;

export const OrdersListItemSchema = z.object({
  id: z.string().cuid(),
  orderNumber: z.string(),
  orderType: OrderTypeSchema,
  status: OrderStatusSchema,
  createdAt: z.string().datetime(),
  totalAmount: z.number().nonnegative(),
  currency: z.string().length(3),
  package: OrderPackageSummarySchema,
  book: OrderBookSummarySchema.nullable(),
  trackingUrl: z.string(),
});
export type OrdersListItem = z.infer<typeof OrdersListItemSchema>;

export const OrdersPaginationSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  totalItems: z.number().int().min(0),
  totalPages: z.number().int().min(0),
  hasPreviousPage: z.boolean(),
  hasNextPage: z.boolean(),
});
export type OrdersPagination = z.infer<typeof OrdersPaginationSchema>;

export const OrdersListResponseSchema = z.object({
  items: z.array(OrdersListItemSchema),
  pagination: OrdersPaginationSchema,
});
export type OrdersListResponse = z.infer<typeof OrdersListResponseSchema>;

export const OrderPaymentSummarySchema = z.object({
  id: z.string().cuid(),
  provider: z.string(),
  status: z.string(),
  type: z.string(),
  amount: z.number().nonnegative(),
  currency: z.string().length(3),
  providerRef: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type OrderPaymentSummary = z.infer<typeof OrderPaymentSummarySchema>;

export const OrderAddonSummarySchema = z.object({
  id: z.string().cuid(),
  addonId: z.string().cuid(),
  name: z.string(),
  price: z.number().nonnegative(),
  wordCount: z.number().int().nullable(),
});
export type OrderAddonSummary = z.infer<typeof OrderAddonSummarySchema>;

/**
 * GET /api/v1/orders/:id
 */
export const OrderDetailResponseSchema = OrdersListItemSchema.extend({
  updatedAt: z.string().datetime(),
  copies: z.number().int().min(1),
  bookSize: z.string(),
  paperColor: z.string(),
  lamination: z.string(),
  initialAmount: z.number().nonnegative(),
  extraAmount: z.number().nonnegative(),
  discountAmount: z.number().nonnegative(),
  refundAmount: z.number().nonnegative(),
  trackingNumber: z.string().nullable(),
  shippingProvider: z.string().nullable(),
  addons: z.array(OrderAddonSummarySchema),
  payments: z.array(OrderPaymentSummarySchema),
});
export type OrderDetailResponse = z.infer<typeof OrderDetailResponseSchema>;

export const TrackingStateSchema = z.enum(["completed", "current", "upcoming"]);
export type TrackingState = z.infer<typeof TrackingStateSchema>;

export const TrackingSourceSchema = z.enum(["order", "book", "system"]);
export type TrackingSource = z.infer<typeof TrackingSourceSchema>;

export const OrderTrackingTimelineItemSchema = z.object({
  key: z.string(),
  label: z.string(),
  status: z.string(),
  source: TrackingSourceSchema,
  state: TrackingStateSchema,
  reachedAt: z.string().datetime().nullable(),
});
export type OrderTrackingTimelineItem = z.infer<typeof OrderTrackingTimelineItemSchema>;

/**
 * GET /api/v1/orders/:id/tracking
 */
export const OrderTrackingResponseSchema = z.object({
  orderId: z.string().cuid(),
  orderNumber: z.string(),
  bookId: z.string().cuid().nullable(),
  currentOrderStatus: OrderStatusSchema,
  currentBookStatus: BookStatusSchema.nullable(),
  rejectionReason: z.string().nullable(),
  trackingNumber: z.string().nullable(),
  shippingProvider: z.string().nullable(),
  updatedAt: z.string().datetime(),
  timeline: z.array(OrderTrackingTimelineItemSchema),
});
export type OrderTrackingResponse = z.infer<typeof OrderTrackingResponseSchema>;

export const OrderInvoiceFinancialBreakdownSchema = z.object({
  packageAmount: z.number().nonnegative(),
  addonsSubtotal: z.number().nonnegative(),
  discountAmount: z.number().nonnegative(),
  taxAmount: z.number().nonnegative(),
  shippingFee: z.number().nonnegative(),
  grandTotal: z.number().nonnegative(),
  currency: z.string().length(3),
});
export type OrderInvoiceFinancialBreakdown = z.infer<typeof OrderInvoiceFinancialBreakdownSchema>;

export const OrderInvoiceLegalEntitySchema = z.object({
  legalName: z.string().min(1),
  address: z.string().min(1),
  supportEmail: z.string().min(1),
  supportPhone: z.string().min(1),
  taxId: z.string().nullable(),
});
export type OrderInvoiceLegalEntity = z.infer<typeof OrderInvoiceLegalEntitySchema>;

export const OrderInvoicePaymentProofSchema = z.object({
  provider: z.string().nullable(),
  status: z.string().nullable(),
  reference: z.string().nullable(),
  paidAt: z.string().datetime().nullable(),
  history: z.array(OrderPaymentSummarySchema),
});
export type OrderInvoicePaymentProof = z.infer<typeof OrderInvoicePaymentProofSchema>;

/**
 * GET /api/v1/orders/:id/invoice/archive
 */
export const OrderInvoiceArchiveResponseSchema = z.object({
  orderId: z.string().cuid(),
  orderNumber: z.string(),
  invoiceNumber: z.string(),
  fileName: z.string(),
  archivedUrl: z.string().url(),
  generatedAt: z.string().datetime(),
  issuedAt: z.string().datetime(),
  paymentReference: z.string().nullable(),
  legal: OrderInvoiceLegalEntitySchema,
  financialBreakdown: OrderInvoiceFinancialBreakdownSchema,
  paymentProof: OrderInvoicePaymentProofSchema,
});
export type OrderInvoiceArchiveResponse = z.infer<typeof OrderInvoiceArchiveResponseSchema>;
