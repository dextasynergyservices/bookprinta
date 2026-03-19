/// <reference types="jest" />
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { AdminShowcaseService } from "./admin-showcase.service.js";

describe("AdminShowcaseService", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns next cursor for user search", async () => {
    const prisma = {
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "cm_user_1",
            firstName: "Ada",
            lastName: "Lovelace",
            email: "ada@example.com",
            isProfileComplete: true,
          },
          {
            id: "cm_user_2",
            firstName: "Grace",
            lastName: "Hopper",
            email: "grace@example.com",
            isProfileComplete: false,
          },
        ]),
      },
    };

    const service = new AdminShowcaseService(prisma as never);

    await expect(
      service.searchAdminShowcaseUsers({
        q: "",
        cursor: undefined,
        limit: 1,
      })
    ).resolves.toMatchObject({
      hasMore: true,
      nextCursor: "cm_user_1",
      items: [
        {
          id: "cm_user_1",
          displayName: "Ada Lovelace",
        },
      ],
    });
  });

  it("rejects create when category reference is invalid", async () => {
    const prisma = {
      showcaseCategory: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      user: {
        findUnique: jest.fn(),
      },
      book: {
        findUnique: jest.fn(),
      },
      authorShowcase: {
        create: jest.fn(),
      },
    };

    const service = new AdminShowcaseService(prisma as never);

    await expect(
      service.createAdminShowcaseEntry({
        authorName: "Author",
        bookTitle: "Book",
        coverImageUrl: "https://res.cloudinary.com/demo/image/upload/cover.jpg",
        categoryId: "cm_missing",
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("blocks deleting category with assigned entries", async () => {
    const prisma = {
      showcaseCategory: {
        findUnique: jest.fn().mockResolvedValue({
          id: "cm_cat_1",
          _count: {
            showcases: 3,
          },
        }),
        delete: jest.fn(),
      },
    };

    const service = new AdminShowcaseService(prisma as never);

    await expect(service.deleteAdminShowcaseCategory("cm_cat_1")).rejects.toBeInstanceOf(
      ConflictException
    );
    expect(prisma.showcaseCategory.delete).not.toHaveBeenCalled();
  });

  it("maps missing record to not found when setting entry cover", async () => {
    const prisma = {
      authorShowcase: {
        update: jest.fn().mockRejectedValue({ code: "P2025" }),
      },
    };

    const service = new AdminShowcaseService(prisma as never);

    await expect(
      service.setEntryCoverFromUpload(
        "cm_entry_1",
        "https://res.cloudinary.com/demo/image/upload/x.jpg"
      )
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("creates an admin showcase entry", async () => {
    const prisma = {
      showcaseCategory: {
        findUnique: jest.fn().mockResolvedValue({ id: "cm_cat_1" }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: "cm_user_1" }),
      },
      book: {
        findUnique: jest.fn().mockResolvedValue({ id: "cm_book_1" }),
      },
      authorShowcase: {
        create: jest.fn().mockResolvedValue({
          id: "cm_entry_1",
          authorName: "A. Author",
          bookTitle: "Stories",
          bookCoverUrl: "https://res.cloudinary.com/demo/image/upload/cover.jpg",
          aboutBook: "A short collection",
          testimonial: null,
          categoryId: "cm_cat_1",
          category: {
            id: "cm_cat_1",
            name: "Fiction",
            slug: "fiction",
            description: "Fiction",
            sortOrder: 1,
            isActive: true,
          },
          publishedYear: 2025,
          publishedAt: new Date("2025-01-01T00:00:00.000Z"),
          userId: "cm_user_1",
          user: {
            id: "cm_user_1",
            firstName: "Ada",
            lastName: "Lovelace",
            email: "ada@example.com",
            isProfileComplete: true,
          },
          bookId: "cm_book_1",
          isFeatured: true,
          sortOrder: 3,
          createdAt: new Date("2026-03-18T00:00:00.000Z"),
        }),
      },
    };

    const service = new AdminShowcaseService(prisma as never);

    const result = await service.createAdminShowcaseEntry({
      authorName: "A. Author",
      bookTitle: "Stories",
      coverImageUrl: "https://res.cloudinary.com/demo/image/upload/cover.jpg",
      aboutBook: "A short collection",
      categoryId: "cm_cat_1",
      userId: "cm_user_1",
      bookId: "cm_book_1",
      publishedYear: 2025,
      sortOrder: 3,
      isFeatured: true,
    });

    expect(result.id).toBe("cm_entry_1");
    expect(result.previewPath).toBe("/showcase?entry=cm_entry_1");
  });

  it("updates and deletes an admin showcase entry", async () => {
    const prisma = {
      showcaseCategory: {
        findUnique: jest.fn().mockResolvedValue({ id: "cm_cat_1" }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: "cm_user_1" }),
      },
      book: {
        findUnique: jest.fn().mockResolvedValue({ id: "cm_book_1" }),
      },
      authorShowcase: {
        update: jest.fn().mockResolvedValue({
          id: "cm_entry_1",
          authorName: "Updated Author",
          bookTitle: "Stories",
          bookCoverUrl: "https://res.cloudinary.com/demo/image/upload/cover.jpg",
          aboutBook: null,
          testimonial: null,
          categoryId: "cm_cat_1",
          category: {
            id: "cm_cat_1",
            name: "Fiction",
            slug: "fiction",
            description: "Fiction",
            sortOrder: 1,
            isActive: true,
          },
          publishedYear: 2025,
          publishedAt: null,
          userId: "cm_user_1",
          user: {
            id: "cm_user_1",
            firstName: "Ada",
            lastName: "Lovelace",
            email: "ada@example.com",
            isProfileComplete: true,
          },
          bookId: "cm_book_1",
          isFeatured: false,
          sortOrder: 3,
          createdAt: new Date("2026-03-18T00:00:00.000Z"),
        }),
        delete: jest.fn().mockResolvedValue({ id: "cm_entry_1" }),
      },
    };

    const service = new AdminShowcaseService(prisma as never);

    const updated = await service.updateAdminShowcaseEntry("cm_entry_1", {
      authorName: "Updated Author",
      isFeatured: false,
    });

    expect(updated.authorName).toBe("Updated Author");
    expect(updated.isFeatured).toBe(false);

    await expect(service.deleteAdminShowcaseEntry("cm_entry_1")).resolves.toEqual({
      id: "cm_entry_1",
      deleted: true,
    });
  });
});
