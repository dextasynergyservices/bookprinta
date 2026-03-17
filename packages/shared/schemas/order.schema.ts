import { z } from "zod";
import {
  AdminAuditEntrySchema,
  AdminRefundTypeSchema,
  AdminSortDirectionSchema,
  IsoDateOnlySchema,
} from "./admin.schema.ts";

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

export const OrderInvoiceRenderEngineSchema = z.enum(["gotenberg", "fallback"]);
export type OrderInvoiceRenderEngine = z.infer<typeof OrderInvoiceRenderEngineSchema>;

/**
 * GET /api/v1/orders/:id/invoice/archive
 */
export const OrderInvoiceArchiveResponseSchema = z.object({
  orderId: z.string().cuid(),
  orderNumber: z.string(),
  invoiceNumber: z.string(),
  brandingVersion: z.number().int().positive().optional(),
  renderEngine: OrderInvoiceRenderEngineSchema.optional(),
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

// ==========================================
// Admin Order Contracts
// ==========================================

export const AdminOrderStatusSourceSchema = z.enum(["order", "book"]);
export type AdminOrderStatusSource = z.infer<typeof AdminOrderStatusSourceSchema>;

export const AdminOrderDisplayStatusSchema = z.enum([
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
  "UPLOADED",
  "PAYMENT_RECEIVED",
  "AI_PROCESSING",
  "DESIGNING",
  "DESIGNED",
  "FORMATTED",
  "FORMATTING_REVIEW",
  "REVIEW",
  "REJECTED",
  "PRINTING",
  "PRINTED",
  "SHIPPING",
  "DELIVERED",
]);
export type AdminOrderDisplayStatus = z.infer<typeof AdminOrderDisplayStatusSchema>;

export const AdminOrderSortFieldSchema = z.enum([
  "orderNumber",
  "customerName",
  "customerEmail",
  "packageName",
  "displayStatus",
  "createdAt",
  "totalAmount",
]);
export type AdminOrderSortField = z.infer<typeof AdminOrderSortFieldSchema>;

export const RefundPolicyDecisionSchema = z.enum(["FULL", "PARTIAL", "NONE"]);
export type RefundPolicyDecision = z.infer<typeof RefundPolicyDecisionSchema>;

export const RefundPolicySnapshotSchema = z.object({
  calculatedAt: z.string().datetime(),
  statusSource: AdminOrderStatusSourceSchema,
  stage: AdminOrderDisplayStatusSchema,
  stageLabel: z.string().trim().min(1).max(120),
  eligible: z.boolean(),
  policyDecision: RefundPolicyDecisionSchema,
  allowedRefundTypes: z.array(AdminRefundTypeSchema),
  recommendedRefundType: AdminRefundTypeSchema.nullable(),
  orderTotalAmount: z.number().nonnegative(),
  recommendedAmount: z.number().nonnegative(),
  maxRefundAmount: z.number().nonnegative(),
  policyPercent: z.number().min(0).max(100),
  policyMessage: z.string().trim().min(1).max(1000),
});
export type RefundPolicySnapshot = z.infer<typeof RefundPolicySnapshotSchema>;

export const AdminOrdersListQuerySchema = z
  .object({
    cursor: z.string().cuid().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    status: AdminOrderDisplayStatusSchema.optional(),
    packageId: z.string().cuid().optional(),
    dateFrom: IsoDateOnlySchema.optional(),
    dateTo: IsoDateOnlySchema.optional(),
    q: z.string().trim().max(200).optional(),
    sortBy: AdminOrderSortFieldSchema.default("createdAt"),
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
export type AdminOrdersListQuery = z.infer<typeof AdminOrdersListQuerySchema>;

export const AdminOrderCustomerSummarySchema = z.object({
  id: z.string().cuid(),
  fullName: z.string().trim().min(1).max(200),
  email: z.string().email(),
  phoneNumber: z.string().trim().min(1).max(40).nullable(),
  preferredLanguage: z.string().trim().min(2).max(10),
});
export type AdminOrderCustomerSummary = z.infer<typeof AdminOrderCustomerSummarySchema>;

export const AdminOrdersListItemSchema = z.object({
  id: z.string().cuid(),
  orderNumber: z.string(),
  customer: AdminOrderCustomerSummarySchema,
  package: OrderPackageSummarySchema,
  orderStatus: OrderStatusSchema,
  bookStatus: BookStatusSchema.nullable(),
  displayStatus: AdminOrderDisplayStatusSchema,
  statusSource: AdminOrderStatusSourceSchema,
  createdAt: z.string().datetime(),
  totalAmount: z.number().nonnegative(),
  currency: z.string().length(3),
  detailUrl: z.string(),
  actions: z.object({
    canArchive: z.boolean(),
  }),
});
export type AdminOrdersListItem = z.infer<typeof AdminOrdersListItemSchema>;

export const AdminOrdersListResponseSchema = z.object({
  items: z.array(AdminOrdersListItemSchema),
  nextCursor: z.string().cuid().nullable(),
  hasMore: z.boolean(),
  totalItems: z.number().int().min(0),
  limit: z.number().int().min(1).max(50),
  sortBy: AdminOrderSortFieldSchema,
  sortDirection: AdminSortDirectionSchema,
  sortableFields: z.array(AdminOrderSortFieldSchema),
});
export type AdminOrdersListResponse = z.infer<typeof AdminOrdersListResponseSchema>;

export const AdminOrderShippingAddressSchema = z.object({
  street: z.string().trim().min(1),
  city: z.string().trim().min(1),
  state: z.string().trim().min(1),
  country: z.string().trim().min(1),
  zipCode: z.string().trim().min(1).nullable(),
});
export type AdminOrderShippingAddress = z.infer<typeof AdminOrderShippingAddressSchema>;

export const AdminOrderBookDetailSchema = z.object({
  id: z.string().cuid(),
  status: BookStatusSchema,
  productionStatus: BookStatusSchema.nullable(),
  version: z.number().int().min(1),
  rejectionReason: z.string().nullable(),
  pageCount: z.number().int().nullable(),
  wordCount: z.number().int().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type AdminOrderBookDetail = z.infer<typeof AdminOrderBookDetailSchema>;

export const AdminOrderPaymentDetailSchema = z.object({
  id: z.string().cuid(),
  provider: z.string().trim().min(1),
  status: z.string().trim().min(1),
  type: z.string().trim().min(1),
  amount: z.number(),
  currency: z.string().length(3),
  providerRef: z.string().nullable(),
  receiptUrl: z.string().url().nullable(),
  payerName: z.string().nullable(),
  payerEmail: z.string().email().nullable(),
  payerPhone: z.string().nullable(),
  adminNote: z.string().nullable(),
  approvedAt: z.string().datetime().nullable(),
  approvedBy: z.string().nullable(),
  processedAt: z.string().datetime().nullable(),
  isRefundable: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type AdminOrderPaymentDetail = z.infer<typeof AdminOrderPaymentDetailSchema>;

export const AdminOrderStatusControlSchema = z.object({
  currentStatus: OrderStatusSchema,
  expectedVersion: z.number().int().min(1),
  nextAllowedStatuses: z.array(OrderStatusSchema),
});
export type AdminOrderStatusControl = z.infer<typeof AdminOrderStatusControlSchema>;

export const AdminOrderDetailSchema = z.object({
  id: z.string().cuid(),
  orderNumber: z.string(),
  orderType: OrderTypeSchema,
  orderStatus: OrderStatusSchema,
  bookStatus: BookStatusSchema.nullable(),
  displayStatus: AdminOrderDisplayStatusSchema,
  statusSource: AdminOrderStatusSourceSchema,
  orderVersion: z.number().int().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  customer: AdminOrderCustomerSummarySchema,
  package: OrderPackageSummarySchema,
  shippingAddress: AdminOrderShippingAddressSchema.nullable(),
  book: AdminOrderBookDetailSchema.nullable(),
  copies: z.number().int().min(1),
  bookSize: z.string(),
  paperColor: z.string(),
  lamination: z.string(),
  initialAmount: z.number().nonnegative(),
  extraAmount: z.number().nonnegative(),
  discountAmount: z.number().nonnegative(),
  totalAmount: z.number().nonnegative(),
  refundAmount: z.number().nonnegative(),
  refundReason: z.string().nullable(),
  refundedAt: z.string().datetime().nullable(),
  refundedBy: z.string().nullable(),
  currency: z.string().length(3),
  trackingNumber: z.string().nullable(),
  shippingProvider: z.string().nullable(),
  addons: z.array(OrderAddonSummarySchema),
  payments: z.array(AdminOrderPaymentDetailSchema),
  timeline: z.array(OrderTrackingTimelineItemSchema),
  refundPolicy: RefundPolicySnapshotSchema,
  statusControl: AdminOrderStatusControlSchema,
});
export type AdminOrderDetail = z.infer<typeof AdminOrderDetailSchema>;

export const AdminArchiveOrderSchema = z.object({
  reason: z.string().trim().min(5).max(500),
});
export type AdminArchiveOrderInput = z.infer<typeof AdminArchiveOrderSchema>;

export const AdminArchiveOrderResponseSchema = z.object({
  id: z.string().cuid(),
  status: OrderStatusSchema,
  archived: z.literal(true),
  archivedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type AdminArchiveOrderResponse = z.infer<typeof AdminArchiveOrderResponseSchema>;

export const AdminUpdateOrderStatusSchema = z.object({
  nextStatus: OrderStatusSchema,
  expectedVersion: z.number().int().min(1),
  reason: z.string().trim().min(1).max(240).optional(),
  note: z.string().trim().min(1).max(1000).optional(),
});
export type AdminUpdateOrderStatusInput = z.infer<typeof AdminUpdateOrderStatusSchema>;

export const AdminUpdateOrderStatusResponseSchema = z.object({
  orderId: z.string().cuid(),
  previousStatus: OrderStatusSchema,
  nextStatus: OrderStatusSchema,
  displayStatus: AdminOrderDisplayStatusSchema,
  statusSource: AdminOrderStatusSourceSchema,
  orderVersion: z.number().int().min(1),
  updatedAt: z.string().datetime(),
  audit: AdminAuditEntrySchema,
});
export type AdminUpdateOrderStatusResponse = z.infer<typeof AdminUpdateOrderStatusResponseSchema>;
