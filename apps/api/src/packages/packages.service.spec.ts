/// <reference types="jest" />
import { NotFoundException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { PrismaService } from "../prisma/prisma.service.js";
import { PackagesService } from "./packages.service.js";

// ─────────────────────────────────────────────
// Test data factories
// ─────────────────────────────────────────────

function makeCategoryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "cmcat00001",
    name: "Author Lunch",
    slug: "author-lunch",
    description: "For author-focused publishing bundles with fixed default copies.",
    copies: 25,
    isActive: true,
    sortOrder: 0,
    ...overrides,
  };
}

function makePackageBaseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "cmpkg00001",
    name: "Author Launch 2",
    slug: "author-launch-2",
    description: "For authors who want more",
    basePrice: { toNumber: () => 125000 } as unknown, // Prisma Decimal mock
    pageLimit: 150,
    includesISBN: true,
    features: {
      items: ["300gsm Cover", "80gsm pages", "Up to 150 pages"],
      copies: { A4: 12, A5: 25, A6: 50 },
    },
    isActive: true,
    sortOrder: 1,
    ...overrides,
  };
}

function makePackageWithCategoryRow(overrides: Record<string, unknown> = {}) {
  return {
    ...makePackageBaseRow(),
    category: makeCategoryRow(),
    ...overrides,
  };
}

function makeSerializedPackage(overrides: Record<string, unknown> = {}) {
  return {
    id: "cmpkg00001",
    name: "Author Launch 2",
    slug: "author-launch-2",
    description: "For authors who want more",
    basePrice: 125000,
    pageLimit: 150,
    includesISBN: true,
    features: {
      items: ["300gsm Cover", "80gsm pages", "Up to 150 pages"],
      copies: { A4: 12, A5: 25, A6: 50 },
    },
    isActive: true,
    sortOrder: 1,
    category: {
      id: "cmcat00001",
      name: "Author Lunch",
      slug: "author-lunch",
      description: "For author-focused publishing bundles with fixed default copies.",
      copies: 25,
      isActive: true,
      sortOrder: 0,
    },
    ...overrides,
  };
}

function makeSerializedCategory(overrides: Record<string, unknown> = {}) {
  return {
    id: "cmcat00001",
    name: "Author Lunch",
    slug: "author-lunch",
    description: "For author-focused publishing bundles with fixed default copies.",
    copies: 25,
    isActive: true,
    sortOrder: 0,
    packages: [
      {
        id: "cmpkg00001",
        name: "Author Launch 2",
        slug: "author-launch-2",
        description: "For authors who want more",
        basePrice: 125000,
        pageLimit: 150,
        includesISBN: true,
        features: {
          items: ["300gsm Cover", "80gsm pages", "Up to 150 pages"],
          copies: { A4: 12, A5: 25, A6: 50 },
        },
        isActive: true,
        sortOrder: 1,
      },
    ],
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
  packageCategory: {
    findMany: jest.fn(),
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
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────
  // findAllActive
  // ─────────────────────────────────────

  describe("findAllActive", () => {
    it("should return active packages with category info", async () => {
      mockPrismaService.package.findMany.mockResolvedValue([makePackageWithCategoryRow()]);

      const result = await service.findAllActive();

      expect(result).toEqual([makeSerializedPackage()]);
      expect(mockPrismaService.package.findMany).toHaveBeenCalledWith({
        where: {
          isActive: true,
          category: { isActive: true },
        },
        orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
        select: expect.objectContaining({
          id: true,
          name: true,
          slug: true,
          category: expect.any(Object),
        }),
      });
    });
  });

  // ─────────────────────────────────────
  // findAllActiveByCategory
  // ─────────────────────────────────────

  describe("findAllActiveByCategory", () => {
    it("should return active categories with nested active packages", async () => {
      mockPrismaService.packageCategory.findMany.mockResolvedValue([
        {
          ...makeCategoryRow(),
          packages: [makePackageBaseRow()],
        },
      ]);

      const result = await service.findAllActiveByCategory();

      expect(result).toEqual([makeSerializedCategory()]);
      expect(mockPrismaService.packageCategory.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        select: expect.objectContaining({
          id: true,
          name: true,
          packages: expect.objectContaining({
            where: { isActive: true },
            orderBy: { sortOrder: "asc" },
          }),
        }),
      });
    });

    it("should omit categories that have no active packages", async () => {
      mockPrismaService.packageCategory.findMany.mockResolvedValue([
        { ...makeCategoryRow(), packages: [] },
      ]);

      const result = await service.findAllActiveByCategory();

      expect(result).toEqual([]);
    });
  });

  // ─────────────────────────────────────
  // findOneById
  // ─────────────────────────────────────

  describe("findOneById", () => {
    it("should return a single package with category info", async () => {
      mockPrismaService.package.findUnique.mockResolvedValue(makePackageWithCategoryRow());

      const result = await service.findOneById("cmpkg00001");

      expect(result).toEqual(makeSerializedPackage());
      expect(mockPrismaService.package.findUnique).toHaveBeenCalledWith({
        where: { id: "cmpkg00001" },
        select: expect.objectContaining({
          id: true,
          slug: true,
          category: expect.any(Object),
        }),
      });
    });

    it("should throw NotFoundException when package does not exist", async () => {
      mockPrismaService.package.findUnique.mockResolvedValue(null);

      await expect(service.findOneById("missing")).rejects.toThrow(NotFoundException);
      await expect(service.findOneById("missing")).rejects.toThrow(
        'Package with ID "missing" not found'
      );
    });

    it("should throw NotFoundException when package is inactive", async () => {
      mockPrismaService.package.findUnique.mockResolvedValue(
        makePackageWithCategoryRow({ isActive: false })
      );

      await expect(service.findOneById("cmpkg00001")).rejects.toThrow(NotFoundException);
      await expect(service.findOneById("cmpkg00001")).rejects.toThrow("no longer available");
    });

    it("should throw NotFoundException when package category is inactive", async () => {
      mockPrismaService.package.findUnique.mockResolvedValue(
        makePackageWithCategoryRow({
          category: makeCategoryRow({ isActive: false }),
        })
      );

      await expect(service.findOneById("cmpkg00001")).rejects.toThrow(NotFoundException);
      await expect(service.findOneById("cmpkg00001")).rejects.toThrow("no longer available");
    });
  });
});
