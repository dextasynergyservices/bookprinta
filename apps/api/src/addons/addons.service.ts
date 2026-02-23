import type { AddonResponse } from "@bookprinta/shared";
import { Injectable, NotFoundException } from "@nestjs/common";
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
      price: isPerWord ? null : Number(addon.price),
      pricePerWord: isPerWord && addon.pricePerWord != null ? Number(addon.pricePerWord) : null,
      sortOrder: addon.sortOrder,
      isActive: addon.isActive,
    };
  }
}
