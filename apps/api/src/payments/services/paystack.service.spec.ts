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
