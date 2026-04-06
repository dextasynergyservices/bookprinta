/// <reference types="jest" />
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { ShowcaseService } from "./showcase.service.js";

describe("ShowcaseService", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("uses featured ordering when listing homepage preview entries", async () => {
    const prisma = {
      showcaseCategory: {
        findMany: jest.fn(),
      },
      authorShowcase: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "cm_show_1",
            authorName: "A. Author",
            bookTitle: "Stories",
            bookCoverUrl: "https://res.cloudinary.com/demo/image/upload/stories.jpg",
            aboutBook: "A short collection",
            testimonial: null,
            categoryId: null,
            category: null,
            publishedYear: 2025,
            publishedAt: new Date("2025-10-10T00:00:00.000Z"),
            userId: null,
            isFeatured: true,
            sortOrder: 0,
            authorBio: "Fallback bio",
            authorProfileImageUrl: null,
            authorWhatsAppNumber: null,
            authorWebsiteUrl: null,
            authorPurchaseLinks: [],
            authorSocialLinks: [],
            user: null,
          },
        ]),
        findUnique: jest.fn(),
      },
    };

    const service = new ShowcaseService(prisma as never);

    const result = await service.listPublic({
      q: "",
      category: undefined,
      sort: "date_desc",
      year: undefined,
      cursor: undefined,
      limit: 4,
      isFeatured: true,
    });

    expect(result).toEqual({
      items: [
        expect.objectContaining({
          id: "cm_show_1",
          hasAuthorProfile: true,
        }),
      ],
      nextCursor: null,
      hasMore: false,
    });

    expect(prisma.authorShowcase.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isFeatured: true,
        }),
        orderBy: [{ sortOrder: "asc" }, { publishedAt: "desc" }, { id: "desc" }],
        take: 5,
      })
    );
  });

  it("serializes merged author-profile fields and prefers user values", async () => {
    const prisma = {
      showcaseCategory: {
        findMany: jest.fn(),
      },
      authorShowcase: {
        findMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({
          authorBio: "Fallback bio",
          authorProfileImageUrl: "https://res.cloudinary.com/demo/image/upload/fallback.jpg",
          authorWhatsAppNumber: "+2348099999999",
          authorWebsiteUrl: "https://fallback.example.com",
          authorPurchaseLinks: [{ label: "Roving Heights", url: "https://rovingheights.com/book" }],
          authorSocialLinks: [{ platform: "Instagram", url: "https://instagram.com/fallback" }],
          user: {
            bio: "Author bio",
            profileImageUrl: null,
            whatsAppNumber: "+2348012345678",
            websiteUrl: "",
            purchaseLinks: [
              { label: "Amazon", url: "https://amazon.example/book" },
              { label: "", url: "https://invalid.example" },
            ],
            socialLinks: [{ platform: "Instagram", url: "https://instagram.com/author" }],
            isProfileComplete: true,
          },
        }),
      },
    };

    const service = new ShowcaseService(prisma as never);

    await expect(service.getAuthorProfile("cm_showcase_1")).resolves.toEqual({
      bio: "Author bio",
      profileImageUrl: "https://res.cloudinary.com/demo/image/upload/fallback.jpg",
      whatsAppNumber: "+2348012345678",
      purchaseLinks: [{ label: "Amazon", url: "https://amazon.example/book" }],
      socialLinks: [{ platform: "Instagram", url: "https://instagram.com/author" }],
      websiteUrl: "https://fallback.example.com",
    });
  });

  it("rejects author-profile requests only when both user and fallback details are empty", async () => {
    const prisma = {
      showcaseCategory: {
        findMany: jest.fn(),
      },
      authorShowcase: {
        findMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({
          authorBio: null,
          authorProfileImageUrl: null,
          authorWhatsAppNumber: null,
          authorWebsiteUrl: null,
          authorPurchaseLinks: [],
          authorSocialLinks: [],
          user: {
            bio: null,
            profileImageUrl: null,
            whatsAppNumber: null,
            websiteUrl: null,
            purchaseLinks: [],
            socialLinks: [],
            isProfileComplete: false,
          },
        }),
      },
    };

    const service = new ShowcaseService(prisma as never);

    await expect(service.getAuthorProfile("cm_showcase_1")).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it("lists admin showcase categories with showcase counts", async () => {
    const prisma = {
      showcaseCategory: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "cm_cat_1",
            name: "Fiction",
            slug: "fiction",
            description: "Fiction titles",
            sortOrder: 1,
            isActive: true,
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            updatedAt: new Date("2026-01-02T00:00:00.000Z"),
            _count: { showcases: 3 },
          },
        ]),
      },
      authorShowcase: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
    };

    const service = new ShowcaseService(prisma as never);

    await expect(service.listAdminShowcaseCategories()).resolves.toEqual({
      categories: [
        {
          id: "cm_cat_1",
          name: "Fiction",
          slug: "fiction",
          description: "Fiction titles",
          sortOrder: 1,
          isActive: true,
          showcaseCount: 3,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-02T00:00:00.000Z",
        },
      ],
    });
  });

  it("creates admin showcase category and normalizes name to slug", async () => {
    const prisma = {
      showcaseCategory: {
        findMany: jest.fn(),
        create: jest.fn().mockResolvedValue({
          id: "cm_cat_2",
          name: "Poetry & Spoken Word",
          slug: "poetry-spoken-word",
          description: "Poetry books",
          sortOrder: 4,
          isActive: true,
          createdAt: new Date("2026-01-03T00:00:00.000Z"),
          updatedAt: new Date("2026-01-03T00:00:00.000Z"),
          _count: { showcases: 0 },
        }),
      },
      authorShowcase: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
    };

    const service = new ShowcaseService(prisma as never);

    await expect(
      service.createAdminShowcaseCategory({
        name: "Poetry & Spoken Word",
        description: "Poetry books",
        sortOrder: 4,
        isActive: true,
      })
    ).resolves.toMatchObject({
      id: "cm_cat_2",
      slug: "poetry-spoken-word",
      showcaseCount: 0,
    });

    expect(prisma.showcaseCategory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          slug: "poetry-spoken-word",
        }),
      })
    );
  });

  it("rejects deleting showcase category when entries are assigned", async () => {
    const prisma = {
      showcaseCategory: {
        findMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({
          id: "cm_cat_1",
          _count: {
            showcases: 2,
          },
        }),
        delete: jest.fn(),
      },
      authorShowcase: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
    };

    const service = new ShowcaseService(prisma as never);

    await expect(service.deleteAdminShowcaseCategory("cm_cat_1")).rejects.toBeInstanceOf(
      ConflictException
    );
    expect(prisma.showcaseCategory.delete).not.toHaveBeenCalled();
  });

  it("lists admin showcase entries with filters and preview path", async () => {
    const prisma = {
      showcaseCategory: {
        findMany: jest.fn(),
      },
      authorShowcase: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "cm_show_1",
            authorName: "A. Author",
            bookTitle: "Stories",
            bookCoverUrl: "https://res.cloudinary.com/demo/image/upload/stories.jpg",
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
            publishedAt: new Date("2025-10-10T00:00:00.000Z"),
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
            createdAt: new Date("2026-02-01T00:00:00.000Z"),
          },
        ]),
        findUnique: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      book: {
        findUnique: jest.fn(),
      },
    };

    const service = new ShowcaseService(prisma as never);

    await expect(
      service.listAdminShowcaseEntries({
        cursor: undefined,
        limit: 20,
        q: "story",
        categoryId: "cm_cat_1",
        isFeatured: true,
        sort: "sort_order_asc",
      })
    ).resolves.toMatchObject({
      items: [
        {
          id: "cm_show_1",
          previewPath: "/showcase?entry=cm_show_1",
          user: {
            displayName: "Ada Lovelace",
            profileComplete: true,
          },
        },
      ],
      hasMore: false,
      nextCursor: null,
    });

    expect(prisma.authorShowcase.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          categoryId: "cm_cat_1",
          isFeatured: true,
        }),
      })
    );
  });

  it("rejects admin showcase entry create when category reference is invalid", async () => {
    const prisma = {
      showcaseCategory: {
        findMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      authorShowcase: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      book: {
        findUnique: jest.fn(),
      },
    };

    const service = new ShowcaseService(prisma as never);

    await expect(
      service.createAdminShowcaseEntry({
        authorName: "Author",
        bookTitle: "Book",
        coverImageUrl: "https://res.cloudinary.com/demo/image/upload/cover.jpg",
        categoryId: "cm_missing",
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("updates sortOrder through admin showcase entry patch", async () => {
    const prisma = {
      showcaseCategory: {
        findMany: jest.fn(),
      },
      authorShowcase: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({
          id: "cm_show_2",
          authorName: "Author",
          bookTitle: "Book",
          bookCoverUrl: "https://res.cloudinary.com/demo/image/upload/cover.jpg",
          aboutBook: null,
          testimonial: null,
          categoryId: null,
          category: null,
          publishedYear: null,
          publishedAt: null,
          userId: null,
          user: null,
          bookId: null,
          isFeatured: false,
          sortOrder: 12,
          createdAt: new Date("2026-02-02T00:00:00.000Z"),
          authorBio: null,
          authorProfileImageUrl: null,
          authorWhatsAppNumber: null,
          authorWebsiteUrl: null,
          authorPurchaseLinks: [],
          authorSocialLinks: [],
        }),
      },
      user: {
        findUnique: jest.fn(),
      },
      book: {
        findUnique: jest.fn(),
      },
    };

    const service = new ShowcaseService(prisma as never);

    const result = await service.updateAdminShowcaseEntry("cm_show_2", {
      sortOrder: 12,
    });

    expect(result.sortOrder).toBe(12);
    expect(prisma.authorShowcase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "cm_show_2" },
        data: expect.objectContaining({
          sortOrder: 12,
        }),
      })
    );
  });

  it("searches showcase-linkable users by name/email with minimal payload", async () => {
    const prisma = {
      showcaseCategory: {
        findMany: jest.fn(),
      },
      authorShowcase: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "cm_user_1",
            firstName: "Ada",
            lastName: "Lovelace",
            email: "ada@example.com",
            isProfileComplete: true,
          },
        ]),
      },
      book: {
        findUnique: jest.fn(),
      },
    };

    const service = new ShowcaseService(prisma as never);

    await expect(
      service.searchAdminShowcaseUsers({
        q: "ada",
        cursor: undefined,
        limit: 10,
      })
    ).resolves.toEqual({
      items: [
        {
          id: "cm_user_1",
          displayName: "Ada Lovelace",
          email: "ada@example.com",
          profileComplete: true,
        },
      ],
      nextCursor: null,
      hasMore: false,
    });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          role: "USER",
        }),
        take: 11,
      })
    );
  });

  it("returns next cursor when showcase user search has more rows", async () => {
    const prisma = {
      showcaseCategory: {
        findMany: jest.fn(),
      },
      authorShowcase: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
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
      book: {
        findUnique: jest.fn(),
      },
    };

    const service = new ShowcaseService(prisma as never);

    await expect(
      service.searchAdminShowcaseUsers({
        q: "",
        cursor: undefined,
        limit: 1,
      })
    ).resolves.toMatchObject({
      items: [
        {
          id: "cm_user_1",
          displayName: "Ada Lovelace",
        },
      ],
      hasMore: true,
      nextCursor: "cm_user_1",
    });
  });
});
