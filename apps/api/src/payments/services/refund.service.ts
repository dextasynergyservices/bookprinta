import type { Locale } from "@bookprinta/emails";
import { renderRefundConfirmEmail } from "@bookprinta/emails/render";
import type {
  AdminRefundRequestInput,
  AdminRefundResponse,
  RefundPolicySnapshot,
} from "@bookprinta/shared";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Resend } from "resend";
import type { Prisma } from "../../generated/prisma/client.js";
import {
  BookStatus,
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
  PaymentType,
} from "../../generated/prisma/enums.js";
import { isUserNotificationChannelEnabled } from "../../notifications/notification-preference-policy.js";
import { NotificationsService } from "../../notifications/notifications.service.js";
import { WhatsappNotificationsService } from "../../notifications/whatsapp-notifications.service.js";
import { buildRefundPolicySnapshot } from "../../orders/admin-order-workflow.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { PaystackService } from "./paystack.service.js";
import { StripeService } from "./stripe.service.js";

// ──────────────────────────────────────────────
// RefundService
//
// Owns admin-initiated refund processing: policy validation,
// provider refund dispatch, DB updates, and confirmation notifications.
// Extracted from the PaymentsService monolith.
// ──────────────────────────────────────────────

@Injectable()
export class RefundService {
  private readonly logger = new Logger(RefundService.name);
  private readonly resend: Resend | null;
  private readonly frontendBaseUrl: string;
  private readonly customerPaymentsFromEmail: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly paystackService: PaystackService,
    private readonly stripeService: StripeService,
    private readonly notificationsService: NotificationsService,
    private readonly whatsappNotificationsService: WhatsappNotificationsService
  ) {
    this.resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
    const raw = process.env.FRONTEND_URL?.trim();
    this.frontendBaseUrl = raw ? raw.replace(/\/+$/, "") : "http://localhost:3000";
    this.customerPaymentsFromEmail = this.resolveCustomerFacingFromEmail();
  }

  async refundAdminPayment(params: {
    paymentId: string;
    adminId: string;
    input: AdminRefundRequestInput;
  }): Promise<AdminRefundResponse> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: params.paymentId },
      select: {
        id: true,
        orderId: true,
        userId: true,
        provider: true,
        type: true,
        amount: true,
        currency: true,
        status: true,
        providerRef: true,
        payerName: true,
        payerEmail: true,
        payerPhone: true,
        adminNote: true,
        gatewayResponse: true,
        order: {
          select: {
            id: true,
            orderNumber: true,
            userId: true,
            status: true,
            version: true,
            totalAmount: true,
            currency: true,
            refundedAt: true,
            refundAmount: true,
            user: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
                phoneNumber: true,
                preferredLanguage: true,
                emailNotificationsEnabled: true,
                whatsAppNotificationsEnabled: true,
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
      },
    });

    if (!payment) {
      throw new NotFoundException("Payment not found");
    }

    if (!payment.order) {
      throw new BadRequestException("This payment is not linked to an order.");
    }
    const order = payment.order;
    const orderBook = order.book;

    if (payment.type === PaymentType.REFUND) {
      throw new BadRequestException("Refund payments cannot be refunded again.");
    }

    if (payment.status !== PaymentStatus.SUCCESS) {
      throw new BadRequestException("Only successful payments can be refunded.");
    }

    if (order.status === OrderStatus.REFUNDED || order.refundedAt) {
      throw new BadRequestException("This order has already been refunded.");
    }

    if (order.version !== params.input.expectedOrderVersion) {
      throw new ConflictException("Order was updated by another admin. Refresh and try again.");
    }

    if (
      orderBook &&
      params.input.expectedBookVersion !== undefined &&
      orderBook.version !== params.input.expectedBookVersion
    ) {
      throw new ConflictException("Book was updated by another admin. Refresh and try again.");
    }

    const policySnapshot = buildRefundPolicySnapshot({
      orderTotalAmount: this.toCurrency(order.totalAmount),
      orderStatus: order.status,
      book: orderBook
        ? {
            status: orderBook.status,
            productionStatus: orderBook.productionStatus,
          }
        : null,
    });

    this.assertRefundPolicySnapshotMatches(params.input.policySnapshot, policySnapshot);

    if (!policySnapshot.eligible) {
      throw new BadRequestException(policySnapshot.policyMessage);
    }

    const originalPaymentAmount = this.toCurrency(payment.amount);
    const refundedAmount = this.resolveAdminRefundAmount({
      input: params.input,
      paymentAmount: originalPaymentAmount,
      policySnapshot,
    });
    const normalizedReason = params.input.reason.trim();
    const normalizedNote = params.input.note?.trim() || null;
    const refundedAt = new Date();

    const providerDispatch = await this.dispatchAdminRefund({
      provider: payment.provider,
      providerRef: payment.providerRef,
      gatewayResponse: this.asRecord(payment.gatewayResponse),
      amount: refundedAmount,
    });

    const { refundPayment, updatedOrder, updatedBook, audit } = await this.prisma.$transaction(
      async (tx) => {
        const orderUpdated = await tx.order.updateMany({
          where: {
            id: order.id,
            version: params.input.expectedOrderVersion,
            refundedAt: null,
          },
          data: {
            status: OrderStatus.REFUNDED,
            refundAmount: refundedAmount,
            refundReason: normalizedReason,
            refundedAt,
            refundedBy: params.adminId,
            version: {
              increment: 1,
            },
          },
        });

        if (orderUpdated.count === 0) {
          throw new ConflictException("Order was updated by another admin. Refresh and try again.");
        }

        let updatedBook: {
          id: string;
          status: BookStatus;
          version: number;
        } | null = null;

        if (orderBook) {
          const expectedBookVersion = params.input.expectedBookVersion ?? orderBook.version;
          const bookUpdated = await tx.book.updateMany({
            where: {
              id: orderBook.id,
              version: expectedBookVersion,
            },
            data: {
              status: BookStatus.CANCELLED,
              productionStatus: BookStatus.CANCELLED,
              productionStatusUpdatedAt: refundedAt,
              version: {
                increment: 1,
              },
            },
          });

          if (bookUpdated.count === 0) {
            throw new ConflictException(
              "Book was updated by another admin. Refresh and try again."
            );
          }

          updatedBook = await tx.book.findUnique({
            where: { id: orderBook.id },
            select: {
              id: true,
              status: true,
              version: true,
            },
          });
        }

        if (refundedAmount >= originalPaymentAmount) {
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: PaymentStatus.REFUNDED,
              adminNote: normalizedNote ?? payment.adminNote ?? null,
            },
          });
        } else if (normalizedNote && normalizedNote !== payment.adminNote) {
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              adminNote: normalizedNote,
            },
          });
        }

        const refundPayment = await tx.payment.create({
          data: {
            orderId: order.id,
            userId: payment.userId ?? order.userId,
            provider: payment.provider,
            type: PaymentType.REFUND,
            amount: -refundedAmount,
            currency: payment.currency,
            status: PaymentStatus.REFUNDED,
            providerRef: providerDispatch.providerRefundReference ?? undefined,
            processedAt: refundedAt,
            payerName: payment.payerName ?? null,
            payerEmail: payment.payerEmail ?? order.user.email,
            payerPhone: payment.payerPhone ?? null,
            adminNote: normalizedNote,
            approvedAt: refundedAt,
            approvedBy: params.adminId,
            metadata: {
              originalPaymentId: payment.id,
              refundType: params.input.type,
              policySnapshot,
            },
            gatewayResponse: providerDispatch.response ?? undefined,
          } as Prisma.PaymentUncheckedCreateInput,
        });

        const updatedOrder = await tx.order.findUnique({
          where: { id: order.id },
          select: {
            id: true,
            status: true,
            version: true,
          },
        });

        if (!updatedOrder) {
          throw new NotFoundException(`Order "${order.id}" not found`);
        }

        const audit = await tx.auditLog.create({
          data: {
            userId: params.adminId,
            action: "ADMIN_ORDER_REFUND_PROCESSED",
            entityType: "ORDER",
            entityId: order.id,
            details: {
              paymentId: payment.id,
              refundPaymentId: refundPayment.id,
              refundType: params.input.type,
              refundedAmount,
              provider: payment.provider,
              processingMode: providerDispatch.processingMode,
              providerRefundReference: providerDispatch.providerRefundReference,
              reason: normalizedReason,
              note: normalizedNote,
              policySnapshot,
            },
          },
        });

        await tx.auditLog.create({
          data: {
            userId: params.adminId,
            action: "ORDER_STATUS_REACHED",
            entityType: "ORDER_TRACKING",
            entityId: order.id,
            details: {
              source: "order",
              status: OrderStatus.REFUNDED,
              reachedAt: refundedAt.toISOString(),
              label: "Refunded",
            },
          },
        });

        await this.notificationsService.createOrderStatusNotification(
          {
            userId: order.userId,
            orderId: order.id,
            orderNumber: order.orderNumber,
            status: OrderStatus.REFUNDED,
            source: "order",
            bookId: orderBook?.id,
          },
          tx
        );

        return {
          refundPayment,
          updatedOrder,
          updatedBook,
          audit,
        };
      }
    );

    const emailSent = await this.sendRefundConfirmationEmail({
      email: order.user.email,
      userName: this.pickDisplayName(
        [order.user.firstName, order.user.lastName].filter(Boolean).join(" ") || undefined,
        order.user.email
      ),
      locale: this.resolveLocale(order.user.preferredLanguage),
      orderNumber: order.orderNumber,
      originalAmount: originalPaymentAmount,
      refundedAmount,
      refundReason: normalizedReason,
      emailNotificationsEnabled: order.user.emailNotificationsEnabled,
    });

    await this.sendRefundConfirmationWhatsApp({
      userName: this.pickDisplayName(
        [order.user.firstName, order.user.lastName].filter(Boolean).join(" ") || undefined,
        order.user.email
      ),
      phoneNumber: payment.payerPhone ?? order.user.phoneNumber ?? null,
      preferredLanguage: order.user.preferredLanguage,
      whatsAppNotificationsEnabled: order.user.whatsAppNotificationsEnabled,
      orderNumber: order.orderNumber,
      originalAmount: this.formatNaira(originalPaymentAmount),
      refundAmount: this.formatNaira(refundedAmount),
      refundReason: normalizedReason,
      dashboardUrl: this.buildLocalizedDashboardUrl(
        this.resolveLocale(order.user.preferredLanguage)
      ),
    });

    return {
      orderId: order.id,
      paymentId: payment.id,
      refundPaymentId: refundPayment.id,
      provider: payment.provider,
      processingMode: providerDispatch.processingMode,
      refundType: params.input.type,
      refundedAmount,
      currency: payment.currency,
      paymentStatus: refundPayment.status,
      providerRefundReference: providerDispatch.providerRefundReference,
      orderStatus: updatedOrder.status,
      bookStatus: updatedBook?.status ?? null,
      refundedAt: refundedAt.toISOString(),
      refundReason: normalizedReason,
      orderVersion: updatedOrder.version,
      bookVersion: updatedBook?.version ?? null,
      emailSent,
      policySnapshot,
      audit: this.serializeAdminAuditEntry(audit, params.adminId),
    };
  }

  // ─────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────

  private assertRefundPolicySnapshotMatches(
    clientSnapshot: RefundPolicySnapshot,
    serverSnapshot: RefundPolicySnapshot
  ): void {
    const sameAllowedTypes =
      clientSnapshot.allowedRefundTypes.length === serverSnapshot.allowedRefundTypes.length &&
      clientSnapshot.allowedRefundTypes.every(
        (value, index) => value === serverSnapshot.allowedRefundTypes[index]
      );

    const matches =
      clientSnapshot.stage === serverSnapshot.stage &&
      clientSnapshot.statusSource === serverSnapshot.statusSource &&
      clientSnapshot.policyDecision === serverSnapshot.policyDecision &&
      clientSnapshot.eligible === serverSnapshot.eligible &&
      sameAllowedTypes &&
      this.toCurrency(clientSnapshot.orderTotalAmount) ===
        this.toCurrency(serverSnapshot.orderTotalAmount) &&
      this.toCurrency(clientSnapshot.recommendedAmount) ===
        this.toCurrency(serverSnapshot.recommendedAmount) &&
      this.toCurrency(clientSnapshot.maxRefundAmount) ===
        this.toCurrency(serverSnapshot.maxRefundAmount) &&
      this.toCurrency(clientSnapshot.policyPercent) ===
        this.toCurrency(serverSnapshot.policyPercent);

    if (!matches) {
      throw new ConflictException(
        "Refund policy changed. Refresh the order and review the latest policy."
      );
    }
  }

  private resolveAdminRefundAmount(params: {
    input: AdminRefundRequestInput;
    paymentAmount: number;
    policySnapshot: RefundPolicySnapshot;
  }): number {
    if (!params.policySnapshot.allowedRefundTypes.includes(params.input.type)) {
      throw new BadRequestException(
        "Selected refund type is not allowed for the current order stage."
      );
    }

    const maxRefundAmount = this.toCurrency(
      Math.min(params.policySnapshot.maxRefundAmount, params.paymentAmount)
    );

    let resolvedAmount = 0;
    switch (params.input.type) {
      case "FULL":
        resolvedAmount = maxRefundAmount;
        break;
      case "PARTIAL":
        resolvedAmount = this.toCurrency(
          Math.min(params.policySnapshot.recommendedAmount, maxRefundAmount)
        );
        break;
      case "CUSTOM":
        resolvedAmount = this.toCurrency(params.input.customAmount ?? 0);
        if (resolvedAmount > maxRefundAmount) {
          throw new BadRequestException(
            `Custom refund amount cannot exceed ${this.formatNaira(maxRefundAmount)} for this payment.`
          );
        }
        break;
      default:
        throw new BadRequestException("Unsupported refund type.");
    }

    if (resolvedAmount <= 0) {
      throw new BadRequestException("Refund amount must be greater than zero.");
    }

    return resolvedAmount;
  }

  private async dispatchAdminRefund(params: {
    provider: PaymentProvider;
    providerRef: string | null;
    gatewayResponse: Record<string, unknown> | null;
    amount: number;
  }): Promise<{
    processingMode: "gateway" | "manual";
    providerRefundReference: string | null;
    response: Prisma.InputJsonValue | undefined;
  }> {
    switch (params.provider) {
      case PaymentProvider.PAYSTACK: {
        if (!params.providerRef) {
          throw new BadRequestException("Paystack payment reference is missing for this refund.");
        }
        const response = await this.paystackService.refund(params.providerRef, params.amount);
        return {
          processingMode: "gateway",
          providerRefundReference: this.extractRefundReference(response),
          response: response as Prisma.InputJsonValue,
        };
      }

      case PaymentProvider.STRIPE: {
        const stripeReference =
          this.asString(params.gatewayResponse?.payment_intent) ?? params.providerRef;
        if (!stripeReference) {
          throw new BadRequestException("Stripe payment reference is missing for this refund.");
        }
        const response = await this.stripeService.refund(stripeReference, params.amount);
        return {
          processingMode: "gateway",
          providerRefundReference: this.extractRefundReference(response),
          response: response as Prisma.InputJsonValue,
        };
      }

      case PaymentProvider.BANK_TRANSFER:
        return {
          processingMode: "manual",
          providerRefundReference: null,
          response: undefined,
        };

      case PaymentProvider.PAYPAL:
        throw new BadRequestException(
          "PayPal refunds are not supported by the admin refund workflow yet."
        );

      default:
        throw new BadRequestException(`Unsupported refund provider: ${params.provider}`);
    }
  }

  private async sendRefundConfirmationEmail(params: {
    email: string;
    userName: string;
    locale: Locale;
    orderNumber: string;
    originalAmount: number;
    refundedAmount: number;
    refundReason: string;
    emailNotificationsEnabled?: boolean | null;
  }): Promise<boolean> {
    if (
      !isUserNotificationChannelEnabled({
        enabled: params.emailNotificationsEnabled,
        kind: "refund_confirmation",
      })
    ) {
      return false;
    }

    if (!this.resend) {
      this.logger.warn("RESEND_API_KEY not set — refund confirmation email skipped");
      return false;
    }

    const email = await renderRefundConfirmEmail({
      locale: params.locale,
      userName: params.userName,
      orderNumber: params.orderNumber,
      originalAmount: this.formatNaira(params.originalAmount),
      refundAmount: this.formatNaira(params.refundedAmount),
      refundReason: params.refundReason,
    });

    const sendResult = await this.resend.emails.send({
      from: this.customerPaymentsFromEmail,
      to: params.email,
      subject: email.subject,
      html: email.html,
    });

    if (sendResult.error) {
      this.logger.error(
        `Failed to send refund confirmation email: ${sendResult.error.name} — ${sendResult.error.message}`
      );
      return false;
    }

    return true;
  }

  private async sendRefundConfirmationWhatsApp(params: {
    userName: string;
    phoneNumber?: string | null;
    preferredLanguage?: string | null;
    whatsAppNotificationsEnabled?: boolean;
    orderNumber: string;
    originalAmount: string;
    refundAmount: string;
    refundReason: string;
    dashboardUrl?: string | null;
  }): Promise<void> {
    await this.whatsappNotificationsService.sendRefundConfirmation({
      recipient: {
        userName: params.userName,
        phoneNumber: params.phoneNumber,
        preferredLanguage: params.preferredLanguage,
        whatsAppNotificationsEnabled: params.whatsAppNotificationsEnabled,
      },
      orderNumber: params.orderNumber,
      originalAmountLabel: params.originalAmount,
      refundAmountLabel: params.refundAmount,
      refundReason: params.refundReason,
      dashboardUrl: params.dashboardUrl,
    });
  }

  private extractRefundReference(response: Record<string, unknown>): string | null {
    return (
      this.asString(response.id) ??
      this.asString(response.reference) ??
      this.asString(response.refund_reference) ??
      this.asString(response.transaction_reference) ??
      null
    );
  }

  private serializeAdminAuditEntry(
    row: Pick<
      Prisma.AuditLogGetPayload<object>,
      "id" | "action" | "entityType" | "entityId" | "details" | "createdAt"
    >,
    recordedBy: string
  ): AdminRefundResponse["audit"] {
    const details = this.asRecord(row.details);
    return {
      auditId: row.id,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      recordedAt: row.createdAt.toISOString(),
      recordedBy,
      note: this.asString(details?.note) ?? null,
      reason: this.asString(details?.reason) ?? null,
    };
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

  private formatNaira(amount: number): string {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      maximumFractionDigits: 0,
    }).format(this.toCurrency(amount));
  }

  private resolveLocale(value: unknown): Locale {
    const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (normalized === "fr" || normalized === "es") return normalized;
    return "en";
  }

  private buildLocalizedDashboardUrl(locale: Locale): string {
    return `${this.frontendBaseUrl}/${locale}/dashboard`;
  }

  private pickDisplayName(fullName: string | undefined, email: string): string {
    if (fullName?.trim()) return fullName.trim();
    return email.split("@")[0] || "Author";
  }

  private resolveCustomerFacingFromEmail(): string {
    const configured =
      process.env.CONTACT_FROM_EMAIL ||
      process.env.DEFAULT_FROM_EMAIL ||
      process.env.ADMIN_FROM_EMAIL ||
      "BookPrinta <info@bookprinta.com>";
    const normalized = configured.trim();
    return normalized.length > 0 ? normalized : "BookPrinta <info@bookprinta.com>";
  }
}
