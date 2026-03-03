import type {
  Coupon,
  CouponDiscountType,
  CreateCouponInput,
  UpdateCouponInput,
  ValidateCouponInput,
  ValidateCouponResponse,
} from "@bookprinta/shared";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { DiscountType, type Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";

type CouponRow = {
  id: string;
  code: string;
  type: DiscountType;
  value: unknown;
  usageLimit: number | null;
  usageCount: number;
  expiresAt: Date | null;
  isActive: boolean;
  createdAt: Date;
};

@Injectable()
export class CouponsService {
  private static readonly COUPON_SELECT = {
    id: true,
    code: true,
    type: true,
    value: true,
    usageLimit: true,
    usageCount: true,
    expiresAt: true,
    isActive: true,
    createdAt: true,
  } as const;

  constructor(private readonly prisma: PrismaService) {}

  async validateCoupon(input: ValidateCouponInput): Promise<ValidateCouponResponse> {
    const code = this.normalizeCode(input.code);
    const coupon = await this.prisma.coupon.findUnique({
      where: { code },
      select: CouponsService.COUPON_SELECT,
    });

    if (!coupon) {
      this.throwCouponValidationError("INVALID_CODE", "Invalid code");
    }

    if (!coupon.isActive) {
      this.throwCouponValidationError("CODE_INACTIVE", "Code is inactive");
    }

    if (coupon.expiresAt && coupon.expiresAt.getTime() <= Date.now()) {
      this.throwCouponValidationError("CODE_EXPIRED", "Code has expired");
    }

    if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
      this.throwCouponValidationError("CODE_MAXED_OUT", "Code has reached its usage limit");
    }

    const amount = this.toCurrency(input.amount);
    const discountAmount = this.calculateDiscountAmount({
      amount,
      discountType: coupon.type,
      discountValue: this.toNumber(coupon.value),
    });

    return {
      ...this.serializeCoupon(coupon),
      discountAmount,
    };
  }

  async listCoupons(): Promise<Coupon[]> {
    const coupons = await this.prisma.coupon.findMany({
      orderBy: { createdAt: "desc" },
      select: CouponsService.COUPON_SELECT,
    });

    return coupons.map((coupon) => this.serializeCoupon(coupon));
  }

  async createCoupon(input: CreateCouponInput): Promise<Coupon> {
    try {
      const coupon = await this.prisma.coupon.create({
        data: {
          code: this.normalizeCode(input.code),
          type: this.toPrismaDiscountType(input.discountType),
          value: this.toCurrency(input.discountValue),
          usageLimit: input.maxUses ?? null,
          usageCount: 0,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          isActive: input.isActive ?? true,
        },
        select: CouponsService.COUPON_SELECT,
      });

      return this.serializeCoupon(coupon);
    } catch (error) {
      if (this.isPrismaUniqueViolation(error)) {
        throw new BadRequestException("Coupon code already exists");
      }
      throw error;
    }
  }

  async updateCoupon(id: string, input: UpdateCouponInput): Promise<Coupon> {
    const existing = await this.prisma.coupon.findUnique({
      where: { id },
      select: {
        id: true,
        usageLimit: true,
        usageCount: true,
      },
    });

    if (!existing) {
      throw new NotFoundException("Coupon not found");
    }

    const nextUsageLimit = input.maxUses !== undefined ? input.maxUses : existing.usageLimit;
    const nextUsageCount =
      input.currentUses !== undefined ? input.currentUses : existing.usageCount;

    if (nextUsageLimit !== null && nextUsageCount > nextUsageLimit) {
      throw new BadRequestException("currentUses cannot be greater than maxUses");
    }

    const data: Prisma.CouponUpdateInput = {};
    if (input.code !== undefined) data.code = this.normalizeCode(input.code);
    if (input.discountType !== undefined) data.type = this.toPrismaDiscountType(input.discountType);
    if (input.discountValue !== undefined) data.value = this.toCurrency(input.discountValue);
    if (input.maxUses !== undefined) data.usageLimit = input.maxUses;
    if (input.currentUses !== undefined) data.usageCount = input.currentUses;
    if (input.expiresAt !== undefined)
      data.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (input.isActive !== undefined) data.isActive = input.isActive;

    try {
      const coupon = await this.prisma.coupon.update({
        where: { id },
        data,
        select: CouponsService.COUPON_SELECT,
      });

      return this.serializeCoupon(coupon);
    } catch (error) {
      if (this.isPrismaUniqueViolation(error)) {
        throw new BadRequestException("Coupon code already exists");
      }

      if (this.isPrismaRecordNotFound(error)) {
        throw new NotFoundException("Coupon not found");
      }

      throw error;
    }
  }

  async deleteCoupon(id: string): Promise<{ id: string; deleted: true }> {
    try {
      await this.prisma.coupon.delete({
        where: { id },
      });
    } catch (error) {
      if (this.isPrismaRecordNotFound(error)) {
        throw new NotFoundException("Coupon not found");
      }
      throw error;
    }

    return { id, deleted: true };
  }

  private normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }

  private toPrismaDiscountType(type: CouponDiscountType): DiscountType {
    return type === "percentage" ? DiscountType.PERCENTAGE : DiscountType.FIXED_AMOUNT;
  }

  private toApiDiscountType(type: DiscountType): CouponDiscountType {
    return type === DiscountType.PERCENTAGE ? "percentage" : "fixed";
  }

  private calculateDiscountAmount(params: {
    amount: number;
    discountType: DiscountType;
    discountValue: number;
  }): number {
    const rawDiscount =
      params.discountType === DiscountType.PERCENTAGE
        ? params.amount * (params.discountValue / 100)
        : params.discountValue;

    return this.toCurrency(Math.min(params.amount, Math.max(0, rawDiscount)));
  }

  private serializeCoupon(coupon: CouponRow): Coupon {
    return {
      id: coupon.id,
      code: coupon.code,
      discountType: this.toApiDiscountType(coupon.type),
      discountValue: this.toNumber(coupon.value),
      maxUses: coupon.usageLimit,
      currentUses: coupon.usageCount,
      expiresAt: coupon.expiresAt ? coupon.expiresAt.toISOString() : null,
      isActive: coupon.isActive,
      createdAt: coupon.createdAt.toISOString(),
    };
  }

  private throwCouponValidationError(
    code: "INVALID_CODE" | "CODE_EXPIRED" | "CODE_INACTIVE" | "CODE_MAXED_OUT",
    message: string
  ): never {
    throw new BadRequestException({ code, message });
  }

  private toCurrency(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Number(value.toFixed(2)));
  }

  private toNumber(value: unknown): number {
    if (typeof value === "number") return value;

    if (
      value &&
      typeof value === "object" &&
      "toNumber" in value &&
      typeof (value as { toNumber: unknown }).toNumber === "function"
    ) {
      return (value as { toNumber: () => number }).toNumber();
    }

    const numericValue = Number(value);
    if (!Number.isNaN(numericValue)) return numericValue;

    throw new TypeError("Failed to serialize decimal value to number");
  }

  private isPrismaUniqueViolation(error: unknown): boolean {
    return Boolean(
      error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
    );
  }

  private isPrismaRecordNotFound(error: unknown): boolean {
    return Boolean(
      error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: string }).code === "P2025"
    );
  }
}
