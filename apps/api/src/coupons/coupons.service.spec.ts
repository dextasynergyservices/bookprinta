/// <reference types="jest" />
import { BadRequestException } from "@nestjs/common";
import { DiscountType } from "../generated/prisma/client.js";
import { CouponsService } from "./coupons.service.js";

function makeCouponRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "cmcoupon001",
    code: "SAVE10",
    type: DiscountType.PERCENTAGE,
    value: { toNumber: () => 10 } as unknown,
    usageLimit: 100,
    usageCount: 1,
    expiresAt: null,
    isActive: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

const mockPrismaService = {
  coupon: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

describe("CouponsService", () => {
  let service: CouponsService;

  beforeEach(() => {
    service = new CouponsService(mockPrismaService as never);
    jest.clearAllMocks();
  });

  async function expectValidationError(code: string, run: () => Promise<unknown>) {
    try {
      await run();
      throw new Error("Expected BadRequestException");
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const response = (error as BadRequestException).getResponse() as { code?: string };
      expect(response.code).toBe(code);
    }
  }

  describe("validateCoupon", () => {
    it("throws INVALID_CODE when coupon does not exist", async () => {
      mockPrismaService.coupon.findUnique.mockResolvedValue(null);

      await expectValidationError("INVALID_CODE", () =>
        service.validateCoupon({ code: "missing", amount: 100_000 })
      );
    });

    it("throws CODE_INACTIVE when coupon is inactive", async () => {
      mockPrismaService.coupon.findUnique.mockResolvedValue(makeCouponRow({ isActive: false }));

      await expectValidationError("CODE_INACTIVE", () =>
        service.validateCoupon({ code: "save10", amount: 100_000 })
      );
    });

    it("throws CODE_EXPIRED when coupon is expired", async () => {
      mockPrismaService.coupon.findUnique.mockResolvedValue(
        makeCouponRow({ expiresAt: new Date("2025-01-01T00:00:00.000Z") })
      );

      await expectValidationError("CODE_EXPIRED", () =>
        service.validateCoupon({ code: "save10", amount: 100_000 })
      );
    });

    it("throws CODE_MAXED_OUT when usage limit is reached", async () => {
      mockPrismaService.coupon.findUnique.mockResolvedValue(
        makeCouponRow({ usageLimit: 10, usageCount: 10 })
      );

      await expectValidationError("CODE_MAXED_OUT", () =>
        service.validateCoupon({ code: "save10", amount: 100_000 })
      );
    });

    it("returns calculated percentage discount for valid coupon", async () => {
      mockPrismaService.coupon.findUnique.mockResolvedValue(makeCouponRow());

      const result = await service.validateCoupon({ code: "save10", amount: 120_000 });

      expect(result.code).toBe("SAVE10");
      expect(result.discountType).toBe("percentage");
      expect(result.discountAmount).toBe(12_000);
      expect(mockPrismaService.coupon.findUnique).toHaveBeenCalledWith({
        where: { code: "SAVE10" },
        select: expect.any(Object),
      });
    });

    it("caps fixed discount at order amount", async () => {
      mockPrismaService.coupon.findUnique.mockResolvedValue(
        makeCouponRow({
          type: DiscountType.FIXED_AMOUNT,
          value: { toNumber: () => 500_000 } as unknown,
        })
      );

      const result = await service.validateCoupon({ code: "save10", amount: 90_000 });

      expect(result.discountType).toBe("fixed");
      expect(result.discountAmount).toBe(90_000);
    });
  });
});
