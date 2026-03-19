/// <reference types="jest" />
import { NotFoundException } from "@nestjs/common";
import { PublicShowcaseService } from "./public-showcase.service.js";

describe("PublicShowcaseService", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("uses featured ordering for featured public listing", async () => {
    const prisma = {
      showcaseCategory: {
        findMany: jest.fn(),
      },
      authorShowcase: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
      },
    };

    const service = new PublicShowcaseService(prisma as never);

    const result = await service.listPublic({
      q: "",
      category: undefined,
      sort: "date_desc",
      year: undefined,
      cursor: undefined,
      limit: 6,
      isFeatured: true,
    });

    expect(result).toEqual({
      items: [],
      nextCursor: null,
      hasMore: false,
    });

    expect(prisma.authorShowcase.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isFeatured: true,
        }),
        orderBy: [{ sortOrder: "asc" }, { publishedAt: "desc" }, { id: "desc" }],
        take: 7,
      })
    );
  });

  it("returns serialized active categories", async () => {
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
          },
        ]),
      },
      authorShowcase: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
    };

    const service = new PublicShowcaseService(prisma as never);

    await expect(service.listCategories()).resolves.toEqual({
      categories: [
        {
          id: "cm_cat_1",
          name: "Fiction",
          slug: "fiction",
          description: "Fiction titles",
          sortOrder: 1,
        },
      ],
    });
  });

  it("throws when linked author profile is not public", async () => {
    const prisma = {
      showcaseCategory: {
        findMany: jest.fn(),
      },
      authorShowcase: {
        findMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({
          userId: "cm_user_1",
          user: {
            bio: "Author bio",
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

    const service = new PublicShowcaseService(prisma as never);

    await expect(service.getAuthorProfile("cm_showcase_1")).rejects.toBeInstanceOf(
      NotFoundException
    );
  });
});
