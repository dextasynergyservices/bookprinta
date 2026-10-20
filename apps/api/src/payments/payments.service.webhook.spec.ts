/// <reference types="jest" />
/**
 * handlePaystackWebhook behaviour.
 *
 * This handler had no direct coverage, which matters because three of its rules
 * are invisible until the exact wrong event arrives in production:
 *
 *  1. Charges that are not ours are acknowledged and ignored. The Paystack
 *     integration can be shared with another product, and recording a foreign
 *     charge as a SUCCESS Payment with no Order makes it indistinguishable from
 *     one of our own customers being stranded — which is the precise signal
 *     listOrphanedPayments() depends on.
 *
 *  2. A deterministic business-rule conflict is acknowledged, not retried.
 *     Returning non-2xx makes Paystack retry on a schedule until it gives up,
 *     and repeated failures can get the endpoint disabled outright.
 *
 *  3. A transient failure still propagates, so Paystack DOES retry it. This is
 *     the half that makes rule 2 safe: swallowing everything would silently
 *     drop recoverable charges.
 */
import { ConflictException, ServiceUnavailableException } from "@nestjs/common";
import { PaymentsService } from "./payments.service.js";

function createService() {
  process.env.FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

  const prisma = {
    payment: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    package: {
      findFirst: jest.fn(),
    },
    customQuote: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(async (cb: (client: unknown) => unknown) => cb({})),
  };

  const service = new PaymentsService(
    prisma as never,
    { isAvailable: true } as never,
    { isAvailable: true } as never,
    { isAvailable: true } as never,
    {} as never,
    {} as never,
    { sendRegistrationLink: jest.fn() } as never,
    {
      createOrderStatusNotification: jest.fn(),
      notifyAdminsBankTransferReceived: jest.fn(),
    } as never,
    {} as never,
    null,
    null
  );

  return { prisma, service };
}

/** A charge.success event whose metadata points at a BookPrinta package. */
function ourChargeEvent(reference = "ref_ours") {
  return {
    event: "charge.success",
    data: {
      reference,
      status: "success",
      amount: 7_500_000,
      currency: "NGN",
      customer: { email: "author@example.com" },
      metadata: { packageId: "pkg_launch_1", fullName: "A Author", phone: "+2348010000001" },
    },
  } as never;
}

/** A charge.success event carrying another product's metadata. */
function foreignChargeEvent(reference = "ref_foreign") {
  return {
    event: "charge.success",
    data: {
      reference,
      status: "success",
      amount: 500_000,
      currency: "NGN",
      customer: { email: "someone@other-product.example" },
      metadata: { plan: "other-product-subscription", seats: 3 },
    },
  } as never;
}

/** The subset of createPaymentFromWebhook's payload these tests assert on. */
type CreatePaymentArgs = {
  providerRef: string;
  amount: number;
  currency: string;
};

/** Stubs the private create path so these tests isolate the dispatch rules. */
function stubCreatePath(service: PaymentsService, impl: () => Promise<void>) {
  const spy = jest.fn<Promise<void>, [CreatePaymentArgs]>(impl);
  (service as unknown as { createPaymentFromWebhook: unknown }).createPaymentFromWebhook = spy;
  return spy;
}

describe("handlePaystackWebhook", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("skips an event whose reference was already processed", async () => {
    const { service, prisma } = createService();
    prisma.payment.findUnique.mockResolvedValue({ processedAt: new Date() });
    const create = stubCreatePath(service, async () => {});

    const result = await service.handlePaystackWebhook(ourChargeEvent());

    expect(result).toEqual({ status: "ok", message: "Already processed" });
    expect(create).not.toHaveBeenCalled();
  });

  describe("foreign charges", () => {
    it("acknowledges and ignores a charge that resolves no BookPrinta package", async () => {
      const { service, prisma } = createService();
      prisma.payment.findUnique.mockResolvedValue(null);
      // No package resolves, and there is no customQuoteId to fall back on.
      prisma.package.findFirst.mockResolvedValue(null);
      const create = stubCreatePath(service, async () => {});

      const result = await service.handlePaystackWebhook(foreignChargeEvent());

      // 2xx, so Paystack does not retry someone else's charge forever...
      expect(result).toEqual({ status: "ok", message: "Not a BookPrinta charge" });
      // ...and crucially no Payment row is written, so it cannot masquerade as
      // one of our own stranded customers.
      expect(create).not.toHaveBeenCalled();
    });

    it("processes a charge that does resolve to an active package", async () => {
      const { service, prisma } = createService();
      prisma.payment.findUnique.mockResolvedValue(null);
      prisma.package.findFirst.mockResolvedValue({ id: "pkg_launch_1", pageLimit: 120 });
      const create = stubCreatePath(service, async () => {});

      const result = await service.handlePaystackWebhook(ourChargeEvent());

      expect(result).toEqual({ status: "ok" });
      expect(create).toHaveBeenCalledTimes(1);
      expect(create.mock.calls[0][0]).toMatchObject({
        providerRef: "ref_ours",
        // Paystack sends kobo; we persist naira.
        amount: 75_000,
        currency: "NGN",
      });
    });
  });

  describe("failure handling", () => {
    it("acknowledges a deterministic business-rule conflict instead of forcing retries", async () => {
      const { service, prisma } = createService();
      prisma.payment.findUnique.mockResolvedValue(null);
      prisma.package.findFirst.mockResolvedValue({ id: "pkg_launch_1" });
      stubCreatePath(service, async () => {
        throw new ConflictException("This phone number is already linked to another account.");
      });

      const result = await service.handlePaystackWebhook(ourChargeEvent());

      // 2xx: a retry would hit the identical conflict, and repeated non-2xx
      // replies risk Paystack disabling the endpoint.
      expect(result).toEqual({ status: "ok", message: "Acknowledged — manual review required" });
    });

    it("propagates a transient failure so Paystack retries it", async () => {
      const { service, prisma } = createService();
      prisma.payment.findUnique.mockResolvedValue(null);
      prisma.package.findFirst.mockResolvedValue({ id: "pkg_launch_1" });
      stubCreatePath(service, async () => {
        throw new ServiceUnavailableException("database unavailable");
      });

      // Must NOT be swallowed — this charge is still recoverable.
      await expect(service.handlePaystackWebhook(ourChargeEvent())).rejects.toThrow(
        ServiceUnavailableException
      );
    });
  });

  it("ignores events other than a successful charge", async () => {
    const { service, prisma } = createService();
    prisma.payment.findUnique.mockResolvedValue(null);
    const create = stubCreatePath(service, async () => {});

    const result = await service.handlePaystackWebhook({
      event: "charge.failed",
      data: { reference: "ref_failed", status: "failed", amount: 1000, currency: "NGN" },
    } as never);

    expect(result).toEqual({ status: "ok" });
    expect(create).not.toHaveBeenCalled();
  });
});
