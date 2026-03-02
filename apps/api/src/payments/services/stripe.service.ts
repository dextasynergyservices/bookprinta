import { DEFAULT_CURRENCY } from "@bookprinta/shared";
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import type Stripe from "stripe";
import { STRIPE_CLIENT } from "../constants.js";

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);

  constructor(
    @Inject(STRIPE_CLIENT)
    private readonly stripe: Stripe | null
  ) {}

  /** Check if Stripe is configured and available. */
  get isAvailable(): boolean {
    return this.stripe !== null;
  }

  /** Guard — throws ServiceUnavailableException if keys aren't set. Returns the Stripe instance. */
  private getClient(): Stripe {
    if (!this.stripe) {
      throw new ServiceUnavailableException("Stripe is not configured. Please contact support.");
    }
    return this.stripe;
  }

  /**
   * Create a Stripe Checkout session.
   * Stripe expects amount in the smallest currency unit (kobo for NGN).
   */
  async initialize(params: {
    email: string;
    amount: number;
    currency?: string;
    orderId?: string;
    callbackUrl?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{
    authorizationUrl: string;
    reference: string;
  }> {
    const client = this.getClient();

    const currency = (params.currency ?? DEFAULT_CURRENCY).toLowerCase();

    this.logger.log(`Creating Stripe checkout session for ${params.email} — ₦${params.amount}`);

    const session = await client.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      customer_email: params.email,
      currency,
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: "BookPrinta Order",
              description: params.orderId ? `Order #${params.orderId}` : "Book publishing service",
            },
            unit_amount: Math.round(params.amount * 100), // Naira → kobo
          },
          quantity: 1,
        },
      ],
      success_url: params.callbackUrl
        ? `${params.callbackUrl}?session_id={CHECKOUT_SESSION_ID}`
        : undefined,
      cancel_url: params.callbackUrl ? `${params.callbackUrl}?cancelled=true` : undefined,
      metadata: {
        orderId: params.orderId ?? "",
        checkout_state: this.serializeCheckoutState(params.metadata),
      },
    });

    return {
      authorizationUrl: session.url ?? "",
      reference: session.id,
    };
  }

  /**
   * Retrieve a Stripe Checkout session to verify payment status.
   * Used as a fallback if the webhook is delayed.
   */
  async verify(sessionId: string): Promise<{
    status: string;
    paymentStatus: string;
    customerEmail: string | null;
    amountTotal: number | null;
    currency: string | null;
    metadata: Record<string, string> | null;
  }> {
    const client = this.getClient();

    this.logger.log(`Verifying Stripe session: ${sessionId}`);

    const session = await client.checkout.sessions.retrieve(sessionId);

    return {
      status: session.status ?? "unknown",
      paymentStatus: session.payment_status,
      customerEmail: session.customer_email,
      amountTotal: session.amount_total,
      currency: session.currency,
      metadata: session.metadata,
    };
  }

  /**
   * Verify the Stripe webhook signature.
   * See: CLAUDE.md Section 11 — Security Checklist
   *
   * Stripe uses the raw body + webhook secret to verify integrity.
   * The raw body MUST be the original unparsed request body.
   */
  verifyWebhookSignature(rawBody: string | Buffer, signature: string): Stripe.Event | null {
    if (!this.stripe) {
      this.logger.error("Cannot verify Stripe webhook — keys not configured");
      return null;
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      this.logger.error("STRIPE_WEBHOOK_SECRET not set — cannot verify webhook signature");
      return null;
    }

    try {
      return this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (error) {
      this.logger.error(
        `Stripe webhook signature verification failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }

  /**
   * Initiate a Stripe refund.
   * @param paymentIntentId — The Stripe PaymentIntent ID to refund.
   * @param amountInNaira — Refund amount in Naira (optional — full refund if omitted).
   */
  async refund(paymentIntentId: string, amountInNaira?: number): Promise<Record<string, unknown>> {
    const client = this.getClient();

    this.logger.log(
      `Initiating Stripe refund for PI: ${paymentIntentId}` +
        (amountInNaira ? ` — ₦${amountInNaira}` : " (full)")
    );

    const params: { payment_intent: string; amount?: number } = {
      payment_intent: paymentIntentId,
    };

    if (amountInNaira !== undefined) {
      params.amount = Math.round(amountInNaira * 100); // kobo
    }

    const refund = await client.refunds.create(params);

    return refund as unknown as Record<string, unknown>;
  }

  private serializeCheckoutState(metadata?: Record<string, unknown>): string {
    const normalized = this.minimizeCheckoutMetadata(metadata ?? {});
    const serialized = JSON.stringify(normalized);
    if (serialized.length <= 500) return serialized;

    const minimal = {
      locale: normalized.locale,
      fullName: normalized.fullName,
      phone: normalized.phone,
      packageId: normalized.packageId,
      packageSlug: normalized.packageSlug,
      tier: normalized.tier,
      hasCover: normalized.hasCover,
      hasFormatting: normalized.hasFormatting,
      bookSize: normalized.bookSize,
      paperColor: normalized.paperColor,
      lamination: normalized.lamination,
      discountAmount: normalized.discountAmount,
      totalPrice: normalized.totalPrice,
      addons: Array.isArray(normalized.addons)
        ? (normalized.addons as Array<Record<string, unknown>>).map((addon) => ({
            id: addon.id,
            slug: addon.slug,
            price: addon.price,
          }))
        : undefined,
    };

    const compact = JSON.stringify(minimal);
    if (compact.length <= 500) return compact;
    throw new BadRequestException("Checkout metadata is too large for Stripe metadata limits.");
  }

  private minimizeCheckoutMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
    const scalarKeys = [
      "locale",
      "fullName",
      "phone",
      "hasCover",
      "hasFormatting",
      "tier",
      "packageId",
      "packageSlug",
      "packageName",
      "includesISBN",
      "bookSize",
      "paperColor",
      "lamination",
      "formattingWordCount",
      "couponCode",
      "discountAmount",
      "basePrice",
      "addonTotal",
      "totalPrice",
    ] as const;

    const result: Record<string, unknown> = {};
    for (const key of scalarKeys) {
      const value = metadata[key];
      if (value !== undefined && value !== null) result[key] = value;
    }

    if (Array.isArray(metadata.addons)) {
      result.addons = metadata.addons
        .filter((addon) => addon && typeof addon === "object")
        .map((addon) => {
          const item = addon as Record<string, unknown>;
          return {
            id: item.id,
            slug: item.slug,
            name: item.name,
            price: item.price,
          };
        });
    }

    return result;
  }
}
