import type {
  AdminPaymentRefundability,
  AdminPaymentSortField,
  AdminPaymentsListItem,
  AdminPaymentsListQuery,
  AdminPaymentsListResponse,
  AdminPendingBankTransferItem,
  AdminPendingBankTransfersResponse,
  AdminPendingCheckoutSnapshot,
  SignupLinkDeliverySnapshot,
} from "@bookprinta/shared";
import { BadRequestException, Injectable } from "@nestjs/common";
import type { Prisma } from "../../generated/prisma/client.js";
import {
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
  PaymentType,
} from "../../generated/prisma/enums.js";
import { buildRefundPolicySnapshot } from "../../orders/admin-order-workflow.js";
import { PrismaService } from "../../prisma/prisma.service.js";

// ──────────────────────────────────────────────
// AdminPaymentListService
//
// Owns payment list queries and serialization for the admin panel.
// Extracted from the PaymentsService monolith.
// ──────────────────────────────────────────────

const STALE_PENDING_CHECKOUT_MINUTES = 120;

const ADMIN_PAYMENT_SORTABLE_FIELDS: AdminPaymentSortField[] = [
  "orderReference",
  "customerName",
  "customerEmail",
  "amount",
  "provider",
  "status",
  "createdAt",
];

const ADMIN_PAYMENT_LIST_SELECT = {
  id: true,
  orderId: true,
  userId: true,
  provider: true,
  type: true,
  amount: true,
  currency: true,
  status: true,
  providerRef: true,
  processedAt: true,
  receiptUrl: true,
  payerName: true,
  payerEmail: true,
  payerPhone: true,
  adminNote: true,
  approvedAt: true,
  approvedBy: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
  order: {
    select: {
      id: true,
      orderNumber: true,
      status: true,
      version: true,
      refundedAt: true,
      totalAmount: true,
      currency: true,
      userId: true,
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phoneNumber: true,
          preferredLanguage: true,
        },
      },
      book: {
        select: {
          id: true,
          status: true,
          productionStatus: true,
          version: true,
        },
      },
    },
  },
  user: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phoneNumber: true,
      preferredLanguage: true,
    },
  },
} as const;

type AdminPaymentListRow = Prisma.PaymentGetPayload<{
  select: typeof ADMIN_PAYMENT_LIST_SELECT;
}>;

type CheckoutMetadataSlice = {
  fullName?: string;
  phone?: string;
  locale?: string;
  paymentFlow?: string;
  source?: string;
};

@Injectable()
export class AdminPaymentListService {
  constructor(private readonly prisma: PrismaService) {}

  async listAdminPayments(query: AdminPaymentsListQuery): Promise<AdminPaymentsListResponse> {
    const limit = query.limit ?? 20;
    const sortBy = query.sortBy ?? "createdAt";
    const sortDirection = query.sortDirection ?? "desc";
    const where = this.buildAdminPaymentsWhere(query);
    const rows = await this.prisma.payment.findMany({
      where,
      select: ADMIN_PAYMENT_LIST_SELECT,
    });
    const items = this.sortAdminPaymentItems(
      rows.map((row) => this.serializeAdminPaymentListItem(row)),
      sortBy,
      sortDirection
    );

    let startIndex = 0;
    if (query.cursor) {
      const cursorIndex = items.findIndex((item) => item.id === query.cursor);
      if (cursorIndex === -1) {
        throw new BadRequestException("Invalid payments cursor");
      }
      startIndex = cursorIndex + 1;
    }

    const pageItems = items.slice(startIndex, startIndex + limit);
    const nextCursor =
      startIndex + limit < items.length && pageItems.length > 0
        ? (pageItems[pageItems.length - 1]?.id ?? null)
        : null;

    return {
      items: pageItems,
      nextCursor,
      hasMore: nextCursor !== null,
      totalItems: items.length,
      limit,
      sortBy,
      sortDirection,
      sortableFields: [...ADMIN_PAYMENT_SORTABLE_FIELDS],
    };
  }

  async listAdminPendingBankTransfers(): Promise<AdminPendingBankTransfersResponse> {
    const rows = await this.prisma.payment.findMany({
      where: {
        provider: PaymentProvider.BANK_TRANSFER,
        status: PaymentStatus.AWAITING_APPROVAL,
      },
      select: ADMIN_PAYMENT_LIST_SELECT,
    });
    // Build a delivery snapshot lookup keyed by payment ID (rows may be reordered by sort)
    const deliveryByPaymentId = new Map<string, SignupLinkDeliverySnapshot | null>(
      rows.map((row) => [
        row.id,
        this.extractSignupLinkDeliverySnapshot(this.asRecord(row.metadata)),
      ])
    );

    const items = this.sortAdminPaymentItems(
      rows.map((row) => this.serializeAdminPaymentListItem(row)),
      "createdAt",
      "asc"
    ).map((item) => ({
      ...item,
      provider: PaymentProvider.BANK_TRANSFER,
      status: PaymentStatus.AWAITING_APPROVAL,
      slaSnapshot: this.buildPendingBankTransferSlaSnapshot(item.createdAt),
      signupLinkDelivery: deliveryByPaymentId.get(item.id) ?? null,
    })) as AdminPendingBankTransferItem[];

    return {
      items,
      totalItems: items.length,
      refreshedAt: new Date().toISOString(),
    };
  }

  // ─────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────

  private buildAdminPaymentsWhere(
    query: Pick<AdminPaymentsListQuery, "status" | "provider" | "dateFrom" | "dateTo" | "q">
  ): Prisma.PaymentWhereInput {
    const where: Prisma.PaymentWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.provider) {
      where.provider = query.provider;
    }

    if (query.dateFrom || query.dateTo) {
      where.createdAt = {
        ...(query.dateFrom ? { gte: this.parseDateOnlyStart(query.dateFrom) } : {}),
        ...(query.dateTo ? { lt: this.parseDateOnlyExclusiveEnd(query.dateTo) } : {}),
      };
    }

    const normalizedQuery = query.q?.trim();
    if (normalizedQuery) {
      where.OR = [
        { id: { contains: normalizedQuery, mode: "insensitive" } },
        { providerRef: { contains: normalizedQuery, mode: "insensitive" } },
        { payerName: { contains: normalizedQuery, mode: "insensitive" } },
        { payerEmail: { contains: normalizedQuery, mode: "insensitive" } },
        { payerPhone: { contains: normalizedQuery, mode: "insensitive" } },
        {
          order: {
            is: {
              orderNumber: {
                contains: normalizedQuery,
                mode: "insensitive",
              },
            },
          },
        },
        {
          order: {
            is: {
              user: {
                is: {
                  OR: [
                    { email: { contains: normalizedQuery, mode: "insensitive" } },
                    { firstName: { contains: normalizedQuery, mode: "insensitive" } },
                    { lastName: { contains: normalizedQuery, mode: "insensitive" } },
                  ],
                },
              },
            },
          },
        },
        {
          user: {
            is: {
              OR: [
                { email: { contains: normalizedQuery, mode: "insensitive" } },
                { firstName: { contains: normalizedQuery, mode: "insensitive" } },
                { lastName: { contains: normalizedQuery, mode: "insensitive" } },
              ],
            },
          },
        },
      ];
    }

    return where;
  }

  private serializeAdminPaymentListItem(row: AdminPaymentListRow): AdminPaymentsListItem {
    const linkedUser = row.user ?? row.order?.user ?? null;
    const checkout = this.extractCheckoutMetadata(this.asRecord(row.metadata));
    const fallbackName = [linkedUser?.firstName, linkedUser?.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();
    const customerName =
      fallbackName || row.payerName?.trim() || checkout?.fullName?.trim() || null;
    const customerEmail = linkedUser?.email?.trim() || row.payerEmail?.trim() || null;
    const customerPhone =
      linkedUser?.phoneNumber?.trim() || row.payerPhone?.trim() || checkout?.phone?.trim() || null;
    const preferredLanguage = linkedUser?.preferredLanguage?.trim() || checkout?.locale || null;
    const orderReference = row.order?.orderNumber?.trim() || row.providerRef?.trim() || row.id;

    return {
      id: row.id,
      orderReference,
      orderNumber: row.order?.orderNumber ?? null,
      orderId: row.orderId,
      userId: row.userId,
      customer: {
        fullName: customerName,
        email: customerEmail,
        phoneNumber: customerPhone,
        preferredLanguage,
      },
      provider: row.provider,
      type: row.type,
      status: row.status,
      amount: this.toCurrency(row.amount),
      currency: row.currency,
      providerRef: row.providerRef ?? null,
      receiptUrl: row.receiptUrl ?? null,
      payerName: row.payerName?.trim() || null,
      payerEmail: row.payerEmail?.trim() || null,
      payerPhone: row.payerPhone?.trim() || null,
      adminNote: row.adminNote ?? null,
      hasAdminNote: Boolean(row.adminNote?.trim()),
      approvedAt: row.approvedAt?.toISOString() ?? null,
      approvedBy: row.approvedBy ?? null,
      processedAt: row.processedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      pendingCheckout: this.buildAdminPendingCheckoutSnapshot(row),
      refundability: this.buildAdminPaymentRefundability(row),
    };
  }

  private buildAdminPaymentRefundability(row: AdminPaymentListRow): AdminPaymentRefundability {
    const order = row.order;
    const processingMode = this.resolveAdminRefundProcessingMode(row.provider);
    const orderVersion = order?.version ?? null;
    const bookVersion = order?.book?.version ?? null;

    if (!order) {
      return {
        isRefundable: false,
        processingMode,
        reason: "This payment is not linked to an order.",
        policySnapshot: null,
        orderVersion,
        bookVersion,
      };
    }

    const policySnapshot = buildRefundPolicySnapshot({
      orderTotalAmount: this.toCurrency(order.totalAmount),
      orderStatus: order.status,
      book: order.book
        ? {
            status: order.book.status,
            productionStatus: order.book.productionStatus,
          }
        : null,
    });

    if (row.type === PaymentType.REFUND) {
      return {
        isRefundable: false,
        processingMode,
        reason: "Refund payments cannot be refunded again.",
        policySnapshot,
        orderVersion,
        bookVersion,
      };
    }

    if (row.provider === PaymentProvider.PAYPAL) {
      return {
        isRefundable: false,
        processingMode,
        reason: "PayPal refunds are not supported by the admin refund workflow yet.",
        policySnapshot,
        orderVersion,
        bookVersion,
      };
    }

    if (row.status !== PaymentStatus.SUCCESS) {
      return {
        isRefundable: false,
        processingMode,
        reason: "Only successful payments can be refunded.",
        policySnapshot,
        orderVersion,
        bookVersion,
      };
    }

    if (order.status === OrderStatus.REFUNDED || order.refundedAt) {
      return {
        isRefundable: false,
        processingMode,
        reason: "This order has already been refunded.",
        policySnapshot,
        orderVersion,
        bookVersion,
      };
    }

    if (!policySnapshot.eligible) {
      return {
        isRefundable: false,
        processingMode,
        reason: policySnapshot.policyMessage,
        policySnapshot,
        orderVersion,
        bookVersion,
      };
    }

    return {
      isRefundable: true,
      processingMode,
      reason: null,
      policySnapshot,
      orderVersion,
      bookVersion,
    };
  }

  private sortAdminPaymentItems(
    items: AdminPaymentsListItem[],
    sortBy: AdminPaymentSortField,
    sortDirection: "asc" | "desc"
  ): AdminPaymentsListItem[] {
    const direction = sortDirection === "asc" ? 1 : -1;
    const sorted = [...items];

    sorted.sort((left, right) => {
      const primary = this.compareAdminPaymentValues(
        this.getAdminPaymentSortValue(left, sortBy),
        this.getAdminPaymentSortValue(right, sortBy)
      );
      if (primary !== 0) return primary * direction;

      const createdAtComparison = this.compareAdminPaymentValues(
        Date.parse(left.createdAt),
        Date.parse(right.createdAt)
      );
      if (createdAtComparison !== 0) return createdAtComparison * direction;

      return this.compareAdminPaymentValues(left.id, right.id) * direction;
    });

    return sorted;
  }

  private getAdminPaymentSortValue(
    item: AdminPaymentsListItem,
    sortBy: AdminPaymentSortField
  ): number | string {
    switch (sortBy) {
      case "orderReference":
        return item.orderReference.toLowerCase();
      case "customerName":
        return (item.customer.fullName ?? item.payerName ?? "").toLowerCase();
      case "customerEmail":
        return (item.customer.email ?? item.payerEmail ?? "").toLowerCase();
      case "amount":
        return item.amount;
      case "provider":
        return item.provider;
      case "status":
        return item.status;
      default:
        return Date.parse(item.createdAt);
    }
  }

  private compareAdminPaymentValues(left: number | string, right: number | string): number {
    if (typeof left === "number" && typeof right === "number") {
      return left === right ? 0 : left > right ? 1 : -1;
    }
    return String(left).localeCompare(String(right), undefined, {
      sensitivity: "base",
      numeric: true,
    });
  }

  private buildPendingBankTransferSlaSnapshot(
    createdAtIso: string
  ): AdminPendingBankTransferItem["slaSnapshot"] {
    const ageMinutes = Math.max(0, Math.floor((Date.now() - Date.parse(createdAtIso)) / 60_000));
    return {
      ageMinutes,
      state: ageMinutes < 15 ? "green" : ageMinutes < 30 ? "yellow" : "red",
    };
  }

  private buildAdminPendingCheckoutSnapshot(
    row: AdminPaymentListRow
  ): AdminPendingCheckoutSnapshot | null {
    if (row.type !== PaymentType.INITIAL || row.status !== PaymentStatus.PENDING) {
      return null;
    }

    if (row.processedAt || row.orderId) {
      return null;
    }

    const checkout = this.extractCheckoutMetadata(this.asRecord(row.metadata));
    if ((checkout?.paymentFlow ?? "").toUpperCase() !== "CHECKOUT") {
      return null;
    }

    const ageMinutes = Math.max(0, Math.floor((Date.now() - row.createdAt.getTime()) / 60_000));

    return {
      ageMinutes,
      staleAfterMinutes: STALE_PENDING_CHECKOUT_MINUTES,
      isStale: ageMinutes >= STALE_PENDING_CHECKOUT_MINUTES,
    };
  }

  private resolveAdminRefundProcessingMode(
    provider: PaymentProvider
  ): AdminPaymentRefundability["processingMode"] {
    return provider === PaymentProvider.BANK_TRANSFER ? "manual" : "gateway";
  }

  private parseDateOnlyStart(value: string): Date {
    return new Date(`${value}T00:00:00.000Z`);
  }

  private parseDateOnlyExclusiveEnd(value: string): Date {
    const start = this.parseDateOnlyStart(value);
    return new Date(start.getTime() + 24 * 60 * 60 * 1000);
  }

  // ─────────────────────────────────────────────
  // Utility helpers (inline — no shared utils dep)
  // ─────────────────────────────────────────────

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  }

  private asString(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  private asNumber(value: unknown): number | undefined {
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

  private toCurrency(value: unknown): number {
    const amount = this.asNumber(value) ?? 0;
    if (!Number.isFinite(amount)) return 0;
    return Number(Math.max(0, amount).toFixed(2));
  }

  private parseJsonRecord(value?: string): Record<string, unknown> | null {
    if (!value) return null;
    try {
      const parsed = JSON.parse(value);
      return this.asRecord(parsed);
    } catch {
      return null;
    }
  }

  private parseJsonArray(value?: string): unknown[] | null {
    if (!value) return null;
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private resolveLocale(value: unknown): string {
    const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (normalized === "fr" || normalized === "es") return normalized;
    return "en";
  }

  /**
   * Extract the checkout metadata from a payment's raw metadata blob.
   * Mirrors the PaymentsService.extractCheckoutMetadata logic.
   */
  private extractCheckoutMetadata(
    metadata: Record<string, unknown> | null
  ): CheckoutMetadataSlice | null {
    if (!metadata || typeof metadata !== "object") return null;

    const merged: Record<string, unknown> = { ...metadata };
    const checkoutState = this.asString(metadata.checkout_state);
    if (checkoutState) {
      const parsed = this.parseJsonRecord(checkoutState);
      if (parsed) Object.assign(merged, parsed);
    }

    const addonsRaw = Array.isArray(merged.addons)
      ? merged.addons
      : this.parseJsonArray(this.asString(merged.addons));

    const addons = (addonsRaw ?? [])
      .map((value) => this.asRecord(value))
      .filter((value): value is Record<string, unknown> => Boolean(value))
      .map((addon) => ({
        id: this.asString(addon.id),
        slug: this.asString(addon.slug),
        name: this.asString(addon.name),
        price: this.asNumber(addon.price),
      }));

    return {
      locale: this.resolveLocale(this.asString(merged.locale)),
      fullName: this.asString(merged.fullName),
      phone: this.asString(merged.phone),
      paymentFlow: this.asString(merged.paymentFlow),
      source: this.asString(merged.source),
      ...(addons.length > 0 ? { addons } : {}),
    };
  }

  /**
   * Extract the signup link delivery snapshot from a payment's metadata blob.
   * This snapshot is written by PaymentsService.attemptSignupLinkDelivery().
   */
  private extractSignupLinkDeliverySnapshot(
    metadata: Record<string, unknown> | null
  ): SignupLinkDeliverySnapshot | null {
    const raw = this.asRecord(metadata?.signupLinkDelivery);
    if (!raw) return null;

    const status = this.asString(raw.status);
    if (status !== "DELIVERED" && status !== "PARTIAL" && status !== "FAILED") return null;

    return {
      status,
      emailDelivered: raw.emailDelivered === true,
      whatsappDelivered: raw.whatsappDelivered === true,
      emailFailureReason: this.asString(raw.emailFailureReason) ?? null,
      whatsappFailureReason: this.asString(raw.whatsappFailureReason) ?? null,
      attemptCount: this.asNumber(raw.attemptCount) ?? 0,
      lastAttemptAt: this.asString(raw.lastAttemptAt) ?? null,
      lastSuccessfulAt: this.asString(raw.lastSuccessfulAt) ?? null,
      lastAttemptSource: this.asString(raw.lastAttemptSource) ?? null,
    };
  }
}
