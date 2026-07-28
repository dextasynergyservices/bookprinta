import { createHmac, timingSafeEqual } from "node:crypto";
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

/** Shape of one entry from Paystack's GET /transaction list endpoint. */
export interface PaystackTransactionListItem {
  reference: string;
  status: string;
  amount: number; // kobo
  currency: string;
  paid_at?: string | null;
  customer?: { email?: string } | null;
  metadata?: Record<string, unknown> | string | null;
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
   * List transactions in a time window, newest first.
   *
   * Used by payment reconciliation (docs: option 3) to find successful charges
   * that never became local Orders — e.g. the customer closed the tab before the
   * browser hit /payments/verify, and no webhook reached us.
   *
   * NOTE: our Paystack integration is shared with another product, so this list
   * contains BOTH products' transactions. Callers MUST filter by BookPrinta's
   * checkout metadata before acting on a transaction.
   *
   * `from`/`to` are ISO timestamps. Paystack caps `perPage`; we page explicitly.
   */
  async listTransactions(params: {
    from: Date;
    to: Date;
    status?: "success" | "failed" | "abandoned";
    page?: number;
    perPage?: number;
  }): Promise<PaystackTransactionListItem[]> {
    const http = this.getHttp();

    const response = await http.get<{
      status: boolean;
      data: PaystackTransactionListItem[];
    }>("/transaction", {
      params: {
        from: params.from.toISOString(),
        to: params.to.toISOString(),
        ...(params.status ? { status: params.status } : {}),
        page: params.page ?? 1,
        perPage: params.perPage ?? 100,
      },
    });

    return response.data.data ?? [];
  }

  /**
   * Verify the webhook signature from Paystack.
   * See: CLAUDE.md Section 11 — Security Checklist
   *
   * Paystack signs webhook payloads with HMAC SHA-512 using the secret key.
   * The signature arrives in the `x-paystack-signature` header.
   *
   * The comparison is constant-time (`timingSafeEqual`): a plain `===` on the
   * hex digest leaks, via early-exit timing, how many leading characters an
   * attacker guessed correctly, which over many requests can be used to forge a
   * valid signature. This is a payment-authorisation path, so it must be
   * textbook regardless of how impractical the attack is over network jitter.
   *
   * Returns false — never throws — for a missing, malformed, or wrong-length
   * signature, so a bad header is treated as an unverified webhook rather than
   * a 500. (The controller also guards the missing-header case; this is defence
   * in depth for any other caller.)
   */
  verifyWebhookSignature(payload: string | Buffer, signature: string | undefined | null): boolean {
    if (!this.config) {
      this.logger.error("Cannot verify Paystack webhook — keys not configured");
      return false;
    }

    if (typeof signature !== "string" || signature.length === 0) {
      this.logger.warn("Paystack webhook rejected — missing or empty signature header");
      return false;
    }

    const expected = createHmac("sha512", this.config.secretKey).update(payload).digest("hex");

    const expectedBuffer = Buffer.from(expected, "utf8");
    const providedBuffer = Buffer.from(signature, "utf8");

    // timingSafeEqual throws if the two buffers differ in length, so the length
    // check must come first. A wrong-length signature is simply invalid — a
    // correct Paystack signature is always a 128-char SHA-512 hex digest.
    if (expectedBuffer.length !== providedBuffer.length) {
      this.logger.warn("Paystack webhook rejected — signature length mismatch");
      return false;
    }

    return timingSafeEqual(expectedBuffer, providedBuffer);
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
