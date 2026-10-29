/// <reference types="multer" />
import { randomBytes } from "node:crypto";
import type { Locale } from "@bookprinta/emails";
import {
  renderBankTransferAdminEmail,
  renderBankTransferRejectedEmail,
  renderBankTransferUserEmail,
  renderNewBookOrderAdminEmail,
  renderNewBookOrderUserEmail,
} from "@bookprinta/emails/render";
import type {
  AdminOrphanedPaymentsResponse,
  AdminPaymentsListQuery,
  AdminPaymentsListResponse,
  AdminPendingBankTransfersResponse,
  AdminRefundRequestInput,
  AdminRefundResponse,
} from "@bookprinta/shared";
import { DEFAULT_CURRENCY } from "@bookprinta/shared";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import * as Sentry from "@sentry/node";
import { Resend } from "resend";
import { normalizePhoneNumber } from "../auth/phone-number.util.js";
import { MAX_FILE_SIZE_BYTES } from "../cloudinary/cloudinary.service.js";
import { CloudinaryService } from "../cloudinary/index.js";
import { verifyRecaptchaToken } from "../common/recaptcha.js";
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
import { isUserNotificationChannelEnabled } from "../notifications/notification-preference-policy.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { SignupNotificationsService } from "../notifications/signup-notifications.service.js";
import { WhatsappService } from "../notifications/whatsapp.service.js";
import { WhatsappNotificationsService } from "../notifications/whatsapp-notifications.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { RolloutService } from "../rollout/rollout.service.js";
import { ScannerService } from "../scanner/scanner.service.js";
import { PAYSTACK_PRODUCT_TAG, PAYSTACK_PRODUCT_TAG_KEY } from "./constants.js";
import type { InitializePaymentDto } from "./dto/payment-request.dto.js";
import { AdminPaymentListService } from "./services/admin-payment-list.service.js";
import {
  CHECKOUT_PRICING_SIGNATURE_KEY,
  CHECKOUT_PRICING_VERSION,
  CHECKOUT_PRICING_VERSION_KEY,
  CheckoutPricingService,
} from "./services/checkout-pricing.service.js";
import { ExtraPagesPaymentService } from "./services/extra-pages-payment.service.js";
import { GatewayService } from "./services/gateway.service.js";
import { PayPalService } from "./services/paypal.service.js";
import type {
  PaystackTransactionListItem,
  PaystackWebhookPayload,
} from "./services/paystack.service.js";
import { PaystackService } from "./services/paystack.service.js";
import { RefundService } from "./services/refund.service.js";
import { ReprintPaymentService } from "./services/reprint-payment.service.js";
import { StripeService } from "./services/stripe.service.js";

const MAX_SIGNUP_TOKEN_HOURS = 24;
const BANK_TRANSFER_ADMIN_WHATSAPP_FALLBACK = "+2348103208297";
const DEFAULT_DASHBOARD_PATH = "/dashboard";
const BANK_TRANSFER_REJECTED_TITLE_KEY = "notifications.bank_transfer_rejected.title";
const BANK_TRANSFER_REJECTED_MESSAGE_KEY = "notifications.bank_transfer_rejected.message";
const BANK_TRANSFER_REJECTED_FALLBACK_TITLE = "Bank transfer not approved";
const REPRINT_MIN_COPIES = 1;
const DEFAULT_REPRINT_COST_PER_PAGE = 15;
const DEFAULT_REPRINT_COVER_COST = 300;
const REPRINT_COST_PER_PAGE_SETTING_KEY = "reprint_cost_per_page";
const REPRINT_COVER_COST_SETTING_KEY = "reprint_cover_cost";
const PHONE_ALREADY_IN_USE_MESSAGE =
  "This phone number is already linked to another account. Use another phone number or sign in to your existing account.";
const EMAIL_PHONE_IDENTITY_CONFLICT_MESSAGE =
  "This email and phone number belong to different accounts. Sign in to the correct account or use a different phone number.";
const DEACTIVATED_CHECKOUT_ACCOUNT_MESSAGE =
  "This account has been deactivated. Reactivate your account first using the recovery flow, or contact support or an administrator before continuing with payment or account setup.";
const REPRINT_ELIGIBLE_BOOK_STATUSES = new Set<BookStatus>([
  BookStatus.DELIVERED,
  BookStatus.COMPLETED,
]);
const SIGNUP_LINK_DELIVERY_METADATA_KEY = "signupLinkDelivery";

/**
 * How far back payment reconciliation looks for unfinalised successful charges.
 * Comfortably wider than the cron interval so a skipped run self-heals, and wide
 * enough to absorb a multi-hour webhook/redirect outage.
 */
/**
 * Hard cap on a single post-commit notification (email / WhatsApp).
 *
 * Bounds how long one slow provider can hold a webhook handler that has already
 * committed the order. Well under Paystack's 10s delivery timeout, though note
 * several notifications run in sequence so this alone does not guarantee the
 * whole handler fits that budget.
 */
const POST_COMMIT_NOTIFICATION_TIMEOUT_MS = 5_000;

const PAYMENT_RECONCILE_LOOKBACK_HOURS = 24;

/** Transactions fetched per Paystack list call during reconciliation. */
const PAYMENT_RECONCILE_PAGE_SIZE = 100;

/**
 * How long reconciliation remembers a reference it has already settled (ours and
 * processed, or the other product's). Longer than the widest manual lookback.
 */
const PAYMENT_RECONCILE_MEMO_TTL_MS = 31 * 24 * 60 * 60 * 1000;
const SIGNUP_LINK_DELIVERY_MAX_ATTEMPTS = 3;

type CheckoutAddonMetadata = {
  id?: string | null;
  slug?: string;
  name?: string;
  price?: number;
  wordCount?: number | null;
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
  paymentFlow?: string;
  customQuoteId?: string;
  quoteTitle?: string;
  quoteQuantity?: number;
  quotePrintSize?: string;
  quoteFinalPrice?: number;
  /** "dashboard" when order placed by authenticated user from dashboard */
  source?: string;
  /** User ID when order placed from dashboard (set server-side by DashboardService) */
  dashboardUserId?: string;
  /** HMAC over the server-computed pricing — see CheckoutPricingService. */
  pricingSignature?: string;
};

type CustomQuoteCheckoutMetadata = {
  customQuoteId: string;
  quoteTitle: string;
  quotePrintSize: string;
  quoteQuantity: number;
  quoteFinalPrice: number;
  fullName: string | null;
  phone: string | null;
  locale: Locale;
};

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

type NormalizedBankTransferInput = {
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

type CheckoutFinalizationInfo = {
  userId: string;
  orderId: string;
  email: string;
  name: string;
  locale: Locale;
  signupToken: string | null;
  phone: string | null;
  whatsAppNotificationsEnabled: boolean;
  orderNumber: string;
  packageName: string;
  amountPaid: string;
  addons: string[];
};

type SignupLinkDeliveryStatus = "DELIVERED" | "PARTIAL" | "FAILED";

type SignupLinkDeliveryAttemptSource = "BANK_TRANSFER_APPROVAL" | "WEBHOOK" | "VERIFY_RETRY";

type SignupLinkDeliverySnapshot = {
  status: SignupLinkDeliveryStatus;
  emailDelivered: boolean;
  whatsappDelivered: boolean;
  emailFailureReason: string | null;
  whatsappFailureReason: string | null;
  attemptCount: number;
  lastAttemptAt: string | null;
  lastSuccessfulAt: string | null;
  lastAttemptSource: SignupLinkDeliveryAttemptSource;
};

type PublicSignupLinkDeliveryStatus = {
  status: SignupLinkDeliveryStatus;
  emailDelivered: boolean;
  whatsappDelivered: boolean;
  attemptCount: number;
  lastAttemptAt: string | null;
  retryEligible: boolean;
};

type DashboardOrderEmailDeliverySnapshot = {
  userSentAt?: string | null;
  adminSentAt?: string | null;
  lastAttemptAt?: string | null;
};

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
  /**
   * References reconciliation has already settled, so a 10-minute tick with no
   * new charges makes no database query and Neon can scale to zero. Outcomes are
   * final (an order exists, or the charge is not ours); a restart only costs one
   * query per reference. Values: classification and expiry (ms epoch).
   */
  private readonly reconciledReferences = new Map<
    string,
    { kind: "processed" | "foreign"; expiresAt: number }
  >();
  private _resend: Resend | null = null;
  private get resend(): Resend | null {
    return this._resend;
  }
  private set resend(value: Resend | null) {
    this._resend = value;
    if (this.reprintPaymentService)
      (this.reprintPaymentService as unknown as { resend: Resend | null }).resend = value;
    if (this.refundService)
      (this.refundService as unknown as { resend: Resend | null }).resend = value;
  }
  private readonly frontendBaseUrl: string;
  private readonly customerPaymentsFromEmail: string;
  private readonly adminNotificationsFromEmail: string;
  private readonly adminEmailRecipients: string[];
  // Sub-services injected by NestJS DI in production; created internally in tests for backward compat
  private gatewayService!: GatewayService;
  private adminPaymentListService!: AdminPaymentListService;
  private refundService!: RefundService;
  private reprintPaymentService!: ReprintPaymentService;
  private extraPagesService!: ExtraPagesPaymentService;
  private checkoutPricing!: CheckoutPricingService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly paystackService: PaystackService,
    private readonly stripeService: StripeService,
    private readonly paypalService: PayPalService,
    private readonly scanner: ScannerService,
    private readonly cloudinary: CloudinaryService,
    private readonly signupNotificationsService: SignupNotificationsService,
    private readonly notificationsService: NotificationsService,
    rollout: RolloutService,
    @Optional() private readonly whatsappService: WhatsappService | null,
    @Optional() private readonly whatsappNotificationsService: WhatsappNotificationsService | null,
    @Optional() gatewayServiceInject?: GatewayService,
    @Optional() adminPaymentListServiceInject?: AdminPaymentListService,
    @Optional() refundServiceInject?: RefundService,
    @Optional() reprintPaymentServiceInject?: ReprintPaymentService,
    @Optional() extraPagesServiceInject?: ExtraPagesPaymentService,
    @Optional() checkoutPricingServiceInject?: CheckoutPricingService
  ) {
    this.resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
    this.frontendBaseUrl = this.resolveFrontendBaseUrl();
    this.customerPaymentsFromEmail = this.resolveCustomerFacingFromEmail();
    this.adminNotificationsFromEmail = this.resolveAdminNotificationsFromEmail();
    this.adminEmailRecipients = this.resolveAdminEmailRecipients();
    // Sub-service initialization: NestJS provides instances in production;
    // tests using `new PaymentsService(prisma, ...)` get internally-created instances.
    this.gatewayService =
      gatewayServiceInject ??
      new GatewayService(prisma, null, paystackService, stripeService, paypalService);
    this.adminPaymentListService =
      adminPaymentListServiceInject ?? new AdminPaymentListService(prisma);
    this.refundService =
      refundServiceInject ??
      new RefundService(
        prisma,
        paystackService,
        stripeService,
        notificationsService,
        this.whatsappNotificationsService
      );
    this.reprintPaymentService =
      reprintPaymentServiceInject ??
      new ReprintPaymentService(prisma, this.gatewayService, notificationsService);
    this.extraPagesService =
      extraPagesServiceInject ?? new ExtraPagesPaymentService(prisma, this.gatewayService, rollout);
    this.checkoutPricing = checkoutPricingServiceInject ?? new CheckoutPricingService(prisma);
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
    return this.gatewayService.listAvailableGateways();
  }

  /**
   * Initialize a payment session with the chosen provider.
   *
   * Public checkout keeps entity creation deferred until the provider confirms
   * the charge. Dashboard new-book checkout additionally pre-creates a
   * PENDING payment after the provider session is created so we persist the
   * full checkout metadata before any webhook/provider truncation can happen.
   */
  /**
   * Public entry point for `POST /payments/initialize`. Dashboard identity and
   * signed pricing are server-only fields, so they are dropped from the body
   * before the shared initialize path runs.
   */
  async initializePublic(input: InitializePaymentDto) {
    return this.initialize({
      ...input,
      metadata: this.stripClientTrustedMetadata(this.asRecord(input.metadata)) ?? undefined,
    });
  }

  async initialize(input: InitializePaymentDto) {
    const provider = input.provider.toUpperCase() as PaymentProvider;

    // 1. Check gateway is enabled
    await this.ensureGatewayEnabled(provider);

    // 2. Ensure the provider SDK is available
    this.ensureProviderAvailable(provider);

    // Identity first: "this phone belongs to another account" is more useful
    // to the customer than any pricing error.
    await this.assertCheckoutIdentityConflict({
      email: input.email,
      phone: this.extractCheckoutMetadata(this.asRecord(input.metadata))?.phone ?? null,
    });

    // 3. Re-price on the server. The browser's amount is only compared, never
    //    charged — see CheckoutPricingService for the full rationale.
    const priced = await this.priceCheckoutMetadata({
      metadata: this.asRecord(input.metadata),
      clientAmount: input.amount,
      currency: input.currency,
    });
    const normalizedMetadata = priced.metadata;
    const checkoutMetadata = this.extractCheckoutMetadata(normalizedMetadata);
    const dto = {
      ...input,
      amount: priced.amount,
      currency: DEFAULT_CURRENCY,
      metadata: normalizedMetadata,
    };

    // 4. Generate a unique reference
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

    // 5. Pre-create a PENDING Payment record for dashboard orders.
    // This persists the full metadata (dashboardUserId, packageId, addons, etc.)
    // in the DB so the webhook/verify flow doesn't rely solely on the payment
    // provider's metadata field, which can be truncated or lost.
    // For public checkout this is skipped — the record is created on webhook/verify.
    const dashboardUserId = this.asString(checkoutMetadata?.dashboardUserId);
    const isDashboardCheckoutInitialization =
      (checkoutMetadata?.source ?? "").toLowerCase() === "dashboard" &&
      (checkoutMetadata?.paymentFlow ?? "").toUpperCase() === "CHECKOUT" &&
      Boolean(dashboardUserId);

    if (isDashboardCheckoutInitialization && dashboardUserId) {
      try {
        await this.prisma.payment.create({
          data: {
            provider,
            type: PaymentType.INITIAL,
            amount: dto.amount,
            currency: (dto.currency ?? DEFAULT_CURRENCY).toUpperCase(),
            status: PaymentStatus.PENDING,
            providerRef: result.reference,
            payerEmail: dto.email,
            userId: dashboardUserId,
            metadata: (normalizedMetadata ?? undefined) as Prisma.InputJsonValue | undefined,
          },
        });
        this.logger.log(
          `Pre-created PENDING payment for dashboard order — ref: ${result.reference}, userId: ${dashboardUserId}`
        );
      } catch (error) {
        // Non-fatal: if this fails (e.g. duplicate ref from a race), the webhook/verify
        // path will still create the record. Log and continue.
        this.logger.warn(
          `Failed to pre-create PENDING payment for ref ${result.reference}: ${error instanceof Error ? error.message : error}`
        );
      }
    }

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
      // Detect stuck reprint: payment SUCCESS but Order/Book never created
      const isStuckReprint =
        existing.status === PaymentStatus.SUCCESS &&
        existing.type === PaymentType.REPRINT &&
        !existing.orderId;

      if (isStuckReprint) {
        this.logger.warn(
          `Payment ${reference} is a stuck reprint (SUCCESS but no orderId) — retrying entity creation`
        );
        try {
          await this.createReprintEntitiesFromMetadata({
            paymentId: existing.id,
            userId: existing.userId,
            payerEmail: existing.payerEmail,
            metadata: this.asRecord(existing.metadata),
            amount: Number(existing.amount),
            currency: existing.currency,
          });
        } catch (error) {
          this.logger.error(
            `Reprint entity retry failed for payment ${existing.id}: ${error instanceof Error ? error.message : error}`,
            error instanceof Error ? error.stack : undefined
          );
        }
      }

      this.logger.log(`Payment ${reference} already processed — returning cached status`);
      const signupFollowUp = await this.resolveSignupFollowUpForReference(reference, {
        retryFailedDelivery: true,
      });
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

      const existingMetadata = this.asRecord(existing.metadata);
      const isDashboardOrder = this.asString(existingMetadata?.source) === "dashboard";
      if (
        isDashboardOrder &&
        existing.status === PaymentStatus.SUCCESS &&
        existing.payerEmail &&
        orderDetails
      ) {
        await this.sendNewBookOrderEmails({
          paymentId: existing.id,
          baseMetadata: existingMetadata,
          locale: this.resolveLocale(this.asString(existingMetadata?.locale)),
          userName: this.pickDisplayName(
            this.asString(existingMetadata?.fullName) || undefined,
            existing.payerEmail
          ),
          userEmail: existing.payerEmail,
          orderNumber: orderDetails.orderNumber,
          packageName: orderDetails.packageName,
          amountPaid: orderDetails.amountPaid,
          addons: orderDetails.addons,
          provider: existing.provider,
          reference,
        });
      }

      return {
        status: existing.status === PaymentStatus.SUCCESS ? "success" : "failed",
        reference,
        amount: Number(existing.amount),
        currency: existing.currency,
        verified: existing.status === PaymentStatus.SUCCESS,
        signupUrl: signupFollowUp.signupUrl,
        awaitingWebhook: false,
        email: existing.payerEmail ?? null,
        orderNumber: orderDetails?.orderNumber ?? null,
        packageName: orderDetails?.packageName ?? null,
        amountPaid: orderDetails?.amountPaid ?? null,
        addons: orderDetails?.addons ?? [],
        signupDelivery: signupFollowUp.signupDelivery,
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

    const signupFollowUp = await this.resolveSignupFollowUpForReference(reference, {
      retryFailedDelivery: true,
    });

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
      signupUrl: signupFollowUp.signupUrl,
      awaitingWebhook: verified && !signupFollowUp.signupUrl,
      email: paymentForOrder?.payerEmail ?? null,
      orderNumber: orderDetails?.orderNumber ?? null,
      packageName: orderDetails?.packageName ?? null,
      amountPaid: orderDetails?.amountPaid ?? null,
      addons: orderDetails?.addons ?? [],
      signupDelivery: signupFollowUp.signupDelivery,
    };
  }

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
    const priced = await this.priceCheckoutMetadata({
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

    const locale = this.resolveLocale(this.extractCheckoutMetadata(metadata)?.locale);

    await this.triggerBankTransferNotifications({
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

    await this.assertCheckoutIdentityConflict({
      email: dto.payerEmail,
      phone: dto.payerPhone,
    });

    const reference = this.generateReference("bt");
    // Public endpoint: the client cannot assert a dashboard identity, and the
    // amount the admin approves against must be the server's price, not one the
    // browser typed in.
    const clientMetadata = this.stripClientTrustedMetadata(this.asRecord(dto.metadata));
    if (this.extractCustomQuoteCheckoutMetadata(clientMetadata) && !receiptFile) {
      throw new BadRequestException(
        "Receipt file upload is required for custom quote bank transfers."
      );
    }
    const priced = await this.priceCheckoutMetadata({
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

    await this.triggerBankTransferNotifications({
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

    await this.triggerBankTransferNotifications({
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
    return this.adminPaymentListService.listAdminPayments(query);
  }

  async listAdminPendingBankTransfers(): Promise<AdminPendingBankTransfersResponse> {
    return this.adminPaymentListService.listAdminPendingBankTransfers();
  }

  async listPendingBankTransfers(): Promise<AdminPendingBankTransfersResponse> {
    return this.listAdminPendingBankTransfers();
  }

  /**
   * Charges we took money for that never became Orders.
   *
   * `status: SUCCESS` + `processedAt` set + `orderId` null is the one payment
   * state that costs a customer money and gives them nothing — no order, no
   * book, no account, no email. It arises two ways:
   *
   *   - finalisation never ran (the browser never returned AND no webhook
   *     arrived) — reconcilePaystackPayments() repairs these automatically;
   *   - finalisation ran and hit a deterministic business-rule conflict, which
   *     handlePaystackWebhook acknowledges rather than retrying into the void.
   *     These need a human.
   *
   * Reconciliation can fix the first kind but nothing detects either kind, so
   * before this existed the failure was completely silent. Oldest first — age
   * is the urgency signal, exactly as with the bank-transfer SLA feed.
   */
  async listOrphanedPayments(limit = 50): Promise<AdminOrphanedPaymentsResponse> {
    const rows = await this.prisma.payment.findMany({
      where: {
        status: PaymentStatus.SUCCESS,
        processedAt: { not: null },
        orderId: null,
      },
      orderBy: { createdAt: "asc" },
      take: Math.max(1, Math.min(limit, 200)),
      select: {
        id: true,
        providerRef: true,
        provider: true,
        type: true,
        amount: true,
        currency: true,
        payerEmail: true,
        payerPhone: true,
        processedAt: true,
        createdAt: true,
      },
    });

    const totalItems = await this.prisma.payment.count({
      where: {
        status: PaymentStatus.SUCCESS,
        processedAt: { not: null },
        orderId: null,
      },
    });

    const now = Date.now();
    const ageMinutes = (at: Date) => Math.max(0, Math.floor((now - at.getTime()) / 60_000));

    const items = rows.map((row) => ({
      id: row.id,
      providerRef: row.providerRef,
      provider: row.provider,
      type: row.type,
      amount: Number(row.amount),
      currency: row.currency,
      payerEmail: row.payerEmail,
      payerPhone: row.payerPhone,
      processedAt: row.processedAt ? row.processedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      ageMinutes: ageMinutes(row.createdAt),
    }));

    return {
      items,
      totalItems,
      // Rows are ascending by createdAt, so the first is the oldest.
      oldestAgeMinutes: items.length > 0 ? items[0].ageMinutes : null,
      refreshedAt: new Date().toISOString(),
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

    const paymentMetadata = this.asRecord(payment.metadata);
    const isDashboardOrder = this.asString(paymentMetadata?.source) === "dashboard";

    if (isDashboardOrder) {
      // Dashboard order: user already has an account — send new-book confirmation emails
      await this.sendNewBookOrderEmails({
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
      await this.attemptSignupLinkDelivery({
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

    await this.sendPaymentConfirmationWhatsApp({
      userName: signupInfo.name,
      phoneNumber: signupInfo.phone,
      preferredLanguage: signupInfo.locale,
      whatsAppNotificationsEnabled: signupInfo.whatsAppNotificationsEnabled,
      orderNumber: signupInfo.orderNumber,
      packageName: signupInfo.packageName,
      amountPaid: signupInfo.amountPaid,
      addons: signupInfo.addons,
      variant: "bank_transfer",
      dashboardUrl: this.buildLocalizedDashboardUrl(signupInfo.locale),
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
    const metadata = this.asRecord(payment.metadata);
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
    let reprintResult: Awaited<ReturnType<typeof this.createReprintEntitiesFromMetadata>>;
    try {
      reprintResult = await this.createReprintEntitiesFromMetadata({
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
      await this.sendPaymentConfirmationWhatsApp({
        userName: reprintResult.name,
        phoneNumber: reprintResult.phone,
        preferredLanguage: reprintResult.locale,
        whatsAppNotificationsEnabled: reprintResult.whatsAppNotificationsEnabled,
        orderNumber: reprintResult.orderNumber,
        packageName: reprintResult.packageName,
        amountPaid: reprintResult.amountPaid,
        addons: reprintResult.addons,
        variant: "reprint",
        dashboardUrl: this.buildLocalizedDashboardUrl(reprintResult.locale),
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

  async refundAdminPayment(params: {
    paymentId: string;
    adminId: string;
    input: AdminRefundRequestInput;
  }): Promise<AdminRefundResponse> {
    return this.refundService.refundAdminPayment(params);
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
    // Single implementation lives in ExtraPagesPaymentService (price comes from
    // the admin `extra_page_price` setting; only unpaid pages are charged).
    return this.extraPagesService.payExtraPages(params);
  }

  /**
   * Pay for a reprint order.
   * Authenticated endpoint — requires userId.
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
      await this.ensureGatewayEnabled(provider);
      this.ensureProviderAvailable(provider);
    } else {
      await this.ensureGatewayEnabled(PaymentProvider.BANK_TRANSFER);
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
  // Payment reconciliation (safety net for missed webhooks)
  // ────────────────────────────────────────────

  /**
   * Finalise successful Paystack charges that never became local Orders.
   *
   * WHY THIS EXISTS
   * Our Paystack integration is shared with another product, and Paystack allows
   * only one webhook URL per integration — so BookPrinta cannot rely on receiving
   * webhooks. Without a webhook, finalisation happens when the browser returns to
   * /payments/verify/:reference. That covers most cases but NOT: the customer
   * closing the tab on Paystack's success page, losing connectivity mid-redirect,
   * or switching apps on mobile. In those cases money is taken and no Order,
   * account, or signup email is ever created — and nothing surfaces it.
   *
   * This job asks Paystack directly "what did you charge successfully?" and
   * finalises anything we missed, which also covers webhook/redirect outages
   * generally. Run it on a schedule (external cron).
   *
   * SAFETY
   * - Only transactions carrying BookPrinta checkout metadata are touched. The
   *   shared integration means the list also contains the other product's
   *   charges; those are skipped (see `looksLikeBookPrintaCheckout`).
   * - Finalisation delegates to `verify()`, the exact path the redirect uses, so
   *   there is no duplicated order-creation logic. `verify()` is idempotent (it
   *   claims `processedAt` atomically), so overlapping runs or a late webhook
   *   cannot double-create.
   */
  async reconcilePaystackPayments(options: { lookbackHours?: number } = {}): Promise<{
    scanned: number;
    ours: number;
    alreadyProcessed: number;
    finalised: number;
    failed: number;
    skippedForeign: number;
  }> {
    const lookbackHours = Math.max(1, options.lookbackHours ?? PAYMENT_RECONCILE_LOOKBACK_HOURS);
    const to = new Date();
    const from = new Date(to.getTime() - lookbackHours * 60 * 60 * 1000);

    const summary = {
      scanned: 0,
      ours: 0,
      alreadyProcessed: 0,
      finalised: 0,
      failed: 0,
      skippedForeign: 0,
    };

    if (!this.paystackService.isAvailable) {
      this.logger.warn("Payment reconciliation skipped — Paystack is not configured");
      return summary;
    }

    let transactions: PaystackTransactionListItem[];
    try {
      transactions = await this.paystackService.listTransactions({
        from,
        to,
        status: "success",
        perPage: PAYMENT_RECONCILE_PAGE_SIZE,
      });
    } catch (error) {
      this.logger.error(
        `Payment reconciliation could not list Paystack transactions: ${error instanceof Error ? error.message : error}`
      );
      return summary;
    }

    summary.scanned = transactions.length;

    const now = Date.now();
    for (const [reference, memo] of this.reconciledReferences) {
      if (memo.expiresAt <= now) this.reconciledReferences.delete(reference);
    }
    const remember = (reference: string, kind: "processed" | "foreign") => {
      this.reconciledReferences.set(reference, {
        kind,
        expiresAt: now + PAYMENT_RECONCILE_MEMO_TTL_MS,
      });
    };

    for (const transaction of transactions) {
      const reference = transaction.reference?.trim();
      if (!reference) continue;

      const memo = this.reconciledReferences.get(reference);
      if (memo) {
        if (memo.kind === "foreign") {
          summary.skippedForeign += 1;
        } else {
          summary.ours += 1;
          summary.alreadyProcessed += 1;
        }
        continue;
      }

      // One indexed lookup per row. A Payment row with this reference means we
      // created the charge (extra pages and reprints are pre-created PENDING),
      // so it is ours regardless of what its metadata looks like.
      const existing = await this.prisma.payment.findUnique({
        where: { providerRef: reference },
        select: { processedAt: true, orderId: true },
      });

      // Shared integration: ignore the other product's charges entirely.
      const ours =
        existing !== null ||
        this.hasBookPrintaProductTag(transaction.metadata) ||
        (await this.isBookPrintaCharge(transaction.metadata));
      if (!ours) {
        summary.skippedForeign += 1;
        remember(reference, "foreign");
        continue;
      }
      summary.ours += 1;

      if (existing?.processedAt && existing.orderId) {
        summary.alreadyProcessed += 1;
        remember(reference, "processed");
        continue;
      }

      try {
        // Same finalisation path as the browser redirect — idempotent.
        await this.verify(reference, "PAYSTACK");
        summary.finalised += 1;
        remember(reference, "processed");
        this.logger.warn(
          `Payment reconciliation finalised orphaned Paystack charge ${reference} ` +
            "(no webhook and the browser never returned)"
        );
      } catch (error) {
        summary.failed += 1;
        this.logger.error(
          `Payment reconciliation failed for ${reference}: ${error instanceof Error ? error.message : error}`
        );
      }
    }

    this.logger.log(
      `Payment reconciliation complete — scanned ${summary.scanned}, ours ${summary.ours}, ` +
        `already processed ${summary.alreadyProcessed}, finalised ${summary.finalised}, ` +
        `failed ${summary.failed}, foreign skipped ${summary.skippedForeign}`
    );

    return summary;
  }

  /**
   * Surface a paying customer who cannot complete signup.
   *
   * Each of these branches means the same thing: money was taken, the signup link
   * failed to deliver, and no further automated attempt will be made. Logging
   * alone is not enough — Pino writes to stdout and never reaches Sentry, so
   * these would otherwise scroll past unnoticed while a customer sits stranded.
   *
   * Deliberately captured as a message (nothing threw) with the payment
   * reference in the fingerprint-relevant fields so occurrences group by cause
   * rather than flooding one issue.
   */
  private captureStrandedSignup(
    reference: string,
    paymentId: string,
    reason: string,
    extra: Record<string, unknown> = {}
  ): void {
    Sentry.captureMessage(`Signup link undeliverable for paid order (${reason})`, {
      level: "error",
      tags: { area: "signup_delivery", reason },
      extra: { reference, paymentId, ...extra },
    });
  }

  /**
   * True when a Paystack transaction was created by BookPrinta's checkout.
   *
   * This is a PRODUCT check, not a user check — it asks "did our checkout create
   * this charge?", never "does this payer have an account". That distinction
   * matters because BookPrinta is pay-first-then-signup: at charge time there is
   * deliberately no user yet.
   *
   * IMPORTANT: do NOT use `extractCheckoutMetadata() !== null` as the signal — it
   * returns a populated object for ANY non-empty metadata (every field is
   * optional), so it matches the other product's charges too. The authoritative
   * signal is the one finalisation itself depends on:
   *   - a `customQuoteId` that exists in our DB (custom-quote flow), or
   *   - a package identifier that resolves to an active BookPrinta package.
   * Both are DB-verified, so a foreign charge cannot be mistaken for ours even if
   * it happens to carry a similarly-named metadata field.
   *
   * Paystack may return metadata as a JSON string rather than an object.
   */
  /** True when Paystack metadata carries BookPrinta's product tag (constants.ts). */
  private hasBookPrintaProductTag(
    metadata: Record<string, unknown> | string | null | undefined
  ): boolean {
    const record =
      typeof metadata === "string" ? this.parseJsonRecord(metadata) : this.asRecord(metadata);
    return record?.[PAYSTACK_PRODUCT_TAG_KEY] === PAYSTACK_PRODUCT_TAG;
  }

  private async isBookPrintaCharge(
    metadata: Record<string, unknown> | string | null | undefined
  ): Promise<boolean> {
    const record =
      typeof metadata === "string" ? this.parseJsonRecord(metadata) : this.asRecord(metadata);
    if (!record) return false;

    // Custom-quote flow: verify the quote is one of ours.
    const quoteCheckout = this.extractCustomQuoteCheckoutMetadata(record);
    const customQuoteId = quoteCheckout
      ? this.asString(quoteCheckout.customQuoteId)
      : this.asString(record.customQuoteId);
    if (customQuoteId) {
      const quote = await this.prisma.customQuote.findUnique({
        where: { id: customQuoteId },
        select: { id: true },
      });
      if (quote) return true;
    }

    // Standard checkout: the package must resolve to an active BookPrinta package.
    const checkout = this.extractCheckoutMetadata(record);
    if (!checkout) return false;
    if (!checkout.packageId && !checkout.packageSlug && !checkout.tier) return false;

    const pkg = await this.resolvePackageFromCheckoutMetadata(checkout);
    return pkg !== null;
  }

  /**
   * Classify a charge, distinguishing "not ours" from "ours but unresolvable".
   *
   * `isBookPrintaCharge` collapses these two into `false`, which is wrong for
   * the second case. `resolvePackageFromCheckoutMetadata` requires
   * `isActive: true` on both the package AND its category, so if an admin
   * deactivates a package (or category) while a customer is mid-checkout, that
   * customer's charge stops resolving — and a plain boolean makes it
   * indistinguishable from another product's charge.
   *
   * Treating that as "foreign" would mean silently ignoring a charge we took
   * money for, leaving no Payment row and therefore nothing for
   * listOrphanedPayments() to surface. The money is gone and we have no record.
   *
   * So:
   *   - "foreign"      → no BookPrinta checkout shape at all. Safe to ignore.
   *   - "unresolvable" → carries our checkout shape (packageId/slug/tier, or a
   *                      customQuoteId) but nothing resolves. Record it and let
   *                      it surface for a human.
   *   - "ours"         → resolves normally.
   */
  private async classifyCharge(
    metadata: Record<string, unknown> | string | null | undefined
  ): Promise<"ours" | "unresolvable" | "foreign"> {
    // Tagged at creation (constants.ts) — covers extra-page and reprint
    // charges, whose metadata has no checkout shape. Whether they resolve is
    // decided downstream (an unresolvable one is recorded as an orphan).
    if (this.hasBookPrintaProductTag(metadata) || (await this.isBookPrintaCharge(metadata))) {
      return "ours";
    }

    const record =
      typeof metadata === "string" ? this.parseJsonRecord(metadata) : this.asRecord(metadata);
    if (!record) return "foreign";

    // A customQuoteId that does not resolve is still a claim to be one of ours.
    const quoteCheckout = this.extractCustomQuoteCheckoutMetadata(record);
    const customQuoteId = quoteCheckout
      ? this.asString(quoteCheckout.customQuoteId)
      : this.asString(record.customQuoteId);
    if (customQuoteId) return "unresolvable";

    const checkout = this.extractCheckoutMetadata(record);
    if (!checkout) return "foreign";
    if (checkout.packageId || checkout.packageSlug || checkout.tier) {
      return "unresolvable";
    }

    return "foreign";
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
      const metadata = (payload.data.metadata as Record<string, unknown>) ?? null;

      // Ignore charges that are not ours, but do NOT conflate that with a
      // charge of ours we merely cannot resolve. See classifyCharge: a package
      // deactivated mid-checkout stops resolving, and silently dropping such a
      // charge would leave no Payment row and nothing for
      // listOrphanedPayments() to surface — money taken, no record.
      const classification = await this.classifyCharge(metadata);

      if (classification === "foreign") {
        this.logger.log(
          `Paystack webhook ${reference} is not a BookPrinta charge — acknowledged and ignored`
        );
        return { status: "ok", message: "Not a BookPrinta charge" };
      }

      if (classification === "unresolvable") {
        // Proceed deliberately: createPaymentFromWebhook records the Payment,
        // logs that the package could not be resolved, and skips order
        // creation. That leaves exactly the claimed-without-an-order state the
        // orphaned-payment check reports, so it reaches a human instead of
        // vanishing.
        this.logger.error(
          `Paystack webhook ${reference} carries BookPrinta checkout metadata that does not ` +
            "resolve (deactivated package/category, or a missing custom quote). Recording the " +
            "payment without an order so it surfaces for manual review."
        );
      }

      try {
        await this.createPaymentFromWebhook({
          provider: PaymentProvider.PAYSTACK,
          providerRef: reference,
          amount: payload.data.amount / 100, // Paystack sends kobo
          currency: payload.data.currency ?? DEFAULT_CURRENCY,
          payerEmail: payload.data.customer?.email ?? null,
          gatewayResponse: payload.data as unknown as Record<string, unknown>,
          metadata,
        });
        this.logger.log(`Paystack payment succeeded: ${reference}`);
      } catch (error) {
        // A ConflictException here is a DETERMINISTIC business-rule failure —
        // the phone belongs to another account, the account is deactivated, the
        // metadata disagrees with the source order. Retrying cannot change the
        // outcome, so returning non-2xx would make Paystack retry on a schedule
        // until it gives up, and repeated failures can get a webhook endpoint
        // disabled outright (which is how this project's reconcile cron died).
        //
        // So we ACK and leave the payment claimed-without-an-order. That is the
        // exact state countOrphanedPayments() reports, so the charge surfaces
        // for admin action instead of being retried into the void.
        //
        // Everything else — DB unavailable, Redis down, provider timeout — is
        // transient and MUST propagate so Paystack retries it.
        if (error instanceof ConflictException) {
          this.logger.error(
            `Paystack webhook ${reference} hit a business-rule conflict and cannot be retried: ` +
              `${error.message}. Payment is recorded without an Order and needs admin action.`
          );
          return { status: "ok", message: "Acknowledged — manual review required" };
        }
        throw error;
      }
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
          ? {
              // Persisted metadata is authoritative because initialize-time
              // dashboard payments store the full checkout context before the
              // provider webhook can truncate or reshape it.
              ...(metadata ?? {}),
              ...(persistedMetadata ?? {}),
            }
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
        try {
          const reprintResult = await this.reprintPaymentService.createReprintEntitiesFromMetadata({
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

            await this.reprintPaymentService.sendReprintConfirmationEmails({
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

            await this.sendPaymentConfirmationWhatsApp({
              userName: reprintResult.name,
              phoneNumber: reprintResult.phone,
              preferredLanguage: reprintResult.locale,
              whatsAppNotificationsEnabled: reprintResult.whatsAppNotificationsEnabled,
              orderNumber: reprintResult.orderNumber,
              packageName: reprintResult.packageName,
              amountPaid: reprintResult.amountPaid,
              addons: reprintResult.addons,
              variant: "reprint",
              dashboardUrl: this.buildLocalizedDashboardUrl(reprintResult.locale),
            });
          }
        } catch (error) {
          this.logger.error(
            `Failed to create reprint entities for payment ${existingPayment.id} — reverting processedAt so retry is possible: ${error instanceof Error ? error.message : error}`,
            error instanceof Error ? error.stack : undefined
          );
          await this.prisma.payment.update({
            where: { id: existingPayment.id },
            data: { processedAt: null, status: PaymentStatus.PENDING },
          });
          throw error;
        }
        return;
      }

      const shouldCreateCheckoutEntities =
        existingPayment.type === PaymentType.INITIAL &&
        (!existingPayment.userId || !existingPayment.orderId);

      const shouldFinalizeCustomQuoteLinkedCheckout =
        existingPayment.type === PaymentType.CUSTOM_QUOTE &&
        Boolean(existingPayment.userId) &&
        Boolean(existingPayment.orderId);

      if (shouldFinalizeCustomQuoteLinkedCheckout) {
        const quoteCheckoutResult = await this.buildCheckoutFinalizationInfoForLinkedPayment({
          paymentId: existingPayment.id,
          userId: existingPayment.userId as string,
          orderId: existingPayment.orderId as string,
          payerEmail: data.payerEmail ?? existingPayment.payerEmail,
          payerName: null,
          metadata: mergedMetadata,
        });

        if (quoteCheckoutResult) {
          await this.sendOnlinePaymentAdminEmail({
            orderNumber: quoteCheckoutResult.orderNumber,
            packageName: quoteCheckoutResult.packageName,
            amountPaid: quoteCheckoutResult.amountPaid,
            addons: quoteCheckoutResult.addons,
            payerEmail: quoteCheckoutResult.email,
            provider: data.provider,
            reference: data.providerRef,
          });

          if (quoteCheckoutResult.signupToken) {
            await this.attemptSignupLinkDelivery({
              paymentId: existingPayment.id,
              paymentReference: data.providerRef,
              baseMetadata: mergedMetadata,
              source: "WEBHOOK",
              email: quoteCheckoutResult.email,
              locale: quoteCheckoutResult.locale,
              name: quoteCheckoutResult.name,
              token: quoteCheckoutResult.signupToken,
              phoneNumber: quoteCheckoutResult.phone,
              orderNumber: quoteCheckoutResult.orderNumber,
              packageName: quoteCheckoutResult.packageName,
              amountPaid: quoteCheckoutResult.amountPaid,
              addons: quoteCheckoutResult.addons,
            });
          }

          await this.sendPaymentConfirmationWhatsApp({
            userName: quoteCheckoutResult.name,
            phoneNumber: quoteCheckoutResult.phone,
            preferredLanguage: quoteCheckoutResult.locale,
            whatsAppNotificationsEnabled: quoteCheckoutResult.whatsAppNotificationsEnabled,
            orderNumber: quoteCheckoutResult.orderNumber,
            packageName: quoteCheckoutResult.packageName,
            amountPaid: quoteCheckoutResult.amountPaid,
            addons: quoteCheckoutResult.addons,
            variant: "quote",
            dashboardUrl: this.buildLocalizedDashboardUrl(quoteCheckoutResult.locale),
          });
        }

        return;
      }

      if (!shouldCreateCheckoutEntities) {
        if (existingPayment.type === PaymentType.EXTRA_PAGES && existingPayment.orderId) {
          await this.extraPagesService.reconcileExtraPagesBillingGate(existingPayment.orderId);
          await this.extraPagesService.sendExtraPagesPaymentConfirmationWhatsApp(
            existingPayment.orderId,
            this.whatsappNotificationsService
          );
        }
        return;
      }

      const checkoutResult = await this.createCheckoutEntitiesFromMetadata({
        paymentId: existingPayment.id,
        payerEmail: data.payerEmail ?? existingPayment.payerEmail,
        metadata: mergedMetadata,
        amount: data.amount,
        currency: data.currency,
        // Only the DB-recorded owner (set server-side at initialize) is trusted
        // here; a metadata dashboardUserId is honoured only when signed.
        existingUserId: existingPayment.userId ?? undefined,
      });

      const isDashboardOrder = this.asString(mergedMetadata?.source) === "dashboard";

      if (checkoutResult && isDashboardOrder) {
        // Dashboard order: user already has an account — send new-book confirmation emails
        await this.sendNewBookOrderEmails({
          paymentId: existingPayment.id,
          baseMetadata: mergedMetadata,
          locale: checkoutResult.locale,
          userName: checkoutResult.name,
          userEmail: checkoutResult.email,
          orderNumber: checkoutResult.orderNumber,
          packageName: checkoutResult.packageName,
          amountPaid: checkoutResult.amountPaid,
          addons: checkoutResult.addons,
          provider: data.provider,
          reference: data.providerRef,
        });
      } else if (checkoutResult) {
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

      if (checkoutResult?.signupToken && !isDashboardOrder) {
        await this.attemptSignupLinkDelivery({
          paymentId: existingPayment.id,
          paymentReference: data.providerRef,
          baseMetadata: mergedMetadata,
          source: "WEBHOOK",
          email: checkoutResult.email,
          locale: checkoutResult.locale,
          name: checkoutResult.name,
          token: checkoutResult.signupToken,
          phoneNumber: checkoutResult.phone,
          orderNumber: checkoutResult.orderNumber,
          packageName: checkoutResult.packageName,
          amountPaid: checkoutResult.amountPaid,
          addons: checkoutResult.addons,
        });
      }

      if (checkoutResult) {
        await this.sendPaymentConfirmationWhatsApp({
          userName: checkoutResult.name,
          phoneNumber: checkoutResult.phone,
          preferredLanguage: checkoutResult.locale,
          whatsAppNotificationsEnabled: checkoutResult.whatsAppNotificationsEnabled,
          orderNumber: checkoutResult.orderNumber,
          packageName: checkoutResult.packageName,
          amountPaid: checkoutResult.amountPaid,
          addons: checkoutResult.addons,
          variant: "standard",
          dashboardUrl: this.buildLocalizedDashboardUrl(checkoutResult.locale),
        });
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

    const isDashboardNewPayment = this.asString(metadata?.source) === "dashboard";

    if (checkoutResult && isDashboardNewPayment) {
      await this.sendNewBookOrderEmails({
        paymentId: payment.id,
        baseMetadata: metadata,
        locale: checkoutResult.locale,
        userName: checkoutResult.name,
        userEmail: checkoutResult.email,
        orderNumber: checkoutResult.orderNumber,
        packageName: checkoutResult.packageName,
        amountPaid: checkoutResult.amountPaid,
        addons: checkoutResult.addons,
        provider: data.provider,
        reference: data.providerRef,
      });
    } else if (checkoutResult) {
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

    if (checkoutResult?.signupToken && !isDashboardNewPayment) {
      await this.attemptSignupLinkDelivery({
        paymentId: payment.id,
        paymentReference: data.providerRef,
        baseMetadata: metadata,
        source: "WEBHOOK",
        email: checkoutResult.email,
        locale: checkoutResult.locale,
        name: checkoutResult.name,
        token: checkoutResult.signupToken,
        phoneNumber: checkoutResult.phone,
        orderNumber: checkoutResult.orderNumber,
        packageName: checkoutResult.packageName,
        amountPaid: checkoutResult.amountPaid,
        addons: checkoutResult.addons,
      });
    }

    if (checkoutResult) {
      await this.sendPaymentConfirmationWhatsApp({
        userName: checkoutResult.name,
        phoneNumber: checkoutResult.phone,
        preferredLanguage: checkoutResult.locale,
        whatsAppNotificationsEnabled: checkoutResult.whatsAppNotificationsEnabled,
        orderNumber: checkoutResult.orderNumber,
        packageName: checkoutResult.packageName,
        amountPaid: checkoutResult.amountPaid,
        addons: checkoutResult.addons,
        variant: "standard",
        dashboardUrl: this.buildLocalizedDashboardUrl(checkoutResult.locale),
      });
    }
  }

  private normalizeWebhookMetadata(
    metadata: Record<string, unknown> | null
  ): Record<string, unknown> | null {
    if (!metadata || typeof metadata !== "object") return null;
    return metadata;
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
      if (!user.isActive) {
        throw new ConflictException(DEACTIVATED_CHECKOUT_ACCOUNT_MESSAGE);
      }

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
        whatsAppNotificationsEnabled: user.whatsAppNotificationsEnabled,
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

    const customQuoteCheckout = this.extractCustomQuoteCheckoutMetadata(params.metadata);
    if (customQuoteCheckout) {
      return this.createCustomQuoteEntitiesFromMetadata({
        ...params,
        customQuote: customQuoteCheckout,
      });
    }

    const rawCheckout = this.extractCheckoutMetadata(params.metadata);
    if (!rawCheckout) return null;

    const pkg = await this.resolvePackageFromCheckoutMetadata(rawCheckout);
    if (!pkg) {
      this.logger.warn(
        `Webhook payment ${params.paymentId}: package could not be resolved from metadata, skipping order creation`
      );
      return null;
    }

    // Never build an Order from pricing the server did not compute, and never
    // for less than that price. Throws ConflictException on underpayment, which
    // the webhook ACKs and leaves as an orphaned payment for admin review.
    const trusted = await this.resolveTrustedCheckout({
      paymentId: params.paymentId,
      checkout: rawCheckout,
      paidAmount: params.amount,
      currency: params.currency,
    });
    const checkout = trusted.checkout;
    const existingUserId = params.existingUserId ?? trusted.dashboardUserId;

    const locale = this.resolveLocale(checkout.locale);
    const normalizedPhone = checkout.phone?.trim() || null;
    const normalizedPhoneLookup = normalizePhoneNumber(normalizedPhone);
    const signupTokenExpiry = new Date(Date.now() + MAX_SIGNUP_TOKEN_HOURS * 60 * 60 * 1000);

    try {
      return await this.prisma.$transaction(async (tx) => {
        let user = existingUserId
          ? await tx.user.findUnique({
              where: { id: existingUserId },
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

        if (user && !user.isActive) {
          throw new ConflictException(DEACTIVATED_CHECKOUT_ACCOUNT_MESSAGE);
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
              isActive: true,
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
        const appliedCoupon = await this.resolveAppliedCouponForOrder(tx, checkout, initialAmount, {
          honorDiscount: trusted.signed ? (checkout.discountAmount ?? 0) : 0,
        });
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
          whatsAppNotificationsEnabled: user.whatsAppNotificationsEnabled,
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
    if (!normalizedEmail) return;

    const db = params.tx ?? this.prisma;
    const emailUser = await db.user.findFirst({
      where: {
        email: {
          equals: normalizedEmail,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
        email: true,
        isActive: true,
      },
    });

    if (emailUser && emailUser.id !== params.allowUserId && !emailUser.isActive) {
      throw new ConflictException(DEACTIVATED_CHECKOUT_ACCOUNT_MESSAGE);
    }

    if (!normalizedPhone) {
      return;
    }

    const phoneUsers = await db.user.findMany({
      where: {
        phoneNumberNormalized: normalizedPhone,
      },
      select: {
        id: true,
        email: true,
      },
      take: 3,
    });

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

  /**
   * Metadata keys only the server may set. Stripped from every public request
   * body so a guest cannot attach a payment to another user's account or
   * smuggle in pre-signed pricing.
   */
  private stripClientTrustedMetadata(
    metadata: Record<string, unknown> | null
  ): Record<string, unknown> | null {
    if (!metadata) return null;
    const {
      dashboardUserId: _dashboardUserId,
      source: _source,
      checkout_state: _checkoutState,
      [CHECKOUT_PRICING_SIGNATURE_KEY]: _signature,
      [CHECKOUT_PRICING_VERSION_KEY]: _version,
      ...rest
    } = metadata;
    return rest;
  }

  /**
   * Price a checkout on the server and return the amount to charge together
   * with metadata whose pricing fields are the server's (and signed).
   *
   * Callers pass `metadata.dashboardUserId` only when it is server-derived
   * (DashboardService, QuotesService, an authenticated session); public request
   * bodies go through `stripClientTrustedMetadata` first.
   */
  private async priceCheckoutMetadata(params: {
    metadata: Record<string, unknown> | null;
    clientAmount: number;
    currency?: string | null;
  }): Promise<{ amount: number; metadata: Record<string, unknown> }> {
    this.checkoutPricing.assertCurrency(params.currency);

    const {
      checkout_state: _checkoutState,
      [CHECKOUT_PRICING_SIGNATURE_KEY]: _signature,
      [CHECKOUT_PRICING_VERSION_KEY]: _version,
      ...base
    } = params.metadata ?? {};

    const checkout = this.extractCheckoutMetadata(base);
    if (!checkout) {
      throw new BadRequestException(
        "Checkout metadata is missing. Return to pricing and try again."
      );
    }

    const customQuote = this.extractCustomQuoteCheckoutMetadata(base);
    if (customQuote) {
      const quote = await this.prisma.customQuote.findUnique({
        where: { id: customQuote.customQuoteId },
        select: { finalPrice: true },
      });
      const finalPrice = this.toCurrency(Number(quote?.finalPrice ?? 0));
      if (!quote || finalPrice <= 0) {
        throw new BadRequestException(
          "This quote is not ready for payment yet. Please use the payment link from your email."
        );
      }
      this.checkoutPricing.assertClientAmountMatches(params.clientAmount, finalPrice);
      return { amount: finalPrice, metadata: { ...base, quoteFinalPrice: finalPrice } };
    }

    const quote = await this.checkoutPricing.quote({
      packageId: checkout.packageId,
      packageSlug: checkout.packageSlug ?? checkout.tier,
      addons: (checkout.addons ?? []).map((addon) => ({
        id: addon.id,
        slug: addon.slug,
        wordCount: addon.wordCount,
      })),
      formattingWordCount: checkout.formattingWordCount,
      couponCode: checkout.couponCode,
    });
    this.checkoutPricing.assertClientAmountMatches(params.clientAmount, quote.totalPrice);

    const dashboardUserId = checkout.dashboardUserId ?? null;
    const signature = this.checkoutPricing.sign(
      this.checkoutPricing.toSignedPricing(quote, dashboardUserId)
    );

    return {
      amount: quote.totalPrice,
      metadata: {
        ...base,
        packageId: quote.packageId,
        packageSlug: quote.packageSlug,
        packageName: quote.packageName,
        tier: quote.packageSlug,
        basePrice: quote.basePrice,
        addonTotal: quote.addonTotal,
        discountAmount: quote.discountAmount,
        totalPrice: quote.totalPrice,
        couponCode: quote.couponCode,
        formattingWordCount: quote.formattingWordCount ?? 0,
        addons: quote.lines.map((line) => ({
          id: line.id,
          slug: line.slug,
          name: line.name,
          price: line.price,
          wordCount: line.wordCount,
        })),
        addonBreakdown: quote.lines.map((line) => ({ name: line.name, price: line.price })),
        ...(dashboardUserId ? { dashboardUserId } : {}),
        [CHECKOUT_PRICING_VERSION_KEY]: CHECKOUT_PRICING_VERSION,
        [CHECKOUT_PRICING_SIGNATURE_KEY]: signature,
      },
    };
  }

  /**
   * Decide which pricing to trust for a paid checkout and enforce that the
   * payment covers it.
   *
   * - Signed metadata (written by `priceCheckoutMetadata`) is trusted as-is,
   *   including its discount and dashboard owner.
   * - Unsigned metadata — legacy in-flight payments, or a charge created
   *   outside our initialize flow — is re-priced from the database, and its
   *   claimed dashboard owner is ignored.
   */
  private async resolveTrustedCheckout(params: {
    paymentId: string;
    checkout: CheckoutMetadata;
    paidAmount: number;
    currency: string;
  }): Promise<{ checkout: CheckoutMetadata; dashboardUserId: string | null; signed: boolean }> {
    const { checkout } = params;
    const signedCandidate = this.checkoutPricing.fromCheckoutFields(checkout);

    if (this.checkoutPricing.verify(signedCandidate, checkout.pricingSignature)) {
      this.assertPaidAmountCovers({
        paymentId: params.paymentId,
        paidAmount: params.paidAmount,
        expectedAmount: signedCandidate.totalPrice,
        currency: params.currency,
      });
      return { checkout, dashboardUserId: signedCandidate.dashboardUserId, signed: true };
    }

    this.logger.warn(
      `Payment ${params.paymentId}: checkout pricing is unsigned or does not verify — re-pricing from the database`
    );

    const quoteInput = {
      packageId: checkout.packageId,
      packageSlug: checkout.packageSlug ?? checkout.tier,
      addons: (checkout.addons ?? []).map((addon) => ({
        id: addon.id,
        slug: addon.slug,
        wordCount: addon.wordCount,
      })),
      formattingWordCount: checkout.formattingWordCount,
      couponCode: checkout.couponCode,
    };
    let quote: Awaited<ReturnType<CheckoutPricingService["quote"]>>;
    try {
      quote = await this.checkoutPricing.quote(quoteInput);
    } catch (error) {
      if (!(error instanceof BadRequestException) || !checkout.couponCode) {
        throw new ConflictException(
          `Checkout for payment ${params.paymentId} cannot be priced: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      // An unsigned coupon that no longer validates simply does not apply.
      quote = await this.checkoutPricing.quote({ ...quoteInput, couponCode: null });
    }

    this.assertPaidAmountCovers({
      paymentId: params.paymentId,
      paidAmount: params.paidAmount,
      expectedAmount: quote.totalPrice,
      currency: params.currency,
    });

    return {
      checkout: {
        ...checkout,
        packageId: quote.packageId,
        packageSlug: quote.packageSlug,
        basePrice: quote.basePrice,
        addonTotal: quote.addonTotal,
        discountAmount: quote.discountAmount,
        totalPrice: quote.totalPrice,
        couponCode: quote.couponCode ?? undefined,
        formattingWordCount: quote.formattingWordCount ?? undefined,
        addons: quote.lines.map((line) => ({
          id: line.id,
          slug: line.slug,
          name: line.name,
          price: line.price,
          wordCount: line.wordCount,
        })),
        dashboardUserId: undefined,
      },
      dashboardUserId: null,
      signed: false,
    };
  }

  /**
   * Refuse to fulfil a payment that does not cover the expected price.
   * ConflictException is the deterministic business-rule failure the webhook
   * ACKs, leaving the payment recorded without an order for admin review.
   */
  private assertPaidAmountCovers(params: {
    paymentId: string;
    paidAmount: number;
    expectedAmount: number;
    currency: string;
  }): void {
    const currency = (params.currency || DEFAULT_CURRENCY).toUpperCase();
    if (
      currency === DEFAULT_CURRENCY &&
      this.checkoutPricing.covers(params.paidAmount, params.expectedAmount)
    ) {
      return;
    }

    const message =
      `Payment ${params.paymentId} paid ${currency} ${params.paidAmount} but the order costs ` +
      `${DEFAULT_CURRENCY} ${params.expectedAmount}. No order was created.`;
    this.logger.error(message);
    Sentry.captureMessage("Underpaid checkout blocked", {
      level: "error",
      tags: { area: "payments", reason: "underpaid_checkout" },
      extra: { ...params, currency },
    });
    throw new ConflictException({ message, errorCode: "CHECKOUT_UNDERPAID" });
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
        wordCount: this.asInteger(addon.wordCount) ?? null,
      }));

    return {
      locale: this.resolveLocale(this.asString(merged.locale)),
      fullName: this.asString(merged.fullName),
      phone: this.asString(merged.phone),
      paymentFlow: this.asString(merged.paymentFlow),
      customQuoteId: this.asString(merged.customQuoteId),
      quoteTitle: this.asString(merged.quoteTitle),
      quoteQuantity: this.asInteger(merged.quoteQuantity),
      quotePrintSize: this.asString(merged.quotePrintSize),
      quoteFinalPrice: this.asNumber(merged.quoteFinalPrice),
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
      source: this.asString(merged.source),
      dashboardUserId: this.asString(merged.dashboardUserId),
      pricingSignature: this.asString(merged[CHECKOUT_PRICING_SIGNATURE_KEY]),
    };
  }

  private deriveTitleFromFileName(fileName: string | null | undefined): string | null {
    if (typeof fileName !== "string") return null;
    const trimmed = fileName.trim();
    if (!trimmed) return null;

    const normalized = trimmed
      .replace(/\.[^.]+$/, "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return normalized.length > 0 ? normalized : null;
  }

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

  private extractCustomQuoteCheckoutMetadata(
    metadata: Record<string, unknown> | null
  ): CustomQuoteCheckoutMetadata | null {
    const checkout = this.extractCheckoutMetadata(metadata);
    if (!checkout) return null;

    if ((checkout.paymentFlow || "").toUpperCase() !== "CUSTOM_QUOTE") {
      return null;
    }

    const customQuoteId = this.asString(checkout.customQuoteId);
    const quoteTitle = this.asString(checkout.quoteTitle);
    const quotePrintSize = this.asString(checkout.quotePrintSize) || "A5";
    const quoteQuantity = this.asInteger(checkout.quoteQuantity);
    const quoteFinalPrice = this.asNumber(checkout.quoteFinalPrice);

    if (!customQuoteId || !quoteTitle || !quoteQuantity || !quoteFinalPrice) {
      return null;
    }

    return {
      customQuoteId,
      quoteTitle,
      quotePrintSize,
      quoteQuantity,
      quoteFinalPrice,
      fullName: this.asString(checkout.fullName) ?? null,
      phone: this.asString(checkout.phone) ?? null,
      locale: this.resolveLocale(this.asString(checkout.locale)),
    };
  }

  private async createCustomQuoteEntitiesFromMetadata(params: {
    paymentId: string;
    payerEmail: string | null;
    metadata: Record<string, unknown> | null;
    amount: number;
    currency: string;
    existingUserId?: string | null;
    customQuote: CustomQuoteCheckoutMetadata;
  }): Promise<CheckoutFinalizationInfo | null> {
    const normalizedEmail = params.payerEmail?.trim().toLowerCase();
    if (!normalizedEmail) return null;

    const signupTokenExpiry = new Date(Date.now() + MAX_SIGNUP_TOKEN_HOURS * 60 * 60 * 1000);

    return this.prisma.$transaction(async (tx) => {
      const quote = await tx.customQuote.findUnique({
        where: { id: params.customQuote.customQuoteId },
        select: {
          id: true,
          finalPrice: true,
          order: {
            select: {
              id: true,
              orderNumber: true,
              totalAmount: true,
              currency: true,
              status: true,
              userId: true,
              package: { select: { name: true } },
            },
          },
        },
      });

      if (!quote) {
        this.logger.warn(
          `Webhook payment ${params.paymentId}: custom quote ${params.customQuote.customQuoteId} not found`
        );
        return null;
      }

      // The quote's price lives in our DB, set by an admin. Metadata's
      // quoteFinalPrice is only a copy and is never the basis for acceptance.
      const agreedPrice = this.toCurrency(Number(quote.finalPrice ?? 0));
      this.assertPaidAmountCovers({
        paymentId: params.paymentId,
        paidAmount: params.amount,
        expectedAmount: agreedPrice > 0 ? agreedPrice : params.customQuote.quoteFinalPrice,
        currency: params.currency,
      });
      params.customQuote.quoteFinalPrice =
        agreedPrice > 0 ? agreedPrice : params.customQuote.quoteFinalPrice;

      if (quote.order) {
        const existingUser = await tx.user.findUnique({
          where: { id: quote.order.userId },
          select: {
            id: true,
            email: true,
            firstName: true,
            preferredLanguage: true,
            phoneNumber: true,
            whatsAppNotificationsEnabled: true,
            password: true,
            isVerified: true,
            isActive: true,
            verificationToken: true,
          },
        });

        if (!existingUser) return null;
        if (!existingUser.isActive) {
          throw new ConflictException(DEACTIVATED_CHECKOUT_ACCOUNT_MESSAGE);
        }

        await tx.payment.update({
          where: { id: params.paymentId },
          data: {
            userId: existingUser.id,
            orderId: quote.order.id,
          },
        });

        if (quote.order.status !== OrderStatus.PAID) {
          await tx.order.update({
            where: { id: quote.order.id },
            data: {
              status: OrderStatus.PAID,
              totalAmount: this.toCurrency(params.customQuote.quoteFinalPrice || params.amount),
              currency: (params.currency || DEFAULT_CURRENCY).toUpperCase(),
            },
          });
        }

        await tx.customQuote.update({
          where: { id: quote.id },
          data: {
            userId: existingUser.id,
            status: "PAID",
          },
        });

        await tx.book.updateMany({
          where: {
            orderId: quote.order.id,
          },
          data: {
            status: BookStatus.PAYMENT_RECEIVED,
            productionStatus: BookStatus.PAYMENT_RECEIVED,
            productionStatusUpdatedAt: new Date(),
          },
        });

        return {
          userId: existingUser.id,
          orderId: quote.order.id,
          email: existingUser.email,
          name: existingUser.firstName,
          locale: this.resolveLocale(existingUser.preferredLanguage),
          signupToken: existingUser.verificationToken ?? null,
          phone: existingUser.phoneNumber ?? null,
          whatsAppNotificationsEnabled: existingUser.whatsAppNotificationsEnabled,
          orderNumber: quote.order.orderNumber,
          packageName: quote.order.package.name,
          amountPaid: this.formatNaira(Number(quote.order.totalAmount)),
          addons: [],
        };
      }

      let user = params.existingUserId
        ? await tx.user.findUnique({ where: { id: params.existingUserId } })
        : null;

      await this.assertCheckoutIdentityConflict({
        email: normalizedEmail,
        phone: params.customQuote.phone,
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

      if (user && !user.isActive) {
        throw new ConflictException(DEACTIVATED_CHECKOUT_ACCOUNT_MESSAGE);
      }

      const fullName = this.pickDisplayName(
        params.customQuote.fullName ?? undefined,
        normalizedEmail
      );
      const splitName = this.splitFullName(fullName);
      const normalizedPhone = params.customQuote.phone?.trim() || user?.phoneNumber || null;
      const normalizedPhoneLookup = normalizePhoneNumber(normalizedPhone);
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
            preferredLanguage: params.customQuote.locale,
            isActive: true,
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
            preferredLanguage: params.customQuote.locale,
            ...(needsSignupToken
              ? {
                  verificationToken: signupToken,
                  tokenExpiry: signupTokenExpiry,
                }
              : {}),
          },
        });
      }

      const fallbackPackage = await tx.package.findFirst({
        where: {
          isActive: true,
          category: {
            isActive: true,
          },
        },
        orderBy: [{ basePrice: "asc" }, { sortOrder: "asc" }],
      });

      if (!fallbackPackage) {
        throw new BadRequestException(
          "No active package is configured for custom quote checkout fulfillment."
        );
      }

      const orderNumber = await this.generateOrderNumber(tx);
      const paidAmount = this.toCurrency(params.customQuote.quoteFinalPrice || params.amount);

      const order = await tx.order.create({
        data: {
          orderNumber,
          userId: user.id,
          packageId: fallbackPackage.id,
          customQuoteId: params.customQuote.customQuoteId,
          skipFormatting: true,
          orderType: "STANDARD",
          packagePriceSnap: Number(fallbackPackage.basePrice),
          hasCoverDesign: true,
          hasFormatting: true,
          bookSize: params.customQuote.quotePrintSize,
          paperColor: "white",
          lamination: "gloss",
          status: OrderStatus.PAID,
          initialAmount: paidAmount,
          extraAmount: 0,
          discountAmount: 0,
          totalAmount: paidAmount,
          currency: (params.currency || DEFAULT_CURRENCY).toUpperCase(),
        } as Prisma.OrderUncheckedCreateInput,
      });

      await tx.book.create({
        data: {
          orderId: order.id,
          userId: user.id,
          status: BookStatus.PAYMENT_RECEIVED,
          title: params.customQuote.quoteTitle,
          pageSize: params.customQuote.quotePrintSize,
          pageCount: null,
          estimatedPages: null,
        },
      });

      await tx.customQuote.update({
        where: { id: params.customQuote.customQuoteId },
        data: {
          userId: user.id,
          status: "PAID",
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
        whatsAppNotificationsEnabled: user.whatsAppNotificationsEnabled,
        orderNumber: order.orderNumber,
        packageName: fallbackPackage.name,
        amountPaid: this.formatNaira(paidAmount),
        addons: [],
      };
    });
  }

  /**
   * Resolve and claim the coupon for a paid checkout.
   *
   * `honorDiscount` is the discount from server-signed pricing: the customer
   * already paid on that basis, so if the coupon expired or ran out between
   * checkout and the webhook we still record that discount rather than book an
   * order whose total disagrees with what was charged.
   */
  private async resolveAppliedCouponForOrder(
    tx: Prisma.TransactionClient,
    checkout: CheckoutMetadata,
    amountPaid: number,
    options: { honorDiscount?: number } = {}
  ): Promise<{ id: string; discountAmount: number } | null> {
    const rawCode = this.asString(checkout.couponCode);
    if (!rawCode) return null;

    const honorDiscount = this.toCurrency(options.honorDiscount ?? 0);
    const honored = async (reason: string) => {
      if (honorDiscount <= 0) return null;
      const existing = await tx.coupon.findUnique({
        where: { code: rawCode.trim().toUpperCase() },
        select: { id: true },
      });
      if (!existing) return null;
      this.logger.warn(
        `Coupon "${rawCode}" ${reason} after checkout — honouring the signed discount of ₦${honorDiscount}.`
      );
      return { id: existing.id, discountAmount: honorDiscount };
    };

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
        appliesToAll: true,
        packageScopes: {
          select: {
            packageId: true,
          },
        },
        categoryScopes: {
          select: {
            categoryId: true,
          },
        },
      },
    });

    if (!coupon) {
      this.logger.warn(`Coupon "${code}" not found. Skipping coupon application.`);
      return null;
    }

    const now = new Date();
    if (!coupon.isActive) {
      this.logger.warn(`Coupon "${code}" is inactive. Skipping coupon application.`);
      return honored("became inactive");
    }
    if (coupon.expiresAt && coupon.expiresAt.getTime() <= now.getTime()) {
      this.logger.warn(`Coupon "${code}" is expired. Skipping coupon application.`);
      return honored("expired");
    }
    if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
      this.logger.warn(`Coupon "${code}" reached usage limit. Skipping coupon application.`);
      return honored("reached its usage limit");
    }

    const packageContext = await this.resolveCheckoutPackageContext(tx, checkout);
    if (!this.isCouponApplicableToCheckout(coupon, packageContext)) {
      this.logger.warn(
        `Coupon "${code}" does not apply to package context. Skipping coupon application.`
      );
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
      return honored("could not be claimed");
    }

    return {
      id: coupon.id,
      discountAmount: honorDiscount > 0 ? honorDiscount : discountAmount,
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

  private async resolveCheckoutPackageContext(
    tx: Prisma.TransactionClient,
    checkout: CheckoutMetadata
  ): Promise<{ id: string; categoryId: string } | null> {
    const packageId = this.asString(checkout.packageId);
    if (packageId) {
      const pkg = await tx.package.findUnique({
        where: { id: packageId },
        select: {
          id: true,
          categoryId: true,
        },
      });

      if (pkg) {
        return pkg;
      }
    }

    const packageSlug = this.asString(checkout.packageSlug) ?? this.asString(checkout.tier);
    if (!packageSlug) {
      return null;
    }

    const pkg = await tx.package.findFirst({
      where: {
        slug: packageSlug,
      },
      select: {
        id: true,
        categoryId: true,
      },
    });

    return pkg ?? null;
  }

  private isCouponApplicableToCheckout(
    coupon: {
      appliesToAll: boolean;
      packageScopes: Array<{ packageId: string }>;
      categoryScopes: Array<{ categoryId: string }>;
    },
    packageContext: { id: string; categoryId: string } | null
  ): boolean {
    if (coupon.appliesToAll) {
      return true;
    }

    if (!packageContext) {
      return false;
    }

    const packageMatch = coupon.packageScopes.some(
      (scope) => scope.packageId === packageContext.id
    );
    if (packageMatch) {
      return true;
    }

    return coupon.categoryScopes.some((scope) => scope.categoryId === packageContext.categoryId);
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

  private mimeToExtension(mimeType: string): string {
    switch (mimeType.toLowerCase()) {
      case "application/pdf":
        return "pdf";
      case "image/png":
        return "png";
      case "image/jpeg":
        return "jpg";
      case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return "docx";
      case "application/msword":
        return "doc";
      default:
        return "bin";
    }
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
      public_id: `receipt_${params.reference}_${Date.now()}.${this.mimeToExtension(params.mimeType)}`,
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
      this.sendBankTransferUserWhatsApp(params),
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
    const ws = this.whatsappService;
    if (!ws) {
      this.logger.debug("WhatsappService not available — skipping admin WhatsApp notification");
      return;
    }
    const recipients = await this.resolveBankTransferAdminWhatsAppRecipients(ws);
    if (recipients.length === 0) {
      this.logger.warn("No admin phone numbers found for bank transfer WhatsApp notifications");
      return;
    }

    const adminPanelUrl = `${this.frontendBaseUrl}/admin/payments`;
    const amountLabel = this.formatNaira(params.amount);

    await Promise.allSettled(
      recipients.map(async (to) => {
        const templateResult = await ws.sendTemplate({
          to,
          templateName: "bank_transfer_admin",
          language: "en",
          kind: "bank transfer admin alert",
          bodyPlaceholders: [
            params.payerName,
            params.payerEmail,
            params.payerPhone,
            amountLabel,
            params.orderNumber,
          ],
          callbackData: params.orderNumber,
          meta: {
            orderNumber: params.orderNumber,
            receiptUrl: params.receiptUrl,
            packageName: params.packageName,
            addons: params.addons,
          },
        });

        if (templateResult.delivered || !templateResult.attempted) {
          return templateResult;
        }

        return ws.sendText({
          to,
          kind: "bank transfer admin alert text fallback",
          text:
            `Hi Admin,\n\n` +
            `New Bank Transfer Received\n\n` +
            `A new bank transfer has been submitted and requires your review.\n\n` +
            `Payer Name: ${params.payerName}\n` +
            `Payer Email: ${params.payerEmail}\n` +
            `Payer Phone: ${params.payerPhone}\n` +
            `Amount: ${amountLabel}\n` +
            `Order Number: ${params.orderNumber}\n` +
            `Receipt: ${params.receiptUrl}\n` +
            `Review in Admin Panel: ${adminPanelUrl}\n\n` +
            `Please review within 30 minutes to maintain our SLA.`,
          callbackData: params.orderNumber,
          meta: {
            orderNumber: params.orderNumber,
            receiptUrl: params.receiptUrl,
            packageName: params.packageName,
            addons: params.addons,
            templateName: "bank_transfer_admin",
            templateLanguage: "en",
            templateFailureReason: templateResult.failureReason,
            fallbackChannel: "text",
          },
        });
      })
    );
  }

  private async sendBankTransferUserWhatsApp(params: {
    payerName: string;
    payerPhone: string;
    amount: number;
    orderNumber: string;
    locale: Locale;
    packageName?: string;
    addons?: string[];
  }): Promise<void> {
    const wns = this.whatsappNotificationsService;
    if (!wns) {
      this.logger.debug(
        "WhatsappNotificationsService not available — skipping user WhatsApp notification"
      );
      return;
    }
    await wns.sendBankTransferVerification({
      recipient: {
        userName: params.payerName,
        phoneNumber: params.payerPhone,
        preferredLanguage: params.locale,
      },
      orderNumber: params.orderNumber,
      amountLabel: this.formatNaira(params.amount),
      expectedWaitTime: "Less than 30 minutes",
      packageName: params.packageName,
      addons: params.addons,
    });
  }

  private async resolveBankTransferAdminWhatsAppRecipients(ws: WhatsappService): Promise<string[]> {
    const configuredRecipients = await this.resolveConfiguredAdminWhatsAppRecipients(ws);
    if (configuredRecipients.length > 0) {
      return configuredRecipients;
    }

    const admins = await this.prisma.user.findMany({
      where: {
        role: { in: [UserRole.ADMIN, UserRole.SUPER_ADMIN] },
      },
      select: { phoneNumber: true },
    });

    const dbRecipients = admins
      .map((admin) => ws.normalizePhone(admin.phoneNumber))
      .filter((phone) => phone.length > 0);

    if (dbRecipients.length > 0) {
      return Array.from(new Set(dbRecipients));
    }

    const fallback = ws.normalizePhone(BANK_TRANSFER_ADMIN_WHATSAPP_FALLBACK);
    return fallback ? [fallback] : [];
  }

  private async resolveConfiguredAdminWhatsAppRecipients(ws: WhatsappService): Promise<string[]> {
    const systemSettingModel = (
      this.prisma as PrismaService & {
        systemSetting?: {
          findUnique?: (args: {
            where: { key: string };
            select: { value: true };
          }) => Promise<{ value: string } | null>;
        };
      }
    ).systemSetting;

    const configured = await systemSettingModel?.findUnique?.({
      where: { key: "admin_whatsapp_numbers" },
      select: { value: true },
    });

    return this.parseAdminWhatsAppRecipients(configured?.value ?? null, ws);
  }

  private parseAdminWhatsAppRecipients(
    value: string | null | undefined,
    ws: WhatsappService
  ): string[] {
    const normalized = value?.trim();
    if (!normalized) return [];

    return Array.from(
      new Set(
        normalized
          .split(",")
          .map((entry) => ws.normalizePhone(entry))
          .filter((entry) => entry.length > 0)
      )
    );
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
      from: this.customerPaymentsFromEmail,
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
      from: this.adminNotificationsFromEmail,
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
    emailNotificationsEnabled?: boolean | null;
  }): Promise<boolean> {
    if (
      !isUserNotificationChannelEnabled({
        enabled: params.emailNotificationsEnabled,
        kind: "bank_transfer_rejected",
      })
    ) {
      return false;
    }

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
      from: this.customerPaymentsFromEmail,
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

  private async sendPaymentConfirmationWhatsApp(params: {
    userName: string;
    phoneNumber?: string | null;
    preferredLanguage?: string | null;
    whatsAppNotificationsEnabled?: boolean;
    orderNumber: string;
    packageName: string;
    amountPaid: string;
    addons?: string[];
    variant?: "standard" | "quote" | "reprint" | "extra_pages" | "bank_transfer";
    dashboardUrl?: string | null;
  }): Promise<void> {
    if (!this.whatsappNotificationsService) return;
    // CLAUDE.md Section 22: WhatsApp is supplementary and must fail silently —
    // email and in-app notifications still work. The low-level sender guards
    // itself, but asserting the policy here means a future change to that layer
    // cannot start failing committed orders.
    await this.runPostCommitNotification("payment confirmation WhatsApp", async () => {
      await this.whatsappNotificationsService?.sendPaymentConfirmation({
        recipient: {
          userName: params.userName,
          phoneNumber: params.phoneNumber,
          preferredLanguage: params.preferredLanguage,
          whatsAppNotificationsEnabled: params.whatsAppNotificationsEnabled,
        },
        orderNumber: params.orderNumber,
        amountLabel: params.amountPaid,
        packageName: params.packageName,
        addons: params.addons,
        dashboardUrl: params.dashboardUrl,
        variant: params.variant,
      });
    });
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

  /**
   * Send confirmation emails when an authenticated user places a new book
   * order from the dashboard ("Print a New Book" flow).
   * - User: order confirmation (locale-aware)
   * - Admin: new order alert (English only)
   */
  private async sendNewBookOrderEmails(params: {
    paymentId: string;
    baseMetadata?: Record<string, unknown> | null;
    locale: Locale;
    userName: string;
    userEmail: string;
    orderNumber: string;
    packageName: string;
    amountPaid: string;
    addons: string[];
    provider: PaymentProvider;
    reference: string;
  }): Promise<void> {
    if (!this.resend) {
      this.logger.warn("RESEND_API_KEY not set — new book order emails skipped");
      return;
    }

    const metadata = this.asRecord(params.baseMetadata);
    const delivery = this.extractDashboardOrderEmailDelivery(metadata);
    if (delivery.userSentAt && delivery.adminSentAt) {
      return;
    }

    const dashboardUrl = this.buildLocalizedDashboardUrl(params.locale);
    const adminPanelUrl = `${this.frontendBaseUrl}/admin/orders`;
    const attemptedAt = new Date().toISOString();
    let userSentAt = delivery.userSentAt ?? null;
    let adminSentAt = delivery.adminSentAt ?? null;

    // Send user confirmation email
    if (!userSentAt) {
      try {
        const userEmail = await renderNewBookOrderUserEmail({
          locale: params.locale,
          userName: params.userName,
          orderNumber: params.orderNumber,
          packageName: params.packageName,
          totalPrice: params.amountPaid,
          addons: params.addons,
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
            `Failed to send new book order user email: ${sendResult.error.name} — ${sendResult.error.message}`
          );
        } else {
          userSentAt = attemptedAt;
        }
      } catch (error) {
        this.logger.error(
          `Failed to send new book order email to ${params.userEmail}: ${error instanceof Error ? error.message : error}`,
          error instanceof Error ? error.stack : undefined
        );
      }
    }

    // Send admin notification email
    if (!adminSentAt) {
      try {
        const adminEmail = await renderNewBookOrderAdminEmail({
          locale: "en",
          userName: params.userName,
          userEmail: params.userEmail,
          orderNumber: params.orderNumber,
          packageName: params.packageName,
          totalPrice: params.amountPaid,
          addons: params.addons,
          provider: params.provider,
          reference: params.reference,
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
            `Failed to send new book order admin notification: ${sendResult.error.name} — ${sendResult.error.message}`
          );
        } else {
          adminSentAt = attemptedAt;
        }
      } catch (error) {
        this.logger.error(
          `Failed to send new book order admin notification for ${params.orderNumber}: ${error instanceof Error ? error.message : error}`,
          error instanceof Error ? error.stack : undefined
        );
      }
    }

    if (!metadata) {
      return;
    }

    try {
      await this.prisma.payment.update({
        where: { id: params.paymentId },
        data: {
          metadata: this.withDashboardOrderEmailDelivery(metadata, {
            userSentAt,
            adminSentAt,
            lastAttemptAt: attemptedAt,
          }) as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to persist new book order email delivery state for payment ${params.paymentId}: ${error instanceof Error ? error.message : error}`,
        error instanceof Error ? error.stack : undefined
      );
    }
  }

  private extractDashboardOrderEmailDelivery(
    metadata: Record<string, unknown> | null
  ): DashboardOrderEmailDeliverySnapshot {
    const snapshot = this.asRecord(metadata?.dashboardOrderEmailDelivery);
    return {
      userSentAt: this.asString(snapshot?.userSentAt),
      adminSentAt: this.asString(snapshot?.adminSentAt),
      lastAttemptAt: this.asString(snapshot?.lastAttemptAt),
    };
  }

  private withDashboardOrderEmailDelivery(
    metadata: Record<string, unknown>,
    delivery: DashboardOrderEmailDeliverySnapshot
  ): Record<string, unknown> {
    return {
      ...metadata,
      dashboardOrderEmailDelivery: {
        ...this.asRecord(metadata.dashboardOrderEmailDelivery),
        ...delivery,
      },
    };
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

    await this.runPostCommitNotification("online payment admin email", async () => {
      const sendResult = await this.resend?.emails.send({
        from: this.adminNotificationsFromEmail,
        to: this.adminEmailRecipients,
        subject,
        html,
      });

      if (sendResult?.error) {
        this.logger.error(
          `Failed to send online payment admin email: ${sendResult.error.name} — ${sendResult.error.message}`
        );
      }
    });
  }

  /**
   * Runs a notification that happens AFTER the order is already committed.
   *
   * Resend reports API-level problems via `sendResult.error`, but a transport
   * failure — DNS, TLS, timeout — makes the call *reject*. Unguarded, that
   * rejection propagates out of the webhook handler, which produces this chain:
   *
   *   order committed -> notification rejects -> webhook returns 5xx ->
   *   Paystack retries -> the idempotency guard reports "already processed" ->
   *   the remaining notifications are never sent.
   *
   * The customer ends up with an order they were never told about. Since the
   * money is taken and the entities exist, abandoning a notification is strictly
   * better than failing the request: admins can re-send, and the signup link in
   * particular is independently tracked and re-sendable.
   *
   * The timeout also bounds how long one slow provider can hold the handler.
   * Note it does NOT by itself guarantee the whole webhook fits Paystack's 10s
   * budget — several notifications run in sequence. That needs finalisation
   * moved off the request path entirely; see the launch checklist.
   */
  private async runPostCommitNotification(label: string, task: () => Promise<void>): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        task(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error(`timed out after ${POST_COMMIT_NOTIFICATION_TIMEOUT_MS}ms`)),
            POST_COMMIT_NOTIFICATION_TIMEOUT_MS
          );
        }),
      ]);
    } catch (error) {
      // Deliberately swallowed — see the method docs. Logged at error level so it
      // is still visible in Sentry/Pino.
      this.logger.error(
        `Post-commit notification "${label}" failed and was not retried inline: ` +
          `${error instanceof Error ? error.message : error}`
      );
    } finally {
      if (timer) clearTimeout(timer);
    }
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

  private buildLocalizedDashboardUrl(locale: Locale): string {
    return `${this.frontendBaseUrl}/${locale}${DEFAULT_DASHBOARD_PATH}`;
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

  private resolveFrontendBaseUrl(): string {
    const raw = process.env.FRONTEND_URL?.trim();
    if (!raw) {
      throw new Error("FRONTEND_URL environment variable is required for payment redirect links");
    }
    return raw.replace(/\/+$/, "");
  }

  private async attemptSignupLinkDelivery(params: {
    paymentId: string;
    paymentReference: string;
    baseMetadata?: Record<string, unknown> | null;
    source: SignupLinkDeliveryAttemptSource;
    email: string;
    name: string;
    locale: Locale;
    token: string;
    phoneNumber?: string | null;
    orderNumber?: string;
    packageName?: string;
    amountPaid?: string;
    addons?: string[];
  }): Promise<SignupLinkDeliverySnapshot> {
    const delivery = await this.signupNotificationsService.sendRegistrationLink({
      email: params.email,
      name: params.name,
      locale: params.locale,
      token: params.token,
      phoneNumber: params.phoneNumber,
      fromEmail: this.customerPaymentsFromEmail,
      orderNumber: params.orderNumber,
      packageName: params.packageName,
      amountPaid: params.amountPaid,
      addons: params.addons,
    });
    const metadata =
      params.baseMetadata ??
      this.asRecord(
        (
          await this.prisma.payment.findUnique({
            where: { id: params.paymentId },
            select: { metadata: true },
          })
        )?.metadata
      );
    const previous = this.readSignupLinkDeliverySnapshot(metadata);
    const attemptedAt = this.asString(delivery.attemptedAt) ?? new Date().toISOString();
    const delivered = delivery.emailDelivered || delivery.whatsappDelivered;
    const snapshot: SignupLinkDeliverySnapshot = {
      status: delivered
        ? delivery.emailDelivered && delivery.whatsappDelivered
          ? "DELIVERED"
          : "PARTIAL"
        : "FAILED",
      emailDelivered: delivery.emailDelivered,
      whatsappDelivered: delivery.whatsappDelivered,
      emailFailureReason: this.truncateSignupLinkFailureReason(delivery.emailFailureReason),
      whatsappFailureReason: this.truncateSignupLinkFailureReason(delivery.whatsappFailureReason),
      attemptCount: (previous?.attemptCount ?? 0) + 1,
      lastAttemptAt: attemptedAt,
      lastSuccessfulAt: delivered ? attemptedAt : (previous?.lastSuccessfulAt ?? null),
      lastAttemptSource: params.source,
    };
    const nextMetadata = {
      ...(metadata ?? {}),
      [SIGNUP_LINK_DELIVERY_METADATA_KEY]: snapshot,
    };

    await this.prisma.payment.update({
      where: { id: params.paymentId },
      data: {
        metadata: nextMetadata as Prisma.InputJsonValue,
      },
    });

    if (snapshot.status === "FAILED") {
      this.logger.warn(
        `Signup link delivery failed for payment ${params.paymentReference} ` +
          `(attempt ${snapshot.attemptCount}, source ${params.source}). ` +
          `emailReason=${snapshot.emailFailureReason ?? "none"}, ` +
          `whatsappReason=${snapshot.whatsappFailureReason ?? "none"}`
      );
    } else {
      const channels =
        snapshot.emailDelivered && snapshot.whatsappDelivered
          ? "email and WhatsApp"
          : snapshot.emailDelivered
            ? "email"
            : "WhatsApp";
      this.logger.log(
        `Signup link delivered for payment ${params.paymentReference} via ${channels} ` +
          `(attempt ${snapshot.attemptCount}, source ${params.source})`
      );
    }

    return snapshot;
  }

  private readSignupLinkDeliverySnapshot(
    metadata: Record<string, unknown> | null
  ): SignupLinkDeliverySnapshot | null {
    const raw = this.asRecord(metadata?.[SIGNUP_LINK_DELIVERY_METADATA_KEY]);
    if (!raw) return null;

    const status = this.asString(raw.status);
    if (status !== "DELIVERED" && status !== "PARTIAL" && status !== "FAILED") {
      return null;
    }

    return {
      status,
      emailDelivered: this.asBoolean(raw.emailDelivered) ?? false,
      whatsappDelivered: this.asBoolean(raw.whatsappDelivered) ?? false,
      emailFailureReason: this.asString(raw.emailFailureReason) ?? null,
      whatsappFailureReason: this.asString(raw.whatsappFailureReason) ?? null,
      attemptCount: this.asInteger(raw.attemptCount) ?? 0,
      lastAttemptAt: this.asString(raw.lastAttemptAt) ?? null,
      lastSuccessfulAt: this.asString(raw.lastSuccessfulAt) ?? null,
      lastAttemptSource:
        this.asString(raw.lastAttemptSource) === "BANK_TRANSFER_APPROVAL" ||
        this.asString(raw.lastAttemptSource) === "VERIFY_RETRY"
          ? (this.asString(raw.lastAttemptSource) as SignupLinkDeliveryAttemptSource)
          : "WEBHOOK",
    };
  }

  private toPublicSignupLinkDeliveryStatus(
    snapshot: SignupLinkDeliverySnapshot | null
  ): PublicSignupLinkDeliveryStatus | null {
    if (!snapshot) return null;

    return {
      status: snapshot.status,
      emailDelivered: snapshot.emailDelivered,
      whatsappDelivered: snapshot.whatsappDelivered,
      attemptCount: snapshot.attemptCount,
      lastAttemptAt: snapshot.lastAttemptAt,
      retryEligible: this.isSignupLinkDeliveryRetryEligible(snapshot),
    };
  }

  private isSignupLinkDeliveryRetryEligible(snapshot: SignupLinkDeliverySnapshot | null): boolean {
    if (!snapshot) return false;
    return (
      snapshot.status === "FAILED" && snapshot.attemptCount < SIGNUP_LINK_DELIVERY_MAX_ATTEMPTS
    );
  }

  private truncateSignupLinkFailureReason(value?: string | null): string | null {
    const normalized = this.asString(value);
    if (!normalized) return null;
    return normalized.length > 220 ? `${normalized.slice(0, 217)}...` : normalized;
  }

  private async resolveSignupFollowUpForReference(
    reference: string,
    options: {
      retryFailedDelivery?: boolean;
    } = {}
  ): Promise<{
    signupUrl: string | null;
    signupDelivery: PublicSignupLinkDeliveryStatus | null;
  }> {
    const payment = await this.prisma.payment.findUnique({
      where: { providerRef: reference },
      select: {
        id: true,
        type: true,
        status: true,
        metadata: true,
        user: {
          select: {
            email: true,
            firstName: true,
            phoneNumber: true,
            isActive: true,
            verificationToken: true,
            tokenExpiry: true,
            preferredLanguage: true,
          },
        },
        order: {
          select: {
            orderNumber: true,
            totalAmount: true,
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
        },
      },
    });

    if (!payment || payment.status !== PaymentStatus.SUCCESS) {
      return {
        signupUrl: null,
        signupDelivery: null,
      };
    }

    const supportsSignupFollowUp =
      payment.type === PaymentType.INITIAL || payment.type === PaymentType.CUSTOM_QUOTE;

    if (!supportsSignupFollowUp) {
      return {
        signupUrl: null,
        signupDelivery: null,
      };
    }

    const metadata = this.asRecord(payment.metadata);
    let snapshot = this.readSignupLinkDeliverySnapshot(metadata);
    const token = payment.user?.verificationToken?.trim();
    const tokenExpired = Boolean(
      payment.user?.tokenExpiry && payment.user.tokenExpiry < new Date()
    );
    const userInactive = payment.user?.isActive === false;
    const locale = this.resolveLocale(payment.user?.preferredLanguage);

    if (options.retryFailedDelivery && snapshot?.status === "FAILED") {
      if (!token) {
        this.logger.warn(
          `Signup link retry skipped for payment ${reference}: verification token missing`
        );
        this.captureStrandedSignup(reference, payment.id, "verification_token_missing");
      } else if (userInactive) {
        // Deliberately NOT captured: the account was deactivated, so having no
        // signup link is the intended outcome rather than a stranded customer.
        this.logger.warn(`Signup link retry skipped for payment ${reference}: user is inactive`);
      } else if (tokenExpired) {
        this.logger.warn(
          `Signup link retry skipped for payment ${reference}: verification token expired`
        );
        this.captureStrandedSignup(reference, payment.id, "verification_token_expired");
      } else if (!this.isSignupLinkDeliveryRetryEligible(snapshot)) {
        this.logger.warn(
          `Signup link retry skipped for payment ${reference}: max attempts reached (${snapshot.attemptCount})`
        );
        this.captureStrandedSignup(reference, payment.id, "max_delivery_attempts_reached", {
          attemptCount: snapshot.attemptCount,
        });
      } else if (!payment.user?.email || !payment.order) {
        this.logger.warn(
          `Signup link retry skipped for payment ${reference}: payment follow-up context incomplete`
        );
        this.captureStrandedSignup(reference, payment.id, "follow_up_context_incomplete");
      } else {
        snapshot = await this.attemptSignupLinkDelivery({
          paymentId: payment.id,
          paymentReference: reference,
          baseMetadata: metadata,
          source: "VERIFY_RETRY",
          email: payment.user.email,
          name:
            payment.user.firstName?.trim() || this.pickDisplayName(undefined, payment.user.email),
          locale,
          token,
          phoneNumber: payment.user.phoneNumber ?? null,
          orderNumber: payment.order.orderNumber,
          packageName: payment.order.package.name,
          amountPaid: this.formatNaira(Number(payment.order.totalAmount)),
          addons: payment.order.addons
            .map((entry) => entry.addon.name)
            .filter((value): value is string => value.trim().length > 0),
        });
      }
    }

    if (!token || tokenExpired || userInactive) {
      return {
        signupUrl: null,
        signupDelivery: this.toPublicSignupLinkDeliveryStatus(snapshot),
      };
    }

    return {
      signupUrl: this.buildSignupFinishUrl(token, locale),
      signupDelivery: this.toPublicSignupLinkDeliveryStatus(snapshot),
    };
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
    return this.gatewayService.ensureGatewayEnabled(provider);
  }

  /**
   * Ensure the provider SDK/service is available (keys are configured).
   */
  private ensureProviderAvailable(provider: PaymentProvider): void {
    this.gatewayService.ensureProviderAvailable(provider);
  }

  /**
   * Whether an enabled gateway can be shown in checkout.
   */
  private isGatewayAvailableForCheckout(provider: PaymentProvider): boolean {
    return this.gatewayService.isGatewayAvailableForCheckout(provider);
  }

  /** reCAPTCHA check — fails closed in production (see common/recaptcha.ts). */
  private verifyRecaptcha(token: string): Promise<boolean> {
    return verifyRecaptchaToken(token, this.logger);
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
   * Fetch reprint cost-per-page and cover-cost from SystemSetting.
   * Returns [costPerPage, coverCost] with sensible defaults.
   */
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
