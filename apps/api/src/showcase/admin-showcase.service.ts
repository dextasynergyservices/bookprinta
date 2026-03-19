import type {
  AdminCreateShowcaseCategoryInput,
  AdminCreateShowcaseEntryInput,
  AdminDeleteShowcaseCategoryResponse,
  AdminDeleteShowcaseEntryResponse,
  AdminShowcaseCategoriesListResponse,
  AdminShowcaseCategory,
  AdminShowcaseEntriesListQuery,
  AdminShowcaseEntriesListResponse,
  AdminShowcaseEntry,
  AdminShowcaseUserSearchQuery,
  AdminShowcaseUserSearchResponse,
  AdminUpdateShowcaseCategoryInput,
  AdminUpdateShowcaseEntryInput,
} from "@bookprinta/shared";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  adminShowcaseCategorySelect,
  adminShowcaseEntrySelect,
  adminShowcaseLinkedUserSelect,
  serializeAdminCategory,
  serializeAdminSearchUser,
  serializeAdminShowcaseEntry,
} from "./showcase.mapper.js";

@Injectable()
export class AdminShowcaseService {
  constructor(private readonly prisma: PrismaService) {}

  async searchAdminShowcaseUsers(
    query: AdminShowcaseUserSearchQuery
  ): Promise<AdminShowcaseUserSearchResponse> {
    const q = query.q?.trim();
    const rows = await this.prisma.user.findMany({
      where: {
        isActive: true,
        role: "USER",
        ...(q ? this.buildShowcaseUserSearchWhere(q) : {}),
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { id: "asc" }],
      take: query.limit + 1,
      ...(query.cursor
        ? {
            cursor: { id: query.cursor },
            skip: 1,
          }
        : {}),
      select: adminShowcaseLinkedUserSelect,
    });

    const hasMore = rows.length > query.limit;
    const pageItems = hasMore ? rows.slice(0, query.limit) : rows;

    return {
      items: pageItems.map((row) => serializeAdminSearchUser(row)),
      nextCursor:
        hasMore && pageItems.length > 0 ? (pageItems[pageItems.length - 1]?.id ?? null) : null,
      hasMore,
    };
  }

  async listAdminShowcaseEntries(
    query: AdminShowcaseEntriesListQuery
  ): Promise<AdminShowcaseEntriesListResponse> {
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
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(query.isFeatured !== undefined ? { isFeatured: query.isFeatured } : {}),
      },
      orderBy: this.resolveAdminEntryOrderBy(query.sort),
      take: query.limit + 1,
      ...(query.cursor
        ? {
            cursor: { id: query.cursor },
            skip: 1,
          }
        : {}),
      select: adminShowcaseEntrySelect,
    });

    const hasMore = rows.length > query.limit;
    const pageItems = hasMore ? rows.slice(0, query.limit) : rows;

    return {
      items: pageItems.map((row) => serializeAdminShowcaseEntry(row)),
      nextCursor:
        hasMore && pageItems.length > 0 ? (pageItems[pageItems.length - 1]?.id ?? null) : null,
      hasMore,
    };
  }

  async createAdminShowcaseEntry(
    input: AdminCreateShowcaseEntryInput
  ): Promise<AdminShowcaseEntry> {
    await this.assertShowcaseCategoryExists(input.categoryId);
    await this.assertShowcaseUserExists(input.userId);
    await this.assertShowcaseBookExists(input.bookId);

    const created = await this.prisma.authorShowcase.create({
      data: {
        authorName: input.authorName.trim(),
        bookTitle: input.bookTitle.trim(),
        bookCoverUrl: input.coverImageUrl.trim(),
        aboutBook: this.normalizeNullableString(input.aboutBook),
        testimonial: this.normalizeNullableString(input.testimonial),
        categoryId: input.categoryId ?? null,
        publishedYear: input.publishedYear ?? null,
        publishedAt: input.publishedAt ? new Date(input.publishedAt) : null,
        userId: input.userId ?? null,
        bookId: input.bookId ?? null,
        isFeatured: input.isFeatured ?? true,
        sortOrder: input.sortOrder ?? 0,
      },
      select: adminShowcaseEntrySelect,
    });

    return serializeAdminShowcaseEntry(created);
  }

  async updateAdminShowcaseEntry(
    id: string,
    input: AdminUpdateShowcaseEntryInput
  ): Promise<AdminShowcaseEntry> {
    if (input.categoryId !== undefined) {
      await this.assertShowcaseCategoryExists(input.categoryId);
    }
    if (input.userId !== undefined) {
      await this.assertShowcaseUserExists(input.userId);
    }
    if (input.bookId !== undefined) {
      await this.assertShowcaseBookExists(input.bookId);
    }

    try {
      const updated = await this.prisma.authorShowcase.update({
        where: { id },
        data: {
          ...(input.authorName !== undefined ? { authorName: input.authorName.trim() } : {}),
          ...(input.bookTitle !== undefined ? { bookTitle: input.bookTitle.trim() } : {}),
          ...(input.coverImageUrl !== undefined
            ? { bookCoverUrl: input.coverImageUrl.trim() }
            : {}),
          ...(input.aboutBook !== undefined
            ? { aboutBook: this.normalizeNullableString(input.aboutBook) }
            : {}),
          ...(input.testimonial !== undefined
            ? { testimonial: this.normalizeNullableString(input.testimonial) }
            : {}),
          ...(input.categoryId !== undefined ? { categoryId: input.categoryId ?? null } : {}),
          ...(input.publishedYear !== undefined
            ? { publishedYear: input.publishedYear ?? null }
            : {}),
          ...(input.publishedAt !== undefined
            ? { publishedAt: input.publishedAt ? new Date(input.publishedAt) : null }
            : {}),
          ...(input.userId !== undefined ? { userId: input.userId ?? null } : {}),
          ...(input.bookId !== undefined ? { bookId: input.bookId ?? null } : {}),
          ...(input.isFeatured !== undefined ? { isFeatured: input.isFeatured } : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        },
        select: adminShowcaseEntrySelect,
      });

      return serializeAdminShowcaseEntry(updated);
    } catch (error) {
      if (this.isPrismaRecordNotFound(error)) {
        throw new NotFoundException("Showcase entry not found");
      }
      throw error;
    }
  }

  async deleteAdminShowcaseEntry(id: string): Promise<AdminDeleteShowcaseEntryResponse> {
    try {
      await this.prisma.authorShowcase.delete({ where: { id } });
    } catch (error) {
      if (this.isPrismaRecordNotFound(error)) {
        throw new NotFoundException("Showcase entry not found");
      }
      throw error;
    }

    return { id, deleted: true };
  }

  async listAdminShowcaseCategories(): Promise<AdminShowcaseCategoriesListResponse> {
    const categories = await this.prisma.showcaseCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: adminShowcaseCategorySelect,
    });

    return {
      categories: categories.map((category) => serializeAdminCategory(category)),
    };
  }

  async createAdminShowcaseCategory(
    input: AdminCreateShowcaseCategoryInput
  ): Promise<AdminShowcaseCategory> {
    try {
      const created = await this.prisma.showcaseCategory.create({
        data: {
          name: input.name.trim(),
          slug: this.slugify(input.name),
          description: this.normalizeNullableString(input.description),
          sortOrder: input.sortOrder ?? 0,
          isActive: input.isActive ?? true,
        },
        select: adminShowcaseCategorySelect,
      });

      return serializeAdminCategory(created);
    } catch (error) {
      if (this.isPrismaUniqueViolation(error)) {
        throw new ConflictException("Showcase category name/slug must be unique");
      }
      throw error;
    }
  }

  async updateAdminShowcaseCategory(
    id: string,
    input: AdminUpdateShowcaseCategoryInput
  ): Promise<AdminShowcaseCategory> {
    try {
      const updated = await this.prisma.showcaseCategory.update({
        where: { id },
        data: {
          ...(input.name !== undefined
            ? {
                name: input.name.trim(),
                slug: this.slugify(input.name),
              }
            : {}),
          ...(input.description !== undefined
            ? { description: this.normalizeNullableString(input.description) }
            : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
        select: adminShowcaseCategorySelect,
      });

      return serializeAdminCategory(updated);
    } catch (error) {
      if (this.isPrismaUniqueViolation(error)) {
        throw new ConflictException("Showcase category name/slug must be unique");
      }
      if (this.isPrismaRecordNotFound(error)) {
        throw new NotFoundException("Showcase category not found");
      }
      throw error;
    }
  }

  async deleteAdminShowcaseCategory(id: string): Promise<AdminDeleteShowcaseCategoryResponse> {
    const category = await this.prisma.showcaseCategory.findUnique({
      where: { id },
      select: {
        id: true,
        _count: {
          select: {
            showcases: true,
          },
        },
      },
    });

    if (!category) {
      throw new NotFoundException("Showcase category not found");
    }

    if (category._count.showcases > 0) {
      throw new ConflictException("Cannot delete category with assigned showcase entries");
    }

    try {
      await this.prisma.showcaseCategory.delete({ where: { id } });
    } catch (error) {
      if (this.isPrismaRecordNotFound(error)) {
        throw new NotFoundException("Showcase category not found");
      }
      throw error;
    }

    return { id, deleted: true };
  }

  async setEntryCoverFromUpload(id: string, secureUrl: string): Promise<AdminShowcaseEntry> {
    try {
      const updated = await this.prisma.authorShowcase.update({
        where: { id },
        data: {
          bookCoverUrl: secureUrl,
        },
        select: adminShowcaseEntrySelect,
      });

      return serializeAdminShowcaseEntry(updated);
    } catch (error) {
      if (this.isPrismaRecordNotFound(error)) {
        throw new NotFoundException("Showcase entry not found");
      }

      throw error;
    }
  }

  private resolveAdminEntryOrderBy(sort: AdminShowcaseEntriesListQuery["sort"]) {
    switch (sort) {
      case "sort_order_desc":
        return [
          { sortOrder: "desc" as const },
          { createdAt: "desc" as const },
          { id: "desc" as const },
        ];
      case "published_at_desc":
        return [{ publishedAt: "desc" as const }, { id: "desc" as const }];
      case "published_at_asc":
        return [{ publishedAt: "asc" as const }, { id: "asc" as const }];
      case "created_at_asc":
        return [{ createdAt: "asc" as const }, { id: "asc" as const }];
      case "created_at_desc":
        return [{ createdAt: "desc" as const }, { id: "desc" as const }];
      default:
        return [
          { sortOrder: "asc" as const },
          { createdAt: "desc" as const },
          { id: "desc" as const },
        ];
    }
  }

  private buildShowcaseUserSearchWhere(q: string) {
    const terms = q.split(/\s+/).filter((term) => term.length > 0);

    const orFilters: Array<Record<string, unknown>> = [
      { email: { contains: q, mode: "insensitive" } },
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
    ];

    if (terms.length > 1) {
      orFilters.push({
        AND: terms.map((term) => ({
          OR: [
            { firstName: { contains: term, mode: "insensitive" } },
            { lastName: { contains: term, mode: "insensitive" } },
          ],
        })),
      });
    }

    return {
      OR: orFilters,
    };
  }

  private normalizeNullableString(value: string | null | undefined): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private async assertShowcaseCategoryExists(categoryId: string | null | undefined): Promise<void> {
    if (!categoryId) {
      return;
    }

    const category = await this.prisma.showcaseCategory.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });

    if (!category) {
      throw new BadRequestException("Invalid showcase category reference");
    }
  }

  private async assertShowcaseUserExists(userId: string | null | undefined): Promise<void> {
    if (!userId) {
      return;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new BadRequestException("Invalid user reference");
    }
  }

  private async assertShowcaseBookExists(bookId: string | null | undefined): Promise<void> {
    if (!bookId) {
      return;
    }

    const book = await this.prisma.book.findUnique({
      where: { id: bookId },
      select: { id: true },
    });

    if (!book) {
      throw new BadRequestException("Invalid book reference");
    }
  }

  private slugify(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  private isPrismaUniqueViolation(error: unknown): boolean {
    return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
  }

  private isPrismaRecordNotFound(error: unknown): boolean {
    return typeof error === "object" && error !== null && "code" in error && error.code === "P2025";
  }
}
