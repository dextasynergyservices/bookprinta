/// <reference types="jest" />
import { NotFoundException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { PrismaService } from "../prisma/prisma.service.js";
import { PackagesService } from "./packages.service.js";

// ─────────────────────────────────────────────
// Test data factories
// ─────────────────────────────────────────────

function makePackageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "cltest00001",
    name: "Glow Up",
    description: "Perfect for authors who want a professional finish.",
    basePrice: { toNumber: () => 150000 } as unknown, // Prisma Decimal mock
    pageLimit: 200,
    includesISBN: true,
    features: {
      items: ["Professional formatting", "Custom cover design", "ISBN registration"],
      copies: { A4: 1, A5: 2, A6: 3 },
    },
    isActive: true,
    sortOrder: 1,
    ...overrides,
  };
}

function makeSerializedPackage(overrides: Record<string, unknown> = {}) {
  return {
    id: "cltest00001",
    name: "Glow Up",
    description: "Perfect for authors who want a professional finish.",
    basePrice: 150000,
    pageLimit: 200,
    includesISBN: true,
    features: {
      items: ["Professional formatting", "Custom cover design", "ISBN registration"],
      copies: { A4: 1, A5: 2, A6: 3 },
    },
    isActive: true,
    sortOrder: 1,
    ...overrides,
  };
}

// ─────────────────────────────────────────────
// Mock PrismaService
// ─────────────────────────────────────────────

const mockPrismaService = {
  package: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
};

// ─────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────

describe("PackagesService", () => {
  let service: PackagesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PackagesService, { provide: PrismaService, useValue: mockPrismaService }],
    }).compile();

    service = module.get<PackagesService>(PackagesService);

    // Reset mocks between tests
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────
  // findAllActive
  // ─────────────────────────────────────

  describe("findAllActive", () => {
    it("should return all active packages sorted by sortOrder", async () => {
      const firstDraft = makePackageRow({
        id: "cltest00002",
        name: "First Draft",
        basePrice: 75000,
        sortOrder: 0,
        includesISBN: false,
      });
      const glowUp = makePackageRow({ sortOrder: 1 });
      const legacy = makePackageRow({
        id: "cltest00003",
        name: "Legacy",
        basePrice: 250000,
        sortOrder: 2,
      });

      mockPrismaService.package.findMany.mockResolvedValue([firstDraft, glowUp, legacy]);

      const result = await service.findAllActive();

      expect(result).toHaveLength(3);
      expect(result[0].name).toBe("First Draft");
      expect(result[1].name).toBe("Glow Up");
      expect(result[2].name).toBe("Legacy");

      // Verify Prisma was called with correct filters
      expect(mockPrismaService.package.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        select: expect.objectContaining({
          id: true,
          name: true,
          basePrice: true,
          isActive: true,
          sortOrder: true,
        }),
      });
    });

    it("should convert Prisma Decimal basePrice to a plain number", async () => {
      const decimalMock = { toNumber: () => 150000, toString: () => "150000" };
      mockPrismaService.package.findMany.mockResolvedValue([
        makePackageRow({ basePrice: decimalMock }),
      ]);

      const result = await service.findAllActive();

      expect(typeof result[0].basePrice).toBe("number");
      expect(result[0].basePrice).toBe(150000);
    });

    it("should return an empty array when no active packages exist", async () => {
      mockPrismaService.package.findMany.mockResolvedValue([]);

      const result = await service.findAllActive();

      expect(result).toEqual([]);
    });
  });

  // ─────────────────────────────────────
  // findOneById
  // ─────────────────────────────────────

  describe("findOneById", () => {
    it("should return a single package by ID", async () => {
      mockPrismaService.package.findUnique.mockResolvedValue(makePackageRow());

      const result = await service.findOneById("cltest00001");

      expect(result).toEqual(makeSerializedPackage());
      expect(mockPrismaService.package.findUnique).toHaveBeenCalledWith({
        where: { id: "cltest00001" },
        select: expect.objectContaining({ id: true, name: true }),
      });
    });

    it("should convert Prisma Decimal basePrice to a number", async () => {
      mockPrismaService.package.findUnique.mockResolvedValue(makePackageRow());

      const result = await service.findOneById("cltest00001");

      expect(typeof result.basePrice).toBe("number");
      expect(result.basePrice).toBe(150000);
    });

    it("should throw NotFoundException when package does not exist", async () => {
      mockPrismaService.package.findUnique.mockResolvedValue(null);

      await expect(service.findOneById("clnonexistent")).rejects.toThrow(NotFoundException);
      await expect(service.findOneById("clnonexistent")).rejects.toThrow(
        'Package with ID "clnonexistent" not found'
      );
    });

    it("should throw NotFoundException when package is inactive", async () => {
      mockPrismaService.package.findUnique.mockResolvedValue(makePackageRow({ isActive: false }));

      await expect(service.findOneById("cltest00001")).rejects.toThrow(NotFoundException);
      await expect(service.findOneById("cltest00001")).rejects.toThrow("no longer available");
    });

    it("should preserve null description", async () => {
      mockPrismaService.package.findUnique.mockResolvedValue(makePackageRow({ description: null }));

      const result = await service.findOneById("cltest00001");

      expect(result.description).toBeNull();
    });

    it("should preserve features JSON structure", async () => {
      const features = {
        items: ["Feature A", "Feature B"],
        copies: { A4: 5, A5: 10, A6: 15 },
      };
      mockPrismaService.package.findUnique.mockResolvedValue(makePackageRow({ features }));

      const result = await service.findOneById("cltest00001");

      expect(result.features).toEqual(features);
      expect(result.features.copies.A4).toBe(5);
    });
  });
});
