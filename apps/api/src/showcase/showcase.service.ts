import type {
  AuthorProfileResponse,
  ShowcaseCategoriesResponse,
  ShowcaseListQuery,
  ShowcaseListResponse,
  ShowcaseSortOption,
} from "@bookprinta/shared";
import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

type ShowcaseCategoryRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
};

type ShowcaseListRow = {
  id: string;
  authorName: string;
  bookTitle: string;
  bookCoverUrl: string;
  aboutBook: string | null;
  testimonial: string | null;
  categoryId: string | null;
  category: ShowcaseCategoryRow | null;
  publishedYear: number | null;
  publishedAt: Date | null;
  userId: string | null;
  isFeatured: boolean;
  sortOrder: number;
  user: {
    isProfileComplete: boolean;
  } | null;
};

type AuthorProfileRow = {
  userId: string | null;
  user: {
    bio: string | null;
    profileImageUrl: string | null;
    whatsAppNumber: string | null;
    websiteUrl: string | null;
    purchaseLinks: unknown;
    socialLinks: unknown;
    isProfileComplete: boolean;
  } | null;
} | null;

type PurchaseLinkRecord = {
  label: string;
  url: string;
};

type SocialLinkRecord = {
  platform: string;
  url: string;
};

@Injectable()
export class ShowcaseService {
  constructor(private readonly prisma: PrismaService) {}

  async listCategories(): Promise<ShowcaseCategoriesResponse> {
    const categories = await this.prisma.showcaseCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        sortOrder: true,
        isActive: true,
      },
    });

    return {
      categories: categories.map((category) => this.serializeCategory(category)),
    };
  }

  async listPublic(query: ShowcaseListQuery): Promise<ShowcaseListResponse> {
    const q = query.q?.trim();

    const rows = await this.prisma.authorShowcase.findMany({
      where: {
        ...(q
          ? {
              OR: [
                { bookTitle: { contains: q, mode: "insensitive" } },
                { authorName: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(query.category
          ? {
              category: {
                is: {
                  slug: query.category,
                  isActive: true,
                },
              },
            }
          : {}),
        ...(query.year ? { publishedYear: query.year } : {}),
        ...(query.isFeatured !== undefined ? { isFeatured: query.isFeatured } : {}),
      },
      orderBy: this.resolveOrderBy(query.sort, query.isFeatured),
      take: query.limit + 1,
      ...(query.cursor
        ? {
            cursor: { id: query.cursor },
            skip: 1,
          }
        : {}),
      select: {
        id: true,
        authorName: true,
        bookTitle: true,
        bookCoverUrl: true,
        aboutBook: true,
        testimonial: true,
        categoryId: true,
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            sortOrder: true,
            isActive: true,
          },
        },
        publishedYear: true,
        publishedAt: true,
        userId: true,
        isFeatured: true,
        sortOrder: true,
        user: {
          select: {
            isProfileComplete: true,
          },
        },
      },
    });

    const hasMore = rows.length > query.limit;
    const pageItems = hasMore ? rows.slice(0, query.limit) : rows;

    return {
      items: pageItems.map((row) => this.serializeShowcaseEntry(row)),
      nextCursor:
        hasMore && pageItems.length > 0 ? (pageItems[pageItems.length - 1]?.id ?? null) : null,
      hasMore,
    };
  }

  async getAuthorProfile(showcaseId: string): Promise<AuthorProfileResponse> {
    const showcase = await this.prisma.authorShowcase.findUnique({
      where: { id: showcaseId },
      select: {
        userId: true,
        user: {
          select: {
            bio: true,
            profileImageUrl: true,
            whatsAppNumber: true,
            websiteUrl: true,
            purchaseLinks: true,
            socialLinks: true,
            isProfileComplete: true,
          },
        },
      },
    });

    if (!showcase?.userId || !showcase.user || !showcase.user.isProfileComplete) {
      throw new NotFoundException(`Author profile for showcase "${showcaseId}" not found`);
    }

    return this.serializeAuthorProfile(showcase);
  }

  private resolveOrderBy(sort: ShowcaseSortOption, isFeatured?: boolean) {
    if (isFeatured === true) {
      return [
        { sortOrder: "asc" as const },
        { publishedAt: "desc" as const },
        { id: "desc" as const },
      ];
    }

    switch (sort) {
      case "date_asc":
        return [{ publishedAt: "asc" as const }, { id: "asc" as const }];
      case "title_asc":
        return [{ bookTitle: "asc" as const }, { id: "asc" as const }];
      case "title_desc":
        return [{ bookTitle: "desc" as const }, { id: "desc" as const }];
      default:
        return [{ publishedAt: "desc" as const }, { id: "desc" as const }];
    }
  }

  private serializeCategory(category: ShowcaseCategoryRow) {
    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      sortOrder: category.sortOrder,
    };
  }

  private serializeShowcaseEntry(row: ShowcaseListRow) {
    return {
      id: row.id,
      authorName: row.authorName,
      bookTitle: row.bookTitle,
      bookCoverUrl: row.bookCoverUrl,
      aboutBook: row.aboutBook,
      testimonial: row.testimonial,
      categoryId: row.categoryId,
      category: row.category?.isActive ? this.serializeCategory(row.category) : null,
      publishedYear: row.publishedYear,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      userId: row.userId,
      isFeatured: row.isFeatured,
      isProfileComplete: row.user?.isProfileComplete ?? false,
    };
  }

  private serializeAuthorProfile(showcase: AuthorProfileRow): AuthorProfileResponse {
    const user = showcase?.user;
    if (!user) {
      throw new NotFoundException("Author profile not found");
    }

    const purchaseLinks = this.parsePurchaseLinks(user.purchaseLinks);
    const socialLinks = this.parseSocialLinks(user.socialLinks);

    return {
      ...(user.bio ? { bio: user.bio } : {}),
      ...(user.profileImageUrl ? { profileImageUrl: user.profileImageUrl } : {}),
      ...(user.whatsAppNumber ? { whatsAppNumber: user.whatsAppNumber } : {}),
      ...(user.websiteUrl ? { websiteUrl: user.websiteUrl } : {}),
      ...(purchaseLinks.length > 0 ? { purchaseLinks } : {}),
      ...(socialLinks.length > 0 ? { socialLinks } : {}),
    };
  }

  private parsePurchaseLinks(value: unknown): PurchaseLinkRecord[] {
    if (!Array.isArray(value)) return [];

    return value.flatMap((item) => {
      if (
        item &&
        typeof item === "object" &&
        "label" in item &&
        "url" in item &&
        typeof item.label === "string" &&
        item.label.trim().length > 0 &&
        typeof item.url === "string" &&
        item.url.trim().length > 0
      ) {
        return [{ label: item.label.trim(), url: item.url.trim() }];
      }
      return [];
    });
  }

  private parseSocialLinks(value: unknown): SocialLinkRecord[] {
    if (!Array.isArray(value)) return [];

    return value.flatMap((item) => {
      if (
        item &&
        typeof item === "object" &&
        "platform" in item &&
        "url" in item &&
        typeof item.platform === "string" &&
        item.platform.trim().length > 0 &&
        typeof item.url === "string" &&
        item.url.trim().length > 0
      ) {
        return [{ platform: item.platform.trim(), url: item.url.trim() }];
      }
      return [];
    });
  }
}
