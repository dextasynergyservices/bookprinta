/// <reference types="jest" />
/**
 * Paystack webhook signature verification must use the RAW request bytes.
 *
 * Paystack computes its HMAC over exactly the bytes it sent. The controller
 * previously verified against `JSON.stringify(body)` — a re-serialisation of the
 * parsed body — which is not guaranteed to reproduce those bytes. The clearest
 * divergence is escaped non-ASCII: Paystack may send `josé@example.com`,
 * `JSON.parse` turns that into `josé`, and `JSON.stringify` emits the literal
 * `é`. Different bytes, different digest, 400 Invalid signature — then Paystack
 * retries, every retry fails identically, and a paying customer never gets an
 * order because their name had an accent. BookPrinta serves Nigerian customers
 * with fr/es locales, so this was a matter of when, not if.
 *
 * Note this class of bug is invisible to an end-to-end load test that generates
 * its own payloads: signing the same string the server reconstructs makes the
 * comparison pass trivially. It has to be asserted at this seam.
 */

import { createHmac } from "node:crypto";
import type { RawBodyRequest } from "@nestjs/common";
import { BadRequestException } from "@nestjs/common";
import type { Request } from "express";
import { PaymentsController } from "./payments.controller.js";

const SECRET = "sk_test_webhook_spec_secret";

function sign(raw: Buffer | string) {
  return createHmac("sha512", SECRET).update(raw).digest("hex");
}

/**
 * A raw payload with an ESCAPED non-ASCII sequence, as a provider may legally
 * send it. `JSON.stringify(JSON.parse(this))` does not reproduce these bytes.
 */
const RAW_WITH_ESCAPED_UNICODE = Buffer.from(
  JSON.stringify({
    event: "charge.success",
    data: {
      reference: "ref_unicode",
      status: "success",
      amount: 7_500_000,
      currency: "NGN",
      customer: { email: "author@example.com" },
      metadata: { fullName: "Jos\\u00e9 Adeyemi" },
    },
  }).replace("Jos\\\\u00e9", "Jos\\u00e9"),
  "utf8"
);

function createController() {
  const handlePaystackWebhook = jest.fn().mockResolvedValue({ status: "ok" });
  // The real signature check, so the test measures which bytes reach it rather
  // than trusting a stub that accepts anything.
  const verifyPaystackSignature = jest.fn((raw: string | Buffer, signature: string) => {
    return sign(raw) === signature;
  });

  const paymentsService = { handlePaystackWebhook, verifyPaystackSignature };
  const controller = new PaymentsController(paymentsService as never);

  return { controller, handlePaystackWebhook, verifyPaystackSignature };
}

function requestWith(rawBody: Buffer | undefined): RawBodyRequest<Request> {
  return { rawBody } as unknown as RawBodyRequest<Request>;
}

describe("POST /payments/webhook/paystack — signature verification", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("verifies against the raw request bytes, not a re-serialised body", async () => {
    const { controller, verifyPaystackSignature, handlePaystackWebhook } = createController();
    const raw = Buffer.from(JSON.stringify({ event: "charge.success", data: { a: 1 } }), "utf8");
    const parsed = JSON.parse(raw.toString("utf8"));

    await controller.handlePaystackWebhook(parsed, sign(raw), requestWith(raw));

    expect(verifyPaystackSignature).toHaveBeenCalledTimes(1);
    const passed = verifyPaystackSignature.mock.calls[0][0];
    expect(Buffer.isBuffer(passed)).toBe(true);
    expect((passed as Buffer).equals(raw)).toBe(true);
    expect(handlePaystackWebhook).toHaveBeenCalledTimes(1);
  });

  it("accepts a payload whose escaped unicode a stringify round-trip would mangle", async () => {
    const { controller, handlePaystackWebhook } = createController();
    const raw = RAW_WITH_ESCAPED_UNICODE;
    const parsed = JSON.parse(raw.toString("utf8"));

    // Guard the premise: if these matched, the test would prove nothing.
    expect(JSON.stringify(parsed)).not.toBe(raw.toString("utf8"));
    // And confirm the old implementation would genuinely have rejected this.
    expect(sign(JSON.stringify(parsed))).not.toBe(sign(raw));

    await expect(
      controller.handlePaystackWebhook(parsed, sign(raw), requestWith(raw))
    ).resolves.toEqual({ status: "ok" });

    expect(handlePaystackWebhook).toHaveBeenCalledTimes(1);
  });

  it("rejects a tampered payload", async () => {
    const { controller, handlePaystackWebhook } = createController();
    const raw = Buffer.from(JSON.stringify({ event: "charge.success", data: { a: 1 } }), "utf8");
    const tampered = Buffer.from(JSON.stringify({ event: "charge.success", data: { a: 2 } }));

    await expect(
      controller.handlePaystackWebhook(JSON.parse(raw.toString()), sign(tampered), requestWith(raw))
    ).rejects.toThrow(BadRequestException);

    expect(handlePaystackWebhook).not.toHaveBeenCalled();
  });

  it("rejects a missing signature header without touching the body", async () => {
    const { controller, verifyPaystackSignature, handlePaystackWebhook } = createController();
    const raw = Buffer.from("{}", "utf8");

    await expect(
      controller.handlePaystackWebhook({}, "" as never, requestWith(raw))
    ).rejects.toThrow(BadRequestException);

    expect(verifyPaystackSignature).not.toHaveBeenCalled();
    expect(handlePaystackWebhook).not.toHaveBeenCalled();
  });

  it("fails closed when the raw body is unavailable", async () => {
    const { controller, verifyPaystackSignature, handlePaystackWebhook } = createController();

    // Must NOT silently fall back to JSON.stringify — that is the original bug,
    // and an unverifiable payload on a payments path must not be processed.
    await expect(
      controller.handlePaystackWebhook(
        { event: "charge.success" },
        sign("{}"),
        requestWith(undefined)
      )
    ).rejects.toThrow(BadRequestException);

    expect(verifyPaystackSignature).not.toHaveBeenCalled();
    expect(handlePaystackWebhook).not.toHaveBeenCalled();
  });
});
