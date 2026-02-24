import { createHmac } from "node:crypto";
import { DEFAULT_CURRENCY } from "@bookprinta/shared";
import { Inject, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import type { AxiosInstance } from "axios";
import axios from "axios";
import { PAYSTACK_CLIENT } from "../constants.js";
import type { PaystackConfig } from "../providers/paystack.provider.js";

// ──────────────────────────────────────────────
// Paystack API response shapes
// ──────────────────────────────────────────────

export interface PaystackInitResponse {
  authorization_url: string;
  access_code: string;
  reference: string;
}

export interface PaystackVerifyResponse {
  status: string; // "success" | "failed" | "abandoned"
  reference: string;
  amount: number; // in kobo
  currency: string;
  channel: string;
  customer: {
    email: string;
    first_name?: string;
    last_name?: string;
  };
  metadata?: Record<string, unknown>;
}

export interface PaystackWebhookPayload {
  event: string;
  data: PaystackVerifyResponse;
}

@Injectable()
export class PaystackService {
  private readonly logger = new Logger(PaystackService.name);
  private readonly http: AxiosInstance | null;

  constructor(
    @Inject(PAYSTACK_CLIENT)
    private readonly config: PaystackConfig | null
  ) {
    if (this.config) {
      this.http = axios.create({
        baseURL: this.config.baseUrl,
        headers: {
          Authorization: `Bearer ${this.config.secretKey}`,
          "Content-Type": "application/json",
        },
      });
    } else {
      this.http = null;
    }
  }

  /** Check if Paystack is configured and available. */
  get isAvailable(): boolean {
    return this.config !== null && this.http !== null;
  }

  /** Guard — throws ServiceUnavailableException if keys aren't set. */
  private ensureAvailable(): void {
    if (!this.isAvailable) {
      throw new ServiceUnavailableException("Paystack is not configured. Please contact support.");
    }
  }

  /** Returns the guaranteed-available HTTP client after ensureAvailable(). */
  private getHttp(): AxiosInstance {
    this.ensureAvailable();
    return this.http as AxiosInstance;
  }

  /**
   * Initialize a Paystack transaction.
   * Paystack expects amount in kobo (₦1 = 100 kobo).
   */
  async initialize(params: {
    email: string;
    amount: number;
    currency?: string;
    reference?: string;
    callbackUrl?: string;
    metadata?: Record<string, unknown>;
  }): Promise<PaystackInitResponse> {
    const http = this.getHttp();

    const payload = {
      email: params.email,
      amount: Math.round(params.amount * 100), // Convert naira → kobo
      currency: params.currency ?? DEFAULT_CURRENCY,
      reference: params.reference,
      callback_url: params.callbackUrl,
      metadata: params.metadata,
    };

    this.logger.log(`Initializing Paystack payment for ${params.email} — ₦${params.amount}`);

    const response = await http.post<{ status: boolean; data: PaystackInitResponse }>(
      "/transaction/initialize",
      payload
    );

    return response.data.data;
  }

  /**
   * Verify a Paystack transaction by reference.
   * Used as a fallback if the webhook is delayed.
   */
  async verify(reference: string): Promise<PaystackVerifyResponse> {
    const http = this.getHttp();

    this.logger.log(`Verifying Paystack payment: ${reference}`);

    const response = await http.get<{ status: boolean; data: PaystackVerifyResponse }>(
      `/transaction/verify/${encodeURIComponent(reference)}`
    );

    return response.data.data;
  }

  /**
   * Verify the webhook signature from Paystack.
   * See: CLAUDE.md Section 11 — Security Checklist
   *
   * Paystack signs webhook payloads with HMAC SHA-512 using
   * the secret key. The signature is in `x-paystack-signature`.
   */
  verifyWebhookSignature(payload: string | Buffer, signature: string): boolean {
    if (!this.config) {
      this.logger.error("Cannot verify Paystack webhook — keys not configured");
      return false;
    }

    const hash = createHmac("sha512", this.config.secretKey).update(payload).digest("hex");

    return hash === signature;
  }

  /**
   * Initiate a refund via the Paystack API.
   * @param transactionRef — The original transaction reference.
   * @param amountInNaira — Refund amount in Naira (optional — full refund if omitted).
   */
  async refund(transactionRef: string, amountInNaira?: number): Promise<Record<string, unknown>> {
    const http = this.getHttp();

    this.logger.log(
      `Initiating Paystack refund for ref: ${transactionRef}` +
        (amountInNaira ? ` — ₦${amountInNaira}` : " (full)")
    );

    const payload: Record<string, unknown> = {
      transaction: transactionRef,
    };

    if (amountInNaira !== undefined) {
      payload.amount = Math.round(amountInNaira * 100); // kobo
    }

    const response = await http.post<{ status: boolean; data: Record<string, unknown> }>(
      "/refund",
      payload
    );

    return response.data.data;
  }
}
