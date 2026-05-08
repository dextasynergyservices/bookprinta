import { DEFAULT_CURRENCY } from "@bookprinta/shared";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "../../generated/prisma/client.js";
import { OrderStatus, PaymentStatus, PaymentType } from "../../generated/prisma/enums.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { RolloutService } from "../../rollout/rollout.service.js";
import { GatewayService } from "./gateway.service.js";

// ──────────────────────────────────────────────
// ExtraPagesPaymentService
//
// Owns extra-pages payment initiation (billing gate),
// post-payment billing gate reconciliation, and
// extra-pages WhatsApp confirmation notifications.
// Extracted from the PaymentsService monolith.
// ──────────────────────────────────────────────

const EXTRA_PAGE_PRICE_NGN = 10;

@Injectable()
export class ExtraPagesPaymentService {
  private readonly frontendBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly gatewayService: GatewayService,
    private readonly rollout: RolloutService
  ) {
    const raw = process.env.FRONTEND_URL?.trim();
    this.frontendBaseUrl = raw ? raw.replace(/\/+$/, "") : "http://localhost:3000";
  }

  /**
   * Initiate an extra-pages payment for a book whose page count exceeds the
   * package limit (the billing gate).
   */
  async payExtraPages(params: {
    bookId: string;
    provider: string;
    extraPages: number;
    callbackUrl?: string;
    userId: string;
  }) {
    const provider = params.provider.toUpperCase() as Parameters<
      typeof this.gatewayService.ensureGatewayEnabled
    >[0];

    await this.gatewayService.ensureGatewayEnabled(provider);
    this.gatewayService.ensureProviderAvailable(provider);

    // Use authoritative gate values from Book.pageCount + Package.pageLimit.
    const book = await this.prisma.book.findUnique({
      where: { id: params.bookId },
      select: {
        id: true,
        userId: true,
        orderId: true,
        pageCount: true,
        order: {
          select: {
            id: true,
            package: {
              select: {
                pageLimit: true,
              },
            },
          },
        },
        user: {
          select: { email: true },
        },
      },
    });

    if (!book) {
      throw new NotFoundException(`Book "${params.bookId}" not found`);
    }

    if (book.userId !== params.userId) {
      throw new BadRequestException("You can only pay for your own books");
    }

    this.rollout.assertBillingGateAccess(book);

    if (typeof book.pageCount !== "number") {
      throw new BadRequestException(
        "Authoritative page count is not ready yet. Please try again shortly."
      );
    }

    const overagePages = Math.max(0, book.pageCount - book.order.package.pageLimit);
    if (overagePages <= 0) {
      throw new BadRequestException("No extra pages payment is required for this manuscript.");
    }

    if (params.extraPages !== overagePages) {
      throw new BadRequestException(
        `Extra pages mismatch. Current overage is ${overagePages}. Please refresh and try again.`
      );
    }

    const amount = overagePages * EXTRA_PAGE_PRICE_NGN;

    await this.prisma.order.update({
      where: { id: book.orderId },
      data: {
        status: OrderStatus.PENDING_EXTRA_PAYMENT,
        extraAmount: amount,
      },
    });

    const reference = this.generateReference("ep");

    const payment = await this.prisma.payment.create({
      data: {
        provider,
        type: PaymentType.EXTRA_PAGES,
        amount,
        currency: DEFAULT_CURRENCY,
        status: PaymentStatus.PENDING,
        providerRef: reference,
        orderId: book.orderId,
        userId: params.userId,
        metadata: {
          bookId: params.bookId,
          extraPages: overagePages,
          costPerPage: EXTRA_PAGE_PRICE_NGN,
          pageCount: book.pageCount,
          pageLimit: book.order.package.pageLimit,
          requiredAmount: amount,
        },
      } as Prisma.PaymentUncheckedCreateInput,
    });

    return this.gatewayService.delegateInitialize(provider, {
      email: book.user.email,
      amount,
      reference,
      callbackUrl: params.callbackUrl,
      paymentId: payment.id,
      orderId: book.orderId,
    });
  }

  /**
   * Reconcile the extra-pages billing gate after a successful payment webhook.
   * Updates the order status to PREVIEW_READY or PENDING_EXTRA_PAYMENT based
   * on whether the required amount is fully covered.
   * Called from PaymentsService.createPaymentFromWebhook.
   */
  async reconcileExtraPagesBillingGate(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        package: {
          select: {
            pageLimit: true,
          },
        },
        book: {
          select: {
            pageCount: true,
          },
        },
        payments: {
          where: {
            type: PaymentType.EXTRA_PAGES,
            status: PaymentStatus.SUCCESS,
          },
          select: {
            amount: true,
          },
        },
      },
    });

    if (!order || !order.book || typeof order.book.pageCount !== "number") {
      return;
    }

    if (
      order.status === OrderStatus.APPROVED ||
      order.status === OrderStatus.IN_PRODUCTION ||
      order.status === OrderStatus.COMPLETED ||
      order.status === OrderStatus.CANCELLED ||
      order.status === OrderStatus.REFUNDED
    ) {
      return;
    }

    const overagePages = Math.max(0, order.book.pageCount - order.package.pageLimit);
    const requiredAmount = overagePages * EXTRA_PAGE_PRICE_NGN;
    const paidAmount = order.payments.reduce((sum, payment) => {
      return sum + this.toCurrency(payment.amount);
    }, 0);

    await this.prisma.order.update({
      where: { id: order.id },
      data: {
        status:
          requiredAmount > 0 && paidAmount < requiredAmount
            ? OrderStatus.PENDING_EXTRA_PAYMENT
            : OrderStatus.PREVIEW_READY,
        extraAmount: requiredAmount,
      },
    });
  }

  /**
   * Send the extra-pages payment confirmation via WhatsApp.
   * Called from PaymentsService.createPaymentFromWebhook after reconciliation.
   */
  async sendExtraPagesPaymentConfirmationWhatsApp(
    orderId: string,
    whatsappNotificationsService: {
      sendPaymentConfirmation: (params: {
        recipient: {
          userName: string;
          phoneNumber: string | null;
          preferredLanguage: string | null;
          whatsAppNotificationsEnabled: boolean;
        };
        orderNumber: string;
        amountLabel: string;
        packageName: string;
        addons?: string[];
        dashboardUrl?: string | null;
        variant?: "standard" | "quote" | "reprint" | "extra_pages" | "bank_transfer";
      }) => Promise<unknown>;
    } | null
  ): Promise<void> {
    if (!whatsappNotificationsService) return;
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        totalAmount: true,
        package: {
          select: {
            name: true,
          },
        },
        payments: {
          where: {
            type: PaymentType.EXTRA_PAGES,
            status: PaymentStatus.SUCCESS,
          },
          orderBy: [{ processedAt: "desc" }, { createdAt: "desc" }],
          take: 1,
          select: {
            amount: true,
          },
        },
        user: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
            phoneNumber: true,
            preferredLanguage: true,
            whatsAppNotificationsEnabled: true,
          },
        },
      },
    });

    if (!order || !order.user) return;

    const locale = this.resolveLocale(order.user.preferredLanguage);
    const dashboardUrl = this.buildLocalizedDashboardUrl(locale);
    const userName = this.pickDisplayName(
      [order.user.firstName, order.user.lastName].filter(Boolean).join(" ") || undefined,
      order.user.email
    );

    await whatsappNotificationsService.sendPaymentConfirmation({
      recipient: {
        userName,
        phoneNumber: order.user.phoneNumber ?? null,
        preferredLanguage: order.user.preferredLanguage,
        whatsAppNotificationsEnabled: order.user.whatsAppNotificationsEnabled,
      },
      orderNumber: order.orderNumber,
      amountLabel: this.formatNaira(
        this.toCurrency(order.payments[0]?.amount ?? order.totalAmount)
      ),
      packageName: order.package.name,
      addons: [],
      dashboardUrl,
      variant: "extra_pages",
    });
  }

  // ─────────────────────────────────────────────
  // Utility helpers (inline — no shared utils dep)
  // ─────────────────────────────────────────────

  private generateReference(prefix = "bp"): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `${prefix}_${timestamp}_${random}`;
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

  private resolveLocale(value: unknown): "en" | "fr" | "es" {
    const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (normalized === "fr" || normalized === "es") return normalized;
    return "en";
  }

  private buildLocalizedDashboardUrl(locale: string): string {
    return `${this.frontendBaseUrl}/${locale}/dashboard`;
  }

  private pickDisplayName(fullName: string | undefined, email: string): string {
    if (fullName?.trim()) return fullName.trim();
    return email.split("@")[0] || "Author";
  }
}
