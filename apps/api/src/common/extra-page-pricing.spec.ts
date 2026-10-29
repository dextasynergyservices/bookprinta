/// <reference types="jest" />
import {
  DEFAULT_EXTRA_PAGE_PRICE_NGN,
  invalidateExtraPagePriceCache,
  isExtraPagesGateSatisfied,
  resolveExtraPagePriceNgn,
  summarizeExtraPagePayments,
} from "./extra-page-pricing.js";

function prismaWith(value: string | null | Error) {
  return {
    systemSetting: {
      findUnique: jest.fn(async () => {
        if (value instanceof Error) throw value;
        return value === null ? null : { value };
      }),
    },
  };
}

describe("extra page pricing", () => {
  beforeEach(() => invalidateExtraPagePriceCache());

  it("reads the admin-configured price", async () => {
    expect(await resolveExtraPagePriceNgn(prismaWith("15.5"))).toBe(15.5);
  });

  it.each([
    ["missing", null],
    ["invalid", "abc"],
    ["negative", "-3"],
    ["unreachable", new Error("db down")],
  ])("falls back to the default when the setting is %s", async (_label, value) => {
    expect(await resolveExtraPagePriceNgn(prismaWith(value))).toBe(DEFAULT_EXTRA_PAGE_PRICE_NGN);
  });

  it("caches, and applies an admin change immediately after invalidation", async () => {
    const prisma = prismaWith("12");
    await resolveExtraPagePriceNgn(prisma);
    await resolveExtraPagePriceNgn(prisma);
    expect(prisma.systemSetting.findUnique).toHaveBeenCalledTimes(1);

    invalidateExtraPagePriceCache();
    expect(await resolveExtraPagePriceNgn(prismaWith("20"))).toBe(20);
  });

  it("sums amounts (incl. Prisma Decimals) and pages paid", () => {
    expect(
      summarizeExtraPagePayments([
        { amount: { toNumber: () => 100 }, metadata: { extraPages: 10 } },
        { amount: "50.5", metadata: { extraPages: 5 } },
        { amount: 30, metadata: null },
      ])
    ).toEqual({ paidAmount: 180.5, paidPages: 15 });
  });

  describe("gate", () => {
    it("is satisfied by pages paid for, even after the price went up", () => {
      // Paid for 40 pages at ₦10; admin later raised the price to ₦15.
      expect(
        isExtraPagesGateSatisfied({
          overagePages: 40,
          pricePerPage: 15,
          paidAmount: 400,
          paidPages: 40,
        })
      ).toBe(true);
    });

    it("accepts naira coverage for legacy payments without a page count", () => {
      expect(
        isExtraPagesGateSatisfied({
          overagePages: 20,
          pricePerPage: 10,
          paidAmount: 200,
          paidPages: 0,
        })
      ).toBe(true);
    });

    it("stays locked when the overage grew after payment", () => {
      expect(
        isExtraPagesGateSatisfied({
          overagePages: 30,
          pricePerPage: 10,
          paidAmount: 200,
          paidPages: 20,
        })
      ).toBe(false);
    });

    it("is open when there is no overage", () => {
      expect(
        isExtraPagesGateSatisfied({
          overagePages: 0,
          pricePerPage: 10,
          paidAmount: 0,
          paidPages: 0,
        })
      ).toBe(true);
    });
  });
});
