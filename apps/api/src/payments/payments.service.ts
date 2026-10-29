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
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { Resend } from "resend";
import { CloudinaryService } from "../cloudinary/index.js";
import type { Prisma } from "../generated/prisma/client.js";
import {
  BookStatus,
  PaymentProvider,
  PaymentStatus,
  PaymentType,
} from "../generated/prisma/enums.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { SignupNotificationsService } from "../notifications/signup-notifications.service.js";
import { WhatsappService } from "../notifications/whatsapp.service.js";
import { WhatsappNotificationsService } from "../notifications/whatsapp-notifications.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { RolloutService } from "../rollout/rollout.service.js";
import { ScannerService } from "../scanner/scanner.service.js";
import type { InitializePaymentDto } from "./dto/payment-request.dto.js";
import {
  asRecord,
  asString,
  extractCheckoutMetadata,
  formatNaira,
  generatePaymentReference,
  parseProviderHint,
  pickDisplayName,
  REPRINT_MIN_COPIES,
  resolveLocale,
  stripClientTrustedMetadata,
  toCurrency,
} from "./payment-metadata.js";
import { AdminPaymentListService } from "./services/admin-payment-list.service.js";
import { BankTransferService } from "./services/bank-transfer.service.js";
import { CheckoutFulfillmentService } from "./services/checkout-fulfillment.service.js";
import { CheckoutIdentityService } from "./services/checkout-identity.service.js";
import { CheckoutMetadataPricingService } from "./services/checkout-metadata-pricing.service.js";
import { CheckoutPricingService } from "./services/checkout-pricing.service.js";
import { CustomQuoteFulfillmentService } from "./services/custom-quote-fulfillment.service.js";
import { ExtraPagesPaymentService } from "./services/extra-pages-payment.service.js";
import { GatewayService } from "./services/gateway.service.js";
import { PaymentNotificationsService } from "./services/payment-notifications.service.js";
import { PaymentReconciliationService } from "./services/payment-reconciliation.service.js";
import { PayPalService } from "./services/paypal.service.js";
import type { PaystackWebhookPayload } from "./services/paystack.service.js";
import { PaystackService } from "./services/paystack.service.js";
import { RefundService } from "./services/refund.service.js";
import { ReprintPaymentService } from "./services/reprint-payment.service.js";
import { SignupLinkDeliveryService } from "./services/signup-link-delivery.service.js";
import { StripeService } from "./services/stripe.service.js";

const DEFAULT_REPRINT_COST_PER_PAGE = 15;
const DEFAULT_REPRINT_COVER_COST = 300;
const REPRINT_COST_PER_PAGE_SETTING_KEY = "reprint_cost_per_page";
const REPRINT_COVER_COST_SETTING_KEY = "reprint_cover_cost";
const REPRINT_ELIGIBLE_BOOK_STATUSES = new Set<BookStatus>([
  BookStatus.DELIVERED,
  BookStatus.COMPLETED,
]);

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
    if (this.paymentNotifications) this.paymentNotifications.resend = value;
  }
  // Sub-services injected by NestJS DI in production; created internally in tests for backward compat
  private gatewayService!: GatewayService;
  private adminPaymentListService!: AdminPaymentListService;
  private refundService!: RefundService;
  private reprintPaymentService!: ReprintPaymentService;
  private extraPagesService!: ExtraPagesPaymentService;
  private paymentNotifications!: PaymentNotificationsService;
  private signupLinkDelivery!: SignupLinkDeliveryService;
  private paymentReconciliation!: PaymentReconciliationService;
  private metadataPricing!: CheckoutMetadataPricingService;
  private checkoutIdentity!: CheckoutIdentityService;
  private customQuoteFulfillment!: CustomQuoteFulfillmentService;
  private checkoutFulfillment!: CheckoutFulfillmentService;
  private bankTransfers!: BankTransferService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly paystackService: PaystackService,
    private readonly stripeService: StripeService,
    private readonly paypalService: PayPalService,
    scanner: ScannerService,
    cloudinary: CloudinaryService,
    signupNotificationsService: SignupNotificationsService,
    notificationsService: NotificationsService,
    rollout: RolloutService,
    @Optional() whatsappService: WhatsappService | null,
    @Optional() private readonly whatsappNotificationsService: WhatsappNotificationsService | null,
    @Optional() gatewayServiceInject?: GatewayService,
    @Optional() adminPaymentListServiceInject?: AdminPaymentListService,
    @Optional() refundServiceInject?: RefundService,
    @Optional() reprintPaymentServiceInject?: ReprintPaymentService,
    @Optional() extraPagesServiceInject?: ExtraPagesPaymentService,
    @Optional() checkoutPricingServiceInject?: CheckoutPricingService,
    @Optional() paymentNotificationsInject?: PaymentNotificationsService,
    @Optional() signupLinkDeliveryInject?: SignupLinkDeliveryService,
    @Optional() paymentReconciliationInject?: PaymentReconciliationService,
    @Optional() metadataPricingInject?: CheckoutMetadataPricingService,
    @Optional() checkoutFulfillmentInject?: CheckoutFulfillmentService,
    @Optional() bankTransfersInject?: BankTransferService,
    @Optional() checkoutIdentityInject?: CheckoutIdentityService,
    @Optional() customQuoteFulfillmentInject?: CustomQuoteFulfillmentService
  ) {
    this.resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
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
    const checkoutPricing = checkoutPricingServiceInject ?? new CheckoutPricingService(prisma);
    this.paymentNotifications =
      paymentNotificationsInject ??
      new PaymentNotificationsService(
        prisma,
        notificationsService,
        whatsappService,
        whatsappNotificationsService
      );
    this.signupLinkDelivery =
      signupLinkDeliveryInject ?? new SignupLinkDeliveryService(prisma, signupNotificationsService);
    this.paymentReconciliation =
      paymentReconciliationInject ?? new PaymentReconciliationService(prisma, paystackService);
    this.metadataPricing =
      metadataPricingInject ?? new CheckoutMetadataPricingService(prisma, checkoutPricing);
    this.checkoutIdentity = checkoutIdentityInject ?? new CheckoutIdentityService(prisma);
    this.customQuoteFulfillment =
      customQuoteFulfillmentInject ??
      new CustomQuoteFulfillmentService(prisma, this.metadataPricing, this.checkoutIdentity);
    // Built from this service's own collaborators, so a spec that stubs one of
    // them (e.g. paymentNotifications) stubs what fulfilment uses.
    this.checkoutFulfillment =
      checkoutFulfillmentInject ??
      new CheckoutFulfillmentService(
        prisma,
        notificationsService,
        this.paymentNotifications,
        this.signupLinkDelivery,
        this.metadataPricing,
        this.checkoutIdentity,
        this.customQuoteFulfillment,
        this.extraPagesService,
        this.reprintPaymentService,
        whatsappNotificationsService
      );
    this.bankTransfers =
      bankTransfersInject ??
      new BankTransferService(
        prisma,
        this.gatewayService,
        scanner,
        cloudinary,
        notificationsService,
        this.paymentNotifications,
        this.signupLinkDelivery,
        this.metadataPricing,
        this.checkoutFulfillment,
        this.checkoutIdentity,
        this.reprintPaymentService
      );
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
      metadata: stripClientTrustedMetadata(asRecord(input.metadata)) ?? undefined,
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
    await this.checkoutIdentity.assertCheckoutIdentityConflict({
      email: input.email,
      phone: extractCheckoutMetadata(asRecord(input.metadata))?.phone ?? null,
    });

    // 3. Re-price on the server. The browser's amount is only compared, never
    //    charged — see CheckoutPricingService for the full rationale.
    const priced = await this.metadataPricing.priceCheckoutMetadata({
      metadata: asRecord(input.metadata),
      clientAmount: input.amount,
      currency: input.currency,
    });
    const normalizedMetadata = priced.metadata;
    const checkoutMetadata = extractCheckoutMetadata(normalizedMetadata);
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
    const dashboardUserId = asString(checkoutMetadata?.dashboardUserId);
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
          await this.reprintPaymentService.createReprintEntitiesFromMetadata({
            paymentId: existing.id,
            userId: existing.userId,
            payerEmail: existing.payerEmail,
            metadata: asRecord(existing.metadata),
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
      const signupFollowUp = await this.signupLinkDelivery.resolveSignupFollowUpForReference(
        reference,
        {
          retryFailedDelivery: true,
        }
      );
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

      const existingMetadata = asRecord(existing.metadata);
      const isDashboardOrder = asString(existingMetadata?.source) === "dashboard";
      if (
        isDashboardOrder &&
        existing.status === PaymentStatus.SUCCESS &&
        existing.payerEmail &&
        orderDetails
      ) {
        await this.paymentNotifications.sendNewBookOrderEmails({
          paymentId: existing.id,
          baseMetadata: existingMetadata,
          locale: resolveLocale(asString(existingMetadata?.locale)),
          userName: pickDisplayName(
            asString(existingMetadata?.fullName) || undefined,
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
    const providerHint = parseProviderHint(providerHintRaw);
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
            await this.checkoutFulfillment.createPaymentFromWebhook({
              provider: PaymentProvider.PAYSTACK,
              providerRef: reference,
              amount: amount ?? 0,
              currency: currency ?? DEFAULT_CURRENCY,
              payerEmail: resp.customer?.email ?? existing?.payerEmail ?? null,
              gatewayResponse: resp as unknown as Record<string, unknown>,
              metadata:
                (resp.metadata as Record<string, unknown> | null) ??
                asRecord(existing?.metadata) ??
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
            await this.checkoutFulfillment.createPaymentFromWebhook({
              provider: PaymentProvider.STRIPE,
              providerRef: reference,
              amount: amount ?? 0,
              currency: currency ?? DEFAULT_CURRENCY,
              payerEmail: resp.customerEmail ?? existing?.payerEmail ?? null,
              gatewayResponse: resp as unknown as Record<string, unknown>,
              metadata:
                (resp.metadata as Record<string, unknown> | null) ??
                asRecord(existing?.metadata) ??
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
            await this.checkoutFulfillment.createPaymentFromWebhook({
              provider: PaymentProvider.PAYPAL,
              providerRef: reference,
              amount: amount ?? 0,
              currency: currency ?? DEFAULT_CURRENCY,
              payerEmail: resp.payerEmail ?? existing.payerEmail ?? null,
              gatewayResponse: resp as unknown as Record<string, unknown>,
              metadata: asRecord(existing.metadata) ?? null,
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

    const signupFollowUp = await this.signupLinkDelivery.resolveSignupFollowUpForReference(
      reference,
      {
        retryFailedDelivery: true,
      }
    );

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

  // ────────────────────────────────────────────
  // Bank transfers (BankTransferService)
  // ────────────────────────────────────────────

  submitDashboardBankTransfer(
    params: Parameters<BankTransferService["submitDashboardBankTransfer"]>[0]
  ) {
    return this.bankTransfers.submitDashboardBankTransfer(params);
  }

  submitBankTransfer(...args: Parameters<BankTransferService["submitBankTransfer"]>) {
    return this.bankTransfers.submitBankTransfer(...args);
  }

  uploadReprintBankTransferReceipt(
    params: Parameters<BankTransferService["uploadReprintBankTransferReceipt"]>[0]
  ) {
    return this.bankTransfers.uploadReprintBankTransferReceipt(params);
  }

  approveBankTransfer(params: Parameters<BankTransferService["approveBankTransfer"]>[0]) {
    return this.bankTransfers.approveBankTransfer(params);
  }

  rejectBankTransfer(params: Parameters<BankTransferService["rejectBankTransfer"]>[0]) {
    return this.bankTransfers.rejectBankTransfer(params);
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
    const amount = toCurrency(costPerCopy * params.copies);
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
  /**
   * Finalise successful Paystack charges that never became orders (no webhook on
   * the shared account; see PaymentReconciliationService). Each charge is
   * finalised through verify(), the same idempotent path as the browser redirect.
   */
  async reconcilePaystackPayments(options: { lookbackHours?: number } = {}) {
    return this.paymentReconciliation.reconcilePaystackPayments(options, (reference) =>
      this.verify(reference, "PAYSTACK")
    );
  }

  // ────────────────────────────────────────────
  // Payment reconciliation (safety net for missed webhooks)
  // ────────────────────────────────────────────

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
      const classification = await this.paymentReconciliation.classifyCharge(metadata);

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
        await this.checkoutFulfillment.createPaymentFromWebhook({
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
        await this.checkoutFulfillment.createPaymentFromWebhook({
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
      amountPaid: formatNaira(Number(order.totalAmount)),
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

  /** Kept as a method so specs can make references deterministic. */
  private generateReference(prefix = "bp"): string {
    return generatePaymentReference(prefix);
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

    const costPerPage = toCurrency(costPerPageRaw);
    const coverCost = toCurrency(coverCostRaw);

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
