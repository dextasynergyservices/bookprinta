import type {
  AddonResponse,
  AdminAddon,
  AdminCreateAddonInput,
  AdminDeleteAddonResponse,
  AdminUpdateAddonInput,
} from "@bookprinta/shared";
import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

/**
 * Handles retrieval of public addon data.
 *
 * Addons are admin-managed extras shown at checkout (Cover Design, Formatting, ISBN).
 * These endpoints are public — no authentication required.
 *
 * Pricing types:
 *   - "fixed"    → flat NGN price (Cover Design, ISBN Registration)
 *   - "per_word" → variable: wordCount × pricePerWord (Formatting)
 */
@Injectable()
export class AddonsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The Prisma `select` clause used by both list and detail queries.
   * Centralised here so the shape stays consistent.
   */
  private static readonly SELECT_FIELDS = {
    id: true,
    name: true,
    slug: true,
    description: true,
    pricingType: true,
    price: true,
    pricePerWord: true,
    sortOrder: true,
    isActive: true,
  } as const;

  private static readonly ADMIN_SELECT_FIELDS = {
    ...AddonsService.SELECT_FIELDS,
  } as const;

  /**
   * List all active addons, sorted by `sortOrder` ascending.
   * Only returns addons where `isActive: true`.
   */
  async findAllActive(): Promise<AddonResponse[]> {
    const addons = await this.prisma.addon.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: AddonsService.SELECT_FIELDS,
    });

    return addons.map((addon) => this.serialize(addon));
  }

  /**
   * Find a single addon by ID.
   * Throws NotFoundException if the addon doesn't exist or is inactive.
   */
  async findOneById(id: string): Promise<AddonResponse> {
    const addon = await this.prisma.addon.findUnique({
      where: { id },
      select: AddonsService.SELECT_FIELDS,
    });

    if (!addon) {
      throw new NotFoundException(`Addon with ID "${id}" not found`);
    }

    if (!addon.isActive) {
      throw new NotFoundException(`Addon with ID "${id}" is no longer available`);
    }

    return this.serialize(addon);
  }

  async listAdminAddons(): Promise<AdminAddon[]> {
    const addons = await this.prisma.addon.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: AddonsService.ADMIN_SELECT_FIELDS,
    });

    return addons.map((addon) => this.serializeAdmin(addon));
  }

  async createAdminAddon(input: AdminCreateAddonInput): Promise<AdminAddon> {
    const pricing = this.resolvePricingValues(input.pricingType, {
      price: input.price,
      pricePerWord: input.pricePerWord,
    });

    try {
      const created = await this.prisma.addon.create({
        data: {
          name: input.name.trim(),
          slug: this.slugify(input.name),
          description: this.normalizeNullableString(input.description),
          pricingType: input.pricingType,
          price: pricing.price,
          pricePerWord: pricing.pricePerWord,
          sortOrder: input.sortOrder ?? 0,
          isActive: input.isActive ?? true,
        },
        select: AddonsService.ADMIN_SELECT_FIELDS,
      });

      return this.serializeAdmin(created);
    } catch (error) {
      if (this.isPrismaUniqueViolation(error)) {
        throw new ConflictException("Addon name/slug must be unique");
      }
      throw error;
    }
  }

  async updateAdminAddon(id: string, input: AdminUpdateAddonInput): Promise<AdminAddon> {
    const existing = await this.prisma.addon.findUnique({
      where: { id },
      select: {
        id: true,
        pricingType: true,
        price: true,
        pricePerWord: true,
      },
    });

    if (!existing) {
      throw new NotFoundException("Addon not found");
    }

    const effectivePricingType =
      input.pricingType ?? (existing.pricingType as "fixed" | "per_word");
    const pricing = this.resolvePricingValues(effectivePricingType, {
      price: input.price ?? this.toNumber(existing.price),
      pricePerWord:
        input.pricePerWord ??
        (existing.pricePerWord != null ? this.toNumber(existing.pricePerWord) : null),
    });

    try {
      const updated = await this.prisma.addon.update({
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
          ...(input.pricingType !== undefined ? { pricingType: input.pricingType } : {}),
          price: pricing.price,
          pricePerWord: pricing.pricePerWord,
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
        select: AddonsService.ADMIN_SELECT_FIELDS,
      });

      return this.serializeAdmin(updated);
    } catch (error) {
      if (this.isPrismaUniqueViolation(error)) {
        throw new ConflictException("Addon name/slug must be unique");
      }
      if (this.isPrismaRecordNotFound(error)) {
        throw new NotFoundException("Addon not found");
      }
      throw error;
    }
  }

  async softDeleteAdminAddon(id: string): Promise<AdminAddon> {
    try {
      const updated = await this.prisma.addon.update({
        where: { id },
        data: { isActive: false },
        select: AddonsService.ADMIN_SELECT_FIELDS,
      });

      return this.serializeAdmin(updated);
    } catch (error) {
      if (this.isPrismaRecordNotFound(error)) {
        throw new NotFoundException("Addon not found");
      }
      throw error;
    }
  }

  async deleteAdminAddon(id: string): Promise<AdminDeleteAddonResponse> {
    const addon = await this.prisma.addon.findUnique({
      where: { id },
      select: {
        id: true,
        _count: {
          select: {
            orderAddons: true,
          },
        },
      },
    });

    if (!addon) {
      throw new NotFoundException("Addon not found");
    }

    if (addon._count.orderAddons > 0) {
      throw new ConflictException("Cannot delete addon with linked orders");
    }

    try {
      await this.prisma.addon.delete({ where: { id } });
    } catch (error) {
      if (this.isPrismaRecordNotFound(error)) {
        throw new NotFoundException("Addon not found");
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
   * Convert a Prisma Addon row into the public API response shape.
   *
   * Key transformations:
   *   - Prisma Decimal → plain number for JSON serialization
   *   - Fixed addons:    price = number, pricePerWord = null
   *   - Per-word addons: price = null,   pricePerWord = number
   */
  private serialize(addon: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    pricingType: string;
    price: unknown; // Prisma Decimal
    pricePerWord: unknown; // Prisma Decimal | null
    sortOrder: number;
    isActive: boolean;
  }): AddonResponse {
    const isPerWord = addon.pricingType === "per_word";

    return {
      id: addon.id,
      name: addon.name,
      slug: addon.slug,
      description: addon.description,
      pricingType: addon.pricingType as "fixed" | "per_word",
      price: isPerWord ? null : this.toNumber(addon.price),
      pricePerWord:
        isPerWord && addon.pricePerWord != null ? this.toNumber(addon.pricePerWord) : null,
      sortOrder: addon.sortOrder,
      isActive: addon.isActive,
    };
  }

  private serializeAdmin(addon: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    pricingType: string;
    price: unknown;
    pricePerWord: unknown;
    sortOrder: number;
    isActive: boolean;
  }): AdminAddon {
    return this.serialize(addon);
  }

  private resolvePricingValues(
    pricingType: "fixed" | "per_word",
    values: {
      price?: number | null;
      pricePerWord?: number | null;
    }
  ): {
    price: number;
    pricePerWord: number | null;
  } {
    if (pricingType === "fixed") {
      if (values.price === undefined || values.price === null || values.price < 0) {
        throw new ConflictException("price is required when pricingType is fixed");
      }

      return {
        price: values.price,
        pricePerWord: null,
      };
    }

    if (
      values.pricePerWord === undefined ||
      values.pricePerWord === null ||
      values.pricePerWord < 0
    ) {
      throw new ConflictException("pricePerWord is required when pricingType is per_word");
    }

    return {
      price: values.price ?? 0,
      pricePerWord: values.pricePerWord,
    };
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
