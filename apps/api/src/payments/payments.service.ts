/// <reference types="multer" />
import { randomBytes } from "node:crypto";
import type { Locale } from "@bookprinta/emails";
import {
  renderBankTransferAdminEmail,
  renderBankTransferRejectedEmail,
  renderBankTransferUserEmail,
  renderRefundConfirmEmail,
} from "@bookprinta/emails/render";
import type {
  AdminPaymentRefundability,
  AdminPaymentSortField,
  AdminPaymentsListItem,
  AdminPaymentsListQuery,
  AdminPaymentsListResponse,
  AdminPendingBankTransferItem,
  AdminPendingBankTransfersResponse,
  AdminRefundRequestInput,
  AdminRefundResponse,
  RefundPolicySnapshot,
} from "@bookprinta/shared";
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
import { normalizePhoneNumber } from "../auth/phone-number.util.js";
import { MAX_FILE_SIZE_BYTES } from "../cloudinary/cloudinary.service.js";
import { CloudinaryService } from "../cloudinary/index.js";
import type { Prisma } from "../generated/prisma/client.js";
import {
  BookStatus,
  DiscountType,
  OrderStatus,
  OrderType,
  PaymentProvider,
  PaymentStatus,
  PaymentType,
  UserRole,
} from "../generated/prisma/enums.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { SignupNotificationsService } from "../notifications/signup-notifications.service.js";
import { buildRefundPolicySnapshot } from "../orders/admin-order-workflow.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { RolloutService } from "../rollout/rollout.service.js";
import { ScannerService } from "../scanner/scanner.service.js";
import type { InitializePaymentDto } from "./dto/payment-request.dto.js";
import { PayPalService } from "./services/paypal.service.js";
import type { PaystackWebhookPayload } from "./services/paystack.service.js";
import { PaystackService } from "./services/paystack.service.js";
import { StripeService } from "./services/stripe.service.js";

const MAX_SIGNUP_TOKEN_HOURS = 24;
const BANK_TRANSFER_ADMIN_WHATSAPP_FALLBACK = "+2348103208297";
const EXTRA_PAGE_PRICE_NGN = 10;
const DEFAULT_DASHBOARD_PATH = "/dashboard";
const BANK_TRANSFER_REJECTED_TITLE_KEY = "notifications.bank_transfer_rejected.title";
const BANK_TRANSFER_REJECTED_MESSAGE_KEY = "notifications.bank_transfer_rejected.message";
const BANK_TRANSFER_REJECTED_FALLBACK_TITLE = "Bank transfer not approved";
const REPRINT_MIN_COPIES = 25;
const DEFAULT_REPRINT_COST_PER_PAGE_A5 = 10;
const REPRINT_COST_PER_PAGE_SETTING_KEY = "quote_cost_per_page";
const PHONE_ALREADY_IN_USE_MESSAGE =
  "This phone number is already linked to another account. Use another phone number or sign in to your existing account.";
const EMAIL_PHONE_IDENTITY_CONFLICT_MESSAGE =
  "This email and phone number belong to different accounts. Sign in to the correct account or use a different phone number.";
const REPRINT_ALLOWED_BOOK_SIZES = new Set(["A4", "A5", "A6"]);
const REPRINT_ALLOWED_PAPER_COLORS = new Set(["white", "cream"]);
const REPRINT_ALLOWED_LAMINATIONS = new Set(["matt", "gloss"]);
const REPRINT_ELIGIBLE_BOOK_STATUSES = new Set<BookStatus>([
  BookStatus.DELIVERED,
  BookStatus.COMPLETED,
]);

type CheckoutAddonMetadata = {
  id?: string | null;
  slug?: string;
  name?: string;
  price?: number;
};

type CheckoutMetadata = {
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
};

type ReprintMetadata = {
  sourceBookId: string;
  sourceOrderId: string | null;
  copies: number;
  bookSize: string;
  paperColor: string;
  lamination: string;
  pageCount: number | null;
  finalPdfUrl: string | null;
};

type NormalizedBankTransferInput = {
  payerName: string;
  payerEmail: string;
  payerPhone: string;
  amount: number;
  currency?: string;
  receiptUrl?: string;
  orderId?: string;
  metadata?: Record<string, unknown>;
};

type CheckoutFinalizationInfo = {
  userId: string;
  orderId: string;
  email: string;
  name: string;
  locale: Locale;
  signupToken: string | null;
  phone: string | null;
  orderNumber: string;
  packageName: string;
  amountPaid: string;
  addons: string[];
};

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

// ──────────────────────────────────────────────
// Orchestrator service for all payment operations.
//
// Responsibilities:
//   1. Gateway availability lookup (PaymentGateway table)
//   2. Provider delegation (Paystack / Stripe / PayPal)
//   3. Idempotency guard on webhooks (providerRef + processedAt)
//   4. Payment record creation & status updates
//
// See CLAUDE.md Section 9 (API Reference — Payments) and
// Section 11 (Security — webhook idempotency).
// ──────────────────────────────────────────────

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly resend: Resend | null;
  private readonly frontendBaseUrl: string;
  private readonly paymentsFromEmail: string;
  private readonly adminEmailRecipients: string[];
  private readonly infobipBaseUrl: string;
  private readonly infobipApiKey: string;
  private readonly infobipWhatsAppFrom: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly paystackService: PaystackService,
    private readonly stripeService: StripeService,
    private readonly paypalService: PayPalService,
    private readonly scanner: ScannerService,
    private readonly cloudinary: CloudinaryService,
    private readonly signupNotificationsService: SignupNotificationsService,
    private readonly notificationsService: NotificationsService,
    private readonly rollout: RolloutService
  ) {
    this.resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
    this.frontendBaseUrl = this.resolveFrontendBaseUrl();
    this.infobipBaseUrl = this.normalizeBaseUrl(
      process.env.INFOBIP_BASE_URL ||
        process.env.INFOBIP_API_BASE_URL ||
        process.env.INFOBIP_BASEURL ||
        ""
    );
    this.infobipApiKey =
      process.env.INFOBIP_API_KEY || process.env.INFOBIP_KEY || process.env.INFOBIP_APIKEY || "";
    this.infobipWhatsAppFrom =
      process.env.INFOBIP_WHATSAPP_FROM ||
      process.env.INFOBIP_WHATSAPP_SENDER ||
      process.env.INFOBIP_WHATSAPP_NUMBER ||
      "";
    this.paymentsFromEmail =
      process.env.ADMIN_FROM_EMAIL ||
      process.env.CONTACT_FROM_EMAIL ||
      process.env.DEFAULT_FROM_EMAIL ||
      "BookPrinta <info@bookprinta.com>";
    this.adminEmailRecipients = this.resolveAdminEmailRecipients();
  }

  // ────────────────────────────────────────────
  // Public API methods (mapped to controller)
  // ────────────────────────────────────────────

  /**
   * List gateways available to frontend checkout.
   * Returns enabled gateways sorted by priority.
   *
   * For card gateways (Paystack/Stripe/PayPal), we only expose gateways
   * that are both enabled in DB and have provider configuration available.
   * BANK_TRANSFER is config-only (no SDK keys required).
   */
  async listAvailableGateways() {
    const gateways = await this.prisma.paymentGateway.findMany({
      where: { isEnabled: true },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    });

    return gateways
      .filter((gateway) => this.isGatewayAvailableForCheckout(gateway.provider))
      .map((gateway) => ({
        id: gateway.id,
        provider: gateway.provider,
        name: gateway.name,
        isEnabled: gateway.isEnabled,
        isTestMode: gateway.isTestMode,
        bankDetails:
          gateway.provider === PaymentProvider.BANK_TRANSFER
            ? ((gateway.bankDetails as Record<string, unknown> | null) ?? null)
            : null,
        instructions:
          gateway.provider === PaymentProvider.BANK_TRANSFER
            ? (gateway.instructions ?? null)
            : null,
        priority: gateway.priority,
      }));
  }

  /**
   * Initialize a payment session with the chosen provider.
   *
   * Per CLAUDE.md Section 8 (Path A, step 6) and the payment flow diagram:
   * - The Payment record is NOT created here.
   * - The webhook handler creates User → Order → Payment after the
   *   provider confirms the charge.
   * - This method only calls the provider API and returns the
   *   authorization URL so the frontend can redirect the user.
   */
  async initialize(dto: InitializePaymentDto) {
    const provider = dto.provider.toUpperCase() as PaymentProvider;

    // 1. Check gateway is enabled
    await this.ensureGatewayEnabled(provider);

    // 2. Ensure the provider SDK is available
    this.ensureProviderAvailable(provider);

    await this.assertCheckoutIdentityConflict({
      email: dto.email,
      phone: this.extractCheckoutMetadata(this.asRecord(dto.metadata))?.phone ?? null,
    });

    // 3. Generate a unique reference
    const reference = this.generateReference();

    this.logger.log(
      `Initializing ${provider} payment — ₦${dto.amount} — ref: ${reference} — email: ${dto.email}`
    );

    // 4. Delegate to the appropriate provider (NO DB record yet)
    let result: { authorizationUrl: string; reference: string; accessCode?: string };

    switch (provider) {
      case PaymentProvider.PAYSTACK: {
        const resp = await this.paystackService.initialize({
          email: dto.email,
          amount: dto.amount,
          currency: dto.currency ?? DEFAULT_CURRENCY,
          reference,
          callbackUrl: dto.callbackUrl ?? undefined,
          metadata: {
            orderId: dto.orderId ?? "",
            ...(dto.metadata ?? {}),
          },
        });
        result = {
          authorizationUrl: resp.authorization_url,
          reference: resp.reference,
          accessCode: resp.access_code,
        };
        break;
      }

      case PaymentProvider.STRIPE: {
        const resp = await this.stripeService.initialize({
          email: dto.email,
          amount: dto.amount,
          currency: dto.currency ?? DEFAULT_CURRENCY,
          orderId: dto.orderId ?? undefined,
          callbackUrl: dto.callbackUrl ?? undefined,
          metadata: {
            reference,
            ...(dto.metadata ?? {}),
          },
        });
        result = {
          authorizationUrl: resp.authorizationUrl,
          reference: resp.reference,
        };
        break;
      }

      case PaymentProvider.PAYPAL: {
        const resp = await this.paypalService.initialize({
          amount: dto.amount,
          currency: dto.currency ?? DEFAULT_CURRENCY,
          orderId: dto.orderId ?? undefined,
          callbackUrl: dto.callbackUrl ?? undefined,
          metadata: {
            reference,
            ...(dto.metadata ?? {}),
          },
        });
        result = {
          authorizationUrl: resp.authorizationUrl,
          reference: resp.reference,
        };
        break;
      }

      default:
        throw new BadRequestException(`Unsupported payment provider: ${provider}`);
    }

    this.logger.log(`${provider} session created — ref: ${result.reference} — redirecting user`);

    return {
      ...result,
      provider,
    };
  }

  /**
   * Verify a payment status by reference.
   * Fallback for when webhooks are delayed.
   *
   * First checks if a Payment record exists (webhook may have already
   * processed it). If not, verifies directly with the provider.
   */
  async verify(reference: string, providerHintRaw?: string) {
    // 1. Check if the webhook already created the Payment record
    const existing = await this.prisma.payment.findUnique({
      where: { providerRef: reference },
    });

    if (existing?.processedAt) {
      this.logger.log(`Payment ${reference} already processed — returning cached status`);
      const signupUrl = await this.resolveSignupUrlForReference(reference);
      let orderDetails: {
        orderNumber: string;
        packageName: string;
        amountPaid: string;
        addons: string[];
      } | null = null;
      try {
        orderDetails = await this.resolveOrderDetailsForPayment(existing.id);
      } catch (err) {
        this.logger.warn(`Failed to resolve order details for payment ${existing.id}: ${err}`);
      }
      return {
        status: existing.status === PaymentStatus.SUCCESS ? "success" : "failed",
        reference,
        amount: Number(existing.amount),
        currency: existing.currency,
        verified: existing.status === PaymentStatus.SUCCESS,
        signupUrl,
        awaitingWebhook: false,
        email: existing.payerEmail ?? null,
        orderNumber: orderDetails?.orderNumber ?? null,
        packageName: orderDetails?.packageName ?? null,
        amountPaid: orderDetails?.amountPaid ?? null,
        addons: orderDetails?.addons ?? [],
      };
    }

    let providerStatus = "pending";
    let verified = false;
    let amount: number | null = null;
    let currency: string | null = null;
    const providerHint = this.parseProviderHint(providerHintRaw);
    const providerToVerify = existing?.provider ?? providerHint;

    const verifyByProvider = async (provider: PaymentProvider) => {
      switch (provider) {
        case PaymentProvider.PAYSTACK: {
          const resp = await this.paystackService.verify(reference);
          providerStatus = resp.status;
          verified = resp.status === "success";
          amount = resp.amount / 100; // Paystack returns kobo
          currency = resp.currency ?? null;

          if (verified) {
            await this.createPaymentFromWebhook({
              provider: PaymentProvider.PAYSTACK,
              providerRef: reference,
              amount: amount ?? 0,
              currency: currency ?? DEFAULT_CURRENCY,
              payerEmail: resp.customer?.email ?? existing?.payerEmail ?? null,
              gatewayResponse: resp as unknown as Record<string, unknown>,
              metadata:
                (resp.metadata as Record<string, unknown> | null) ??
                this.asRecord(existing?.metadata) ??
                null,
            });
          }
          return true;
        }
        case PaymentProvider.STRIPE: {
          const resp = await this.stripeService.verify(reference);
          providerStatus = resp.paymentStatus;
          verified = resp.paymentStatus === "paid";
          amount = resp.amountTotal ? resp.amountTotal / 100 : null;
          currency = resp.currency?.toUpperCase() ?? null;

          if (verified) {
            await this.createPaymentFromWebhook({
              provider: PaymentProvider.STRIPE,
              providerRef: reference,
              amount: amount ?? 0,
              currency: currency ?? DEFAULT_CURRENCY,
              payerEmail: resp.customerEmail ?? existing?.payerEmail ?? null,
              gatewayResponse: resp as unknown as Record<string, unknown>,
              metadata:
                (resp.metadata as Record<string, unknown> | null) ??
                this.asRecord(existing?.metadata) ??
                null,
            });
          }
          return true;
        }
        case PaymentProvider.PAYPAL: {
          const resp = await this.paypalService.verify(reference);
          providerStatus = resp.status;
          verified = resp.status === "COMPLETED";
          amount = resp.amount ? Number(resp.amount) : null;
          currency = resp.currency?.toUpperCase() ?? null;

          if (verified && existing) {
            await this.createPaymentFromWebhook({
              provider: PaymentProvider.PAYPAL,
              providerRef: reference,
              amount: amount ?? 0,
              currency: currency ?? DEFAULT_CURRENCY,
              payerEmail: resp.payerEmail ?? existing.payerEmail ?? null,
              gatewayResponse: resp as unknown as Record<string, unknown>,
              metadata: this.asRecord(existing.metadata) ?? null,
            });
          }
          return true;
        }
        default:
          return false;
      }
    };

    // 2. Verify with specific provider if known, else try providers in order.
    if (providerToVerify) {
      await verifyByProvider(providerToVerify);
    } else {
      const providersToTry = [
        PaymentProvider.PAYSTACK,
        PaymentProvider.STRIPE,
        PaymentProvider.PAYPAL,
      ];
      let lastError: unknown = null;
      let verifiedByAny = false;

      for (const provider of providersToTry) {
        try {
          verifiedByAny = await verifyByProvider(provider);
          if (verifiedByAny) break;
        } catch (error) {
          lastError = error;
        }
      }

      if (!verifiedByAny) {
        throw new NotFoundException(
          `Payment with reference "${reference}" not found. It may not have been processed yet.`
        );
      }

      if (lastError && !verified) {
        // Keep last provider status if available; otherwise surface fallback status.
        providerStatus = providerStatus ?? "pending";
      }
    }

    this.logger.log(
      `Payment ${reference} verified — status: ${providerStatus}, verified: ${verified}`
    );

    const signupUrl = await this.resolveSignupUrlForReference(reference);

    // Look up order details for the enriched response
    const paymentForOrder = await this.prisma.payment.findUnique({
      where: { providerRef: reference },
      select: { id: true, payerEmail: true },
    });
    let orderDetails: {
      orderNumber: string;
      packageName: string;
      amountPaid: string;
      addons: string[];
    } | null = null;
    try {
      orderDetails = paymentForOrder
        ? await this.resolveOrderDetailsForPayment(paymentForOrder.id)
        : null;
    } catch (err) {
      this.logger.warn(`Failed to resolve order details for reference ${reference}: ${err}`);
    }

    return {
      status: providerStatus,
      reference,
      amount,
      currency,
      verified,
      signupUrl,
      awaitingWebhook: verified && !signupUrl,
      email: paymentForOrder?.payerEmail ?? null,
      orderNumber: orderDetails?.orderNumber ?? null,
      packageName: orderDetails?.packageName ?? null,
      amountPaid: orderDetails?.amountPaid ?? null,
      addons: orderDetails?.addons ?? [],
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
    // Check bank transfer gateway is enabled
    await this.ensureGatewayEnabled(PaymentProvider.BANK_TRANSFER);

    await this.assertCheckoutIdentityConflict({
      email: dto.payerEmail,
      phone: dto.payerPhone,
    });

    const reference = this.generateReference("bt");
    const checkoutMetadata = (dto.metadata as Record<string, unknown>) ?? {};
    const metadata: Record<string, unknown> = {
      ...checkoutMetadata,
      fullName: dto.payerName,
      phone: dto.payerPhone,
      payerEmail: dto.payerEmail,
      email: dto.payerEmail,
    };
    const locale = this.resolveLocale(this.extractCheckoutMetadata(metadata)?.locale);
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
        amount: dto.amount,
        currency: dto.currency ?? DEFAULT_CURRENCY,
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
      `Bank transfer submitted — ${dto.payerName} — ₦${dto.amount} — ref: ${reference}`
    );

    const orderSummary = await this.resolveBankTransferOrderSummary({
      reference,
      metadata,
    });

    await this.triggerBankTransferNotifications({
      paymentId: payment.id,
      reference,
      orderNumber: orderSummary.orderNumber,
      packageName: orderSummary.packageName,
      addons: orderSummary.addons,
      payerName: dto.payerName,
      payerEmail: dto.payerEmail,
      payerPhone: dto.payerPhone,
      amount: dto.amount,
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

    const checkout = this.extractCheckoutMetadata(params.metadata);
    if (!checkout) return fallback;

    let packageName =
      this.asString(checkout.packageName) || this.asString(checkout.tier) || fallback.packageName;

    const namedAddons = (checkout.addons ?? [])
      .map((addon) => this.asString(addon.name))
      .filter((name): name is string => Boolean(name));

    if (namedAddons.length > 0 && packageName !== fallback.packageName) {
      return {
        orderNumber: params.reference,
        packageName,
        addons: namedAddons,
      };
    }

    if (packageName === fallback.packageName) {
      const pkg = await this.resolvePackageFromCheckoutMetadata(checkout);
      if (pkg?.name) packageName = pkg.name;
    }

    const addons =
      namedAddons.length > 0
        ? namedAddons
        : await this.resolveAddonNamesFromMetadata(this.prisma, checkout);

    return {
      orderNumber: params.reference,
      packageName,
      addons,
    };
  }

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
    const items = this.sortAdminPaymentItems(
      rows.map((row) => this.serializeAdminPaymentListItem(row)),
      "createdAt",
      "asc"
    ).map((item) => ({
      ...item,
      provider: PaymentProvider.BANK_TRANSFER,
      status: PaymentStatus.AWAITING_APPROVAL,
      slaSnapshot: this.buildPendingBankTransferSlaSnapshot(item.createdAt),
    })) as AdminPendingBankTransferItem[];

    return {
      items,
      totalItems: items.length,
      refreshedAt: new Date().toISOString(),
    };
  }

  async listPendingBankTransfers(): Promise<AdminPendingBankTransfersResponse> {
    return this.listAdminPendingBankTransfers();
  }

  async approveBankTransfer(params: { paymentId: string; adminId: string; adminNote?: string }) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: params.paymentId },
      select: {
        id: true,
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

    const normalizedAdminNote = params.adminNote?.trim() || null;
    const signupInfo = await this.ensureBankTransferApprovalSignupInfo({
      paymentId: payment.id,
      payerEmail: payment.payerEmail,
      payerName: payment.payerName,
      amount: Number(payment.amount),
      currency: payment.currency,
      metadata: this.asRecord(payment.metadata),
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

    if (signupInfo?.signupToken) {
      const delivery = await this.signupNotificationsService.sendRegistrationLink({
        email: signupInfo.email,
        name: signupInfo.name,
        locale: signupInfo.locale,
        token: signupInfo.signupToken,
        phoneNumber: signupInfo.phone,
        fromEmail: this.paymentsFromEmail,
        orderNumber: signupInfo.orderNumber,
        packageName: signupInfo.packageName,
        amountPaid: signupInfo.amountPaid,
        addons: signupInfo.addons,
      });

      if (!delivery.emailDelivered && !delivery.whatsappDelivered) {
        this.logger.warn(`Signup link delivery failed for approved bank transfer ${payment.id}`);
      }
    }

    return {
      id: payment.id,
      status: PaymentStatus.SUCCESS,
      message: "Bank transfer approved successfully.",
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
    const checkout = this.extractCheckoutMetadata(this.asRecord(payment.metadata));
    const orderNumber =
      payment.order?.orderNumber?.trim() || payment.providerRef?.trim() || payment.id;
    const reference = payment.providerRef?.trim() || payment.id;
    const recipientEmail =
      payment.payerEmail?.trim().toLowerCase() || payment.user?.email?.trim().toLowerCase() || null;
    const linkedUserName = payment.user
      ? `${payment.user.firstName} ${payment.user.lastName ?? ""}`.trim()
      : "";
    const userName = recipientEmail
      ? this.pickDisplayName(
          payment.payerName?.trim() || checkout?.fullName?.trim() || linkedUserName || undefined,
          recipientEmail
        )
      : payment.payerName?.trim() || checkout?.fullName?.trim() || linkedUserName || "Author";
    const locale = this.resolveLocale(checkout?.locale ?? payment.user?.preferredLanguage);
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
      const emailSent = await this.sendBankTransferRejectedEmail({
        email: recipientEmail,
        userName,
        locale,
        orderNumber,
        paymentReference: reference,
        rejectionReason,
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

  /**
   * Pay for extra pages (billing gate).
   * Authenticated endpoint — requires userId.
   */
  async payExtraPages(params: {
    bookId: string;
    provider: string;
    extraPages: number;
    callbackUrl?: string;
    userId: string;
  }) {
    const provider = params.provider.toUpperCase() as PaymentProvider;
    await this.ensureGatewayEnabled(provider);
    this.ensureProviderAvailable(provider);

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

    // Create payment record
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

    // Delegate to provider
    return this.delegateInitialize(provider, {
      email: book.user.email,
      amount,
      reference,
      callbackUrl: params.callbackUrl,
      paymentId: payment.id,
      orderId: book.orderId,
    });
  }

  /**
   * Pay for a reprint order.
   * Authenticated endpoint — requires userId.
   */
  async payReprint(params: {
    sourceBookId: string;
    copies: number;
    bookSize: string;
    paperColor: string;
    lamination: string;
    provider: string;
    callbackUrl?: string;
    userId: string;
  }) {
    const provider = params.provider.toUpperCase() as PaymentProvider;

    if (provider !== PaymentProvider.PAYSTACK && provider !== PaymentProvider.STRIPE) {
      throw new BadRequestException("Reprint payments currently support Paystack and Stripe only.");
    }

    await this.ensureGatewayEnabled(provider);
    this.ensureProviderAvailable(provider);

    const sourceBook = await this.prisma.book.findFirst({
      where: {
        id: params.sourceBookId,
        userId: params.userId,
      },
      select: {
        id: true,
        orderId: true,
        status: true,
        pageCount: true,
        finalPdfUrl: true,
        user: {
          select: {
            email: true,
          },
        },
      },
    });

    if (!sourceBook) {
      throw new NotFoundException(`Book "${params.sourceBookId}" not found`);
    }

    if (!REPRINT_ELIGIBLE_BOOK_STATUSES.has(sourceBook.status)) {
      throw new BadRequestException(
        "Only delivered books can start a same-file reprint from the dashboard."
      );
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
      throw new BadRequestException("Minimum 25 copies required for reprints.");
    }

    if (!REPRINT_ALLOWED_BOOK_SIZES.has(params.bookSize)) {
      throw new BadRequestException("Unsupported book size for same-file reprint.");
    }

    if (!REPRINT_ALLOWED_PAPER_COLORS.has(params.paperColor)) {
      throw new BadRequestException("Unsupported paper color for same-file reprint.");
    }

    if (!REPRINT_ALLOWED_LAMINATIONS.has(params.lamination)) {
      throw new BadRequestException("Unsupported lamination for same-file reprint.");
    }

    const configuredA5Cost = await this.resolveConfiguredReprintCostPerPage();
    const unitCostPerPage = this.resolveReprintCostPerPage(params.bookSize, configuredA5Cost);
    const amount = this.toCurrency(params.copies * sourceBook.pageCount * unitCostPerPage);
    const reference = this.generateReference("rp");

    const payment = await this.prisma.payment.create({
      data: {
        provider,
        type: PaymentType.REPRINT,
        amount,
        currency: DEFAULT_CURRENCY,
        status: PaymentStatus.PENDING,
        providerRef: reference,
        userId: params.userId,
        payerEmail: sourceBook.user.email,
        metadata: {
          sourceBookId: sourceBook.id,
          sourceOrderId: sourceBook.orderId,
          orderType: "REPRINT_SAME",
          copies: params.copies,
          bookSize: params.bookSize,
          paperColor: params.paperColor,
          lamination: params.lamination,
          pageCount: sourceBook.pageCount,
          unitCostPerPage,
          finalPdfUrl: sourceBook.finalPdfUrl,
        },
      } as Prisma.PaymentUncheckedCreateInput,
    });

    return this.delegateInitialize(provider, {
      email: sourceBook.user.email,
      amount,
      reference,
      callbackUrl: params.callbackUrl,
      paymentId: payment.id,
    });
  }

  // ────────────────────────────────────────────
  // Webhook signature verification (public API for controller)
  // ────────────────────────────────────────────

  /**
   * Verify a Paystack webhook signature.
   * Delegated from controller to avoid private access via bracket notation.
   */
  verifyPaystackSignature(rawBody: string | Buffer, signature: string): boolean {
    return this.paystackService.verifyWebhookSignature(rawBody, signature);
  }

  /**
   * Verify a Stripe webhook signature.
   * Delegated from controller to avoid private access via bracket notation.
   */
  verifyStripeSignature(rawBody: string | Buffer, signature: string) {
    return this.stripeService.verifyWebhookSignature(rawBody, signature);
  }

  // ────────────────────────────────────────────
  // Webhook handlers
  // ────────────────────────────────────────────

  /**
   * Handle Paystack webhook.
   * See CLAUDE.md Section 11 — webhook idempotency.
   *
   * Per the payment flow diagram:
   *   1. Check providerRef exists → if processedAt set → 200, skip
   *   2. Verify signature (done in controller)
   *   3. Create User, Order, Payment record
   */
  async handlePaystackWebhook(payload: PaystackWebhookPayload) {
    const reference = payload.data.reference;

    // 1. Idempotency check
    if (await this.isAlreadyProcessed(reference)) {
      this.logger.log(`Paystack webhook for ${reference} already processed — skipping`);
      return { status: "ok", message: "Already processed" };
    }

    // 2. Process based on event
    if (payload.event === "charge.success" && payload.data.status === "success") {
      await this.createPaymentFromWebhook({
        provider: PaymentProvider.PAYSTACK,
        providerRef: reference,
        amount: payload.data.amount / 100, // Paystack sends kobo
        currency: payload.data.currency ?? DEFAULT_CURRENCY,
        payerEmail: payload.data.customer?.email ?? null,
        gatewayResponse: payload.data as unknown as Record<string, unknown>,
        metadata: (payload.data.metadata as Record<string, unknown>) ?? null,
      });
      this.logger.log(`Paystack payment succeeded: ${reference}`);
    } else {
      this.logger.warn(
        `Paystack webhook event not handled: ${payload.event} — status: ${payload.data.status}`
      );
    }

    return { status: "ok" };
  }

  /**
   * Handle Stripe webhook.
   * See CLAUDE.md Section 11 — webhook idempotency.
   */
  async handleStripeWebhook(event: { type: string; data: { object: Record<string, unknown> } }) {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const sessionId = session.id as string;

      // 1. Idempotency check
      if (await this.isAlreadyProcessed(sessionId)) {
        this.logger.log(`Stripe webhook for ${sessionId} already processed — skipping`);
        return { status: "ok", message: "Already processed" };
      }

      // 2. Create payment record if paid
      if (session.payment_status === "paid") {
        const amountTotal = session.amount_total as number;
        await this.createPaymentFromWebhook({
          provider: PaymentProvider.STRIPE,
          providerRef: sessionId,
          amount: amountTotal ? amountTotal / 100 : 0,
          currency: (session.currency as string)?.toUpperCase() ?? DEFAULT_CURRENCY,
          payerEmail: (session.customer_email as string) ?? null,
          gatewayResponse: session as unknown as Record<string, unknown>,
          metadata: (session.metadata as Record<string, unknown>) ?? null,
        });
        this.logger.log(`Stripe payment succeeded: ${sessionId}`);
      }
    } else {
      this.logger.log(`Stripe webhook event not handled: ${event.type}`);
    }

    return { status: "ok" };
  }

  // ────────────────────────────────────────────
  // Private helpers
  // ────────────────────────────────────────────

  /**
   * Check if a webhook has already been processed (idempotency guard).
   * Returns true if the payment exists and `processedAt` is set.
   */
  private async isAlreadyProcessed(providerRef: string): Promise<boolean> {
    const payment = await this.prisma.payment.findUnique({
      where: { providerRef },
      select: { processedAt: true },
    });
    return payment?.processedAt !== null && payment?.processedAt !== undefined;
  }

  /**
   * Create a Payment record from a verified webhook.
   * Called by handlePaystackWebhook / handleStripeWebhook after
   * signature verification and idempotency check pass.
   *
   * For initial checkout payments this creates/links:
   *   Payment → User (pending) → Order → Book
   * and sends a signup link email as a network fallback.
   *
   * For pre-created payments this updates the existing pending record to
   * SUCCESS, then runs any follow-up fulfillment required for that payment type.
   */
  private async createPaymentFromWebhook(data: {
    provider: PaymentProvider;
    providerRef: string;
    amount: number;
    currency: string;
    payerEmail: string | null;
    gatewayResponse: Record<string, unknown>;
    metadata: Record<string, unknown> | null;
  }) {
    const metadata = this.normalizeWebhookMetadata(data.metadata);

    const existingPayment = await this.prisma.payment.findUnique({
      where: { providerRef: data.providerRef },
      select: {
        id: true,
        type: true,
        userId: true,
        orderId: true,
        processedAt: true,
        metadata: true,
        payerEmail: true,
      },
    });

    if (existingPayment) {
      if (existingPayment.processedAt) {
        this.logger.log(`Payment ${data.providerRef} already processed — skipping`);
        return;
      }

      const persistedMetadata = this.asRecord(existingPayment.metadata);
      const mergedMetadata =
        persistedMetadata || metadata
          ? { ...(persistedMetadata ?? {}), ...(metadata ?? {}) }
          : null;

      // Atomic claim: only update if processedAt is still null.
      // This prevents a race between the webhook handler and the
      // verify-polling endpoint both calling createPaymentFromWebhook
      // concurrently — only the first caller's update will match.
      const claimed = await this.prisma.payment.updateMany({
        where: { id: existingPayment.id, processedAt: null },
        data: {
          status: PaymentStatus.SUCCESS,
          processedAt: new Date(),
          amount: data.amount,
          currency: data.currency,
          payerEmail: data.payerEmail ?? existingPayment.payerEmail,
          gatewayResponse: data.gatewayResponse as Prisma.InputJsonValue,
          metadata: (mergedMetadata ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });

      if (claimed.count === 0) {
        this.logger.log(`Payment ${data.providerRef} claimed by another process — skipping`);
        return;
      }

      const shouldCreateReprintEntities =
        existingPayment.type === PaymentType.REPRINT && !existingPayment.orderId;

      if (shouldCreateReprintEntities) {
        const reprintResult = await this.createReprintEntitiesFromMetadata({
          paymentId: existingPayment.id,
          userId: existingPayment.userId,
          payerEmail: data.payerEmail ?? existingPayment.payerEmail,
          metadata: mergedMetadata,
          amount: data.amount,
          currency: data.currency,
        });

        if (reprintResult) {
          await this.sendOnlinePaymentAdminEmail({
            orderNumber: reprintResult.orderNumber,
            packageName: reprintResult.packageName,
            amountPaid: reprintResult.amountPaid,
            addons: reprintResult.addons,
            payerEmail: reprintResult.email,
            provider: data.provider,
            reference: data.providerRef,
          });
        }
        return;
      }

      const shouldCreateCheckoutEntities =
        existingPayment.type === PaymentType.INITIAL &&
        (!existingPayment.userId || !existingPayment.orderId);

      if (!shouldCreateCheckoutEntities) {
        if (existingPayment.type === PaymentType.EXTRA_PAGES && existingPayment.orderId) {
          await this.reconcileExtraPagesBillingGate(existingPayment.orderId);
        }
        return;
      }

      const checkoutResult = await this.createCheckoutEntitiesFromMetadata({
        paymentId: existingPayment.id,
        payerEmail: data.payerEmail ?? existingPayment.payerEmail,
        metadata: mergedMetadata,
        amount: data.amount,
        currency: data.currency,
      });

      if (checkoutResult) {
        await this.sendOnlinePaymentAdminEmail({
          orderNumber: checkoutResult.orderNumber,
          packageName: checkoutResult.packageName,
          amountPaid: checkoutResult.amountPaid,
          addons: checkoutResult.addons,
          payerEmail: checkoutResult.email,
          provider: data.provider,
          reference: data.providerRef,
        });
      }

      if (checkoutResult?.signupToken) {
        const delivery = await this.signupNotificationsService.sendRegistrationLink({
          email: checkoutResult.email,
          locale: checkoutResult.locale,
          name: checkoutResult.name,
          token: checkoutResult.signupToken,
          phoneNumber: checkoutResult.phone,
          fromEmail: this.paymentsFromEmail,
          orderNumber: checkoutResult.orderNumber,
          packageName: checkoutResult.packageName,
          amountPaid: checkoutResult.amountPaid,
          addons: checkoutResult.addons,
        });

        if (!delivery.emailDelivered && !delivery.whatsappDelivered) {
          this.logger.warn(`Signup link delivery failed for payment ${data.providerRef}`);
        }
      }
      return;
    }

    // No existing payment record — create one. The unique constraint on
    // providerRef means if two concurrent callers race here, only one
    // will succeed; the other will throw a unique constraint error which
    // we catch and treat as "already processed".
    let payment: { id: string };
    try {
      payment = await this.prisma.payment.create({
        data: {
          provider: data.provider,
          type: PaymentType.INITIAL,
          amount: data.amount,
          currency: data.currency,
          status: PaymentStatus.SUCCESS,
          providerRef: data.providerRef,
          processedAt: new Date(),
          payerEmail: data.payerEmail,
          gatewayResponse: data.gatewayResponse,
          metadata: metadata ?? undefined,
        } as Prisma.PaymentUncheckedCreateInput,
      });
    } catch (error) {
      // Prisma unique constraint violation (P2002) means another process
      // already created this payment — safe to skip.
      if (this.isPrismaUniqueViolation(error)) {
        this.logger.log(
          `Payment ${data.providerRef} already created by another process — skipping`
        );
        return;
      }
      throw error;
    }

    const checkoutResult = await this.createCheckoutEntitiesFromMetadata({
      paymentId: payment.id,
      payerEmail: data.payerEmail,
      metadata,
      amount: data.amount,
      currency: data.currency,
    });

    if (checkoutResult) {
      await this.sendOnlinePaymentAdminEmail({
        orderNumber: checkoutResult.orderNumber,
        packageName: checkoutResult.packageName,
        amountPaid: checkoutResult.amountPaid,
        addons: checkoutResult.addons,
        payerEmail: checkoutResult.email,
        provider: data.provider,
        reference: data.providerRef,
      });
    }

    if (checkoutResult?.signupToken) {
      const delivery = await this.signupNotificationsService.sendRegistrationLink({
        email: checkoutResult.email,
        locale: checkoutResult.locale,
        name: checkoutResult.name,
        token: checkoutResult.signupToken,
        phoneNumber: checkoutResult.phone,
        fromEmail: this.paymentsFromEmail,
        orderNumber: checkoutResult.orderNumber,
        packageName: checkoutResult.packageName,
        amountPaid: checkoutResult.amountPaid,
        addons: checkoutResult.addons,
      });

      if (!delivery.emailDelivered && !delivery.whatsappDelivered) {
        this.logger.warn(`Signup link delivery failed for payment ${data.providerRef}`);
      }
    }
  }

  private normalizeWebhookMetadata(
    metadata: Record<string, unknown> | null
  ): Record<string, unknown> | null {
    if (!metadata || typeof metadata !== "object") return null;
    return metadata;
  }

  private async reconcileExtraPagesBillingGate(orderId: string): Promise<void> {
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

  private async ensureBankTransferApprovalSignupInfo(params: {
    paymentId: string;
    payerEmail: string | null;
    payerName: string | null;
    amount: number;
    currency: string;
    metadata: Record<string, unknown> | null;
    userId: string | null;
    orderId: string | null;
  }): Promise<CheckoutFinalizationInfo | null> {
    let resolvedUserId = params.userId;
    let resolvedOrderId = params.orderId;

    if (resolvedOrderId && !resolvedUserId) {
      const existingOrder = await this.prisma.order.findUnique({
        where: { id: resolvedOrderId },
        select: { userId: true },
      });

      if (existingOrder?.userId) {
        resolvedUserId = existingOrder.userId;
      } else {
        resolvedOrderId = null;
      }
    }

    if (resolvedUserId && resolvedOrderId) {
      const linkedCheckout = await this.buildCheckoutFinalizationInfoForLinkedPayment({
        paymentId: params.paymentId,
        userId: resolvedUserId,
        orderId: resolvedOrderId,
        payerEmail: params.payerEmail,
        payerName: params.payerName,
        metadata: params.metadata,
      });

      if (linkedCheckout) {
        return linkedCheckout;
      }

      resolvedOrderId = null;
    }

    return this.createCheckoutEntitiesFromMetadata({
      paymentId: params.paymentId,
      payerEmail: params.payerEmail,
      metadata: params.metadata,
      amount: params.amount,
      currency: params.currency,
      existingUserId: resolvedUserId,
    });
  }

  private async buildCheckoutFinalizationInfoForLinkedPayment(params: {
    paymentId: string;
    userId: string;
    orderId: string;
    payerEmail: string | null;
    payerName: string | null;
    metadata: Record<string, unknown> | null;
  }): Promise<CheckoutFinalizationInfo | null> {
    const checkout = this.extractCheckoutMetadata(params.metadata);
    const signupTokenExpiry = new Date(Date.now() + MAX_SIGNUP_TOKEN_HOURS * 60 * 60 * 1000);

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: params.orderId },
        select: {
          id: true,
          userId: true,
          orderNumber: true,
          totalAmount: true,
          currency: true,
          package: {
            select: {
              name: true,
            },
          },
          addons: {
            select: {
              addon: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      });

      if (!order) return null;

      let user = await tx.user.findUnique({
        where: { id: params.userId },
      });

      if (!user) return null;

      if (order.userId !== user.id) {
        throw new ConflictException("Payment is linked to a mismatched checkout owner.");
      }

      const locale = this.resolveLocale(checkout?.locale ?? user.preferredLanguage);
      const displayEmail = params.payerEmail?.trim().toLowerCase() || user.email;
      const fullName = this.pickDisplayName(
        checkout?.fullName || params.payerName || `${user.firstName} ${user.lastName ?? ""}`.trim(),
        displayEmail
      );
      const splitName = this.splitFullName(fullName);
      const normalizedPhone = checkout?.phone?.trim() || user.phoneNumber || null;
      const normalizedPhoneLookup = normalizePhoneNumber(normalizedPhone);
      const needsSignupToken = !user.password || !user.isVerified;
      let signupToken: string | null = null;

      if (needsSignupToken) {
        signupToken = this.generateSecureToken();
      }

      user = await tx.user.update({
        where: { id: user.id },
        data: {
          firstName: user.firstName || splitName.firstName,
          lastName: user.lastName ?? splitName.lastName,
          phoneNumber: user.phoneNumber || normalizedPhone,
          phoneNumberNormalized: user.phoneNumberNormalized || normalizedPhoneLookup,
          preferredLanguage: locale,
          ...(needsSignupToken
            ? {
                verificationToken: signupToken,
                tokenExpiry: signupTokenExpiry,
              }
            : {}),
        },
      });

      await tx.payment.update({
        where: { id: params.paymentId },
        data: {
          userId: user.id,
          orderId: order.id,
        },
      });

      return {
        userId: user.id,
        orderId: order.id,
        email: user.email,
        name: user.firstName,
        locale: this.resolveLocale(user.preferredLanguage),
        signupToken,
        phone: user.phoneNumber ?? null,
        orderNumber: order.orderNumber,
        packageName: order.package.name,
        amountPaid: this.formatNaira(Number(order.totalAmount)),
        addons: order.addons
          .map((entry) => entry.addon.name)
          .filter((value): value is string => value.trim().length > 0),
      };
    });
  }

  private async createCheckoutEntitiesFromMetadata(params: {
    paymentId: string;
    payerEmail: string | null;
    metadata: Record<string, unknown> | null;
    amount: number;
    currency: string;
    existingUserId?: string | null;
  }): Promise<CheckoutFinalizationInfo | null> {
    if (!params.payerEmail && !params.existingUserId) return null;

    const checkout = this.extractCheckoutMetadata(params.metadata);
    if (!checkout) return null;

    const pkg = await this.resolvePackageFromCheckoutMetadata(checkout);
    if (!pkg) {
      this.logger.warn(
        `Webhook payment ${params.paymentId}: package could not be resolved from metadata, skipping order creation`
      );
      return null;
    }

    const locale = this.resolveLocale(checkout.locale);
    const normalizedPhone = checkout.phone?.trim() || null;
    const normalizedPhoneLookup = normalizePhoneNumber(normalizedPhone);
    const signupTokenExpiry = new Date(Date.now() + MAX_SIGNUP_TOKEN_HOURS * 60 * 60 * 1000);

    try {
      return await this.prisma.$transaction(async (tx) => {
        let user = params.existingUserId
          ? await tx.user.findUnique({
              where: { id: params.existingUserId },
            })
          : null;

        const normalizedEmail =
          user?.email?.trim().toLowerCase() || params.payerEmail?.trim().toLowerCase();
        if (!normalizedEmail) return null;

        await this.assertCheckoutIdentityConflict({
          email: normalizedEmail,
          phone: normalizedPhone,
          tx,
        });

        if (!user) {
          user = await tx.user.findFirst({
            where: {
              email: {
                equals: normalizedEmail,
                mode: "insensitive",
              },
            },
          });
        }

        const fullName = this.pickDisplayName(
          checkout.fullName ||
            [user?.firstName, user?.lastName]
              .filter((value): value is string => Boolean(value))
              .join(" ") ||
            undefined,
          normalizedEmail
        );
        const splitName = this.splitFullName(fullName);

        let signupToken: string | null = null;

        if (!user) {
          signupToken = this.generateSecureToken();
          user = await tx.user.create({
            data: {
              email: normalizedEmail,
              firstName: splitName.firstName,
              lastName: splitName.lastName,
              phoneNumber: normalizedPhone,
              phoneNumberNormalized: normalizedPhoneLookup,
              preferredLanguage: locale,
              isVerified: false,
              verificationToken: signupToken,
              tokenExpiry: signupTokenExpiry,
            },
          });
        } else {
          const needsSignupToken = !user.password || !user.isVerified;
          if (needsSignupToken) {
            signupToken = this.generateSecureToken();
          }

          user = await tx.user.update({
            where: { id: user.id },
            data: {
              firstName: user.firstName || splitName.firstName,
              lastName: user.lastName ?? splitName.lastName,
              phoneNumber: user.phoneNumber || normalizedPhone,
              phoneNumberNormalized: user.phoneNumberNormalized || normalizedPhoneLookup,
              preferredLanguage: locale,
              ...(needsSignupToken
                ? {
                    verificationToken: signupToken,
                    tokenExpiry: signupTokenExpiry,
                  }
                : {}),
            },
          });
        }

        const orderNumber = await this.generateOrderNumber(tx);
        const totalAmount = this.toCurrency(checkout.totalPrice ?? params.amount);
        const initialAmount = this.toCurrency(params.amount);
        const appliedCoupon = await this.resolveAppliedCouponForOrder(tx, checkout, initialAmount);
        const discountAmount = appliedCoupon?.discountAmount ?? 0;

        const order = await tx.order.create({
          data: {
            orderNumber,
            userId: user.id,
            packageId: pkg.id,
            orderType: "STANDARD",
            packagePriceSnap: Number(pkg.basePrice),
            hasCoverDesign: checkout.hasCover ?? true,
            hasFormatting: checkout.hasFormatting ?? true,
            bookSize: checkout.bookSize ?? "A5",
            paperColor: checkout.paperColor ?? "white",
            lamination: checkout.lamination ?? "gloss",
            status: OrderStatus.PAID,
            initialAmount,
            extraAmount: 0,
            couponId: appliedCoupon?.id ?? null,
            discountAmount,
            totalAmount: Math.max(totalAmount, initialAmount),
            currency: (params.currency || DEFAULT_CURRENCY).toUpperCase(),
          } as Prisma.OrderUncheckedCreateInput,
        });

        await this.createOrderAddonsFromMetadata(tx, order.id, checkout);

        // Resolve addon names for confirmation display
        const addonNames = await this.resolveAddonNamesFromMetadata(tx, checkout);

        const book = await tx.book.create({
          data: {
            orderId: order.id,
            userId: user.id,
            status: BookStatus.PAYMENT_RECEIVED,
            productionStatus: BookStatus.PAYMENT_RECEIVED,
            productionStatusUpdatedAt: new Date(),
            pageSize: checkout.bookSize ?? "A5",
          },
        });

        await tx.auditLog.createMany({
          data: [
            {
              userId: user.id,
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
              userId: user.id,
              action: "ORDER_STATUS_REACHED",
              entityType: "ORDER_TRACKING",
              entityId: order.id,
              details: {
                source: "book",
                status: BookStatus.PAYMENT_RECEIVED,
                reachedAt: book.createdAt.toISOString(),
                label: "Payment Received",
              },
            },
          ],
        });

        await tx.payment.update({
          where: { id: params.paymentId },
          data: {
            userId: user.id,
            orderId: order.id,
          },
        });

        await this.notificationsService.createOrderStatusNotification(
          {
            userId: user.id,
            orderId: order.id,
            orderNumber,
            status: OrderStatus.PAID,
            source: "order",
            bookId: book.id,
          },
          tx
        );

        return {
          userId: user.id,
          orderId: order.id,
          email: user.email,
          name: user.firstName,
          locale: this.resolveLocale(user.preferredLanguage),
          signupToken,
          phone: user.phoneNumber ?? null,
          orderNumber,
          packageName: pkg.name,
          amountPaid: this.formatNaira(params.amount),
          addons: addonNames,
        };
      });
    } catch (error) {
      if (this.isPrismaUniqueViolationForField(error, "phoneNumberNormalized")) {
        throw new ConflictException(PHONE_ALREADY_IN_USE_MESSAGE);
      }

      throw error;
    }
  }

  private async assertCheckoutIdentityConflict(params: {
    email: string;
    phone: string | null;
    tx?: Prisma.TransactionClient | PrismaService;
    allowUserId?: string | null;
  }): Promise<void> {
    const normalizedEmail = params.email.trim().toLowerCase();
    const normalizedPhone = normalizePhoneNumber(params.phone);

    if (!normalizedEmail || !normalizedPhone) {
      return;
    }

    const db = params.tx ?? this.prisma;
    const [emailUser, phoneUsers] = await Promise.all([
      db.user.findFirst({
        where: {
          email: {
            equals: normalizedEmail,
            mode: "insensitive",
          },
        },
        select: {
          id: true,
          email: true,
        },
      }),
      db.user.findMany({
        where: {
          phoneNumberNormalized: normalizedPhone,
        },
        select: {
          id: true,
          email: true,
        },
        take: 3,
      }),
    ]);

    const emailOwnerId = emailUser && emailUser.id !== params.allowUserId ? emailUser.id : null;
    const conflictingPhoneUsers = phoneUsers.filter((user) => user.id !== params.allowUserId);

    if (conflictingPhoneUsers.length === 0) {
      return;
    }

    if (emailOwnerId && conflictingPhoneUsers.every((user) => user.id === emailOwnerId)) {
      return;
    }

    if (emailOwnerId) {
      throw new ConflictException(EMAIL_PHONE_IDENTITY_CONFLICT_MESSAGE);
    }

    throw new ConflictException(PHONE_ALREADY_IN_USE_MESSAGE);
  }

  private async createReprintEntitiesFromMetadata(params: {
    paymentId: string;
    userId: string | null;
    payerEmail: string | null;
    metadata: Record<string, unknown> | null;
    amount: number;
    currency: string;
  }): Promise<{
    email: string;
    orderNumber: string;
    packageName: string;
    amountPaid: string;
    addons: string[];
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
          user: {
            select: {
              email: true,
            },
          },
          order: {
            select: {
              id: true,
              packageId: true,
              packagePriceSnap: true,
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

      const orderNumber = await this.generateOrderNumber(tx);
      const amount = this.toCurrency(params.amount);
      const now = new Date();

      const order = await tx.order.create({
        data: {
          orderNumber,
          userId: sourceBook.userId,
          packageId: sourceBook.order.packageId,
          orderType: OrderType.REPRINT_SAME,
          originalBookId: sourceBook.id,
          skipFormatting: true,
          copies: reprint.copies,
          packagePriceSnap: Number(sourceBook.order.packagePriceSnap),
          hasCoverDesign: false,
          hasFormatting: false,
          bookSize: reprint.bookSize,
          paperColor: reprint.paperColor,
          lamination: reprint.lamination,
          status: OrderStatus.IN_PRODUCTION,
          initialAmount: amount,
          extraAmount: 0,
          discountAmount: 0,
          totalAmount: amount,
          currency: (params.currency || DEFAULT_CURRENCY).toUpperCase(),
        } as Prisma.OrderUncheckedCreateInput,
      });

      const book = await tx.book.create({
        data: {
          orderId: order.id,
          userId: sourceBook.userId,
          status: BookStatus.IN_PRODUCTION,
          productionStatus: BookStatus.IN_PRODUCTION,
          productionStatusUpdatedAt: now,
          title: sourceBook.title,
          coverImageUrl: sourceBook.coverImageUrl,
          pageCount,
          wordCount: sourceBook.wordCount,
          estimatedPages: sourceBook.estimatedPages,
          fontFamily: sourceBook.fontFamily,
          fontSize: sourceBook.fontSize,
          pageSize: reprint.bookSize,
          finalPdfUrl,
        },
      });

      await tx.auditLog.createMany({
        data: [
          {
            userId: sourceBook.userId,
            action: "ORDER_STATUS_REACHED",
            entityType: "ORDER_TRACKING",
            entityId: order.id,
            details: {
              source: "order",
              status: OrderStatus.IN_PRODUCTION,
              reachedAt: order.createdAt.toISOString(),
              label: "In Production",
            },
          },
          {
            userId: sourceBook.userId,
            action: "ORDER_STATUS_REACHED",
            entityType: "ORDER_TRACKING",
            entityId: order.id,
            details: {
              source: "book",
              status: BookStatus.IN_PRODUCTION,
              reachedAt: book.createdAt.toISOString(),
              label: "In Production",
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
          status: OrderStatus.IN_PRODUCTION,
          source: "order",
          bookId: book.id,
        },
        tx
      );

      return {
        email: params.payerEmail ?? sourceBook.user.email,
        orderNumber,
        packageName: sourceBook.order.package.name,
        amountPaid: this.formatNaira(params.amount),
        addons: [],
      };
    });
  }

  private async createOrderAddonsFromMetadata(
    tx: Prisma.TransactionClient,
    orderId: string,
    checkout: CheckoutMetadata
  ): Promise<void> {
    const addonInputs = checkout.addons ?? [];
    if (addonInputs.length === 0) return;

    const addonIds = addonInputs
      .map((addon) => this.asString(addon.id))
      .filter((value): value is string => Boolean(value));
    const addonSlugs = addonInputs
      .map((addon) => this.asString(addon.slug))
      .filter((value): value is string => Boolean(value));

    if (addonIds.length === 0 && addonSlugs.length === 0) return;

    const addons = await tx.addon.findMany({
      where: {
        OR: [{ id: { in: addonIds } }, { slug: { in: addonSlugs } }],
      },
      select: {
        id: true,
        slug: true,
        pricingType: true,
      },
    });

    const addonById = new Map(addons.map((addon) => [addon.id, addon]));
    const addonBySlug = new Map(addons.map((addon) => [addon.slug, addon]));

    const rows: Prisma.OrderAddonCreateManyInput[] = [];
    for (const addonInput of addonInputs) {
      const addonId = this.asString(addonInput.id);
      const addonSlug = this.asString(addonInput.slug);
      const resolvedAddon =
        (addonId ? addonById.get(addonId) : undefined) ||
        (addonSlug ? addonBySlug.get(addonSlug) : undefined);

      if (!resolvedAddon) continue;

      const price = this.toCurrency(this.asNumber(addonInput.price) ?? 0);
      if (price <= 0) continue;

      rows.push({
        orderId,
        addonId: resolvedAddon.id,
        priceSnap: price,
        wordCount:
          resolvedAddon.pricingType === "per_word" ? (checkout.formattingWordCount ?? null) : null,
      });
    }

    if (rows.length > 0) {
      await tx.orderAddon.createMany({
        data: rows,
        skipDuplicates: true,
      });
    }
  }

  /**
   * Resolves addon names from checkout metadata (used for confirmation email/page).
   */
  private async resolveAddonNamesFromMetadata(
    tx: Pick<Prisma.TransactionClient, "addon">,
    checkout: CheckoutMetadata
  ): Promise<string[]> {
    const addonInputs = checkout.addons ?? [];
    if (addonInputs.length === 0) return [];

    const addonIds = addonInputs
      .map((addon) => this.asString(addon.id))
      .filter((value): value is string => Boolean(value));
    const addonSlugs = addonInputs
      .map((addon) => this.asString(addon.slug))
      .filter((value): value is string => Boolean(value));

    if (addonIds.length === 0 && addonSlugs.length === 0) return [];

    const addons = await tx.addon.findMany({
      where: {
        OR: [{ id: { in: addonIds } }, { slug: { in: addonSlugs } }],
      },
      select: { name: true },
    });

    return addons.map((a) => a.name).filter(Boolean);
  }

  private async resolvePackageFromCheckoutMetadata(checkout: CheckoutMetadata) {
    const packageId = this.asString(checkout.packageId);
    if (packageId) {
      const byId = await this.prisma.package.findFirst({
        where: {
          id: packageId,
          isActive: true,
          category: { isActive: true },
        },
      });
      if (byId) return byId;
    }

    const packageSlug = this.asString(checkout.packageSlug) || this.asString(checkout.tier);
    if (!packageSlug) return null;

    return this.prisma.package.findFirst({
      where: {
        slug: packageSlug,
        isActive: true,
        category: { isActive: true },
      },
    });
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

  private extractCheckoutMetadata(
    metadata: Record<string, unknown> | null
  ): CheckoutMetadata | null {
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
      couponCode: this.asString(merged.couponCode),
      packageId: this.asString(merged.packageId),
      packageSlug: this.asString(merged.packageSlug),
      packageName: this.asString(merged.packageName),
      tier: this.asString(merged.tier),
      hasCover: this.asBoolean(merged.hasCover),
      hasFormatting: this.asBoolean(merged.hasFormatting),
      bookSize: this.asString(merged.bookSize),
      paperColor: this.asString(merged.paperColor),
      lamination: this.asString(merged.lamination),
      formattingWordCount: this.asInteger(merged.formattingWordCount),
      basePrice: this.asNumber(merged.basePrice),
      addonTotal: this.asNumber(merged.addonTotal),
      discountAmount: this.asNumber(merged.discountAmount),
      totalPrice: this.asNumber(merged.totalPrice),
      addons,
    };
  }

  private extractReprintMetadata(metadata: Record<string, unknown> | null): ReprintMetadata | null {
    if (!metadata || typeof metadata !== "object") return null;

    const sourceBookId = this.asString(metadata.sourceBookId);
    const copies = this.asInteger(metadata.copies);
    const bookSize = this.asString(metadata.bookSize);
    const paperColor = this.asString(metadata.paperColor);
    const lamination = this.asString(metadata.lamination);

    if (
      !sourceBookId ||
      typeof copies !== "number" ||
      copies < REPRINT_MIN_COPIES ||
      !bookSize ||
      !REPRINT_ALLOWED_BOOK_SIZES.has(bookSize) ||
      !paperColor ||
      !REPRINT_ALLOWED_PAPER_COLORS.has(paperColor) ||
      !lamination ||
      !REPRINT_ALLOWED_LAMINATIONS.has(lamination)
    ) {
      return null;
    }

    return {
      sourceBookId,
      sourceOrderId: this.asString(metadata.sourceOrderId) ?? null,
      copies,
      bookSize,
      paperColor,
      lamination,
      pageCount: this.asInteger(metadata.pageCount) ?? null,
      finalPdfUrl: this.asString(metadata.finalPdfUrl) ?? null,
    };
  }

  private async resolveAppliedCouponForOrder(
    tx: Prisma.TransactionClient,
    checkout: CheckoutMetadata,
    amountPaid: number
  ): Promise<{ id: string; discountAmount: number } | null> {
    const rawCode = this.asString(checkout.couponCode);
    if (!rawCode) return null;

    const code = rawCode.trim().toUpperCase();
    const coupon = await tx.coupon.findUnique({
      where: { code },
      select: {
        id: true,
        type: true,
        value: true,
        usageLimit: true,
        usageCount: true,
        expiresAt: true,
        isActive: true,
      },
    });

    if (!coupon) {
      this.logger.warn(`Coupon "${code}" not found. Skipping coupon application.`);
      return null;
    }

    const now = new Date();
    if (!coupon.isActive) {
      this.logger.warn(`Coupon "${code}" is inactive. Skipping coupon application.`);
      return null;
    }
    if (coupon.expiresAt && coupon.expiresAt.getTime() <= now.getTime()) {
      this.logger.warn(`Coupon "${code}" is expired. Skipping coupon application.`);
      return null;
    }
    if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
      this.logger.warn(`Coupon "${code}" reached usage limit. Skipping coupon application.`);
      return null;
    }

    const subtotal = this.resolveCouponSubtotal(checkout, amountPaid);
    const discountValue = this.toCurrency(coupon.value);
    const rawDiscount =
      coupon.type === DiscountType.PERCENTAGE ? subtotal * (discountValue / 100) : discountValue;
    const discountAmount = this.toCurrency(Math.min(subtotal, Math.max(0, rawDiscount)));

    if (discountAmount <= 0) {
      return null;
    }

    // Atomic claim to avoid over-consuming usage-limited coupons under concurrency.
    const claimed = await tx.coupon.updateMany({
      where: {
        id: coupon.id,
        isActive: true,
        ...(coupon.expiresAt ? { expiresAt: { gt: now } } : {}),
        ...(coupon.usageLimit === null
          ? {}
          : {
              usageCount: { lt: coupon.usageLimit },
            }),
      },
      data: {
        usageCount: { increment: 1 },
      },
    });

    if (claimed.count === 0) {
      this.logger.warn(`Coupon "${code}" could not be claimed. Skipping coupon application.`);
      return null;
    }

    return {
      id: coupon.id,
      discountAmount,
    };
  }

  private resolveCouponSubtotal(checkout: CheckoutMetadata, amountPaid: number): number {
    const basePlusAddons = this.toCurrency((checkout.basePrice ?? 0) + (checkout.addonTotal ?? 0));
    if (basePlusAddons > 0) return basePlusAddons;

    const totalPlusDiscount = this.toCurrency(
      (checkout.totalPrice ?? 0) + (checkout.discountAmount ?? 0)
    );
    if (totalPlusDiscount > 0) return totalPlusDiscount;

    return this.toCurrency(amountPaid);
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

    const parsedDataUrl = this.parseDataUrl(receiptUrl);
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

  private parseDataUrl(
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
      public_id: `receipt_${params.reference}_${Date.now()}`,
    });

    return upload.secure_url;
  }

  private async triggerBankTransferNotifications(params: {
    paymentId: string;
    reference: string;
    orderNumber: string;
    packageName: string;
    addons: string[];
    payerName: string;
    payerEmail: string;
    payerPhone: string;
    amount: number;
    receiptUrl: string;
    locale: Locale;
  }): Promise<void> {
    await Promise.allSettled([
      this.notificationsService.notifyAdminsBankTransferReceived({
        reference: params.reference,
        orderNumber: params.orderNumber,
        payerName: params.payerName,
        amountLabel: this.formatNaira(params.amount),
      }),
      this.sendBankTransferAdminWhatsApp(params),
      this.sendBankTransferUserEmail(params),
      this.sendBankTransferAdminEmail(params),
    ]);
  }

  private async sendBankTransferAdminWhatsApp(params: {
    orderNumber: string;
    packageName: string;
    addons: string[];
    payerName: string;
    payerEmail: string;
    payerPhone: string;
    amount: number;
    receiptUrl: string;
  }): Promise<void> {
    if (!this.infobipBaseUrl || !this.infobipApiKey || !this.infobipWhatsAppFrom) {
      this.logMissingInfobipConfig("bank transfer admin alert");
      return;
    }

    const recipients = await this.resolveBankTransferAdminWhatsAppRecipients();
    if (recipients.length === 0) {
      this.logger.warn("No admin phone numbers found for bank transfer WhatsApp notifications");
      return;
    }

    const adminPanelUrl = `${this.frontendBaseUrl}/admin/payments`;
    const addonsLabel = params.addons.length > 0 ? params.addons.join(", ") : "None";
    const text =
      "New bank transfer submitted.\n\n" +
      `Order: ${params.orderNumber}\n` +
      `Package: ${params.packageName}\n` +
      `Add-ons: ${addonsLabel}\n` +
      `Amount: ${this.formatNaira(params.amount)}\n` +
      `Payer: ${params.payerName}\n` +
      `Email: ${params.payerEmail}\n` +
      `Phone: ${params.payerPhone}\n` +
      `Receipt: ${params.receiptUrl}\n` +
      `Review: ${adminPanelUrl}`;

    await Promise.allSettled(
      recipients.map((to) => this.sendInfobipTextMessage(to, text, "bank transfer admin alert"))
    );
  }

  private async resolveBankTransferAdminWhatsAppRecipients(): Promise<string[]> {
    const admins = await this.prisma.user.findMany({
      where: {
        role: { in: [UserRole.ADMIN, UserRole.SUPER_ADMIN] },
      },
      select: { phoneNumber: true },
    });

    const dbRecipients = admins
      .map((admin) => this.normalizeWhatsAppPhone(admin.phoneNumber ?? ""))
      .filter((phone) => phone.length > 0);

    if (dbRecipients.length > 0) {
      return Array.from(new Set(dbRecipients));
    }

    const fallback = this.normalizeWhatsAppPhone(BANK_TRANSFER_ADMIN_WHATSAPP_FALLBACK);
    return fallback ? [fallback] : [];
  }

  private async sendBankTransferUserEmail(params: {
    payerName: string;
    payerEmail: string;
    amount: number;
    orderNumber: string;
    packageName: string;
    addons: string[];
    locale: Locale;
  }): Promise<void> {
    if (!this.resend) {
      this.logger.warn("RESEND_API_KEY not set — bank transfer user email skipped");
      return;
    }

    const userEmail = await renderBankTransferUserEmail({
      locale: params.locale,
      userName: params.payerName,
      orderNumber: params.orderNumber,
      packageName: params.packageName,
      addons: params.addons,
      amount: this.formatNaira(params.amount),
    });

    const sendResult = await this.resend.emails.send({
      from: this.paymentsFromEmail,
      to: params.payerEmail,
      subject: userEmail.subject,
      html: userEmail.html,
    });

    if (sendResult.error) {
      this.logger.error(
        `Failed to send bank transfer user email: ${sendResult.error.name} — ${sendResult.error.message}`
      );
    }
  }

  private async sendBankTransferAdminEmail(params: {
    payerName: string;
    payerEmail: string;
    payerPhone: string;
    amount: number;
    orderNumber: string;
    receiptUrl: string;
    locale: Locale;
  }): Promise<void> {
    if (!this.resend) {
      this.logger.warn("RESEND_API_KEY not set — bank transfer admin email skipped");
      return;
    }

    const adminPanelUrl = `${this.frontendBaseUrl}/admin/payments`;
    const adminEmail = await renderBankTransferAdminEmail({
      locale: params.locale,
      payerName: params.payerName,
      payerEmail: params.payerEmail,
      payerPhone: params.payerPhone,
      amount: this.formatNaira(params.amount),
      orderNumber: params.orderNumber,
      receiptUrl: params.receiptUrl,
      adminPanelUrl,
    });

    const sendResult = await this.resend.emails.send({
      from: this.paymentsFromEmail,
      to: this.adminEmailRecipients,
      subject: adminEmail.subject,
      html: adminEmail.html,
    });

    if (sendResult.error) {
      this.logger.error(
        `Failed to send bank transfer admin email: ${sendResult.error.name} — ${sendResult.error.message}`
      );
    }
  }

  private async sendBankTransferRejectedEmail(params: {
    email: string;
    userName: string;
    locale: Locale;
    orderNumber: string;
    paymentReference: string;
    rejectionReason: string;
  }): Promise<boolean> {
    if (!this.resend) {
      this.logger.warn("RESEND_API_KEY not set — bank transfer rejection email skipped");
      return false;
    }

    const email = await renderBankTransferRejectedEmail({
      locale: params.locale,
      userName: params.userName,
      orderNumber: params.orderNumber,
      paymentReference: params.paymentReference,
      rejectionReason: params.rejectionReason,
    });

    const sendResult = await this.resend.emails.send({
      from: this.paymentsFromEmail,
      to: params.email,
      subject: email.subject,
      html: email.html,
    });

    if (sendResult.error) {
      this.logger.error(
        `Failed to send bank transfer rejection email: ${sendResult.error.name} — ${sendResult.error.message}`
      );
      return false;
    }

    return true;
  }

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

  private async sendOnlinePaymentAdminEmail(params: {
    orderNumber: string;
    packageName: string;
    amountPaid: string;
    addons: string[];
    payerEmail: string;
    provider: PaymentProvider;
    reference: string;
  }): Promise<void> {
    if (!this.resend) {
      this.logger.warn("RESEND_API_KEY not set — online payment admin email skipped");
      return;
    }

    const addonsLabel = params.addons.length > 0 ? params.addons.join(", ") : "None";
    const adminPanelUrl = `${this.frontendBaseUrl}/admin/payments`;
    const subject = `Online Payment Received - Order #${params.orderNumber}`;
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;">
        <h2 style="margin:0 0 12px;">New Online Payment Received</h2>
        <p style="margin:0 0 12px;">A customer completed an online payment successfully.</p>
        <p style="margin:0;"><strong>Order Number:</strong> ${params.orderNumber}</p>
        <p style="margin:0;"><strong>Package:</strong> ${params.packageName}</p>
        <p style="margin:0;"><strong>Amount Paid:</strong> ${params.amountPaid}</p>
        <p style="margin:0;"><strong>Add-ons:</strong> ${addonsLabel}</p>
        <p style="margin:0;"><strong>Payer Email:</strong> ${params.payerEmail}</p>
        <p style="margin:0;"><strong>Provider:</strong> ${params.provider}</p>
        <p style="margin:0 0 12px;"><strong>Reference:</strong> ${params.reference}</p>
        <p style="margin:0;">
          <a href="${adminPanelUrl}" style="color:#007eff;text-decoration:underline;">Review in Admin Panel</a>
        </p>
      </div>
    `;

    const sendResult = await this.resend.emails.send({
      from: this.paymentsFromEmail,
      to: this.adminEmailRecipients,
      subject,
      html,
    });

    if (sendResult.error) {
      this.logger.error(
        `Failed to send online payment admin email: ${sendResult.error.name} — ${sendResult.error.message}`
      );
    }
  }

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
  }): Promise<boolean> {
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
      from: this.paymentsFromEmail,
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

  private pickDisplayName(fullName: string | undefined, email: string): string {
    if (fullName?.trim()) return fullName.trim();
    return email.split("@")[0] || "Author";
  }

  private splitFullName(name: string): { firstName: string; lastName: string | null } {
    const normalized = name.trim().replace(/\s+/g, " ");
    const [first, ...rest] = normalized.split(" ");
    return {
      firstName: first || "Author",
      lastName: rest.length > 0 ? rest.join(" ") : null,
    };
  }

  private generateSecureToken(): string {
    return randomBytes(32).toString("hex");
  }

  private formatNaira(amount: number): string {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: DEFAULT_CURRENCY,
      maximumFractionDigits: 0,
    }).format(this.toCurrency(amount));
  }

  private resolveLocale(value: unknown): Locale {
    const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (normalized === "fr" || normalized === "es") return normalized;
    return "en";
  }

  private toCurrency(value: unknown): number {
    const amount = this.asNumber(value) ?? 0;
    if (!Number.isFinite(amount)) return 0;
    return Number(Math.max(0, amount).toFixed(2));
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  }

  private isPrismaUniqueViolation(error: unknown): boolean {
    if (error && typeof error === "object" && "code" in error) {
      return (error as { code: string }).code === "P2002";
    }
    return false;
  }

  private isPrismaUniqueViolationForField(error: unknown, field: string): boolean {
    if (!this.isPrismaUniqueViolation(error)) {
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

  private asString(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  private asBoolean(value: unknown): boolean | undefined {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "true") return true;
      if (normalized === "false") return false;
    }
    return undefined;
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

  private parseProviderHint(value?: string): PaymentProvider | undefined {
    if (!value) return undefined;
    const normalized = value.trim().toUpperCase();
    if (normalized === PaymentProvider.PAYSTACK) return PaymentProvider.PAYSTACK;
    if (normalized === PaymentProvider.STRIPE) return PaymentProvider.STRIPE;
    if (normalized === PaymentProvider.PAYPAL) return PaymentProvider.PAYPAL;
    return undefined;
  }

  private normalizeBaseUrl(baseUrl: string): string {
    const normalized = baseUrl.trim().replace(/\/+$/, "");
    if (!normalized) return "";
    if (/^https?:\/\//i.test(normalized)) return normalized;
    return `https://${normalized}`;
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

  private normalizeWhatsAppPhone(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return "";

    if (trimmed.startsWith("+")) {
      const digits = trimmed.slice(1).replace(/\D/g, "");
      return digits ? `+${digits}` : "";
    }

    return trimmed.replace(/\D/g, "");
  }

  private async sendInfobipTextMessage(to: string, text: string, kind: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.infobipBaseUrl}/whatsapp/1/message/text`, {
        method: "POST",
        headers: {
          Authorization: `App ${this.infobipApiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          from: this.infobipWhatsAppFrom,
          to,
          content: { text },
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        this.logger.error(`Infobip ${kind} WhatsApp failed (${response.status}): ${body}`);
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(
        `Infobip ${kind} WhatsApp failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return false;
    }
  }

  private logMissingInfobipConfig(kind: string): void {
    const missing: string[] = [];
    if (!this.infobipBaseUrl) missing.push("INFOBIP_BASE_URL");
    if (!this.infobipApiKey) missing.push("INFOBIP_API_KEY");
    if (!this.infobipWhatsAppFrom) missing.push("INFOBIP_WHATSAPP_FROM");
    const details = missing.length > 0 ? ` (${missing.join(", ")})` : "";
    this.logger.warn(`Infobip WhatsApp config missing${details} — ${kind} skipped`);
  }

  private resolveFrontendBaseUrl(): string {
    const raw = process.env.FRONTEND_URL?.trim();
    if (!raw) {
      throw new Error("FRONTEND_URL environment variable is required for payment redirect links");
    }
    return raw.replace(/\/+$/, "");
  }

  private async resolveSignupUrlForReference(reference: string): Promise<string | null> {
    const payment = await this.prisma.payment.findUnique({
      where: { providerRef: reference },
      select: {
        type: true,
        status: true,
        user: {
          select: {
            verificationToken: true,
            tokenExpiry: true,
            preferredLanguage: true,
          },
        },
      },
    });

    if (!payment) return null;
    if (payment.type !== PaymentType.INITIAL) return null;
    if (payment.status !== PaymentStatus.SUCCESS) return null;

    const token = payment.user?.verificationToken?.trim();
    if (!token) return null;
    if (payment.user?.tokenExpiry && payment.user.tokenExpiry < new Date()) return null;

    const locale = this.resolveLocale(payment.user?.preferredLanguage);
    return this.buildSignupFinishUrl(token, locale);
  }

  private buildSignupFinishUrl(token: string, locale: Locale): string {
    return `${this.frontendBaseUrl}/${locale}/signup/finish?token=${encodeURIComponent(token)}`;
  }

  private async resolveOrderDetailsForPayment(paymentId: string): Promise<{
    orderNumber: string;
    packageName: string;
    amountPaid: string;
    addons: string[];
  } | null> {
    // Step 1: Get orderId from the payment
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: { orderId: true },
    });

    if (!payment?.orderId) return null;

    // Step 2: Get order details
    const order = await this.prisma.order.findUnique({
      where: { id: payment.orderId },
      select: {
        orderNumber: true,
        totalAmount: true,
        currency: true,
        package: { select: { name: true } },
      },
    });

    if (!order) return null;

    // Step 3: Get addon names separately (simple, no nested select issues)
    const orderAddons = await this.prisma.orderAddon.findMany({
      where: { orderId: payment.orderId },
      select: { addon: { select: { name: true } } },
    });

    return {
      orderNumber: order.orderNumber,
      packageName: order.package?.name ?? "BookPrinta Package",
      amountPaid: this.formatNaira(Number(order.totalAmount)),
      addons: orderAddons.map((oa) => oa.addon.name).filter(Boolean),
    };
  }

  /**
   * Ensure a payment gateway is enabled in the database.
   */
  private async ensureGatewayEnabled(provider: PaymentProvider): Promise<void> {
    const gateway = await this.prisma.paymentGateway.findUnique({
      where: { provider },
    });

    if (!gateway) {
      throw new NotFoundException(
        `Payment gateway "${provider}" is not configured. Please contact support.`
      );
    }

    if (!gateway.isEnabled) {
      throw new ServiceUnavailableException(`Payment gateway "${provider}" is currently disabled.`);
    }
  }

  /**
   * Ensure the provider SDK/service is available (keys are configured).
   */
  private ensureProviderAvailable(provider: PaymentProvider): void {
    const available =
      (provider === PaymentProvider.PAYSTACK && this.paystackService.isAvailable) ||
      (provider === PaymentProvider.STRIPE && this.stripeService.isAvailable) ||
      (provider === PaymentProvider.PAYPAL && this.paypalService.isAvailable);

    if (!available) {
      throw new ServiceUnavailableException(`${provider} is not configured. API keys are missing.`);
    }
  }

  /**
   * Whether an enabled gateway can be shown in checkout.
   */
  private isGatewayAvailableForCheckout(provider: PaymentProvider): boolean {
    if (provider === PaymentProvider.BANK_TRANSFER) {
      return true;
    }

    if (provider === PaymentProvider.PAYSTACK) {
      return this.paystackService.isAvailable;
    }

    if (provider === PaymentProvider.STRIPE) {
      return this.stripeService.isAvailable;
    }

    if (provider === PaymentProvider.PAYPAL) {
      return this.paypalService.isAvailable;
    }

    return false;
  }

  /**
   * Generate a unique payment reference with an optional prefix.
   */
  private generateReference(prefix = "bp"): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `${prefix}_${timestamp}_${random}`;
  }

  /**
   * Delegate payment initialization to the correct provider.
   * Used internally by payExtraPages and payReprint.
   */
  private async resolveConfiguredReprintCostPerPage(): Promise<number> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: {
        key: REPRINT_COST_PER_PAGE_SETTING_KEY,
      },
      select: {
        value: true,
      },
    });

    const parsed = this.toCurrency(setting?.value);
    return parsed > 0 ? parsed : DEFAULT_REPRINT_COST_PER_PAGE_A5;
  }

  private resolveReprintCostPerPage(bookSize: string, configuredA5Cost: number): number {
    if (bookSize === "A4") {
      return this.toCurrency(configuredA5Cost * 2);
    }

    if (bookSize === "A6") {
      return this.toCurrency(configuredA5Cost / 2);
    }

    return this.toCurrency(configuredA5Cost);
  }

  private async delegateInitialize(
    provider: PaymentProvider,
    params: {
      email: string;
      amount: number;
      reference: string;
      callbackUrl?: string;
      paymentId: string;
      orderId?: string;
    }
  ) {
    switch (provider) {
      case PaymentProvider.PAYSTACK: {
        const resp = await this.paystackService.initialize({
          email: params.email,
          amount: params.amount,
          reference: params.reference,
          callbackUrl: params.callbackUrl,
          metadata: {
            paymentId: params.paymentId,
            ...(params.orderId ? { orderId: params.orderId } : {}),
          },
        });
        return {
          authorizationUrl: resp.authorization_url,
          reference: resp.reference,
          accessCode: resp.access_code,
          provider,
          paymentId: params.paymentId,
        };
      }

      case PaymentProvider.STRIPE: {
        const resp = await this.stripeService.initialize({
          email: params.email,
          amount: params.amount,
          orderId: params.orderId,
          callbackUrl: params.callbackUrl,
          metadata: { paymentId: params.paymentId },
        });
        await this.prisma.payment.update({
          where: { id: params.paymentId },
          data: { providerRef: resp.reference },
        });
        return {
          authorizationUrl: resp.authorizationUrl,
          reference: resp.reference,
          provider,
          paymentId: params.paymentId,
        };
      }

      case PaymentProvider.PAYPAL: {
        const resp = await this.paypalService.initialize({
          amount: params.amount,
          orderId: params.orderId,
          callbackUrl: params.callbackUrl,
          metadata: { paymentId: params.paymentId },
        });
        await this.prisma.payment.update({
          where: { id: params.paymentId },
          data: { providerRef: resp.reference },
        });
        return {
          authorizationUrl: resp.authorizationUrl,
          reference: resp.reference,
          provider,
          paymentId: params.paymentId,
        };
      }

      default:
        throw new BadRequestException(`Unsupported provider for delegation: ${provider}`);
    }
  }
}
