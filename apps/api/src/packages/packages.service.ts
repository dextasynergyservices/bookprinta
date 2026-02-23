import type { PackageFeatures, PackageResponse } from "@bookprinta/shared";
import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

/**
 * Handles retrieval of public package/tier data.
 *
 * Packages are admin-managed reference data (First Draft, Glow Up, Legacy).
 * These endpoints are public — no authentication required.
 */
@Injectable()
export class PackagesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The Prisma `select` clause used by both list and detail queries.
   * Centralised here so the shape stays consistent.
   */
  private static readonly SELECT_FIELDS = {
    id: true,
    name: true,
    description: true,
    basePrice: true,
    pageLimit: true,
    includesISBN: true,
    features: true,
    isActive: true,
    sortOrder: true,
  } as const;

  /**
   * List all active packages, sorted by `sortOrder` ascending.
   * Only returns packages where `isActive: true`.
   */
  async findAllActive(): Promise<PackageResponse[]> {
    const packages = await this.prisma.package.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: PackagesService.SELECT_FIELDS,
    });

    return packages.map((pkg) => this.serialize(pkg));
  }

  /**
   * Find a single package by ID.
   * Throws NotFoundException if the package doesn't exist or is inactive.
   */
  async findOneById(id: string): Promise<PackageResponse> {
    const pkg = await this.prisma.package.findUnique({
      where: { id },
      select: PackagesService.SELECT_FIELDS,
    });

    if (!pkg) {
      throw new NotFoundException(`Package with ID "${id}" not found`);
    }

    if (!pkg.isActive) {
      throw new NotFoundException(`Package with ID "${id}" is no longer available`);
    }

    return this.serialize(pkg);
  }

  // ─────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────

  /**
   * Convert a Prisma Package row into the public API response shape.
   * Key transformation: Prisma Decimal → plain number for JSON serialization.
   */
  private serialize(pkg: {
    id: string;
    name: string;
    description: string | null;
    basePrice: unknown; // Prisma Decimal
    pageLimit: number;
    includesISBN: boolean;
    features: unknown; // Prisma Json
    isActive: boolean;
    sortOrder: number;
  }): PackageResponse {
    return {
      id: pkg.id,
      name: pkg.name,
      description: pkg.description,
      basePrice: Number(pkg.basePrice),
      pageLimit: pkg.pageLimit,
      includesISBN: pkg.includesISBN,
      features: pkg.features as PackageFeatures,
      isActive: pkg.isActive,
      sortOrder: pkg.sortOrder,
    };
  }
}
