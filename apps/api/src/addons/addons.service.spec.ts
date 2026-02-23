/// <reference types="jest" />
import { NotFoundException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { PrismaService } from "../prisma/prisma.service.js";
import { AddonsService } from "./addons.service.js";

// ─────────────────────────────────────────────
// Test data factories
// ─────────────────────────────────────────────

function makeFixedAddonRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "cltest_addon_001",
    name: "Cover Design",
    slug: "cover-design",
    description: "Professional cover design for your book",
    pricingType: "fixed",
    price: { toNumber: () => 45000 } as unknown, // Prisma Decimal mock
    pricePerWord: null,
    sortOrder: 1,
    isActive: true,
    ...overrides,
  };
}

function makePerWordAddonRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "cltest_addon_002",
    name: "Formatting",
    slug: "formatting",
    description: "Professional manuscript formatting",
    pricingType: "per_word",
    price: { toNumber: () => 0 } as unknown, // Prisma Decimal mock (0 for per_word)
    pricePerWord: { toNumber: () => 0.7 } as unknown, // Prisma Decimal mock
    sortOrder: 2,
    isActive: true,
    ...overrides,
  };
}

function makeSerializedFixedAddon(overrides: Record<string, unknown> = {}) {
  return {
    id: "cltest_addon_001",
    name: "Cover Design",
    slug: "cover-design",
    description: "Professional cover design for your book",
    pricingType: "fixed",
    price: 45000,
    pricePerWord: null,
    sortOrder: 1,
    isActive: true,
    ...overrides,
  };
}

function makeSerializedPerWordAddon(overrides: Record<string, unknown> = {}) {
  return {
    id: "cltest_addon_002",
    name: "Formatting",
    slug: "formatting",
    description: "Professional manuscript formatting",
    pricingType: "per_word",
    price: null,
    pricePerWord: 0.7,
    sortOrder: 2,
    isActive: true,
    ...overrides,
  };
}

// ─────────────────────────────────────────────
// Mock PrismaService
// ─────────────────────────────────────────────

const mockPrismaService = {
  addon: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
};

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

describe("AddonsService", () => {
  let service: AddonsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AddonsService, { provide: PrismaService, useValue: mockPrismaService }],
    }).compile();

    service = module.get<AddonsService>(AddonsService);

    // Reset mocks between tests
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────
  // findAllActive
  // ─────────────────────────────────────

  describe("findAllActive", () => {
    it("should return all active addons sorted by sortOrder", async () => {
      const coverDesign = makeFixedAddonRow({ sortOrder: 1 });
      const formatting = makePerWordAddonRow({ sortOrder: 2 });
      const isbn = makeFixedAddonRow({
        id: "cltest_addon_003",
        name: "ISBN Registration",
        slug: "isbn-registration",
        price: { toNumber: () => 15000 } as unknown,
        sortOrder: 3,
      });

      mockPrismaService.addon.findMany.mockResolvedValue([coverDesign, formatting, isbn]);

      const result = await service.findAllActive();

      expect(result).toHaveLength(3);
      expect(result[0].name).toBe("Cover Design");
      expect(result[1].name).toBe("Formatting");
      expect(result[2].name).toBe("ISBN Registration");

      // Verify Prisma was called with correct filters
      expect(mockPrismaService.addon.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        select: expect.objectContaining({
          id: true,
          name: true,
          slug: true,
          pricingType: true,
          price: true,
          pricePerWord: true,
          isActive: true,
          sortOrder: true,
        }),
      });
    });

    it("should serialize fixed addon: price as number, pricePerWord as null", async () => {
      mockPrismaService.addon.findMany.mockResolvedValue([makeFixedAddonRow()]);

      const result = await service.findAllActive();

      expect(result[0].pricingType).toBe("fixed");
      expect(typeof result[0].price).toBe("number");
      expect(result[0].price).toBe(45000);
      expect(result[0].pricePerWord).toBeNull();
    });

    it("should serialize per_word addon: pricePerWord as number, price as null", async () => {
      mockPrismaService.addon.findMany.mockResolvedValue([makePerWordAddonRow()]);

      const result = await service.findAllActive();

      expect(result[0].pricingType).toBe("per_word");
      expect(result[0].price).toBeNull();
      expect(typeof result[0].pricePerWord).toBe("number");
      expect(result[0].pricePerWord).toBe(0.7);
    });

    it("should return an empty array when no active addons exist", async () => {
      mockPrismaService.addon.findMany.mockResolvedValue([]);

      const result = await service.findAllActive();

      expect(result).toEqual([]);
    });
  });

  // ─────────────────────────────────────
  // findOneById
  // ─────────────────────────────────────

  describe("findOneById", () => {
    it("should return a single fixed addon by ID", async () => {
      mockPrismaService.addon.findUnique.mockResolvedValue(makeFixedAddonRow());

      const result = await service.findOneById("cltest_addon_001");

      expect(result).toEqual(makeSerializedFixedAddon());
      expect(mockPrismaService.addon.findUnique).toHaveBeenCalledWith({
        where: { id: "cltest_addon_001" },
        select: expect.objectContaining({ id: true, name: true }),
      });
    });

    it("should return a single per_word addon by ID", async () => {
      mockPrismaService.addon.findUnique.mockResolvedValue(makePerWordAddonRow());

      const result = await service.findOneById("cltest_addon_002");

      expect(result).toEqual(makeSerializedPerWordAddon());
    });

    it("should throw NotFoundException when addon does not exist", async () => {
      mockPrismaService.addon.findUnique.mockResolvedValue(null);

      await expect(service.findOneById("clnonexistent")).rejects.toThrow(NotFoundException);
      await expect(service.findOneById("clnonexistent")).rejects.toThrow(
        'Addon with ID "clnonexistent" not found'
      );
    });

    it("should throw NotFoundException when addon is inactive", async () => {
      mockPrismaService.addon.findUnique.mockResolvedValue(makeFixedAddonRow({ isActive: false }));

      await expect(service.findOneById("cltest_addon_001")).rejects.toThrow(NotFoundException);
      await expect(service.findOneById("cltest_addon_001")).rejects.toThrow("no longer available");
    });

    it("should preserve null description", async () => {
      mockPrismaService.addon.findUnique.mockResolvedValue(
        makeFixedAddonRow({ description: null })
      );

      const result = await service.findOneById("cltest_addon_001");

      expect(result.description).toBeNull();
    });

    it("should preserve slug field", async () => {
      mockPrismaService.addon.findUnique.mockResolvedValue(
        makeFixedAddonRow({ slug: "custom-slug" })
      );

      const result = await service.findOneById("cltest_addon_001");

      expect(result.slug).toBe("custom-slug");
    });
  });
});
