/// <reference types="jest" />
import { createHmac } from "node:crypto";
import type { PaystackConfig } from "../providers/paystack.provider.js";
import { PaystackService } from "./paystack.service.js";

// Deliberately NOT shaped like a real provider key (no `sk_test_` prefix):
// GitHub push protection flags high-entropy `sk_test_…` strings as leaked Stripe
// keys and rejects the push. The value is arbitrary here — it is only the HMAC
// key used to sign and verify the fixture payload below.
const SECRET = "paystack-webhook-signing-secret-for-tests";

function sign(payload: string): string {
  return createHmac("sha512", SECRET).update(payload).digest("hex");
}

describe("PaystackService.verifyWebhookSignature", () => {
  const config: PaystackConfig = {
    secretKey: SECRET,
    baseUrl: "https://api.paystack.co",
    currency: "NGN",
  };
  const service = new PaystackService(config);

  const payload = JSON.stringify({ event: "charge.success", data: { reference: "ref_123" } });

  it("accepts a correct signature", () => {
    expect(service.verifyWebhookSignature(payload, sign(payload))).toBe(true);
  });

  it("accepts a correct signature over a Buffer payload", () => {
    const buffer = Buffer.from(payload, "utf8");
    expect(service.verifyWebhookSignature(buffer, sign(payload))).toBe(true);
  });

  it("rejects a signature computed over a different payload", () => {
    const tampered = `${payload} `;
    expect(service.verifyWebhookSignature(tampered, sign(payload))).toBe(false);
  });

  it("rejects a signature of the correct length but wrong content", () => {
    // Same 128-char hex length as a real SHA-512 digest — guards against a
    // length-only comparison passing.
    const wrong = "a".repeat(128);
    expect(service.verifyWebhookSignature(payload, wrong)).toBe(false);
  });

  it("rejects a wrong-length signature without throwing", () => {
    // timingSafeEqual throws on length mismatch; the length guard must catch it.
    expect(() => service.verifyWebhookSignature(payload, "short")).not.toThrow();
    expect(service.verifyWebhookSignature(payload, "short")).toBe(false);
  });

  it("rejects an absent signature header", () => {
    expect(service.verifyWebhookSignature(payload, undefined)).toBe(false);
    expect(service.verifyWebhookSignature(payload, null)).toBe(false);
    expect(service.verifyWebhookSignature(payload, "")).toBe(false);
  });

  it("returns false when Paystack keys are not configured", () => {
    const unconfigured = new PaystackService(null);
    expect(unconfigured.verifyWebhookSignature(payload, sign(payload))).toBe(false);
  });
});

describe("PaystackService.listTransactions", () => {
  const config: PaystackConfig = {
    secretKey: SECRET,
    baseUrl: "https://api.paystack.co",
    currency: "NGN",
  };

  const from = new Date("2026-10-01T00:00:00.000Z");
  const to = new Date("2026-10-02T00:00:00.000Z");

  /** Installs a fake axios instance and records the pages requested. */
  function withPages(pages: unknown[][]) {
    const service = new PaystackService(config);
    const requested: number[] = [];
    const get = jest.fn(async (_url: string, opts: { params: { page: number } }) => {
      requested.push(opts.params.page);
      return { data: { status: true, data: pages[opts.params.page - 1] ?? [] } };
    });
    (service as unknown as { http: unknown }).http = { get };
    return { service, requested, get };
  }

  const fullPage = (n: number) => Array.from({ length: n }, (_, i) => ({ reference: `r${i}` }));

  it("walks every page until a short page ends the window", async () => {
    // Fetching only page 1 put a silent ceiling on reconciliation: anything
    // beyond the first page was never examined, and the only clue was a
    // `scanned` count that happened to equal the page size.
    const { service, requested } = withPages([fullPage(3), fullPage(3), fullPage(1)]);

    const result = await service.listTransactions({ from, to, perPage: 3 });

    expect(requested).toEqual([1, 2, 3]);
    expect(result).toHaveLength(7);
  });

  it("stops after a single short page", async () => {
    const { service, requested } = withPages([fullPage(2)]);

    const result = await service.listTransactions({ from, to, perPage: 3 });

    expect(requested).toEqual([1]);
    expect(result).toHaveLength(2);
  });

  it("honours an explicit page without paginating", async () => {
    const { service, requested } = withPages([fullPage(3), fullPage(3)]);

    const result = await service.listTransactions({ from, to, perPage: 3, page: 2 });

    expect(requested).toEqual([2]);
    expect(result).toHaveLength(3);
  });

  it("stops at maxPages rather than looping forever on full pages", async () => {
    // Guards against an unbounded loop if the API keeps returning full pages.
    const { service, requested } = withPages([fullPage(2), fullPage(2), fullPage(2), fullPage(2)]);

    const result = await service.listTransactions({ from, to, perPage: 2, maxPages: 2 });

    expect(requested).toEqual([1, 2]);
    expect(result).toHaveLength(4);
  });
});

describe("PaystackService.initialize", () => {
  it("tags every charge with the BookPrinta product tag, keeping caller metadata", async () => {
    const service = new PaystackService({
      secretKey: SECRET,
      baseUrl: "https://api.paystack.co",
      currency: "NGN",
    });
    const post = jest.fn().mockResolvedValue({
      data: { data: { authorization_url: "u", access_code: "a", reference: "ep_1" } },
    });
    (service as unknown as { http: { post: typeof post } }).http = { post };

    await service.initialize({
      email: "a@b.co",
      amount: 200,
      reference: "ep_1",
      metadata: { paymentId: "pay_1" },
    });

    expect(post).toHaveBeenCalledWith(
      "/transaction/initialize",
      expect.objectContaining({
        amount: 20000,
        metadata: { paymentId: "pay_1", app: "bookprinta" },
      })
    );
  });
});
