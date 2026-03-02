import { randomBytes } from "node:crypto";
import type { Locale } from "@bookprinta/emails";
import {
  renderBankTransferAdminEmail,
  renderBankTransferUserEmail,
} from "@bookprinta/emails/render";
import { DEFAULT_CURRENCY } from "@bookprinta/shared";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Resend } from "resend";
import { MAX_FILE_SIZE_BYTES } from "../cloudinary/cloudinary.service.js";
import { CloudinaryService } from "../cloudinary/index.js";
import type { Prisma } from "../generated/prisma/client.js";
import {
  BookStatus,
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
  PaymentType,
  UserRole,
} from "../generated/prisma/client.js";
import { SignupNotificationsService } from "../notifications/signup-notifications.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ScannerService } from "../scanner/scanner.service.js";
import type { InitializePaymentDto } from "./dto/payment-request.dto.js";
import { PayPalService } from "./services/paypal.service.js";
import type { PaystackWebhookPayload } from "./services/paystack.service.js";
import { PaystackService } from "./services/paystack.service.js";
import { StripeService } from "./services/stripe.service.js";

const FRONTEND_FALLBACK_URL = "https://bookprinta.com";
const MAX_SIGNUP_TOKEN_HOURS = 24;

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
  packageId?: string;
  packageSlug?: string;
  tier?: string;
  hasCover?: boolean;
  hasFormatting?: boolean;
  bookSize?: string;
  paperColor?: string;
  lamination?: string;
  formattingWordCount?: number;
  discountAmount?: number;
  totalPrice?: number;
  addons?: CheckoutAddonMetadata[];
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly paystackService: PaystackService,
    private readonly stripeService: StripeService,
    private readonly paypalService: PayPalService,
    private readonly scanner: ScannerService,
    private readonly cloudinary: CloudinaryService,
    private readonly signupNotificationsService: SignupNotificationsService
  ) {
    this.resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
    this.frontendBaseUrl = (process.env.FRONTEND_URL || FRONTEND_FALLBACK_URL).replace(/\/+$/, "");
    this.paymentsFromEmail =
      process.env.PAYMENTS_FROM_EMAIL ||
      process.env.AUTH_FROM_EMAIL ||
      "BookPrinta <onboarding@resend.dev>";
    this.adminEmailRecipients = (
      process.env.PAYMENT_ADMIN_EMAILS ||
      process.env.CONTACT_ADMIN_EMAIL ||
      "info@bookprinta.com"
    )
      .split(",")
      .map((email) => email.trim())
      .filter((email) => email.length > 0);
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
      return {
        status: existing.status === PaymentStatus.SUCCESS ? "success" : "failed",
        reference,
        amount: Number(existing.amount),
        currency: existing.currency,
        verified: existing.status === PaymentStatus.SUCCESS,
        signupUrl,
        awaitingWebhook: false,
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

    return {
      status: providerStatus,
      reference,
      amount,
      currency,
      verified,
      signupUrl,
      awaitingWebhook: verified && !signupUrl,
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

    await this.triggerBankTransferNotifications({
      paymentId: payment.id,
      reference,
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

  async listPendingBankTransfers() {
    const payments = await this.prisma.payment.findMany({
      where: {
        provider: PaymentProvider.BANK_TRANSFER,
        status: PaymentStatus.AWAITING_APPROVAL,
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        providerRef: true,
        payerName: true,
        payerEmail: true,
        payerPhone: true,
        amount: true,
        currency: true,
        receiptUrl: true,
        createdAt: true,
      },
    });

    return payments.map((payment) => {
      const ageMinutes = Math.max(
        0,
        Math.floor((Date.now() - payment.createdAt.getTime()) / 60000)
      );
      const slaColor = ageMinutes < 15 ? "green" : ageMinutes < 30 ? "yellow" : "red";

      return {
        ...payment,
        amount: Number(payment.amount),
        slaAgeMinutes: ageMinutes,
        slaColor,
      };
    });
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

    let signupInfo: {
      email: string;
      name: string;
      locale: Locale;
      signupToken: string | null;
      phone: string | null;
    } | null = null;

    if (!payment.userId || !payment.orderId) {
      signupInfo = await this.createCheckoutEntitiesFromMetadata({
        paymentId: payment.id,
        payerEmail: payment.payerEmail,
        metadata: this.asRecord(payment.metadata),
        amount: Number(payment.amount),
        currency: payment.currency,
      });
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.SUCCESS,
        approvedAt: new Date(),
        approvedBy: params.adminId,
        adminNote: params.adminNote?.trim() || null,
      },
    });

    if (signupInfo?.signupToken) {
      await this.signupNotificationsService.sendRegistrationLink({
        email: signupInfo.email,
        name: signupInfo.name,
        locale: signupInfo.locale,
        token: signupInfo.signupToken,
        phoneNumber: signupInfo.phone,
        fromEmail: this.paymentsFromEmail,
      });
    }

    return {
      id: payment.id,
      status: PaymentStatus.SUCCESS,
      message: "Bank transfer approved successfully.",
    };
  }

  async rejectBankTransfer(params: { paymentId: string; adminId: string; adminNote: string }) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: params.paymentId },
      select: { id: true, provider: true, status: true },
    });

    if (!payment || payment.provider !== PaymentProvider.BANK_TRANSFER) {
      throw new NotFoundException("Bank transfer payment not found");
    }

    if (payment.status !== PaymentStatus.AWAITING_APPROVAL) {
      throw new BadRequestException("This payment is no longer awaiting approval");
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.FAILED,
        approvedBy: params.adminId,
        adminNote: params.adminNote.trim(),
      },
    });

    return {
      id: payment.id,
      status: PaymentStatus.FAILED,
      message: "Bank transfer rejected.",
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

    // Look up the book to get the associated order
    const book = await this.prisma.book.findUnique({
      where: { id: params.bookId },
      include: {
        order: true,
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

    // Calculate extra pages cost: ₦300/page (from CLAUDE.md Section 7.2)
    const costPerPage = 300;
    const amount = params.extraPages * costPerPage;

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
          extraPages: params.extraPages,
          costPerPage,
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
    orderId: string;
    provider: string;
    callbackUrl?: string;
    userId: string;
  }) {
    const provider = params.provider.toUpperCase() as PaymentProvider;
    await this.ensureGatewayEnabled(provider);
    this.ensureProviderAvailable(provider);

    const order = await this.prisma.order.findUnique({
      where: { id: params.orderId },
      include: {
        user: {
          select: { email: true },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order "${params.orderId}" not found`);
    }

    if (order.userId !== params.userId) {
      throw new BadRequestException("You can only pay for your own orders");
    }

    const reference = this.generateReference("rp");

    const payment = await this.prisma.payment.create({
      data: {
        provider,
        type: PaymentType.REPRINT,
        amount: order.totalAmount,
        currency: order.currency,
        status: PaymentStatus.PENDING,
        providerRef: reference,
        orderId: order.id,
        userId: params.userId,
      } as Prisma.PaymentUncheckedCreateInput,
    });

    return this.delegateInitialize(provider, {
      email: order.user.email,
      amount: Number(order.totalAmount),
      reference,
      callbackUrl: params.callbackUrl,
      paymentId: payment.id,
      orderId: order.id,
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
   * For pre-created payments (extra pages, reprint), this updates the
   * existing pending record to SUCCESS without creating checkout entities.
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

      await this.prisma.payment.update({
        where: { id: existingPayment.id },
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

      const shouldCreateCheckoutEntities =
        existingPayment.type === PaymentType.INITIAL &&
        (!existingPayment.userId || !existingPayment.orderId);

      if (!shouldCreateCheckoutEntities) return;

      const checkoutResult = await this.createCheckoutEntitiesFromMetadata({
        paymentId: existingPayment.id,
        payerEmail: data.payerEmail ?? existingPayment.payerEmail,
        metadata: mergedMetadata,
        amount: data.amount,
        currency: data.currency,
      });

      if (checkoutResult?.signupToken) {
        await this.signupNotificationsService.sendRegistrationLink({
          email: checkoutResult.email,
          locale: checkoutResult.locale,
          name: checkoutResult.name,
          token: checkoutResult.signupToken,
          phoneNumber: checkoutResult.phone,
          fromEmail: this.paymentsFromEmail,
        });
      }
      return;
    }

    const payment = await this.prisma.payment.create({
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

    const checkoutResult = await this.createCheckoutEntitiesFromMetadata({
      paymentId: payment.id,
      payerEmail: data.payerEmail,
      metadata,
      amount: data.amount,
      currency: data.currency,
    });

    if (checkoutResult?.signupToken) {
      await this.signupNotificationsService.sendRegistrationLink({
        email: checkoutResult.email,
        locale: checkoutResult.locale,
        name: checkoutResult.name,
        token: checkoutResult.signupToken,
        phoneNumber: checkoutResult.phone,
        fromEmail: this.paymentsFromEmail,
      });
    }
  }

  private normalizeWebhookMetadata(
    metadata: Record<string, unknown> | null
  ): Record<string, unknown> | null {
    if (!metadata || typeof metadata !== "object") return null;
    return metadata;
  }

  private async createCheckoutEntitiesFromMetadata(params: {
    paymentId: string;
    payerEmail: string | null;
    metadata: Record<string, unknown> | null;
    amount: number;
    currency: string;
  }): Promise<{
    email: string;
    name: string;
    locale: Locale;
    signupToken: string | null;
    phone: string | null;
  } | null> {
    if (!params.payerEmail) return null;

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
    const fullName = this.pickDisplayName(checkout.fullName, params.payerEmail);
    const splitName = this.splitFullName(fullName);
    const normalizedEmail = params.payerEmail.trim().toLowerCase();
    const normalizedPhone = checkout.phone?.trim() || null;
    const signupTokenExpiry = new Date(Date.now() + MAX_SIGNUP_TOKEN_HOURS * 60 * 60 * 1000);

    return this.prisma.$transaction(async (tx) => {
      let user = await tx.user.findUnique({
        where: { email: normalizedEmail },
      });

      let signupToken: string | null = null;

      if (!user) {
        signupToken = this.generateSecureToken();
        user = await tx.user.create({
          data: {
            email: normalizedEmail,
            firstName: splitName.firstName,
            lastName: splitName.lastName,
            phoneNumber: normalizedPhone,
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
      const discountAmount = this.toCurrency(checkout.discountAmount ?? 0);
      const initialAmount = this.toCurrency(params.amount);

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
          discountAmount,
          totalAmount: Math.max(totalAmount, initialAmount),
          currency: (params.currency || DEFAULT_CURRENCY).toUpperCase(),
        } as Prisma.OrderUncheckedCreateInput,
      });

      await this.createOrderAddonsFromMetadata(tx, order.id, checkout);

      await tx.book.create({
        data: {
          orderId: order.id,
          userId: user.id,
          status: BookStatus.PAYMENT_RECEIVED,
          pageSize: checkout.bookSize ?? "A5",
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
        email: user.email,
        name: user.firstName,
        locale: this.resolveLocale(user.preferredLanguage),
        signupToken,
        phone: user.phoneNumber ?? null,
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
      packageId: this.asString(merged.packageId),
      packageSlug: this.asString(merged.packageSlug),
      tier: this.asString(merged.tier),
      hasCover: this.asBoolean(merged.hasCover),
      hasFormatting: this.asBoolean(merged.hasFormatting),
      bookSize: this.asString(merged.bookSize),
      paperColor: this.asString(merged.paperColor),
      lamination: this.asString(merged.lamination),
      formattingWordCount: this.asInteger(merged.formattingWordCount),
      discountAmount: this.asNumber(merged.discountAmount),
      totalPrice: this.asNumber(merged.totalPrice),
      addons,
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
    payerName: string;
    payerEmail: string;
    payerPhone: string;
    amount: number;
    receiptUrl: string;
    locale: Locale;
  }): Promise<void> {
    await Promise.allSettled([
      this.createAdminInAppNotifications(params),
      this.sendBankTransferUserEmail(params),
      this.sendBankTransferAdminEmail(params),
      this.sendAdminWhatsAppNotification(params),
    ]);
  }

  private async createAdminInAppNotifications(params: {
    reference: string;
    payerName: string;
    amount: number;
  }): Promise<void> {
    const admins = await this.prisma.user.findMany({
      where: {
        role: { in: [UserRole.ADMIN, UserRole.SUPER_ADMIN] },
      },
      select: { id: true },
    });

    if (admins.length === 0) return;

    const amountLabel = this.formatNaira(params.amount);
    await this.prisma.notification.createMany({
      data: admins.map((admin) => ({
        userId: admin.id,
        title: "Bank Transfer Received",
        message: `${params.payerName} submitted ${amountLabel}. Ref: ${params.reference}`,
        type: "BANK_TRANSFER_RECEIVED",
      })),
    });
  }

  private async sendBankTransferUserEmail(params: {
    payerName: string;
    payerEmail: string;
    amount: number;
    reference: string;
    locale: Locale;
  }): Promise<void> {
    if (!this.resend) {
      this.logger.warn("RESEND_API_KEY not set — bank transfer user email skipped");
      return;
    }

    const userEmail = await renderBankTransferUserEmail({
      locale: params.locale,
      userName: params.payerName,
      orderNumber: params.reference,
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
    reference: string;
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
      orderNumber: params.reference,
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

  private async sendAdminWhatsAppNotification(params: {
    reference: string;
    payerName: string;
    payerEmail: string;
    amount: number;
    receiptUrl: string;
  }): Promise<void> {
    const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.META_WHATSAPP_TOKEN;
    const adminWhatsAppNumber =
      process.env.PAYMENT_ADMIN_WHATSAPP_TO || process.env.ADMIN_WHATSAPP_TO || "";

    if (!phoneNumberId || !accessToken || !adminWhatsAppNumber) {
      this.logger.warn("Meta WhatsApp config missing — admin WhatsApp notification skipped");
      return;
    }

    const message =
      `Bank transfer received\n` +
      `Ref: ${params.reference}\n` +
      `Payer: ${params.payerName}\n` +
      `Email: ${params.payerEmail}\n` +
      `Amount: ${this.formatNaira(params.amount)}\n` +
      `Receipt: ${params.receiptUrl}`;

    try {
      const response = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: adminWhatsAppNumber,
          type: "text",
          text: { body: message },
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        this.logger.error(`WhatsApp notification failed (${response.status}): ${body}`);
      }
    } catch (error) {
      this.logger.error(
        `WhatsApp notification failed: ${error instanceof Error ? error.message : String(error)}`
      );
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

  private toCurrency(value: unknown): number {
    const amount = this.asNumber(value) ?? 0;
    if (!Number.isFinite(amount)) return 0;
    return Number(Math.max(0, amount).toFixed(2));
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
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
  private async delegateInitialize(
    provider: PaymentProvider,
    params: {
      email: string;
      amount: number;
      reference: string;
      callbackUrl?: string;
      paymentId: string;
      orderId: string;
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
            orderId: params.orderId,
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
