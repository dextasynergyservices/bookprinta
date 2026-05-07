import type { Locale } from "@bookprinta/emails";
import {
  renderReprintAdminConfirmEmail,
  renderReprintConfirmEmail,
} from "@bookprinta/emails/render";
import { DEFAULT_CURRENCY } from "@bookprinta/shared";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Resend } from "resend";
import type { Prisma } from "../../generated/prisma/client.js";
import {
  BookStatus,
  OrderStatus,
  OrderType,
  PaymentProvider,
  PaymentStatus,
  PaymentType,
} from "../../generated/prisma/enums.js";
import { NotificationsService } from "../../notifications/notifications.service.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { GatewayService } from "./gateway.service.js";

// ──────────────────────────────────────────────
// ReprintPaymentService
//
// Owns reprint payment initiation, entity creation on webhook/verify,
// and reprint confirmation emails.
// Extracted from the PaymentsService monolith.
// ──────────────────────────────────────────────

const REPRINT_MIN_COPIES = 1;
const DEFAULT_REPRINT_COST_PER_PAGE = 15;
const DEFAULT_REPRINT_COVER_COST = 300;
const REPRINT_COST_PER_PAGE_SETTING_KEY = "reprint_cost_per_page";
const REPRINT_COVER_COST_SETTING_KEY = "reprint_cover_cost";

const REPRINT_ELIGIBLE_BOOK_STATUSES = new Set<BookStatus>([
  BookStatus.DELIVERED,
  BookStatus.COMPLETED,
]);

type ReprintMetadata = {
  sourceBookId: string;
  sourceOrderId: string | null;
  copies: number;
  bookSize: string | null;
  paperColor: string | null;
  lamination: string | null;
  pageCount: number | null;
  finalPdfUrl: string | null;
};

@Injectable()
export class ReprintPaymentService {
  private readonly logger = new Logger(ReprintPaymentService.name);
  private readonly resend: Resend | null;
  private readonly frontendBaseUrl: string;
  private readonly customerPaymentsFromEmail: string;
  private readonly adminNotificationsFromEmail: string;
  private readonly adminEmailRecipients: string[];

  constructor(
    private readonly prisma: PrismaService,
    private readonly gatewayService: GatewayService,
    private readonly notificationsService: NotificationsService
  ) {
    this.resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
    const raw = process.env.FRONTEND_URL?.trim();
    this.frontendBaseUrl = raw ? raw.replace(/\/+$/, "") : "http://localhost:3000";
    this.customerPaymentsFromEmail = this.resolveCustomerFacingFromEmail();
    this.adminNotificationsFromEmail = this.resolveAdminNotificationsFromEmail();
    this.adminEmailRecipients = this.resolveAdminEmailRecipients();
  }

  /**
   * Pay for a reprint order.
   * Cost formula: ((pageCount × costPerPage) + coverCost) × copies
   */
  async payReprint(params: {
    sourceBookId: string;
    copies: number;
    provider: string;
    callbackUrl?: string;
    userId: string;
  }) {
    const provider = params.provider.toUpperCase() as PaymentProvider;

    if (
      provider !== PaymentProvider.PAYSTACK &&
      provider !== PaymentProvider.STRIPE &&
      provider !== PaymentProvider.BANK_TRANSFER
    ) {
      throw new BadRequestException(
        "Reprint payments support Paystack, Stripe, and Bank Transfer."
      );
    }

    if (provider !== PaymentProvider.BANK_TRANSFER) {
      await this.gatewayService.ensureGatewayEnabled(provider);
      this.gatewayService.ensureProviderAvailable(provider);
    } else {
      await this.gatewayService.ensureGatewayEnabled(PaymentProvider.BANK_TRANSFER);
    }

    const sourceBook = await this.prisma.book.findFirst({
      where: {
        id: params.sourceBookId,
        userId: params.userId,
      },
      select: {
        id: true,
        orderId: true,
        status: true,
        productionStatus: true,
        pageCount: true,
        finalPdfUrl: true,
        title: true,
        user: {
          select: {
            email: true,
            firstName: true,
            phoneNumber: true,
          },
        },
        order: {
          select: {
            id: true,
            bookSize: true,
            paperColor: true,
            lamination: true,
          },
        },
      },
    });

    if (!sourceBook) {
      throw new NotFoundException(`Book "${params.sourceBookId}" not found`);
    }

    const isEligibleByStatus = REPRINT_ELIGIBLE_BOOK_STATUSES.has(sourceBook.status);
    const isEligibleByProductionStatus =
      sourceBook.productionStatus !== null &&
      REPRINT_ELIGIBLE_BOOK_STATUSES.has(sourceBook.productionStatus);

    if (!isEligibleByStatus && !isEligibleByProductionStatus) {
      throw new BadRequestException("Only delivered books can start a reprint from the dashboard.");
    }

    if (!sourceBook.finalPdfUrl) {
      throw new BadRequestException("Final PDF is not available for same-file reprint yet.");
    }

    if (typeof sourceBook.pageCount !== "number" || sourceBook.pageCount < 1) {
      throw new BadRequestException(
        "Authoritative page count is required before reprint payment can start."
      );
    }

    if (params.copies < REPRINT_MIN_COPIES) {
      throw new BadRequestException("At least 1 copy is required.");
    }

    const [costPerPage, coverCost] = await this.resolveReprintCostSettings();
    const costPerCopy = sourceBook.pageCount * costPerPage + coverCost;
    const amount = this.toCurrency(costPerCopy * params.copies);
    const reference = this.generateReference("rp");

    const bookSize = sourceBook.order.bookSize ?? "A5";
    const paperColor = sourceBook.order.paperColor ?? "white";
    const lamination = sourceBook.order.lamination ?? "gloss";

    const payment = await this.prisma.payment.create({
      data: {
        provider,
        type: PaymentType.REPRINT,
        amount,
        currency: DEFAULT_CURRENCY,
        status:
          provider === PaymentProvider.BANK_TRANSFER
            ? PaymentStatus.AWAITING_APPROVAL
            : PaymentStatus.PENDING,
        providerRef: reference,
        userId: params.userId,
        payerEmail: sourceBook.user.email,
        metadata: {
          sourceBookId: sourceBook.id,
          sourceOrderId: sourceBook.orderId,
          orderType: "REPRINT",
          copies: params.copies,
          bookSize,
          paperColor,
          lamination,
          pageCount: sourceBook.pageCount,
          costPerPage,
          coverCost,
          costPerCopy,
          finalPdfUrl: sourceBook.finalPdfUrl,
        },
      } as Prisma.PaymentUncheckedCreateInput,
    });

    // Bank Transfer: return order info for the dashboard bank transfer UI
    if (provider === PaymentProvider.BANK_TRANSFER) {
      return {
        provider,
        paymentId: payment.id,
        reference,
        amount,
        status: PaymentStatus.AWAITING_APPROVAL,
        bankTransfer: true,
        message:
          "Upload your payment receipt to complete the bank transfer. " +
          "An admin will verify and approve your payment.",
      };
    }

    return this.gatewayService.delegateInitialize(provider, {
      email: sourceBook.user.email,
      amount,
      reference,
      callbackUrl: params.callbackUrl,
      paymentId: payment.id,
    });
  }

  /**
   * Create the Order, Book, and audit logs after a reprint payment succeeds.
   * Called from PaymentsService.createPaymentFromWebhook when reprint entity
   * creation is needed.
   */
  async createReprintEntitiesFromMetadata(params: {
    paymentId: string;
    userId: string | null;
    payerEmail: string | null;
    metadata: Record<string, unknown> | null;
    amount: number;
    currency: string;
  }): Promise<{
    email: string;
    name: string;
    locale: Locale;
    phone: string | null;
    whatsAppNotificationsEnabled: boolean;
    orderNumber: string;
    packageName: string;
    amountPaid: string;
    addons: string[];
    bookTitle: string;
    copies: number;
    costPerCopy: string;
    bookSize: string;
    paperColor: string;
    lamination: string;
  } | null> {
    if (!params.userId) {
      throw new ConflictException("Authenticated reprint payments require a linked user.");
    }

    const reprint = this.extractReprintMetadata(params.metadata);
    if (!reprint) {
      this.logger.warn(
        `Webhook payment ${params.paymentId}: reprint metadata is incomplete, skipping order creation`
      );
      return null;
    }

    return this.prisma.$transaction(async (tx) => {
      const sourceBook = await tx.book.findUnique({
        where: { id: reprint.sourceBookId },
        select: {
          id: true,
          orderId: true,
          userId: true,
          title: true,
          coverImageUrl: true,
          pageCount: true,
          wordCount: true,
          estimatedPages: true,
          fontFamily: true,
          fontSize: true,
          finalPdfUrl: true,
          files: {
            where: { fileType: "RAW_MANUSCRIPT" },
            orderBy: [{ version: "desc" }, { createdAt: "desc" }],
            take: 1,
            select: {
              url: true,
              fileName: true,
              fileSize: true,
              mimeType: true,
            },
          },
          user: {
            select: {
              email: true,
              firstName: true,
              preferredLanguage: true,
              phoneNumber: true,
              whatsAppNotificationsEnabled: true,
            },
          },
          order: {
            select: {
              id: true,
              packageId: true,
              packagePriceSnap: true,
              bookSize: true,
              paperColor: true,
              lamination: true,
              package: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      });

      if (!sourceBook || sourceBook.userId !== params.userId) {
        throw new ForbiddenException("Source book is no longer available for reprint fulfillment.");
      }

      if (reprint.sourceOrderId && sourceBook.orderId !== reprint.sourceOrderId) {
        throw new ConflictException("Reprint payment metadata does not match the source order.");
      }

      const finalPdfUrl = reprint.finalPdfUrl ?? sourceBook.finalPdfUrl;
      if (!finalPdfUrl) {
        throw new ConflictException("Final PDF is required to fulfill a same-file reprint.");
      }

      const pageCount = reprint.pageCount ?? sourceBook.pageCount ?? null;
      if (typeof pageCount !== "number" || pageCount < 1) {
        throw new ConflictException(
          "Authoritative page count is required for reprint fulfillment."
        );
      }

      // Pull bookSize/paperColor/lamination from source order (authoritative)
      const bookSize = sourceBook.order.bookSize ?? reprint.bookSize ?? "A5";
      const paperColor = sourceBook.order.paperColor ?? reprint.paperColor ?? "white";
      const lamination = sourceBook.order.lamination ?? reprint.lamination ?? "gloss";

      const orderNumber = await this.generateOrderNumber(tx);
      const amount = this.toCurrency(params.amount);
      const now = new Date();

      const order = await tx.order.create({
        data: {
          orderNumber,
          userId: sourceBook.userId,
          packageId: sourceBook.order.packageId,
          orderType: OrderType.REPRINT,
          originalBookId: sourceBook.id,
          skipFormatting: true,
          copies: reprint.copies,
          packagePriceSnap: Number(sourceBook.order.packagePriceSnap),
          hasCoverDesign: false,
          hasFormatting: false,
          bookSize,
          paperColor,
          lamination,
          status: OrderStatus.PAID,
          initialAmount: amount,
          extraAmount: 0,
          discountAmount: 0,
          totalAmount: amount,
          currency: (params.currency || DEFAULT_CURRENCY).toUpperCase(),
        } as Prisma.OrderUncheckedCreateInput,
      });

      const sourceManuscript = sourceBook.files[0] ?? null;

      const book = await tx.book.create({
        data: {
          orderId: order.id,
          userId: sourceBook.userId,
          status: BookStatus.REVIEW,
          productionStatus: BookStatus.REVIEW,
          productionStatusUpdatedAt: now,
          title: sourceBook.title,
          coverImageUrl: sourceBook.coverImageUrl,
          pageCount,
          wordCount: sourceBook.wordCount,
          estimatedPages: sourceBook.estimatedPages,
          fontFamily: sourceBook.fontFamily,
          fontSize: sourceBook.fontSize,
          pageSize: bookSize,
          finalPdfUrl,
          previewPdfUrl: finalPdfUrl,
        },
      });

      // Copy the source book's latest RAW_MANUSCRIPT file so the title
      // derivation in list serializers works identically to normal books.
      if (sourceManuscript?.url) {
        await tx.file.create({
          data: {
            bookId: book.id,
            fileType: "RAW_MANUSCRIPT",
            url: sourceManuscript.url,
            fileName: sourceManuscript.fileName,
            fileSize: sourceManuscript.fileSize,
            mimeType: sourceManuscript.mimeType,
            version: 1,
            createdBy: "SYSTEM",
          },
        });
      }

      await tx.auditLog.createMany({
        data: [
          {
            userId: sourceBook.userId,
            action: "ORDER_STATUS_REACHED",
            entityType: "ORDER_TRACKING",
            entityId: order.id,
            details: {
              source: "order",
              status: OrderStatus.PAID,
              reachedAt: order.createdAt.toISOString(),
              label: "Paid",
            },
          },
          {
            userId: sourceBook.userId,
            action: "ORDER_STATUS_REACHED",
            entityType: "ORDER_TRACKING",
            entityId: order.id,
            details: {
              source: "book",
              status: BookStatus.REVIEW,
              reachedAt: book.createdAt.toISOString(),
              label: "Review",
            },
          },
        ],
      });

      await tx.payment.update({
        where: { id: params.paymentId },
        data: {
          userId: sourceBook.userId,
          orderId: order.id,
        },
      });

      await this.notificationsService.createOrderStatusNotification(
        {
          userId: sourceBook.userId,
          orderId: order.id,
          orderNumber,
          status: OrderStatus.PAID,
          source: "order",
          bookId: book.id,
        },
        tx
      );

      return {
        email: params.payerEmail ?? sourceBook.user.email,
        name: sourceBook.user.firstName,
        locale: this.resolveLocale(sourceBook.user.preferredLanguage),
        phone: sourceBook.user.phoneNumber ?? null,
        whatsAppNotificationsEnabled: sourceBook.user.whatsAppNotificationsEnabled,
        orderNumber,
        packageName: sourceBook.order.package.name,
        amountPaid: this.formatNaira(params.amount),
        addons: [],
        bookTitle:
          this.deriveTitleFromFileName(sourceManuscript?.fileName) ??
          sourceBook.title ??
          "Untitled",
        copies: reprint.copies,
        costPerCopy: this.formatNaira(pageCount > 0 ? params.amount / reprint.copies : 0),
        bookSize,
        paperColor,
        lamination,
      };
    });
  }

  /**
   * Send reprint confirmation emails to the user and an admin notification.
   * Called from PaymentsService.createPaymentFromWebhook after entity creation.
   */
  async sendReprintConfirmationEmails(params: {
    locale: Locale;
    userName: string;
    userEmail: string;
    orderNumber: string;
    bookTitle: string;
    copies: number;
    costPerCopy: string;
    bookSize: string;
    paperColor: string;
    lamination: string;
    totalPrice: string;
  }): Promise<void> {
    if (!this.resend) {
      this.logger.warn("RESEND_API_KEY not set — reprint confirmation emails skipped");
      return;
    }

    const dashboardUrl = this.buildLocalizedDashboardUrl(params.locale);
    const adminPanelUrl = `${this.frontendBaseUrl}/admin/orders`;

    // Send user confirmation email
    try {
      const userEmail = await renderReprintConfirmEmail({
        locale: params.locale,
        userName: params.userName,
        orderNumber: params.orderNumber,
        bookTitle: params.bookTitle,
        copies: params.copies,
        costPerCopy: params.costPerCopy,
        pageSize: params.bookSize,
        paperColor: params.paperColor,
        lamination: params.lamination,
        totalPrice: params.totalPrice,
        dashboardUrl,
      });

      const sendResult = await this.resend.emails.send({
        from: this.customerPaymentsFromEmail,
        to: params.userEmail,
        subject: userEmail.subject,
        html: userEmail.html,
      });

      if (sendResult.error) {
        this.logger.error(
          `Failed to send reprint confirmation email: ${sendResult.error.name} — ${sendResult.error.message}`
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to send reprint confirmation email to ${params.userEmail}: ${error instanceof Error ? error.message : error}`,
        error instanceof Error ? error.stack : undefined
      );
    }

    // Send admin notification email
    try {
      const adminEmail = await renderReprintAdminConfirmEmail({
        locale: "en",
        userName: params.userName,
        userEmail: params.userEmail,
        orderNumber: params.orderNumber,
        bookTitle: params.bookTitle,
        copies: params.copies,
        costPerCopy: params.costPerCopy,
        pageSize: params.bookSize,
        paperColor: params.paperColor,
        lamination: params.lamination,
        totalPrice: params.totalPrice,
        adminPanelUrl,
      });

      const adminRecipients =
        this.adminEmailRecipients.length > 0
          ? this.adminEmailRecipients
          : [this.adminNotificationsFromEmail];

      const sendResult = await this.resend.emails.send({
        from: this.adminNotificationsFromEmail,
        to: adminRecipients,
        subject: adminEmail.subject,
        html: adminEmail.html,
      });

      if (sendResult.error) {
        this.logger.error(
          `Failed to send reprint admin notification: ${sendResult.error.name} — ${sendResult.error.message}`
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to send reprint admin notification for ${params.orderNumber}: ${error instanceof Error ? error.message : error}`,
        error instanceof Error ? error.stack : undefined
      );
    }
  }

  // ─────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────

  private extractReprintMetadata(metadata: Record<string, unknown> | null): ReprintMetadata | null {
    if (!metadata || typeof metadata !== "object") return null;

    const sourceBookId = this.asString(metadata.sourceBookId);
    const copies = this.asInteger(metadata.copies);

    if (!sourceBookId || typeof copies !== "number" || copies < REPRINT_MIN_COPIES) {
      return null;
    }

    return {
      sourceBookId,
      sourceOrderId: this.asString(metadata.sourceOrderId) ?? null,
      copies,
      bookSize: this.asString(metadata.bookSize) ?? null,
      paperColor: this.asString(metadata.paperColor) ?? null,
      lamination: this.asString(metadata.lamination) ?? null,
      pageCount: this.asInteger(metadata.pageCount) ?? null,
      finalPdfUrl: this.asString(metadata.finalPdfUrl) ?? null,
    };
  }

  private async resolveReprintCostSettings(): Promise<[number, number]> {
    const settings = await this.prisma.systemSetting.findMany({
      where: {
        key: {
          in: [REPRINT_COST_PER_PAGE_SETTING_KEY, REPRINT_COVER_COST_SETTING_KEY],
        },
      },
      select: { key: true, value: true },
    });

    const costPerPageRaw = settings.find((s) => s.key === REPRINT_COST_PER_PAGE_SETTING_KEY)?.value;
    const coverCostRaw = settings.find((s) => s.key === REPRINT_COVER_COST_SETTING_KEY)?.value;

    const costPerPage = this.toCurrency(costPerPageRaw);
    const coverCost = this.toCurrency(coverCostRaw);

    return [
      costPerPage > 0 ? costPerPage : DEFAULT_REPRINT_COST_PER_PAGE,
      coverCost > 0 ? coverCost : DEFAULT_REPRINT_COVER_COST,
    ];
  }

  private async generateOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
      const candidate = `BP-${new Date().getFullYear()}-${randomPart}`;

      const existing = await tx.order.findUnique({
        where: { orderNumber: candidate },
        select: { id: true },
      });
      if (!existing) return candidate;
    }

    throw new ServiceUnavailableException("Unable to generate a unique order number");
  }

  private generateReference(prefix = "bp"): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `${prefix}_${timestamp}_${random}`;
  }

  private deriveTitleFromFileName(fileName: string | null | undefined): string | null {
    if (typeof fileName !== "string") return null;
    const trimmed = fileName.trim();
    if (!trimmed) return null;
    return (
      trimmed
        .replace(/\.[^.]+$/, "")
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim() || null
    );
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

  private asInteger(value: unknown): number | undefined {
    const parsed = this.asNumber(value);
    if (parsed === undefined) return undefined;
    return Math.max(0, Math.floor(parsed));
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

  private resolveCustomerFacingFromEmail(): string {
    const configured =
      process.env.CONTACT_FROM_EMAIL ||
      process.env.DEFAULT_FROM_EMAIL ||
      process.env.ADMIN_FROM_EMAIL ||
      "BookPrinta <info@bookprinta.com>";
    const normalized = configured.trim();
    return normalized.length > 0 ? normalized : "BookPrinta <info@bookprinta.com>";
  }

  private resolveAdminNotificationsFromEmail(): string {
    const configured =
      process.env.ADMIN_FROM_EMAIL ||
      process.env.CONTACT_FROM_EMAIL ||
      process.env.DEFAULT_FROM_EMAIL ||
      "BookPrinta <info@bookprinta.com>";
    const normalized = configured.trim();
    return normalized.length > 0 ? normalized : "BookPrinta <info@bookprinta.com>";
  }

  private resolveAdminEmailRecipients(): string[] {
    const sources = [
      process.env.PAYMENT_ADMIN_EMAILS,
      process.env.ADMIN_NOTIFICATION_EMAIL,
      process.env.CONTACT_ADMIN_EMAIL,
      process.env.ADMIN_FROM_EMAIL,
      process.env.CONTACT_FROM_EMAIL,
    ];

    const recipients = sources
      .filter((value): value is string => Boolean(value && value.trim().length > 0))
      .flatMap((value) => value.split(","))
      .map((value) => this.extractEmailAddress(value))
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase());

    const unique = Array.from(new Set(recipients));
    return unique.length > 0 ? unique : ["info@bookprinta.com"];
  }

  private extractEmailAddress(value: string): string | null {
    const normalized = value.trim();
    if (!normalized) return null;
    const bracketMatch = normalized.match(/<([^>]+)>/);
    const candidate = bracketMatch?.[1]?.trim() || normalized;
    if (!candidate.includes("@")) return null;
    return candidate;
  }
}
