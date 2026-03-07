/// <reference types="jest" />
import { DiscountType } from "../generated/prisma/client.js";
import { PaymentsService } from "./payments.service.js";

type CouponCheckoutMetadata = {
  couponCode?: string;
  basePrice?: number;
  addonTotal?: number;
  totalPrice?: number;
  discountAmount?: number;
};

type CouponTransactionClient = {
  coupon: {
    findUnique: jest.Mock;
    updateMany: jest.Mock;
  };
};

type PaymentsServiceCouponPrivate = {
  resolveAppliedCouponForOrder: (
    tx: CouponTransactionClient,
    checkout: CouponCheckoutMetadata,
    amountPaid: number
  ) => Promise<{ id: string; discountAmount: number } | null>;
};

function createService() {
  process.env.FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
  return new PaymentsService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never
  );
}

async function resolveAppliedCouponForOrder(
  service: PaymentsService,
  tx: CouponTransactionClient,
  checkout: CouponCheckoutMetadata,
  amountPaid: number
) {
  return (service as unknown as PaymentsServiceCouponPrivate).resolveAppliedCouponForOrder(
    tx,
    checkout,
    amountPaid
  );
}

function makeCouponRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "cmcoupon001",
    type: DiscountType.PERCENTAGE,
    value: { toNumber: () => 10 } as unknown,
    usageLimit: 100,
    usageCount: 1,
    expiresAt: null,
    isActive: true,
    ...overrides,
  };
}

describe("PaymentsService coupon application", () => {
  it("returns null when checkout has no coupon code", async () => {
    const service = createService();
    const tx = {
      coupon: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    const result = await resolveAppliedCouponForOrder(
      service,
      tx,
      { basePrice: 100_000, addonTotal: 20_000 },
      120_000
    );

    expect(result).toBeNull();
    expect(tx.coupon.findUnique).not.toHaveBeenCalled();
    expect(tx.coupon.updateMany).not.toHaveBeenCalled();
  });

  it("applies percentage coupon and increments usage count atomically", async () => {
    const service = createService();
    const tx = {
      coupon: {
        findUnique: jest.fn().mockResolvedValue(makeCouponRow()),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const result = await resolveAppliedCouponForOrder(
      service,
      tx,
      { couponCode: "save10", basePrice: 100_000, addonTotal: 20_000 },
      120_000
    );

    expect(result).toEqual({
      id: "cmcoupon001",
      discountAmount: 12_000,
    });
    expect(tx.coupon.findUnique).toHaveBeenCalledWith({
      where: { code: "SAVE10" },
      select: expect.any(Object),
    });
    expect(tx.coupon.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "cmcoupon001",
        isActive: true,
        usageCount: { lt: 100 },
      }),
      data: {
        usageCount: { increment: 1 },
      },
    });
  });

  it("caps fixed discount at subtotal and increments usage", async () => {
    const service = createService();
    const tx = {
      coupon: {
        findUnique: jest.fn().mockResolvedValue(
          makeCouponRow({
            type: DiscountType.FIXED_AMOUNT,
            value: { toNumber: () => 500_000 } as unknown,
          })
        ),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const result = await resolveAppliedCouponForOrder(
      service,
      tx,
      { couponCode: "BIGSAVE" },
      90_000
    );

    expect(result).toEqual({
      id: "cmcoupon001",
      discountAmount: 90_000,
    });
  });

  it("returns null when coupon cannot be claimed under concurrency", async () => {
    const service = createService();
    const tx = {
      coupon: {
        findUnique: jest.fn().mockResolvedValue(makeCouponRow()),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    const result = await resolveAppliedCouponForOrder(
      service,
      tx,
      { couponCode: "SAVE10", basePrice: 100_000, addonTotal: 20_000 },
      120_000
    );

    expect(result).toBeNull();
    expect(tx.coupon.updateMany).toHaveBeenCalledTimes(1);
  });

  it("returns null when coupon is expired", async () => {
    const service = createService();
    const tx = {
      coupon: {
        findUnique: jest
          .fn()
          .mockResolvedValue(makeCouponRow({ expiresAt: new Date("2025-01-01T00:00:00.000Z") })),
        updateMany: jest.fn(),
      },
    };

    const result = await resolveAppliedCouponForOrder(
      service,
      tx,
      { couponCode: "SAVE10", basePrice: 100_000, addonTotal: 20_000 },
      120_000
    );

    expect(result).toBeNull();
    expect(tx.coupon.updateMany).not.toHaveBeenCalled();
  });
});
