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
  appliesToAll: boolean;
  packageScopes: Array<{ packageId: string }>;
  categoryScopes: Array<{ categoryId: string }>;
  createdAt: Date;
};

export type CouponAnalyticsBreakdownItem = {
  packageId: string;
  packageName: string;
  categoryId: string;
  categoryName: string;
  orderCount: number;
  discountAmount: number;
};

export type CouponAnalyticsItem = {
  couponId: string;
  couponCode: string;
  orderCount: number;
  usageCount: number;
  totalDiscountAmount: number;
  totalRevenueAmount: number;
  packageBreakdown: CouponAnalyticsBreakdownItem[];
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
    appliesToAll: true,
    packageScopes: {
      select: {
        packageId: true,
      },
    },
    categoryScopes: {
      select: {
        categoryId: true,
      },
    },
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

    const packageContext = await this.resolvePackageContext(input);
    if (!this.isCouponApplicableToPackage(coupon, packageContext)) {
      this.throwCouponValidationError("CODE_NOT_APPLICABLE", "Code does not apply to this package");
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
    const scope = this.resolveScopeInput(input);
    await this.assertScopeTargetsExist(scope);

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
          appliesToAll: scope.appliesToAll,
          packageScopes:
            scope.appliesToAll || scope.eligiblePackageIds.length === 0
              ? undefined
              : {
                  create: scope.eligiblePackageIds.map((packageId) => ({ packageId })),
                },
          categoryScopes:
            scope.appliesToAll || scope.eligibleCategoryIds.length === 0
              ? undefined
              : {
                  create: scope.eligibleCategoryIds.map((categoryId) => ({ categoryId })),
                },
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
        appliesToAll: true,
        packageScopes: {
          select: {
            packageId: true,
          },
        },
        categoryScopes: {
          select: {
            categoryId: true,
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException("Coupon not found");
    }

    const nextUsageLimit = input.maxUses !== undefined ? input.maxUses : existing.usageLimit;
    const nextUsageCount =
      input.currentUses !== undefined ? input.currentUses : existing.usageCount;

    const nextAppliesToAll = input.appliesToAll ?? existing.appliesToAll;
    const nextPackageIds =
      input.eligiblePackageIds !== undefined
        ? this.normalizeIdList(input.eligiblePackageIds)
        : existing.packageScopes.map((scope) => scope.packageId);
    const nextCategoryIds =
      input.eligibleCategoryIds !== undefined
        ? this.normalizeIdList(input.eligibleCategoryIds)
        : existing.categoryScopes.map((scope) => scope.categoryId);

    if (!nextAppliesToAll && nextPackageIds.length === 0 && nextCategoryIds.length === 0) {
      throw new BadRequestException("At least one eligible package or category is required");
    }

    await this.assertScopeTargetsExist({
      appliesToAll: nextAppliesToAll,
      eligiblePackageIds: nextPackageIds,
      eligibleCategoryIds: nextCategoryIds,
    });

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
    if (input.appliesToAll !== undefined) data.appliesToAll = input.appliesToAll;

    const shouldReplaceScopeTargets =
      input.appliesToAll !== undefined ||
      input.eligiblePackageIds !== undefined ||
      input.eligibleCategoryIds !== undefined;

    try {
      const coupon = await this.prisma.coupon.update({
        where: { id },
        data: {
          ...data,
          ...(shouldReplaceScopeTargets
            ? {
                packageScopes: {
                  deleteMany: {},
                  ...(nextAppliesToAll || nextPackageIds.length === 0
                    ? {}
                    : {
                        create: nextPackageIds.map((packageId) => ({ packageId })),
                      }),
                },
                categoryScopes: {
                  deleteMany: {},
                  ...(nextAppliesToAll || nextCategoryIds.length === 0
                    ? {}
                    : {
                        create: nextCategoryIds.map((categoryId) => ({ categoryId })),
                      }),
                },
              }
            : {}),
        },
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

  async getCouponAnalytics(): Promise<CouponAnalyticsItem[]> {
    const orders = await this.prisma.order.findMany({
      where: {
        couponId: {
          not: null,
        },
      },
      select: {
        couponId: true,
        coupon: {
          select: {
            code: true,
            usageCount: true,
          },
        },
        discountAmount: true,
        totalAmount: true,
        package: {
          select: {
            id: true,
            name: true,
            category: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const couponMap = new Map<string, CouponAnalyticsItem>();

    for (const order of orders) {
      if (!order.couponId || !order.coupon) continue;

      const current = couponMap.get(order.couponId);
      if (!current) {
        couponMap.set(order.couponId, {
          couponId: order.couponId,
          couponCode: order.coupon.code,
          orderCount: 1,
          usageCount: order.coupon.usageCount,
          totalDiscountAmount: this.toCurrency(order.discountAmount),
          totalRevenueAmount: this.toCurrency(order.totalAmount),
          packageBreakdown: [
            {
              packageId: order.package.id,
              packageName: order.package.name,
              categoryId: order.package.category.id,
              categoryName: order.package.category.name,
              orderCount: 1,
              discountAmount: this.toCurrency(order.discountAmount),
            },
          ],
        });
        continue;
      }

      current.orderCount += 1;
      current.totalDiscountAmount = this.toCurrency(
        current.totalDiscountAmount + this.toCurrency(order.discountAmount)
      );
      current.totalRevenueAmount = this.toCurrency(
        current.totalRevenueAmount + this.toCurrency(order.totalAmount)
      );

      const breakdown = current.packageBreakdown.find(
        (item) =>
          item.packageId === order.package.id && item.categoryId === order.package.category.id
      );

      if (!breakdown) {
        current.packageBreakdown.push({
          packageId: order.package.id,
          packageName: order.package.name,
          categoryId: order.package.category.id,
          categoryName: order.package.category.name,
          orderCount: 1,
          discountAmount: this.toCurrency(order.discountAmount),
        });
      } else {
        breakdown.orderCount += 1;
        breakdown.discountAmount = this.toCurrency(
          breakdown.discountAmount + this.toCurrency(order.discountAmount)
        );
      }
    }

    return Array.from(couponMap.values()).sort((a, b) => {
      if (b.totalDiscountAmount !== a.totalDiscountAmount) {
        return b.totalDiscountAmount - a.totalDiscountAmount;
      }

      return b.orderCount - a.orderCount;
    });
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
      appliesToAll: coupon.appliesToAll,
      eligiblePackageIds: coupon.packageScopes.map((scope) => scope.packageId),
      eligibleCategoryIds: coupon.categoryScopes.map((scope) => scope.categoryId),
      createdAt: coupon.createdAt.toISOString(),
    };
  }

  private throwCouponValidationError(
    code:
      | "INVALID_CODE"
      | "CODE_EXPIRED"
      | "CODE_INACTIVE"
      | "CODE_MAXED_OUT"
      | "CODE_NOT_APPLICABLE",
    message: string
  ): never {
    throw new BadRequestException({ code, message });
  }

  private resolveScopeInput(input: CreateCouponInput): {
    appliesToAll: boolean;
    eligiblePackageIds: string[];
    eligibleCategoryIds: string[];
  } {
    const appliesToAll = input.appliesToAll ?? true;
    const eligiblePackageIds = this.normalizeIdList(input.eligiblePackageIds ?? []);
    const eligibleCategoryIds = this.normalizeIdList(input.eligibleCategoryIds ?? []);

    if (!appliesToAll && eligiblePackageIds.length === 0 && eligibleCategoryIds.length === 0) {
      throw new BadRequestException("At least one eligible package or category is required");
    }

    return {
      appliesToAll,
      eligiblePackageIds,
      eligibleCategoryIds,
    };
  }

  private normalizeIdList(values: string[]): string[] {
    return Array.from(
      new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))
    );
  }

  private async assertScopeTargetsExist(params: {
    appliesToAll: boolean;
    eligiblePackageIds: string[];
    eligibleCategoryIds: string[];
  }): Promise<void> {
    if (params.appliesToAll) {
      return;
    }

    if (params.eligiblePackageIds.length > 0) {
      const count = await this.prisma.package.count({
        where: {
          id: {
            in: params.eligiblePackageIds,
          },
        },
      });

      if (count !== params.eligiblePackageIds.length) {
        throw new BadRequestException("One or more eligible packages are invalid");
      }
    }

    if (params.eligibleCategoryIds.length > 0) {
      const count = await this.prisma.packageCategory.count({
        where: {
          id: {
            in: params.eligibleCategoryIds,
          },
        },
      });

      if (count !== params.eligibleCategoryIds.length) {
        throw new BadRequestException("One or more eligible categories are invalid");
      }
    }
  }

  private async resolvePackageContext(input: {
    packageId?: string;
    packageSlug?: string;
  }): Promise<{ id: string; categoryId: string } | null> {
    if (input.packageId) {
      const pkg = await this.prisma.package.findUnique({
        where: { id: input.packageId },
        select: {
          id: true,
          categoryId: true,
        },
      });

      if (pkg) {
        return pkg;
      }
    }

    if (input.packageSlug) {
      const pkg = await this.prisma.package.findUnique({
        where: { slug: input.packageSlug },
        select: {
          id: true,
          categoryId: true,
        },
      });

      if (pkg) {
        return pkg;
      }
    }

    return null;
  }

  private isCouponApplicableToPackage(
    coupon: Pick<CouponRow, "appliesToAll" | "packageScopes" | "categoryScopes">,
    packageContext: { id: string; categoryId: string } | null
  ): boolean {
    if (coupon.appliesToAll) {
      return true;
    }

    if (!packageContext) {
      return false;
    }

    const packageMatch = coupon.packageScopes.some(
      (scope) => scope.packageId === packageContext.id
    );
    if (packageMatch) {
      return true;
    }

    return coupon.categoryScopes.some((scope) => scope.categoryId === packageContext.categoryId);
  }

  private toCurrency(value: unknown): number {
    const numericValue = this.toNumber(value);
    if (!Number.isFinite(numericValue)) return 0;
    return Math.max(0, Number(numericValue.toFixed(2)));
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
