import type {
  AdminCreatePackageCategoryInput,
  AdminCreatePackageInput,
  AdminDeletePackageCategoryResponse,
  AdminDeletePackageResponse,
  AdminPackage,
  AdminPackageCategory,
  AdminUpdatePackageCategoryInput,
  AdminUpdatePackageInput,
  PackageCategoryResponse,
  PackageFeatures,
  PackageResponse,
} from "@bookprinta/shared";
import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
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

type AdminPackageRow = PackageWithCategoryRow & {
  categoryId: string;
};

type AdminCategoryRow = CategorySummaryRow & {
  createdAt: Date;
  updatedAt: Date;
  _count: {
    packages: number;
  };
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

  async listAdminPackageCategories(): Promise<AdminPackageCategory[]> {
    const categories = await this.prisma.packageCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        ...PackagesService.CATEGORY_SELECT_FIELDS,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            packages: true,
          },
        },
      },
    });

    return categories.map((category) => this.serializeAdminCategory(category));
  }

  async createAdminPackageCategory(
    input: AdminCreatePackageCategoryInput
  ): Promise<AdminPackageCategory> {
    try {
      const created = await this.prisma.packageCategory.create({
        data: {
          name: input.name.trim(),
          slug: this.slugify(input.name),
          description: this.normalizeNullableString(input.description),
          copies: input.copies,
          sortOrder: input.sortOrder ?? 0,
          isActive: input.isActive ?? true,
        },
        select: {
          ...PackagesService.CATEGORY_SELECT_FIELDS,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              packages: true,
            },
          },
        },
      });

      return this.serializeAdminCategory(created);
    } catch (error) {
      if (this.isPrismaUniqueViolation(error)) {
        throw new ConflictException("Package category name/slug must be unique");
      }
      throw error;
    }
  }

  async updateAdminPackageCategory(
    id: string,
    input: AdminUpdatePackageCategoryInput
  ): Promise<AdminPackageCategory> {
    try {
      const updated = await this.prisma.packageCategory.update({
        where: { id },
        data: {
          ...(input.name !== undefined
            ? {
                name: input.name.trim(),
                slug: this.slugify(input.name),
              }
            : {}),
          ...(input.description !== undefined
            ? { description: this.normalizeNullableString(input.description) }
            : {}),
          ...(input.copies !== undefined ? { copies: input.copies } : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
        select: {
          ...PackagesService.CATEGORY_SELECT_FIELDS,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              packages: true,
            },
          },
        },
      });

      return this.serializeAdminCategory(updated);
    } catch (error) {
      if (this.isPrismaUniqueViolation(error)) {
        throw new ConflictException("Package category name/slug must be unique");
      }
      if (this.isPrismaRecordNotFound(error)) {
        throw new NotFoundException("Package category not found");
      }
      throw error;
    }
  }

  async deleteAdminPackageCategory(id: string): Promise<AdminDeletePackageCategoryResponse> {
    const category = await this.prisma.packageCategory.findUnique({
      where: { id },
      select: {
        id: true,
        _count: {
          select: {
            packages: true,
          },
        },
      },
    });

    if (!category) {
      throw new NotFoundException("Package category not found");
    }

    if (category._count.packages > 0) {
      throw new ConflictException("Cannot delete category with assigned packages");
    }

    try {
      await this.prisma.packageCategory.delete({ where: { id } });
    } catch (error) {
      if (this.isPrismaRecordNotFound(error)) {
        throw new NotFoundException("Package category not found");
      }
      throw error;
    }

    return { id, deleted: true };
  }

  async listAdminPackages(): Promise<AdminPackage[]> {
    const packages = await this.prisma.package.findMany({
      orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }, { name: "asc" }],
      select: {
        ...PackagesService.PACKAGE_WITH_CATEGORY_SELECT_FIELDS,
        categoryId: true,
      },
    });

    return packages.map((pkg) => this.serializeAdminPackage(pkg));
  }

  async createAdminPackage(input: AdminCreatePackageInput): Promise<AdminPackage> {
    await this.assertPackageCategoryExists(input.categoryId);

    try {
      const created = await this.prisma.package.create({
        data: {
          categoryId: input.categoryId,
          name: input.name.trim(),
          slug: this.slugify(input.name),
          description: this.normalizeNullableString(input.description),
          basePrice: input.basePrice,
          pageLimit: input.pageLimit,
          includesISBN: input.includesISBN,
          features: this.normalizePackageFeatures(input.features),
          sortOrder: input.sortOrder ?? 0,
          isActive: input.isActive ?? true,
        },
        select: {
          ...PackagesService.PACKAGE_WITH_CATEGORY_SELECT_FIELDS,
          categoryId: true,
        },
      });

      return this.serializeAdminPackage(created);
    } catch (error) {
      if (this.isPrismaUniqueViolation(error)) {
        throw new ConflictException("Package name/slug must be unique");
      }
      throw error;
    }
  }

  async updateAdminPackage(id: string, input: AdminUpdatePackageInput): Promise<AdminPackage> {
    if (input.categoryId) {
      await this.assertPackageCategoryExists(input.categoryId);
    }

    try {
      const updated = await this.prisma.package.update({
        where: { id },
        data: {
          ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
          ...(input.name !== undefined
            ? {
                name: input.name.trim(),
                slug: this.slugify(input.name),
              }
            : {}),
          ...(input.description !== undefined
            ? { description: this.normalizeNullableString(input.description) }
            : {}),
          ...(input.basePrice !== undefined ? { basePrice: input.basePrice } : {}),
          ...(input.pageLimit !== undefined ? { pageLimit: input.pageLimit } : {}),
          ...(input.includesISBN !== undefined ? { includesISBN: input.includesISBN } : {}),
          ...(input.features !== undefined
            ? { features: this.normalizePackageFeatures(input.features) }
            : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
        select: {
          ...PackagesService.PACKAGE_WITH_CATEGORY_SELECT_FIELDS,
          categoryId: true,
        },
      });

      return this.serializeAdminPackage(updated);
    } catch (error) {
      if (this.isPrismaUniqueViolation(error)) {
        throw new ConflictException("Package name/slug must be unique");
      }
      if (this.isPrismaRecordNotFound(error)) {
        throw new NotFoundException("Package not found");
      }
      throw error;
    }
  }

  async deleteAdminPackage(id: string): Promise<AdminDeletePackageResponse> {
    const pkg = await this.prisma.package.findUnique({
      where: { id },
      select: {
        id: true,
        _count: {
          select: {
            orders: true,
          },
        },
      },
    });

    if (!pkg) {
      throw new NotFoundException("Package not found");
    }

    if (pkg._count.orders > 0) {
      throw new ConflictException("Cannot delete package with linked orders");
    }

    try {
      await this.prisma.package.delete({ where: { id } });
    } catch (error) {
      if (this.isPrismaRecordNotFound(error)) {
        throw new NotFoundException("Package not found");
      }
      throw error;
    }

    return {
      id,
      deleted: true,
    };
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

  private serializeAdminCategory(category: AdminCategoryRow): AdminPackageCategory {
    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      copies: category.copies,
      isActive: category.isActive,
      sortOrder: category.sortOrder,
      packageCount: category._count.packages,
      createdAt: category.createdAt.toISOString(),
      updatedAt: category.updatedAt.toISOString(),
    };
  }

  private serializeAdminPackage(pkg: AdminPackageRow): AdminPackage {
    return {
      id: pkg.id,
      categoryId: pkg.categoryId,
      category: this.serializeCategorySummary(pkg.category),
      name: pkg.name,
      slug: pkg.slug,
      description: pkg.description,
      basePrice: this.toNumber(pkg.basePrice),
      pageLimit: pkg.pageLimit,
      includesISBN: pkg.includesISBN,
      features: this.normalizePackageFeatures(pkg.features),
      isActive: pkg.isActive,
      sortOrder: pkg.sortOrder,
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

  private slugify(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  private normalizeNullableString(value: string | null | undefined): string | null {
    if (value === undefined || value === null) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private normalizePackageFeatures(value: unknown): PackageFeatures {
    const features = value as PackageFeatures;
    const items = Array.isArray(features?.items)
      ? features.items
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter((item) => item.length > 0)
      : [];

    const copies = {
      A4: Number((features?.copies as { A4?: number })?.A4 ?? 0),
      A5: Number((features?.copies as { A5?: number })?.A5 ?? 0),
      A6: Number((features?.copies as { A6?: number })?.A6 ?? 0),
    };

    return {
      items,
      copies: {
        A4: Number.isFinite(copies.A4) && copies.A4 >= 0 ? Math.floor(copies.A4) : 0,
        A5: Number.isFinite(copies.A5) && copies.A5 >= 0 ? Math.floor(copies.A5) : 0,
        A6: Number.isFinite(copies.A6) && copies.A6 >= 0 ? Math.floor(copies.A6) : 0,
      },
    };
  }

  private async assertPackageCategoryExists(categoryId: string): Promise<void> {
    const category = await this.prisma.packageCategory.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });

    if (!category) {
      throw new NotFoundException("Package category not found");
    }
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
