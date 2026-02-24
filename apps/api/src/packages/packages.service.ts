import type { PackageCategoryResponse, PackageFeatures, PackageResponse } from "@bookprinta/shared";
import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

type CategorySummaryRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  copies: number;
  isActive: boolean;
  sortOrder: number;
};

type PackageBaseRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  basePrice: unknown; // Prisma Decimal
  pageLimit: number;
  includesISBN: boolean;
  features: unknown; // Prisma Json
  isActive: boolean;
  sortOrder: number;
};

type PackageWithCategoryRow = PackageBaseRow & {
  category: CategorySummaryRow;
};

type CategoryWithPackagesRow = CategorySummaryRow & {
  packages: PackageBaseRow[];
};

/**
 * Handles retrieval of public package data grouped by package categories.
 * These endpoints are public — no authentication required.
 */
@Injectable()
export class PackagesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Shared Prisma projection for package fields.
   */
  private static readonly PACKAGE_BASE_SELECT_FIELDS = {
    id: true,
    name: true,
    slug: true,
    description: true,
    basePrice: true,
    pageLimit: true,
    includesISBN: true,
    features: true,
    isActive: true,
    sortOrder: true,
  } as const;

  /**
   * Shared Prisma projection for category fields.
   */
  private static readonly CATEGORY_SELECT_FIELDS = {
    id: true,
    name: true,
    slug: true,
    description: true,
    copies: true,
    isActive: true,
    sortOrder: true,
  } as const;

  /**
   * Package projection including category summary.
   */
  private static readonly PACKAGE_WITH_CATEGORY_SELECT_FIELDS = {
    ...PackagesService.PACKAGE_BASE_SELECT_FIELDS,
    category: {
      select: PackagesService.CATEGORY_SELECT_FIELDS,
    },
  } as const;

  /**
   * Category projection including nested active packages.
   */
  private static readonly CATEGORY_WITH_PACKAGES_SELECT_FIELDS = {
    ...PackagesService.CATEGORY_SELECT_FIELDS,
    packages: {
      where: { isActive: true },
      orderBy: { sortOrder: "asc" as const },
      select: PackagesService.PACKAGE_BASE_SELECT_FIELDS,
    },
  } as const;

  /**
   * List all active packages (flat list), sorted by category then package sort order.
   * Kept for compatibility with consumers that still read /packages directly.
   */
  async findAllActive(): Promise<PackageResponse[]> {
    const packages = await this.prisma.package.findMany({
      where: {
        isActive: true,
        category: { isActive: true },
      },
      orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
      select: PackagesService.PACKAGE_WITH_CATEGORY_SELECT_FIELDS,
    });

    return packages.map((pkg) => this.serializePackage(pkg));
  }

  /**
   * List active categories with nested active packages for the pricing page.
   * Categories with zero active packages are omitted.
   */
  async findAllActiveByCategory(): Promise<PackageCategoryResponse[]> {
    const categories = await this.prisma.packageCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: PackagesService.CATEGORY_WITH_PACKAGES_SELECT_FIELDS,
    });

    return categories
      .filter((category) => category.packages.length > 0)
      .map((category) => this.serializeCategory(category));
  }

  /**
   * Find a single package by ID.
   * Throws NotFoundException if the package doesn't exist, is inactive,
   * or belongs to an inactive category.
   */
  async findOneById(id: string): Promise<PackageResponse> {
    const pkg = await this.prisma.package.findUnique({
      where: { id },
      select: PackagesService.PACKAGE_WITH_CATEGORY_SELECT_FIELDS,
    });

    if (!pkg) {
      throw new NotFoundException(`Package with ID "${id}" not found`);
    }

    if (!pkg.isActive || !pkg.category.isActive) {
      throw new NotFoundException(`Package with ID "${id}" is no longer available`);
    }

    return this.serializePackage(pkg);
  }

  // ─────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────

  /**
   * Serialize category summary row to API shape.
   */
  private serializeCategorySummary(category: CategorySummaryRow) {
    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      copies: category.copies,
      isActive: category.isActive,
      sortOrder: category.sortOrder,
    };
  }

  /**
   * Serialize package row without category to API shape.
   */
  private serializePackageBase(pkg: PackageBaseRow) {
    return {
      id: pkg.id,
      name: pkg.name,
      slug: pkg.slug,
      description: pkg.description,
      basePrice: this.toNumber(pkg.basePrice),
      pageLimit: pkg.pageLimit,
      includesISBN: pkg.includesISBN,
      features: pkg.features as PackageFeatures,
      isActive: pkg.isActive,
      sortOrder: pkg.sortOrder,
    };
  }

  /**
   * Serialize package row with category summary.
   */
  private serializePackage(pkg: PackageWithCategoryRow): PackageResponse {
    return {
      ...this.serializePackageBase(pkg),
      category: this.serializeCategorySummary(pkg.category),
    };
  }

  /**
   * Serialize category row with nested packages.
   */
  private serializeCategory(category: CategoryWithPackagesRow): PackageCategoryResponse {
    return {
      ...this.serializeCategorySummary(category),
      packages: category.packages.map((pkg) => this.serializePackageBase(pkg)),
    };
  }

  /**
   * Convert Prisma Decimal-like values to plain numbers.
   */
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

    const asNumber = Number(value);
    if (!Number.isNaN(asNumber)) {
      return asNumber;
    }

    throw new TypeError("Failed to serialize decimal value to number");
  }
}
