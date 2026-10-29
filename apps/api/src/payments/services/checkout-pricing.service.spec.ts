/// <reference types="jest" />
import { BadRequestException, ConflictException } from "@nestjs/common";
import { CheckoutPricingService } from "./checkout-pricing.service.js";

const PACKAGE = {
  id: "pkg_glow",
  slug: "glow-up",
  name: "Glow Up",
  basePrice: 150000,
  includesISBN: false,
  categoryId: "cat_launch",
};

const ADDONS = [
  {
    id: "addon_cover",
    slug: "cover-design",
    name: "Cover Design",
    price: 45000,
    pricingType: "fixed",
    pricePerWord: null,
  },
  {
    id: "addon_isbn",
    slug: "isbn-registration",
    name: "ISBN Registration",
    price: 15000,
    pricingType: "fixed",
    pricePerWord: null,
  },
  {
    id: "addon_format",
    slug: "formatting",
    name: "Formatting",
    price: 0,
    pricingType: "per_word",
    pricePerWord: 0.7,
  },
];

function createService(overrides: { pkg?: unknown; coupon?: unknown } = {}) {
  const prisma = {
    package: {
      findFirst: jest.fn().mockResolvedValue("pkg" in overrides ? overrides.pkg : PACKAGE),
    },
    addon: {
      findMany: jest.fn(
        async ({ where }: { where: { OR: Array<Record<string, { in: string[] }>> } }) => {
          const ids = where.OR[0]?.id?.in ?? [];
          const slugs = where.OR[1]?.slug?.in ?? [];
          return ADDONS.filter((addon) => ids.includes(addon.id) || slugs.includes(addon.slug));
        }
      ),
    },
    coupon: {
      findUnique: jest.fn().mockResolvedValue(overrides.coupon ?? null),
    },
  };
  return { service: new CheckoutPricingService(prisma as never), prisma };
}

const validCoupon = {
  id: "coupon_1",
  code: "LAUNCH10",
  type: "PERCENTAGE",
  value: 10,
  usageLimit: 100,
  usageCount: 3,
  expiresAt: null,
  isActive: true,
  appliesToAll: true,
  packageScopes: [],
  categoryScopes: [],
};

describe("CheckoutPricingService", () => {
  it("prices the package plus fixed addons from the database, ignoring client prices", async () => {
    const { service } = createService();

    const quote = await service.quote({
      packageId: "pkg_glow",
      addons: [{ id: "addon_cover" }],
    });

    expect(quote.basePrice).toBe(150000);
    expect(quote.lines).toEqual([
      expect.objectContaining({ id: "addon_cover", price: 45000, pricingType: "fixed" }),
    ]);
    expect(quote.totalPrice).toBe(195000);
    expect(quote.currency).toBe("NGN");
  });

  it("prices per-word formatting from the word count and the addon's per-word rate", async () => {
    const { service } = createService();

    const quote = await service.quote({
      packageId: "pkg_glow",
      addons: [{ slug: "formatting" }],
      formattingWordCount: 50000,
    });

    expect(quote.lines[0]).toEqual(
      expect.objectContaining({ id: "addon_format", price: 35000, wordCount: 50000 })
    );
    expect(quote.totalPrice).toBe(185000);
  });

  it("requires a word count when per-word formatting is selected", async () => {
    const { service } = createService();
    await expect(
      service.quote({ packageId: "pkg_glow", addons: [{ id: "addon_format" }] })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("does not charge for ISBN when the package already includes it", async () => {
    const { service } = createService({ pkg: { ...PACKAGE, includesISBN: true } });

    const quote = await service.quote({
      packageId: "pkg_glow",
      addons: [{ id: "addon_isbn" }, { id: "addon_cover" }],
    });

    expect(quote.lines.map((line) => line.id)).toEqual(["addon_cover"]);
    expect(quote.totalPrice).toBe(195000);
  });

  it("applies a valid coupon to the server subtotal", async () => {
    const { service } = createService({ coupon: validCoupon });

    const quote = await service.quote({
      packageId: "pkg_glow",
      addons: [{ id: "addon_cover" }],
      couponCode: " launch10 ",
    });

    expect(quote.couponCode).toBe("LAUNCH10");
    expect(quote.discountAmount).toBe(19500);
    expect(quote.totalPrice).toBe(175500);
  });

  it.each([
    ["expired", { expiresAt: new Date(Date.now() - 1000) }],
    ["exhausted", { usageCount: 100 }],
    ["inactive", { isActive: false }],
    ["out of scope", { appliesToAll: false }],
  ])("rejects an %s coupon instead of silently discounting", async (_label, patch) => {
    const { service } = createService({ coupon: { ...validCoupon, ...patch } });
    await expect(
      service.quote({ packageId: "pkg_glow", couponCode: "LAUNCH10" })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects an unknown or inactive package", async () => {
    const { service } = createService({ pkg: null });
    await expect(service.quote({ packageId: "pkg_missing" })).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it("rejects an addon that does not exist or is inactive", async () => {
    const { service } = createService();
    await expect(
      service.quote({ packageId: "pkg_glow", addons: [{ id: "addon_ghost" }] })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("flags a client amount that disagrees with the server total", () => {
    const { service } = createService();
    expect(() => service.assertClientAmountMatches(100, 195000)).toThrow(ConflictException);
    expect(() => service.assertClientAmountMatches(195000.2, 195000)).not.toThrow();
  });

  it("rejects non-NGN currencies", () => {
    const { service } = createService();
    expect(() => service.assertCurrency("USD")).toThrow(BadRequestException);
    expect(() => service.assertCurrency("ngn")).not.toThrow();
    expect(() => service.assertCurrency(undefined)).not.toThrow();
  });

  describe("signatures", () => {
    const pricing = {
      packageId: "pkg_glow",
      addons: [
        { id: "b", price: 10, wordCount: null },
        { id: "a", price: 20, wordCount: 1000 },
      ],
      couponCode: null,
      discountAmount: 0,
      totalPrice: 150030,
      currency: "NGN",
      dashboardUserId: null,
    };

    it("verifies its own signature regardless of addon order", () => {
      const { service } = createService();
      const signature = service.sign(pricing);
      expect(service.verify({ ...pricing, addons: [...pricing.addons].reverse() }, signature)).toBe(
        true
      );
    });

    it.each([
      ["total", { totalPrice: 100 }],
      ["addon price", { addons: [{ id: "a", price: 1, wordCount: 1000 }] }],
      ["dashboard owner", { dashboardUserId: "user_victim" }],
      ["discount", { discountAmount: 150000 }],
    ])("rejects pricing whose %s was tampered with", (_label, patch) => {
      const { service } = createService();
      const signature = service.sign(pricing);
      expect(service.verify({ ...pricing, ...patch }, signature)).toBe(false);
    });

    it("rejects missing or malformed signatures", () => {
      const { service } = createService();
      expect(service.verify(pricing, undefined)).toBe(false);
      expect(service.verify(pricing, "not-hex")).toBe(false);
      expect(service.verify(pricing, "ab".repeat(16))).toBe(false);
    });
  });
});
