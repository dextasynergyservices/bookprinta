/// <reference types="multer" />
import type { Locale } from "@bookprinta/emails";
import { DEFAULT_CURRENCY } from "@bookprinta/shared";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { MAX_FILE_SIZE_BYTES } from "../../cloudinary/cloudinary.service.js";
import { CloudinaryService } from "../../cloudinary/index.js";
import { verifyRecaptchaToken } from "../../common/recaptcha.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { PaymentProvider, PaymentStatus, PaymentType } from "../../generated/prisma/enums.js";
import { NotificationsService } from "../../notifications/notifications.service.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { ScannerService } from "../../scanner/scanner.service.js";
import { DEFAULT_DASHBOARD_PATH } from "../payment-config.js";
import {
  asRecord,
  asString,
  extractCheckoutMetadata,
  extractCustomQuoteCheckoutMetadata,
  generatePaymentReference,
  mimeToExtension,
  parseDataUrl,
  pickDisplayName,
  resolveLocale,
  stripClientTrustedMetadata,
} from "../payment-metadata.js";
import { CheckoutFulfillmentService } from "./checkout-fulfillment.service.js";
import { CheckoutIdentityService } from "./checkout-identity.service.js";
import { CheckoutMetadataPricingService } from "./checkout-metadata-pricing.service.js";
import { GatewayService } from "./gateway.service.js";
import { PaymentNotificationsService } from "./payment-notifications.service.js";
import { ReprintPaymentService } from "./reprint-payment.service.js";
import { SignupLinkDeliveryService } from "./signup-link-delivery.service.js";

export const BANK_TRANSFER_REJECTED_TITLE_KEY = "notifications.bank_transfer_rejected.title";

export const BANK_TRANSFER_REJECTED_MESSAGE_KEY = "notifications.bank_transfer_rejected.message";

export const BANK_TRANSFER_REJECTED_FALLBACK_TITLE = "Bank transfer not approved";

export type NormalizedBankTransferInput = {
  payerName: string;
  payerEmail: string;
  payerPhone: string;
  amount: number;
  currency?: string;
  receiptUrl?: string;
  orderId?: string;
  metadata?: Record<string, unknown>;
  recaptchaToken?: string;
};

/**
 * Bank-transfer payments: the customer pays offline, uploads a receipt, and an
 * admin approves or rejects it.
 *
 * Submission records an AWAITING_APPROVAL payment (receipt malware-scanned,
 * pricing computed on the server) and alerts admins; approval runs the same
 * checkout fulfilment as an online payment and sends the signup link;
 * rejection notifies the customer.
 */
@Injectable()
export class BankTransferService {
  private readonly logger = new Logger(BankTransferService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gatewayService: GatewayService,
    private readonly scanner: ScannerService,
    private readonly cloudinary: CloudinaryService,
    private readonly notificationsService: NotificationsService,
    private readonly paymentNotifications: PaymentNotificationsService,
    private readonly signupLinkDelivery: SignupLinkDeliveryService,
    private readonly metadataPricing: CheckoutMetadataPricingService,
    private readonly checkoutFulfillment: CheckoutFulfillmentService,
    private readonly checkoutIdentity: CheckoutIdentityService,
    private readonly reprintPaymentService: ReprintPaymentService
  ) {}

  /**
   * Submit a bank transfer for a new-book order initiated from the dashboard.
   * The user is already authenticated — payment links directly to their userId.
   * Skips reCAPTCHA and identity conflict checks.
   */
  async submitDashboardBankTransfer(params: {
    userId: string;
    payerName: string;
    payerEmail: string;
    payerPhone: string;
    amount: number;
    currency: string;
    receiptUrl?: string;
    metadata: Record<string, unknown>;
  }): Promise<{ id: string; status: string; message: string }> {
    await this.ensureGatewayEnabled(PaymentProvider.BANK_TRANSFER);

    const reference = this.generateReference("bt");
    const priced = await this.metadataPricing.priceCheckoutMetadata({
      metadata: { ...params.metadata, dashboardUserId: params.userId, source: "dashboard" },
      clientAmount: params.amount,
      currency: params.currency,
    });
    const expectedAmount = priced.amount;
    const metadata: Record<string, unknown> = {
      ...priced.metadata,
      fullName: params.payerName,
      phone: params.payerPhone,
      payerEmail: params.payerEmail,
      email: params.payerEmail,
    };

    const payment = await this.prisma.payment.create({
      data: {
        provider: PaymentProvider.BANK_TRANSFER,
        type: PaymentType.INITIAL,
        amount: expectedAmount,
        currency: DEFAULT_CURRENCY,
        status: PaymentStatus.AWAITING_APPROVAL,
        providerRef: reference,
        receiptUrl: params.receiptUrl ?? null,
        payerName: params.payerName,
        payerEmail: params.payerEmail,
        payerPhone: params.payerPhone,
        userId: params.userId,
        metadata,
      } as Prisma.PaymentUncheckedCreateInput,
    });

    this.logger.log(
      `Dashboard bank transfer submitted — ${params.payerName} — ₦${expectedAmount} — ref: ${reference}`
    );

    const orderSummary = await this.resolveBankTransferOrderSummary({
      reference,
      metadata,
    });

    const locale = resolveLocale(extractCheckoutMetadata(metadata)?.locale);

    await this.paymentNotifications.triggerBankTransferNotifications({
      paymentId: payment.id,
      reference,
      orderNumber: orderSummary.orderNumber,
      packageName: orderSummary.packageName,
      addons: orderSummary.addons,
      payerName: params.payerName,
      payerEmail: params.payerEmail,
      payerPhone: params.payerPhone,
      amount: expectedAmount,
      receiptUrl: params.receiptUrl ?? "",
      locale,
    });

    return {
      id: payment.id,
      status: payment.status,
      message:
        "Your payment is being verified. You will receive an email once approved. " +
        "This typically takes less than 30 minutes.",
    };
  }

  /**
   * Submit a bank transfer receipt.
   * Creates a Payment record with status AWAITING_APPROVAL.
   *
   * Per CLAUDE.md Section 8, step 7: user doesn't have an account yet.
   * userId is null — it gets linked after admin approves and the user
   * completes signup at /signup/finish.
   */
  async submitBankTransfer(dto: NormalizedBankTransferInput, receiptFile?: Express.Multer.File) {
    // Verify reCAPTCHA before processing
    if (dto.recaptchaToken) {
      const isHuman = await this.verifyRecaptcha(dto.recaptchaToken);
      if (!isHuman) {
        throw new BadRequestException("reCAPTCHA verification failed. Please try again.");
      }
    }

    // Check bank transfer gateway is enabled
    await this.ensureGatewayEnabled(PaymentProvider.BANK_TRANSFER);

    await this.checkoutIdentity.assertCheckoutIdentityConflict({
      email: dto.payerEmail,
      phone: dto.payerPhone,
    });

    const reference = this.generateReference("bt");
    // Public endpoint: the client cannot assert a dashboard identity, and the
    // amount the admin approves against must be the server's price, not one the
    // browser typed in.
    const clientMetadata = stripClientTrustedMetadata(asRecord(dto.metadata));
    if (extractCustomQuoteCheckoutMetadata(clientMetadata) && !receiptFile) {
      throw new BadRequestException(
        "Receipt file upload is required for custom quote bank transfers."
      );
    }
    const priced = await this.metadataPricing.priceCheckoutMetadata({
      metadata: clientMetadata,
      clientAmount: dto.amount,
      currency: dto.currency,
    });
    const checkoutMetadata = priced.metadata;
    const expectedAmount = priced.amount;
    const metadata: Record<string, unknown> = {
      ...checkoutMetadata,
      fullName: dto.payerName,
      phone: dto.payerPhone,
      payerEmail: dto.payerEmail,
      email: dto.payerEmail,
    };
    const locale = resolveLocale(extractCheckoutMetadata(metadata)?.locale);
    const resolvedReceiptUrl = await this.resolveBankTransferReceiptUrl({
      receiptFile,
      receiptUrl: dto.receiptUrl,
      payerName: dto.payerName,
      reference,
    });

    const payment = await this.prisma.payment.create({
      data: {
        provider: PaymentProvider.BANK_TRANSFER,
        type: PaymentType.INITIAL,
        amount: expectedAmount,
        currency: DEFAULT_CURRENCY,
        status: PaymentStatus.AWAITING_APPROVAL,
        providerRef: reference,
        receiptUrl: resolvedReceiptUrl,
        payerName: dto.payerName,
        payerEmail: dto.payerEmail,
        payerPhone: dto.payerPhone,
        // userId and orderId omitted — guest checkout, no user exists yet.
        // They get linked after admin approval + user signup (Phase 3).
        metadata,
      } as Prisma.PaymentUncheckedCreateInput,
    });

    this.logger.log(
      `Bank transfer submitted — ${dto.payerName} — ₦${expectedAmount} — ref: ${reference}`
    );

    const orderSummary = await this.resolveBankTransferOrderSummary({
      reference,
      metadata,
    });

    await this.paymentNotifications.triggerBankTransferNotifications({
      paymentId: payment.id,
      reference,
      orderNumber: orderSummary.orderNumber,
      packageName: orderSummary.packageName,
      addons: orderSummary.addons,
      payerName: dto.payerName,
      payerEmail: dto.payerEmail,
      payerPhone: dto.payerPhone,
      amount: expectedAmount,
      receiptUrl: resolvedReceiptUrl,
      locale,
    });

    return {
      id: payment.id,
      status: payment.status,
      message:
        "Your payment is being verified. You will receive an email once approved. " +
        "This typically takes less than 30 minutes.",
    };
  }

  /**
   * Upload a bank transfer receipt for an existing reprint payment.
   * Called from dashboard after payReprint() created the BANK_TRANSFER payment.
   */
  async uploadReprintBankTransferReceipt(params: {
    paymentId: string;
    userId: string;
    receiptFile?: Express.Multer.File;
    receiptUrl?: string;
    payerName?: string;
    payerEmail?: string;
    payerPhone?: string;
  }) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: params.paymentId },
      select: {
        id: true,
        userId: true,
        type: true,
        provider: true,
        status: true,
        providerRef: true,
        amount: true,
        payerEmail: true,
        payerName: true,
        metadata: true,
      },
    });

    if (!payment) {
      throw new NotFoundException("Payment not found");
    }

    if (payment.userId !== params.userId) {
      throw new ForbiddenException("You do not have access to this payment.");
    }

    if (
      payment.type !== PaymentType.REPRINT ||
      payment.provider !== PaymentProvider.BANK_TRANSFER
    ) {
      throw new BadRequestException("This payment does not accept bank transfer receipts.");
    }

    if (payment.status !== PaymentStatus.AWAITING_APPROVAL) {
      throw new BadRequestException("This payment is no longer awaiting a receipt.");
    }

    const resolvedReceiptUrl = await this.resolveBankTransferReceiptUrl({
      receiptFile: params.receiptFile,
      receiptUrl: params.receiptUrl,
      payerName: payment.payerName ?? "Author",
      reference: payment.providerRef ?? payment.id,
    });

    const updatedPayerName = params.payerName || payment.payerName;
    const updatedPayerEmail = params.payerEmail || payment.payerEmail;
    const updatedPayerPhone = params.payerPhone || "";

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        receiptUrl: resolvedReceiptUrl,
        ...(params.payerName ? { payerName: params.payerName } : {}),
        ...(params.payerEmail ? { payerEmail: params.payerEmail } : {}),
        ...(params.payerPhone ? { payerPhone: params.payerPhone } : {}),
      },
    });

    const reference = payment.providerRef ?? payment.id;

    await this.paymentNotifications.triggerBankTransferNotifications({
      paymentId: payment.id,
      reference,
      orderNumber: reference,
      packageName: "Reprint Order",
      addons: [],
      payerName: updatedPayerName ?? "Author",
      payerEmail: updatedPayerEmail ?? "",
      payerPhone: updatedPayerPhone,
      amount: Number(payment.amount),
      receiptUrl: resolvedReceiptUrl,
      locale: "en",
    });

    return {
      id: payment.id,
      status: payment.status,
      receiptUrl: resolvedReceiptUrl,
      message:
        "Receipt uploaded. Your reprint payment is being verified. " +
        "This typically takes less than 30 minutes.",
    };
  }

  private async resolveBankTransferOrderSummary(params: {
    reference: string;
    metadata: Record<string, unknown>;
  }): Promise<{
    orderNumber: string;
    packageName: string;
    addons: string[];
  }> {
    const fallback = {
      orderNumber: params.reference,
      packageName: "BookPrinta Package",
      addons: [] as string[],
    };

    const checkout = extractCheckoutMetadata(params.metadata);
    if (!checkout) return fallback;

    let packageName =
      asString(checkout.packageName) || asString(checkout.tier) || fallback.packageName;

    const namedAddons = (checkout.addons ?? [])
      .map((addon) => asString(addon.name))
      .filter((name): name is string => Boolean(name));

    if (namedAddons.length > 0 && packageName !== fallback.packageName) {
      return {
        orderNumber: params.reference,
        packageName,
        addons: namedAddons,
      };
    }

    if (packageName === fallback.packageName) {
      const pkg = await this.checkoutFulfillment.resolvePackageFromCheckoutMetadata(checkout);
      if (pkg?.name) packageName = pkg.name;
    }

    const addons =
      namedAddons.length > 0
        ? namedAddons
        : await this.checkoutFulfillment.resolveAddonNamesFromMetadata(this.prisma, checkout);

    return {
      orderNumber: params.reference,
      packageName,
      addons,
    };
  }

  async approveBankTransfer(params: { paymentId: string; adminId: string; adminNote?: string }) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: params.paymentId },
      select: {
        id: true,
        type: true,
        provider: true,
        status: true,
        payerEmail: true,
        payerName: true,
        amount: true,
        currency: true,
        providerRef: true,
        metadata: true,
        userId: true,
        orderId: true,
      },
    });

    if (!payment || payment.provider !== PaymentProvider.BANK_TRANSFER) {
      throw new NotFoundException("Bank transfer payment not found");
    }

    if (payment.status !== PaymentStatus.AWAITING_APPROVAL) {
      throw new BadRequestException("This payment is no longer awaiting approval");
    }

    // ── Reprint bank transfer approval ──
    if (payment.type === PaymentType.REPRINT) {
      return this.approveReprintBankTransfer(payment, params.adminId, params.adminNote);
    }

    const normalizedAdminNote = params.adminNote?.trim() || null;
    const signupInfo = await this.checkoutFulfillment.ensureBankTransferApprovalSignupInfo({
      paymentId: payment.id,
      payerEmail: payment.payerEmail,
      payerName: payment.payerName,
      amount: Number(payment.amount),
      currency: payment.currency,
      metadata: asRecord(payment.metadata),
      userId: payment.userId,
      orderId: payment.orderId,
    });

    if (!signupInfo) {
      throw new BadRequestException(
        "This bank transfer cannot be approved because the checkout context is incomplete."
      );
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.SUCCESS,
          processedAt: now,
          approvedAt: now,
          approvedBy: params.adminId,
          adminNote: normalizedAdminNote,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: params.adminId,
          action: "ADMIN_BANK_TRANSFER_APPROVED",
          entityType: "PAYMENT",
          entityId: payment.id,
          details: {
            provider: payment.provider,
            providerRef: payment.providerRef,
            previousStatus: payment.status,
            nextStatus: PaymentStatus.SUCCESS,
            orderId: signupInfo.orderId,
            orderNumber: signupInfo.orderNumber,
            linkedUserId: signupInfo.userId,
            signupLinkIssued: Boolean(signupInfo.signupToken),
            adminNote: normalizedAdminNote,
          },
        },
      });
    });

    const paymentMetadata = asRecord(payment.metadata);
    const isDashboardOrder = asString(paymentMetadata?.source) === "dashboard";

    if (isDashboardOrder) {
      // Dashboard order: user already has an account — send new-book confirmation emails
      await this.paymentNotifications.sendNewBookOrderEmails({
        paymentId: payment.id,
        baseMetadata: paymentMetadata,
        locale: signupInfo.locale,
        userName: signupInfo.name,
        userEmail: signupInfo.email,
        orderNumber: signupInfo.orderNumber,
        packageName: signupInfo.packageName,
        amountPaid: signupInfo.amountPaid,
        addons: signupInfo.addons,
        provider: PaymentProvider.BANK_TRANSFER,
        reference: payment.providerRef || payment.id,
      });
    } else if (signupInfo?.signupToken) {
      await this.signupLinkDelivery.attemptSignupLinkDelivery({
        paymentId: payment.id,
        paymentReference: payment.providerRef || payment.id,
        baseMetadata: paymentMetadata,
        source: "BANK_TRANSFER_APPROVAL",
        email: signupInfo.email,
        name: signupInfo.name,
        locale: signupInfo.locale,
        token: signupInfo.signupToken,
        phoneNumber: signupInfo.phone,
        orderNumber: signupInfo.orderNumber,
        packageName: signupInfo.packageName,
        amountPaid: signupInfo.amountPaid,
        addons: signupInfo.addons,
      });
    }

    await this.paymentNotifications.sendPaymentConfirmationWhatsApp({
      userName: signupInfo.name,
      phoneNumber: signupInfo.phone,
      preferredLanguage: signupInfo.locale,
      whatsAppNotificationsEnabled: signupInfo.whatsAppNotificationsEnabled,
      orderNumber: signupInfo.orderNumber,
      packageName: signupInfo.packageName,
      amountPaid: signupInfo.amountPaid,
      addons: signupInfo.addons,
      variant: "bank_transfer",
      dashboardUrl: this.paymentNotifications.buildLocalizedDashboardUrl(signupInfo.locale),
    });

    return {
      id: payment.id,
      status: PaymentStatus.SUCCESS,
      message: "Bank transfer approved successfully.",
    };
  }

  /**
   * Approve a bank transfer for a reprint payment.
   * Creates reprint Order + Book (status: REVIEW), sends confirmation.
   * Does NOT issue a signup link — user already has an account.
   */
  private async approveReprintBankTransfer(
    payment: {
      id: string;
      payerEmail: string | null;
      payerName: string | null;
      amount: unknown;
      currency: string;
      providerRef: string | null;
      metadata: unknown;
      userId: string | null;
      orderId: string | null;
    },
    adminId: string,
    adminNote?: string
  ) {
    const normalizedAdminNote = adminNote?.trim() || null;
    const metadata = asRecord(payment.metadata);
    const now = new Date();

    // Mark payment as SUCCESS
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.SUCCESS,
          processedAt: now,
          approvedAt: now,
          approvedBy: adminId,
          adminNote: normalizedAdminNote,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: adminId,
          action: "ADMIN_BANK_TRANSFER_APPROVED",
          entityType: "PAYMENT",
          entityId: payment.id,
          details: {
            provider: PaymentProvider.BANK_TRANSFER,
            providerRef: payment.providerRef,
            previousStatus: PaymentStatus.AWAITING_APPROVAL,
            nextStatus: PaymentStatus.SUCCESS,
            paymentType: PaymentType.REPRINT,
            linkedUserId: payment.userId,
            adminNote: normalizedAdminNote,
          },
        },
      });
    });

    // Create reprint Order + Book
    let reprintResult: Awaited<
      ReturnType<typeof this.reprintPaymentService.createReprintEntitiesFromMetadata>
    >;
    try {
      reprintResult = await this.reprintPaymentService.createReprintEntitiesFromMetadata({
        paymentId: payment.id,
        userId: payment.userId,
        payerEmail: payment.payerEmail,
        metadata,
        amount: Number(payment.amount),
        currency: payment.currency,
      });
    } catch (error) {
      this.logger.error(
        `Reprint entity creation failed for bank-transfer payment ${payment.id} — reverting payment status: ${error instanceof Error ? error.message : error}`,
        error instanceof Error ? error.stack : undefined
      );
      await this.prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.AWAITING_APPROVAL,
            processedAt: null,
            approvedAt: null,
            approvedBy: null,
          },
        });
      });
      throw new ConflictException(
        `Bank transfer approved but reprint order creation failed: ${error instanceof Error ? error.message : "unknown error"}. Payment has been reverted to AWAITING_APPROVAL.`
      );
    }

    if (reprintResult) {
      await this.paymentNotifications.sendPaymentConfirmationWhatsApp({
        userName: reprintResult.name,
        phoneNumber: reprintResult.phone,
        preferredLanguage: reprintResult.locale,
        whatsAppNotificationsEnabled: reprintResult.whatsAppNotificationsEnabled,
        orderNumber: reprintResult.orderNumber,
        packageName: reprintResult.packageName,
        amountPaid: reprintResult.amountPaid,
        addons: reprintResult.addons,
        variant: "reprint",
        dashboardUrl: this.paymentNotifications.buildLocalizedDashboardUrl(reprintResult.locale),
      });

      await this.sendReprintConfirmationEmails({
        locale: reprintResult.locale,
        userName: reprintResult.name,
        userEmail: reprintResult.email,
        orderNumber: reprintResult.orderNumber,
        bookTitle: reprintResult.bookTitle,
        copies: reprintResult.copies,
        costPerCopy: reprintResult.costPerCopy,
        bookSize: reprintResult.bookSize,
        paperColor: reprintResult.paperColor,
        lamination: reprintResult.lamination,
        totalPrice: reprintResult.amountPaid,
      });
    }

    return {
      id: payment.id,
      status: PaymentStatus.SUCCESS,
      message: "Reprint bank transfer approved. Order created for user review.",
    };
  }

  async rejectBankTransfer(params: { paymentId: string; adminId: string; adminNote: string }) {
    const rejectionReason = params.adminNote.trim();
    if (!rejectionReason) {
      throw new BadRequestException("Admin note is required to reject a bank transfer");
    }

    const payment = await this.prisma.payment.findUnique({
      where: { id: params.paymentId },
      select: {
        id: true,
        provider: true,
        status: true,
        providerRef: true,
        processedAt: true,
        payerEmail: true,
        payerName: true,
        userId: true,
        orderId: true,
        metadata: true,
        order: {
          select: {
            id: true,
            orderNumber: true,
          },
        },
        user: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
            preferredLanguage: true,
            emailNotificationsEnabled: true,
          },
        },
      },
    });

    if (!payment || payment.provider !== PaymentProvider.BANK_TRANSFER) {
      throw new NotFoundException("Bank transfer payment not found");
    }

    if (payment.status !== PaymentStatus.AWAITING_APPROVAL) {
      throw new BadRequestException("This payment is no longer awaiting approval");
    }

    const recordedAt = new Date();
    const processedAt = payment.processedAt ?? recordedAt;
    const checkout = extractCheckoutMetadata(asRecord(payment.metadata));
    const orderNumber =
      payment.order?.orderNumber?.trim() || payment.providerRef?.trim() || payment.id;
    const reference = payment.providerRef?.trim() || payment.id;
    const recipientEmail =
      payment.payerEmail?.trim().toLowerCase() || payment.user?.email?.trim().toLowerCase() || null;
    const linkedUserName = payment.user
      ? `${payment.user.firstName} ${payment.user.lastName ?? ""}`.trim()
      : "";
    const userName = recipientEmail
      ? pickDisplayName(
          payment.payerName?.trim() || checkout?.fullName?.trim() || linkedUserName || undefined,
          recipientEmail
        )
      : payment.payerName?.trim() || checkout?.fullName?.trim() || linkedUserName || "Author";
    const locale = resolveLocale(checkout?.locale ?? payment.user?.preferredLanguage);
    const actionHref = payment.orderId
      ? `/dashboard/orders/${payment.orderId}`
      : DEFAULT_DASHBOARD_PATH;

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.FAILED,
          approvedBy: params.adminId,
          adminNote: rejectionReason,
          processedAt,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: params.adminId,
          action: "ADMIN_BANK_TRANSFER_REJECTED",
          entityType: "PAYMENT",
          entityId: payment.id,
          details: {
            previousStatus: payment.status,
            nextStatus: PaymentStatus.FAILED,
            reason: rejectionReason,
            processedAt: processedAt.toISOString(),
            providerRef: payment.providerRef ?? null,
            orderId: payment.orderId ?? null,
            orderNumber,
            linkedUserId: payment.userId ?? null,
            emailTarget: recipientEmail,
          },
        },
      });

      if (payment.userId) {
        await this.notificationsService.createSystemNotification(
          {
            userId: payment.userId,
            orderId: payment.orderId ?? undefined,
            titleKey: BANK_TRANSFER_REJECTED_TITLE_KEY,
            messageKey: BANK_TRANSFER_REJECTED_MESSAGE_KEY,
            params: {
              orderNumber,
              reference,
            },
            action: {
              kind: "navigate",
              href: actionHref,
            },
            presentation: {
              tone: "warning",
            },
            fallbackTitle: BANK_TRANSFER_REJECTED_FALLBACK_TITLE,
            fallbackMessage:
              `Your bank transfer for order ${orderNumber} was not approved. ` +
              `Check your email for the reason and next steps. Ref: ${reference}.`,
          },
          tx
        );
      }
    });

    if (recipientEmail) {
      const emailSent = await this.paymentNotifications.sendBankTransferRejectedEmail({
        email: recipientEmail,
        userName,
        locale,
        orderNumber,
        paymentReference: reference,
        rejectionReason,
        emailNotificationsEnabled: payment.user?.emailNotificationsEnabled ?? null,
      });

      if (!emailSent) {
        this.logger.warn(`Bank transfer rejection email failed for payment ${payment.id}`);
      }
    }

    return {
      id: payment.id,
      status: PaymentStatus.FAILED,
      message: "Bank transfer rejected.",
    };
  }

  private async resolveBankTransferReceiptUrl(params: {
    receiptFile?: Express.Multer.File;
    receiptUrl?: string;
    payerName: string;
    reference: string;
  }): Promise<string> {
    if (params.receiptFile) {
      return this.scanAndUploadReceipt({
        buffer: params.receiptFile.buffer,
        mimeType: params.receiptFile.mimetype,
        fileName: params.receiptFile.originalname || `${params.reference}.bin`,
        reference: params.reference,
      });
    }

    const receiptUrl = params.receiptUrl?.trim();
    if (!receiptUrl) {
      throw new BadRequestException("Receipt file or receipt URL is required");
    }

    if (/^https?:\/\//i.test(receiptUrl)) {
      return receiptUrl;
    }

    const parsedDataUrl = parseDataUrl(receiptUrl);
    if (!parsedDataUrl) {
      throw new BadRequestException("Invalid receipt format. Upload a PDF/JPG/PNG receipt.");
    }

    return this.scanAndUploadReceipt({
      buffer: parsedDataUrl.buffer,
      mimeType: parsedDataUrl.mimeType,
      fileName: `${params.reference}.${parsedDataUrl.extension}`,
      reference: params.reference,
    });
  }

  private async scanAndUploadReceipt(params: {
    buffer: Buffer;
    mimeType: string;
    fileName: string;
    reference: string;
  }): Promise<string> {
    if (!this.cloudinary.isAllowedMimeType(params.mimeType)) {
      throw new BadRequestException(
        "Unsupported receipt type. Please upload a PDF, JPG, PNG, or DOCX file."
      );
    }

    if (!this.cloudinary.isWithinSizeLimit(params.buffer.byteLength)) {
      throw new BadRequestException(
        `Receipt exceeds ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB limit`
      );
    }

    const scan = await this.scanner.scanBuffer(params.buffer, params.fileName);
    if (!scan.clean) {
      throw new ForbiddenException(
        "Receipt file failed security checks. Please upload a clean file and try again."
      );
    }

    const upload = await this.cloudinary.upload(params.buffer, {
      folder: "bookprinta/payments/receipts",
      resource_type: params.mimeType.startsWith("image/") ? "image" : "raw",
      type: "upload",
      public_id: `receipt_${params.reference}_${Date.now()}.${mimeToExtension(params.mimeType)}`,
    });

    return upload.secure_url;
  }

  private async sendReprintConfirmationEmails(params: {
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
    return this.reprintPaymentService.sendReprintConfirmationEmails(params);
  }

  private async ensureGatewayEnabled(provider: PaymentProvider): Promise<void> {
    return this.gatewayService.ensureGatewayEnabled(provider);
  }

  /** reCAPTCHA check — fails closed in production (see common/recaptcha.ts). */
  private verifyRecaptcha(token: string): Promise<boolean> {
    return verifyRecaptchaToken(token, this.logger);
  }

  /** Kept as a method so specs can make references deterministic. */
  private generateReference(prefix = "bp"): string {
    return generatePaymentReference(prefix);
  }
}
