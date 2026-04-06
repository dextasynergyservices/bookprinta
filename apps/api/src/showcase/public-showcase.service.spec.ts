/// <reference types="jest" />
import { NotFoundException } from "@nestjs/common";
import { PublicShowcaseService } from "./public-showcase.service.js";

function createFallbackAuthorProfile(
  overrides: Partial<{
    authorBio: string | null;
    authorProfileImageUrl: string | null;
    authorWhatsAppNumber: string | null;
    authorWebsiteUrl: string | null;
    authorPurchaseLinks: Array<{ label: string; url: string }>;
    authorSocialLinks: Array<{ platform: string; url: string }>;
  }> = {}
) {
  return {
    authorBio: null,
    authorProfileImageUrl: null,
    authorWhatsAppNumber: null,
    authorWebsiteUrl: null,
    authorPurchaseLinks: [],
    authorSocialLinks: [],
    ...overrides,
  };
}

function createUserAuthorProfile(
  overrides: Partial<{
    bio: string | null;
    profileImageUrl: string | null;
    whatsAppNumber: string | null;
    websiteUrl: string | null;
    purchaseLinks: Array<{ label: string; url: string }>;
    socialLinks: Array<{ platform: string; url: string }>;
    isProfileComplete: boolean;
  }> = {}
) {
  return {
    bio: null,
    profileImageUrl: null,
    whatsAppNumber: null,
    websiteUrl: null,
    purchaseLinks: [],
    socialLinks: [],
    isProfileComplete: false,
    ...overrides,
  };
}

function createPublicShowcaseRow(
  overrides: Partial<{
    id: string;
    authorName: string;
    bookTitle: string;
    bookCoverUrl: string;
    aboutBook: string | null;
    testimonial: string | null;
    categoryId: string | null;
    category: null;
    publishedYear: number | null;
    publishedAt: Date | null;
    userId: string | null;
    isFeatured: boolean;
    sortOrder: number;
    user: ReturnType<typeof createUserAuthorProfile> | null;
    authorBio: string | null;
    authorProfileImageUrl: string | null;
    authorWhatsAppNumber: string | null;
    authorWebsiteUrl: string | null;
    authorPurchaseLinks: Array<{ label: string; url: string }>;
    authorSocialLinks: Array<{ platform: string; url: string }>;
  }> = {}
) {
  return {
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
    user: null,
    ...createFallbackAuthorProfile(),
    ...overrides,
  };
}

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
        findMany: jest.fn().mockResolvedValue([
          createPublicShowcaseRow({
            ...createFallbackAuthorProfile({
              authorBio: "Fallback bio",
            }),
          }),
        ]),
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

  it("returns admin fallback author details when the linked user is incomplete", async () => {
    const prisma = {
      showcaseCategory: {
        findMany: jest.fn(),
      },
      authorShowcase: {
        findMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({
          ...createFallbackAuthorProfile({
            authorBio: "Fallback bio",
            authorProfileImageUrl: "https://res.cloudinary.com/demo/image/upload/fallback.jpg",
            authorWhatsAppNumber: "+2348099999999",
            authorWebsiteUrl: "https://fallback.example.com",
            authorPurchaseLinks: [
              { label: "Roving Heights", url: "https://rovingheights.com/book" },
            ],
            authorSocialLinks: [{ platform: "X", url: "https://x.com/fallback-author" }],
          }),
          user: createUserAuthorProfile({
            isProfileComplete: false,
          }),
        }),
      },
    };

    const service = new PublicShowcaseService(prisma as never);

    await expect(service.getAuthorProfile("cm_showcase_1")).resolves.toEqual({
      bio: "Fallback bio",
      profileImageUrl: "https://res.cloudinary.com/demo/image/upload/fallback.jpg",
      whatsAppNumber: "+2348099999999",
      websiteUrl: "https://fallback.example.com",
      purchaseLinks: [{ label: "Roving Heights", url: "https://rovingheights.com/book" }],
      socialLinks: [{ platform: "X", url: "https://x.com/fallback-author" }],
    });
  });

  it("fills missing linked user fields from admin fallback when the linked user profile is partial", async () => {
    const prisma = {
      showcaseCategory: {
        findMany: jest.fn(),
      },
      authorShowcase: {
        findMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({
          ...createFallbackAuthorProfile({
            authorBio: "Fallback bio",
            authorProfileImageUrl: "https://res.cloudinary.com/demo/image/upload/fallback.jpg",
            authorWhatsAppNumber: "+2348099999999",
            authorWebsiteUrl: "https://fallback.example.com",
            authorPurchaseLinks: [
              { label: "Roving Heights", url: "https://rovingheights.com/book" },
            ],
            authorSocialLinks: [{ platform: "X", url: "https://x.com/fallback-author" }],
          }),
          user: createUserAuthorProfile({
            bio: "Author bio",
            profileImageUrl: null,
            whatsAppNumber: "+2348012345678",
            websiteUrl: null,
            purchaseLinks: [{ label: "Amazon", url: "https://amazon.example/book" }],
            socialLinks: [],
          }),
        }),
      },
    };

    const service = new PublicShowcaseService(prisma as never);

    await expect(service.getAuthorProfile("cm_showcase_1")).resolves.toEqual({
      bio: "Author bio",
      profileImageUrl: "https://res.cloudinary.com/demo/image/upload/fallback.jpg",
      whatsAppNumber: "+2348012345678",
      websiteUrl: "https://fallback.example.com",
      purchaseLinks: [{ label: "Amazon", url: "https://amazon.example/book" }],
      socialLinks: [{ platform: "X", url: "https://x.com/fallback-author" }],
    });
  });

  it("returns fallback author details when no linked user exists", async () => {
    const prisma = {
      showcaseCategory: {
        findMany: jest.fn(),
      },
      authorShowcase: {
        findMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({
          ...createFallbackAuthorProfile({
            authorBio: "Fallback only bio",
            authorWebsiteUrl: "https://fallback-only.example.com",
            authorSocialLinks: [{ platform: "Instagram", url: "https://instagram.com/fallback" }],
          }),
          user: null,
        }),
      },
    };

    const service = new PublicShowcaseService(prisma as never);

    await expect(service.getAuthorProfile("cm_showcase_1")).resolves.toEqual({
      bio: "Fallback only bio",
      websiteUrl: "https://fallback-only.example.com",
      socialLinks: [{ platform: "Instagram", url: "https://instagram.com/fallback" }],
    });
  });

  it("prefers linked user values over admin fallback when both sources provide the same fields", async () => {
    const prisma = {
      showcaseCategory: {
        findMany: jest.fn(),
      },
      authorShowcase: {
        findMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({
          ...createFallbackAuthorProfile({
            authorBio: "Fallback bio",
            authorProfileImageUrl: "https://res.cloudinary.com/demo/image/upload/fallback.jpg",
            authorWhatsAppNumber: "+2348099999999",
            authorWebsiteUrl: "https://fallback.example.com",
            authorPurchaseLinks: [
              { label: "Fallback Store", url: "https://fallback.example.com/store" },
            ],
            authorSocialLinks: [
              { platform: "Facebook", url: "https://facebook.com/fallback-author" },
            ],
          }),
          user: createUserAuthorProfile({
            bio: "User bio",
            profileImageUrl: "https://res.cloudinary.com/demo/image/upload/user.jpg",
            whatsAppNumber: "+2348012345678",
            websiteUrl: "https://user.example.com",
            purchaseLinks: [{ label: "Amazon", url: "https://amazon.example/book" }],
            socialLinks: [{ platform: "X", url: "https://x.com/user-author" }],
            isProfileComplete: true,
          }),
        }),
      },
    };

    const service = new PublicShowcaseService(prisma as never);

    await expect(service.getAuthorProfile("cm_showcase_1")).resolves.toEqual({
      bio: "User bio",
      profileImageUrl: "https://res.cloudinary.com/demo/image/upload/user.jpg",
      whatsAppNumber: "+2348012345678",
      websiteUrl: "https://user.example.com",
      purchaseLinks: [{ label: "Amazon", url: "https://amazon.example/book" }],
      socialLinks: [{ platform: "X", url: "https://x.com/user-author" }],
    });
  });

  it("marks public entries with no linked user and no fallback details as having no author profile CTA", async () => {
    const prisma = {
      showcaseCategory: {
        findMany: jest.fn(),
      },
      authorShowcase: {
        findMany: jest.fn().mockResolvedValue([
          createPublicShowcaseRow({
            userId: null,
            user: null,
          }),
        ]),
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
      isFeatured: undefined,
    });

    expect(result.items).toEqual([
      expect.objectContaining({
        id: "cm_show_1",
        hasAuthorProfile: false,
      }),
    ]);
  });

  it("throws when neither linked user nor admin fallback has author details", async () => {
    const prisma = {
      showcaseCategory: {
        findMany: jest.fn(),
      },
      authorShowcase: {
        findMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({
          ...createFallbackAuthorProfile(),
          user: createUserAuthorProfile(),
        }),
      },
    };

    const service = new PublicShowcaseService(prisma as never);

    await expect(service.getAuthorProfile("cm_showcase_1")).rejects.toBeInstanceOf(
      NotFoundException
    );
  });
});
