import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PaymentProvider } from "../../generated/prisma/enums.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { RedisService } from "../../redis/redis.service.js";
import { PayPalService } from "./paypal.service.js";
import { PaystackService } from "./paystack.service.js";
import { StripeService } from "./stripe.service.js";

// ──────────────────────────────────────────────
// GatewayService
//
// Owns gateway availability checks and provider SDK delegation.
// Extracted from the PaymentsService monolith so gateway-specific
// logic is isolated and independently testable.
// ──────────────────────────────────────────────

@Injectable()
export class GatewayService {
  private static readonly CACHE_KEY = "bp:gateways:active";
  private static readonly CACHE_TTL = 300; // 5 minutes

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly redis: RedisService | null = null,
    private readonly paystackService: PaystackService,
    private readonly stripeService: StripeService,
    private readonly paypalService: PayPalService
  ) {}

  /**
   * List gateways available to frontend checkout.
   * Returns enabled gateways sorted by priority.
   * Cached in Redis for 5 minutes; invalidated on admin gateway update.
   */
  async listAvailableGateways() {
    type CachedGateway = ReturnType<typeof this.serializeGateway>;

    if (this.redis !== null) {
      const cached = await this.redis.get<CachedGateway[]>(GatewayService.CACHE_KEY);
      if (cached !== null) return cached;
    }

    const gateways = await this.prisma.paymentGateway.findMany({
      where: { isEnabled: true },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    });

    const result = gateways
      .filter((gateway) => this.isGatewayAvailableForCheckout(gateway.provider))
      .map((gateway) => this.serializeGateway(gateway));

    if (this.redis !== null) {
      await this.redis.set(GatewayService.CACHE_KEY, result, GatewayService.CACHE_TTL);
    }
    return result;
  }

  /** Invalidate the checkout gateway cache (call after any admin gateway mutation). */
  async invalidateGatewayCache(): Promise<void> {
    if (this.redis !== null) {
      await this.redis.del(GatewayService.CACHE_KEY);
    }
  }

  private serializeGateway(gateway: {
    id: string;
    provider: PaymentProvider;
    name: string;
    isEnabled: boolean;
    isTestMode: boolean;
    bankDetails: unknown;
    instructions: string | null;
    priority: number;
  }) {
    return {
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
        gateway.provider === PaymentProvider.BANK_TRANSFER ? (gateway.instructions ?? null) : null,
      priority: gateway.priority,
    };
  }

  /**
   * Ensure a payment gateway is enabled in the database.
   * Throws NotFoundException if the gateway is not configured.
   * Throws ServiceUnavailableException if it is disabled.
   */
  async ensureGatewayEnabled(provider: PaymentProvider): Promise<void> {
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
   * Ensure the provider SDK/service is available (API keys are configured).
   */
  ensureProviderAvailable(provider: PaymentProvider): void {
    const available =
      (provider === PaymentProvider.PAYSTACK && this.paystackService.isAvailable) ||
      (provider === PaymentProvider.STRIPE && this.stripeService.isAvailable) ||
      (provider === PaymentProvider.PAYPAL && this.paypalService.isAvailable);

    if (!available) {
      throw new ServiceUnavailableException(`${provider} is not configured. API keys are missing.`);
    }
  }

  /**
   * Whether an enabled gateway can be shown in the checkout UI.
   * Card gateways require provider API keys to be configured.
   * BANK_TRANSFER is always available (no SDK required).
   */
  isGatewayAvailableForCheckout(provider: PaymentProvider): boolean {
    if (provider === PaymentProvider.BANK_TRANSFER) return true;
    if (provider === PaymentProvider.PAYSTACK) return this.paystackService.isAvailable;
    if (provider === PaymentProvider.STRIPE) return this.stripeService.isAvailable;
    if (provider === PaymentProvider.PAYPAL) return this.paypalService.isAvailable;
    return false;
  }

  /**
   * Delegate a payment initialization to the appropriate provider SDK.
   * Assumes gateway and provider have already been validated.
   */
  async delegateInitialize(
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

      default: {
        const _exhaustive: never = provider as never;
        void _exhaustive;
        throw new BadRequestException(`Unsupported provider for delegation: ${provider}`);
      }
    }
  }
}
