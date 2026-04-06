import type {
  AuthorProfileResponse,
  ShowcaseCategoriesResponse,
  ShowcaseListQuery,
  ShowcaseListResponse,
  ShowcaseSortOption,
} from "@bookprinta/shared";
import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  authorProfileUserSelect,
  hasAuthorProfileDetails,
  resolveShowcaseAuthorProfile,
  serializeCategory,
  serializeShowcaseEntry,
  showcaseCategorySelect,
  showcaseFallbackAuthorProfileSelect,
  showcasePublicEntrySelect,
} from "./showcase.mapper.js";

@Injectable()
export class PublicShowcaseService {
  constructor(private readonly prisma: PrismaService) {}

  async listCategories(): Promise<ShowcaseCategoriesResponse> {
    const categories = await this.prisma.showcaseCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: showcaseCategorySelect,
    });

    return {
      categories: categories.map((category) => serializeCategory(category)),
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
      select: showcasePublicEntrySelect,
    });

    const hasMore = rows.length > query.limit;
    const pageItems = hasMore ? rows.slice(0, query.limit) : rows;

    return {
      items: pageItems.map((row) => serializeShowcaseEntry(row)),
      nextCursor:
        hasMore && pageItems.length > 0 ? (pageItems[pageItems.length - 1]?.id ?? null) : null,
      hasMore,
    };
  }

  async getAuthorProfile(showcaseId: string): Promise<AuthorProfileResponse> {
    const showcase = await this.prisma.authorShowcase.findUnique({
      where: { id: showcaseId },
      select: {
        ...showcaseFallbackAuthorProfileSelect,
        user: {
          select: authorProfileUserSelect,
        },
      },
    });

    const profile = resolveShowcaseAuthorProfile({
      user: showcase?.user,
      fallback: showcase ?? null,
    });

    if (!hasAuthorProfileDetails(profile)) {
      throw new NotFoundException(`Author profile for showcase "${showcaseId}" not found`);
    }

    return profile;
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
}
