import { DEFAULT_CURRENCY } from "@bookprinta/shared";
import { Inject, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import type { AxiosInstance } from "axios";
import axios from "axios";
import { PAYPAL_CLIENT } from "../constants.js";
import type { PayPalConfig } from "../providers/paypal.provider.js";

/** PayPal OAuth2 token response. */
interface PayPalTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

/** PayPal order creation response (simplified). */
export interface PayPalOrderResponse {
  id: string;
  status: string;
  links: Array<{ href: string; rel: string; method: string }>;
}

@Injectable()
export class PayPalService {
  private readonly logger = new Logger(PayPalService.name);
  private readonly http: AxiosInstance | null;
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(
    @Inject(PAYPAL_CLIENT)
    private readonly config: PayPalConfig | null
  ) {
    if (this.config) {
      this.http = axios.create({
        baseURL: this.config.baseUrl,
        headers: { "Content-Type": "application/json" },
      });
    } else {
      this.http = null;
    }
  }

  /** Check if PayPal is configured and available. */
  get isAvailable(): boolean {
    return this.config !== null && this.http !== null;
  }

  /** Guard — throws ServiceUnavailableException if keys aren't set. */
  private ensureAvailable(): void {
    if (!this.isAvailable) {
      throw new ServiceUnavailableException("PayPal is not configured. Please contact support.");
    }
  }

  /** Returns the guaranteed-available HTTP client after ensureAvailable(). */
  private getHttp(): AxiosInstance {
    this.ensureAvailable();
    return this.http as AxiosInstance;
  }

  /** Returns the guaranteed-available config after ensureAvailable(). */
  private getConfig(): PayPalConfig {
    this.ensureAvailable();
    return this.config as PayPalConfig;
  }

  /**
   * Get a PayPal OAuth2 access token.
   * Caches the token and refreshes ~60s before expiry.
   */
  private async getAccessToken(): Promise<string> {
    const http = this.getHttp();
    const config = this.getConfig();

    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60_000) {
      return this.accessToken;
    }

    const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");

    const response = await http.post<PayPalTokenResponse>(
      "/v1/oauth2/token",
      "grant_type=client_credentials",
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    this.accessToken = response.data.access_token;
    this.tokenExpiresAt = Date.now() + response.data.expires_in * 1000;
    return this.accessToken;
  }

  /**
   * Create a PayPal order.
   * PayPal uses standard currency units (not kobo/cents).
   */
  async initialize(params: {
    amount: number;
    currency?: string;
    orderId?: string;
    callbackUrl?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{
    authorizationUrl: string;
    reference: string;
  }> {
    this.ensureAvailable();

    const http = this.getHttp();
    const token = await this.getAccessToken();
    const currency = params.currency ?? DEFAULT_CURRENCY;

    this.logger.log(`Creating PayPal order — ₦${params.amount}`);

    const payload = {
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: currency,
            value: params.amount.toFixed(2),
          },
          description: params.orderId
            ? `BookPrinta Order #${params.orderId}`
            : "BookPrinta publishing service",
          custom_id: params.orderId ?? undefined,
        },
      ],
      application_context: {
        return_url: params.callbackUrl ?? undefined,
        cancel_url: params.callbackUrl ? `${params.callbackUrl}?cancelled=true` : undefined,
        brand_name: "BookPrinta",
        user_action: "PAY_NOW",
      },
    };

    const response = await http.post<PayPalOrderResponse>("/v2/checkout/orders", payload, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const approveLink = response.data.links.find((l) => l.rel === "approve");

    return {
      authorizationUrl: approveLink?.href ?? "",
      reference: response.data.id,
    };
  }

  /**
   * Capture a PayPal order after the user approves.
   * Returns the captured order details.
   */
  async capture(orderId: string): Promise<Record<string, unknown>> {
    const http = this.getHttp();
    const token = await this.getAccessToken();

    this.logger.log(`Capturing PayPal order: ${orderId}`);

    const response = await http.post<Record<string, unknown>>(
      `/v2/checkout/orders/${orderId}/capture`,
      {},
      { headers: { Authorization: `Bearer ${token}` } }
    );

    return response.data;
  }

  /**
   * Verify a PayPal order status.
   */
  async verify(orderId: string): Promise<{
    status: string;
    amount: string | null;
    currency: string | null;
    payerEmail: string | null;
  }> {
    const http = this.getHttp();
    const token = await this.getAccessToken();

    this.logger.log(`Verifying PayPal order: ${orderId}`);

    const response = await http.get<Record<string, unknown>>(`/v2/checkout/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = response.data;
    const purchaseUnit = (data.purchase_units as Array<Record<string, unknown>>)?.[0];
    const amount = purchaseUnit?.amount as Record<string, string> | undefined;
    const payer = data.payer as Record<string, unknown> | undefined;

    return {
      status: data.status as string,
      amount: amount?.value ?? null,
      currency: amount?.currency_code ?? null,
      payerEmail: (payer?.email_address as string) ?? null,
    };
  }

  /**
   * Initiate a PayPal refund.
   * @param captureId — The PayPal capture ID to refund.
   * @param amountInNaira — Refund amount (optional — full refund if omitted).
   */
  async refund(captureId: string, amountInNaira?: number): Promise<Record<string, unknown>> {
    const http = this.getHttp();
    const token = await this.getAccessToken();

    this.logger.log(
      `Initiating PayPal refund for capture: ${captureId}` +
        (amountInNaira ? ` — ₦${amountInNaira}` : " (full)")
    );

    const payload: Record<string, unknown> = {};
    if (amountInNaira !== undefined) {
      payload.amount = {
        value: amountInNaira.toFixed(2),
        currency_code: DEFAULT_CURRENCY,
      };
    }

    const response = await http.post<Record<string, unknown>>(
      `/v2/payments/captures/${captureId}/refund`,
      payload,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    return response.data;
  }
}
