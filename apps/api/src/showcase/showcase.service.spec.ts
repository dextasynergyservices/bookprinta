/// <reference types="jest" />
import { NotFoundException } from "@nestjs/common";
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
        findMany: jest.fn().mockResolvedValue([]),
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
        take: 5,
      })
    );
  });

  it("serializes only filled author-profile fields", async () => {
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
      whatsAppNumber: "+2348012345678",
      purchaseLinks: [{ label: "Amazon", url: "https://amazon.example/book" }],
      socialLinks: [{ platform: "Instagram", url: "https://instagram.com/author" }],
    });
  });

  it("rejects author-profile requests when the linked user is not publicly available", async () => {
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

    const service = new ShowcaseService(prisma as never);

    await expect(service.getAuthorProfile("cm_showcase_1")).rejects.toBeInstanceOf(
      NotFoundException
    );
  });
});
