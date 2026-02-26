import { DEFAULT_CURRENCY } from "@bookprinta/shared";
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client.js";
import { PaymentProvider, PaymentStatus, PaymentType } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { BankTransferDto, InitializePaymentDto } from "./dto/payment-request.dto.js";
import { PayPalService } from "./services/paypal.service.js";
import type { PaystackWebhookPayload } from "./services/paystack.service.js";
import { PaystackService } from "./services/paystack.service.js";
import { StripeService } from "./services/stripe.service.js";

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly paystackService: PaystackService,
    private readonly stripeService: StripeService,
    private readonly paypalService: PayPalService
  ) {}

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
  async verify(reference: string) {
    // 1. Check if the webhook already created the Payment record
    const existing = await this.prisma.payment.findUnique({
      where: { providerRef: reference },
    });

    if (existing?.processedAt) {
      this.logger.log(`Payment ${reference} already processed — returning cached status`);
      return {
        status: existing.status === PaymentStatus.SUCCESS ? "success" : "failed",
        reference,
        amount: Number(existing.amount),
        currency: existing.currency,
        verified: existing.status === PaymentStatus.SUCCESS,
      };
    }

    // 2. No record (or not yet processed) — verify directly with provider.
    //    Try each provider in order until one recognizes the reference.
    let providerStatus: string;
    let verified: boolean;
    let amount: number | undefined;
    let currency: string | undefined;

    // Detect provider from reference prefix or try all
    if (existing) {
      // We know the provider from the existing record
      switch (existing.provider) {
        case PaymentProvider.PAYSTACK: {
          const resp = await this.paystackService.verify(reference);
          providerStatus = resp.status;
          verified = resp.status === "success";
          amount = resp.amount / 100; // Paystack returns kobo
          currency = resp.currency;
          break;
        }
        case PaymentProvider.STRIPE: {
          const resp = await this.stripeService.verify(reference);
          providerStatus = resp.paymentStatus;
          verified = resp.paymentStatus === "paid";
          amount = resp.amountTotal ? resp.amountTotal / 100 : undefined;
          currency = resp.currency ?? undefined;
          break;
        }
        case PaymentProvider.PAYPAL: {
          const resp = await this.paypalService.verify(reference);
          providerStatus = resp.status;
          verified = resp.status === "COMPLETED";
          break;
        }
        default:
          throw new BadRequestException(`Cannot verify provider: ${existing.provider}`);
      }
    } else {
      // No DB record — try Paystack first (primary provider for Nigeria)
      try {
        const resp = await this.paystackService.verify(reference);
        providerStatus = resp.status;
        verified = resp.status === "success";
        amount = resp.amount / 100;
        currency = resp.currency;
      } catch {
        throw new NotFoundException(
          `Payment with reference "${reference}" not found. It may not have been processed yet.`
        );
      }
    }

    this.logger.log(
      `Payment ${reference} verified — status: ${providerStatus}, verified: ${verified}`
    );

    return {
      status: providerStatus,
      reference,
      amount,
      currency,
      verified,
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
  async submitBankTransfer(dto: BankTransferDto) {
    // Check bank transfer gateway is enabled
    await this.ensureGatewayEnabled(PaymentProvider.BANK_TRANSFER);

    const reference = this.generateReference("bt");

    const payment = await this.prisma.payment.create({
      data: {
        provider: PaymentProvider.BANK_TRANSFER,
        type: PaymentType.INITIAL,
        amount: dto.amount,
        currency: dto.currency ?? DEFAULT_CURRENCY,
        status: PaymentStatus.AWAITING_APPROVAL,
        providerRef: reference,
        receiptUrl: dto.receiptUrl,
        payerName: dto.payerName,
        payerEmail: dto.payerEmail,
        payerPhone: dto.payerPhone,
        // userId and orderId omitted — guest checkout, no user exists yet.
        // They get linked after admin approval + user signup (Phase 3).
        metadata: (dto.metadata as Record<string, string>) ?? undefined,
      } as Prisma.PaymentUncheckedCreateInput,
    });

    this.logger.log(
      `Bank transfer submitted — ${dto.payerName} — ₦${dto.amount} — ref: ${reference}`
    );

    // TODO: Phase 7 — Send notifications:
    //   1. Confirmation email to user
    //   2. In-app + email + WhatsApp notification to admin

    return {
      id: payment.id,
      status: payment.status,
      message:
        "Your payment is being verified. You will receive an email once approved. " +
        "This typically takes less than 30 minutes.",
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
      include: { order: true },
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
      email: "", // Will be filled from auth context in controller
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
      email: "", // Will be filled from auth context
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
        gatewayResponse: payload.data as unknown as Record<string, string>,
        metadata: (payload.data.metadata as Record<string, string>) ?? null,
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
          gatewayResponse: session as unknown as Record<string, string>,
          metadata: (session.metadata as Record<string, string>) ?? null,
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
   * Per the payment flow diagram, the full flow is:
   *   Webhook → Create User → Create Order → Create Payment
   * For now, we create the Payment record. User + Order creation
   * will be added in Phase 3 (E-Commerce & Payment Flow).
   */
  private async createPaymentFromWebhook(data: {
    provider: PaymentProvider;
    providerRef: string;
    amount: number;
    currency: string;
    payerEmail: string | null;
    gatewayResponse: Record<string, string>;
    metadata: Record<string, string> | null;
  }) {
    await this.prisma.payment.create({
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
        metadata: data.metadata ?? undefined,
        // userId and orderId omitted — created later in Phase 3:
        //   webhook → create User → create Order → link Payment
      } as Prisma.PaymentUncheckedCreateInput,
    });

    // TODO: Phase 3 completion — after creating Payment:
    //   1. Create User (PENDING_VERIFICATION) with preferredLanguage from NEXT_LOCALE
    //   2. Create Order with config metadata from payment
    //   3. Link Payment.userId and Payment.orderId to new records
    //   4. Send signup link email
    //   5. Update Order status to PAID
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
