/// <reference types="jest" />
import { PaymentStatus } from "../generated/prisma/enums.js";
import { PaymentsService } from "./payments.service.js";

/**
 * Payment reconciliation finalises successful Paystack charges that never became
 * Orders (missed webhook / customer never returned from the redirect).
 *
 * The safety-critical property under test: our Paystack integration is SHARED
 * with another product, so the transaction list contains charges that are not
 * ours. Reconciliation must finalise only BookPrinta charges and never touch the
 * other product's.
 */

type Tx = { reference: string; metadata?: unknown; status?: string };

function createService(options: {
  transactions: Tx[];
  packages?: Array<{ id?: string; slug?: string }>;
  quotes?: string[];
  existingPayments?: Record<string, { processedAt: Date | null; orderId: string | null }>;
}) {
  // PaymentsService resolves redirect links in its constructor.
  process.env.FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

  const listTransactions = jest.fn().mockResolvedValue(options.transactions);

  const prisma = {
    payment: {
      findUnique: jest.fn(async ({ where }: { where: { providerRef: string } }) => {
        return options.existingPayments?.[where.providerRef] ?? null;
      }),
    },
    customQuote: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
        options.quotes?.includes(where.id) ? { id: where.id } : null
      ),
    },
    package: {
      // Mirrors resolvePackageFromCheckoutMetadata: active package by id, then slug/tier.
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const pkgs = options.packages ?? [];
        if (typeof where.id === "string") {
          return pkgs.find((p) => p.id === where.id) ?? null;
        }
        if (typeof where.slug === "string") {
          return pkgs.find((p) => p.slug === where.slug) ?? null;
        }
        return null;
      }),
    },
  };

  const service = new PaymentsService(
    prisma as never,
    { isAvailable: true, listTransactions } as never,
    { isAvailable: true } as never,
    { isAvailable: true } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { assertBillingGateAccess: jest.fn() } as never,
    null,
    null
  );

  // verify() is the shared finalisation path (also used by the browser redirect).
  // Reconciliation must delegate to it rather than reimplement order creation.
  const verify = jest
    .spyOn(service, "verify")
    .mockResolvedValue({ status: "success" } as unknown as never);

  return { service, prisma, listTransactions, verify };
}

const OUR_PACKAGE_ID = "cmpkglegacy0000000000000001";

describe("PaymentsService.reconcilePaystackPayments", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("finalises our unprocessed charge via verify()", async () => {
    const { service, verify } = createService({
      transactions: [{ reference: "ps_ours_1", metadata: { packageId: OUR_PACKAGE_ID } }],
      packages: [{ id: OUR_PACKAGE_ID }],
    });

    const result = await service.reconcilePaystackPayments();

    expect(verify).toHaveBeenCalledWith("ps_ours_1", "PAYSTACK");
    expect(result).toMatchObject({ ours: 1, finalised: 1, skippedForeign: 0, failed: 0 });
  });

  it("SKIPS the other product's charge on the shared integration", async () => {
    // Foreign metadata: a populated object, but no package/quote of ours.
    const { service, verify } = createService({
      transactions: [
        { reference: "ps_other_app", metadata: { orderId: "OTHER-123", plan: "pro" } },
      ],
      packages: [{ id: OUR_PACKAGE_ID }],
    });

    const result = await service.reconcilePaystackPayments();

    expect(verify).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ours: 0, finalised: 0, skippedForeign: 1 });
  });

  it("skips a charge whose package does not resolve to an active BookPrinta package", async () => {
    // Guards against treating any metadata with a packageId as ours.
    const { service, verify } = createService({
      transactions: [{ reference: "ps_unknown_pkg", metadata: { packageId: "not-our-package" } }],
      packages: [{ id: OUR_PACKAGE_ID }],
    });

    const result = await service.reconcilePaystackPayments();

    expect(verify).not.toHaveBeenCalled();
    expect(result.skippedForeign).toBe(1);
  });

  it("treats metadata delivered as a JSON string the same as an object", async () => {
    const { service, verify } = createService({
      transactions: [
        { reference: "ps_json_meta", metadata: JSON.stringify({ packageId: OUR_PACKAGE_ID }) },
      ],
      packages: [{ id: OUR_PACKAGE_ID }],
    });

    const result = await service.reconcilePaystackPayments();

    expect(verify).toHaveBeenCalledWith("ps_json_meta", "PAYSTACK");
    expect(result.finalised).toBe(1);
  });

  it("recognises the custom-quote flow when the quote exists", async () => {
    const { service, verify } = createService({
      transactions: [{ reference: "ps_quote", metadata: { customQuoteId: "cmquote1" } }],
      quotes: ["cmquote1"],
    });

    const result = await service.reconcilePaystackPayments();

    expect(verify).toHaveBeenCalledWith("ps_quote", "PAYSTACK");
    expect(result.finalised).toBe(1);
  });

  it("does not re-finalise a charge that already has a processed payment and order", async () => {
    const { service, verify } = createService({
      transactions: [{ reference: "ps_done", metadata: { packageId: OUR_PACKAGE_ID } }],
      packages: [{ id: OUR_PACKAGE_ID }],
      existingPayments: {
        ps_done: { processedAt: new Date("2026-07-01T10:00:00.000Z"), orderId: "cmorder1" },
      },
    });

    const result = await service.reconcilePaystackPayments();

    expect(verify).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ours: 1, alreadyProcessed: 1, finalised: 0 });
  });

  it("retries a payment that was processed but never got an order (stuck)", async () => {
    const { service, verify } = createService({
      transactions: [{ reference: "ps_stuck", metadata: { packageId: OUR_PACKAGE_ID } }],
      packages: [{ id: OUR_PACKAGE_ID }],
      existingPayments: {
        ps_stuck: { processedAt: new Date("2026-07-01T10:00:00.000Z"), orderId: null },
      },
    });

    const result = await service.reconcilePaystackPayments();

    expect(verify).toHaveBeenCalledWith("ps_stuck", "PAYSTACK");
    expect(result.finalised).toBe(1);
  });

  it("counts a failure without aborting the rest of the batch", async () => {
    const { service, verify } = createService({
      transactions: [
        { reference: "ps_bad", metadata: { packageId: OUR_PACKAGE_ID } },
        { reference: "ps_good", metadata: { packageId: OUR_PACKAGE_ID } },
      ],
      packages: [{ id: OUR_PACKAGE_ID }],
    });
    verify
      .mockRejectedValueOnce(new Error("Paystack verify failed"))
      .mockResolvedValueOnce({ status: "success" } as unknown as never);

    const result = await service.reconcilePaystackPayments();

    expect(result).toMatchObject({ ours: 2, finalised: 1, failed: 1 });
  });

  it("no-ops safely when Paystack is not configured", async () => {
    const { service, listTransactions } = createService({ transactions: [] });
    (
      service as unknown as { paystackService: { isAvailable: boolean } }
    ).paystackService.isAvailable = false;

    const result = await service.reconcilePaystackPayments();

    expect(listTransactions).not.toHaveBeenCalled();
    expect(result.scanned).toBe(0);
  });

  it("returns an empty summary when listing transactions fails", async () => {
    const { service, listTransactions, verify } = createService({ transactions: [] });
    listTransactions.mockRejectedValue(new Error("Paystack 500"));

    const result = await service.reconcilePaystackPayments();

    expect(verify).not.toHaveBeenCalled();
    expect(result).toMatchObject({ scanned: 0, finalised: 0 });
  });

  it("requests only successful charges within the lookback window", async () => {
    const { service, listTransactions } = createService({ transactions: [] });

    await service.reconcilePaystackPayments({ lookbackHours: 6 });

    const args = listTransactions.mock.calls[0][0];
    expect(args.status).toBe(PaymentStatus.SUCCESS.toLowerCase());
    const spanHours = (args.to.getTime() - args.from.getTime()) / 3_600_000;
    expect(Math.round(spanHours)).toBe(6);
  });
});
