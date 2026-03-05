import type {
  AdminCreateResourceCategoryInput,
  AdminCreateResourceInput,
  AdminDeleteResourceCategoryResponse,
  AdminDeleteResourceResponse,
  AdminResourceCategoryResponse,
  AdminResourceDetail,
  AdminResourcesListQuery,
  AdminResourcesListResponse,
  AdminUpdateResourceCategoryInput,
  AdminUpdateResourceInput,
  PublicResourceCategoriesResponse,
  PublicResourceDetailResponse,
  PublicResourcesListQuery,
  PublicResourcesListResponse,
} from "@bookprinta/shared";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

type CategorySummaryRow = {
  id: string;
  name: string;
  slug: string;
};

type PublicListItemRow = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  coverImage: string | null;
  publishedAt: Date | null;
  category: CategorySummaryRow | null;
};

type AdminResourceListRow = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  coverImage: string | null;
  category: CategorySummaryRow | null;
  isPublished: boolean;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type AdminResourceDetailRow = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  coverImage: string | null;
  categoryId: string | null;
  category: CategorySummaryRow | null;
  isPublished: boolean;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type AdminCategoryRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    posts: number;
  };
};

@Injectable()
export class ResourcesService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublicCategories(): Promise<PublicResourceCategoriesResponse> {
    const now = new Date();

    const [categories, publishedCountByCategory] = await Promise.all([
      this.prisma.resourceCategory.findMany({
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
      }),
      this.prisma.blogPost.groupBy({
        by: ["categoryId"],
        where: {
          isPublished: true,
          publishedAt: { not: null, lte: now },
          categoryId: { not: null },
          category: { is: { isActive: true } },
        },
        _count: { _all: true },
      }),
    ]);

    const countMap = new Map<string, number>();
    for (const row of publishedCountByCategory) {
      if (!row.categoryId) continue;
      countMap.set(row.categoryId, row._count._all);
    }

    return {
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        description: category.description,
        sortOrder: category.sortOrder,
        isActive: category.isActive,
        articleCount: countMap.get(category.id) ?? 0,
      })),
    };
  }

  async listPublishedResources(
    query: PublicResourcesListQuery
  ): Promise<PublicResourcesListResponse> {
    const now = new Date();

    const where = {
      isPublished: true,
      publishedAt: { not: null, lte: now },
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
    };

    const posts = await this.prisma.blogPost.findMany({
      where,
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor
        ? {
            cursor: { id: query.cursor },
            skip: 1,
          }
        : {}),
      select: {
        id: true,
        title: true,
        slug: true,
        excerpt: true,
        coverImage: true,
        publishedAt: true,
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    const hasMore = posts.length > query.limit;
    const pageItems = hasMore ? posts.slice(0, query.limit) : posts;
    const serializedItems = pageItems.flatMap((post) => this.serializePublicListItem(post));

    return {
      items: serializedItems,
      nextCursor:
        hasMore && pageItems.length > 0 ? (pageItems[pageItems.length - 1]?.id ?? null) : null,
      hasMore,
    };
  }

  async getPublishedResourceBySlug(slug: string): Promise<PublicResourceDetailResponse> {
    const now = new Date();

    const post = await this.prisma.blogPost.findFirst({
      where: {
        slug,
        isPublished: true,
        publishedAt: { not: null, lte: now },
      },
      select: {
        id: true,
        title: true,
        slug: true,
        excerpt: true,
        content: true,
        coverImage: true,
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        author: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!post || !post.publishedAt) {
      throw new NotFoundException(`Published resource with slug "${slug}" not found`);
    }

    const authorName = [post.author.firstName, post.author.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();

    return {
      id: post.id,
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      content: post.content,
      coverImageUrl: post.coverImage,
      category: post.category,
      authorName: authorName || post.author.firstName,
      publishedAt: post.publishedAt.toISOString(),
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
    };
  }

  private serializePublicListItem(post: PublicListItemRow) {
    if (!post.publishedAt) return [];

    return [
      {
        id: post.id,
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt,
        coverImageUrl: post.coverImage,
        category: post.category,
        publishedAt: post.publishedAt.toISOString(),
      },
    ];
  }

  async listAdminResources(query: AdminResourcesListQuery): Promise<AdminResourcesListResponse> {
    const q = query.q?.trim();
    const where = {
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.isPublished !== undefined ? { isPublished: query.isPublished } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" as const } },
              { slug: { contains: q, mode: "insensitive" as const } },
              { excerpt: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const posts = await this.prisma.blogPost.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor
        ? {
            cursor: { id: query.cursor },
            skip: 1,
          }
        : {}),
      select: {
        id: true,
        title: true,
        slug: true,
        excerpt: true,
        coverImage: true,
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        isPublished: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const hasMore = posts.length > query.limit;
    const pageItems = hasMore ? posts.slice(0, query.limit) : posts;

    return {
      items: pageItems.map((post) => this.serializeAdminResourceListItem(post)),
      nextCursor:
        hasMore && pageItems.length > 0 ? (pageItems[pageItems.length - 1]?.id ?? null) : null,
      hasMore,
    };
  }

  async createAdminResource(
    input: AdminCreateResourceInput,
    adminId: string
  ): Promise<AdminResourceDetail> {
    await this.assertAdminAuthorExists(adminId);
    await this.assertCategoryExists(input.categoryId ?? null);

    const publication = this.resolveCreatePublicationState(input);

    try {
      const created = await this.prisma.blogPost.create({
        data: {
          title: input.title.trim(),
          slug: this.normalizeSlug(input.slug),
          excerpt: this.normalizeNullableString(input.excerpt),
          content: input.content,
          coverImage: this.normalizeNullableString(input.coverImageUrl),
          categoryId: input.categoryId ?? null,
          isPublished: publication.isPublished,
          publishedAt: publication.publishedAt,
          authorId: adminId,
        },
        select: {
          id: true,
          title: true,
          slug: true,
          excerpt: true,
          content: true,
          coverImage: true,
          categoryId: true,
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          isPublished: true,
          publishedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return this.serializeAdminResourceDetail(created);
    } catch (error) {
      if (this.isPrismaUniqueViolation(error)) {
        throw new BadRequestException("Resource title/slug must be unique");
      }
      if (this.isPrismaForeignKeyViolation(error)) {
        throw new BadRequestException("Invalid categoryId");
      }
      throw error;
    }
  }

  async updateAdminResource(
    id: string,
    input: AdminUpdateResourceInput
  ): Promise<AdminResourceDetail> {
    const existing = await this.prisma.blogPost.findUnique({
      where: { id },
      select: {
        id: true,
        isPublished: true,
        publishedAt: true,
        categoryId: true,
      },
    });

    if (!existing) {
      throw new NotFoundException("Resource not found");
    }

    if (input.categoryId !== undefined) {
      await this.assertCategoryExists(input.categoryId ?? null);
    }

    const publication = this.resolveUpdatePublicationState({
      currentIsPublished: existing.isPublished,
      currentPublishedAt: existing.publishedAt,
      inputIsPublished: input.isPublished,
      inputPublishedAt: input.publishedAt,
    });

    try {
      const updated = await this.prisma.blogPost.update({
        where: { id },
        data: {
          ...(input.title !== undefined ? { title: input.title.trim() } : {}),
          ...(input.slug !== undefined ? { slug: this.normalizeSlug(input.slug) } : {}),
          ...(input.excerpt !== undefined
            ? { excerpt: this.normalizeNullableString(input.excerpt) }
            : {}),
          ...(input.content !== undefined ? { content: input.content } : {}),
          ...(input.coverImageUrl !== undefined
            ? { coverImage: this.normalizeNullableString(input.coverImageUrl) }
            : {}),
          ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
          ...(publication.isPublished !== undefined
            ? { isPublished: publication.isPublished }
            : {}),
          ...(publication.publishedAt !== undefined
            ? { publishedAt: publication.publishedAt }
            : {}),
        },
        select: {
          id: true,
          title: true,
          slug: true,
          excerpt: true,
          content: true,
          coverImage: true,
          categoryId: true,
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          isPublished: true,
          publishedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return this.serializeAdminResourceDetail(updated);
    } catch (error) {
      if (this.isPrismaUniqueViolation(error)) {
        throw new BadRequestException("Resource title/slug must be unique");
      }
      if (this.isPrismaForeignKeyViolation(error)) {
        throw new BadRequestException("Invalid categoryId");
      }
      if (this.isPrismaRecordNotFound(error)) {
        throw new NotFoundException("Resource not found");
      }
      throw error;
    }
  }

  async deleteAdminResource(id: string): Promise<AdminDeleteResourceResponse> {
    try {
      await this.prisma.blogPost.delete({
        where: { id },
      });
    } catch (error) {
      if (this.isPrismaRecordNotFound(error)) {
        throw new NotFoundException("Resource not found");
      }
      throw error;
    }

    return { id, deleted: true };
  }

  async createAdminResourceCategory(
    input: AdminCreateResourceCategoryInput
  ): Promise<AdminResourceCategoryResponse> {
    try {
      const created = await this.prisma.resourceCategory.create({
        data: {
          name: input.name.trim(),
          slug: this.normalizeSlug(input.slug),
          description: this.normalizeNullableString(input.description),
          sortOrder: input.sortOrder ?? 0,
          isActive: input.isActive ?? true,
        },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          sortOrder: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              posts: true,
            },
          },
        },
      });

      return this.serializeAdminCategory(created);
    } catch (error) {
      if (this.isPrismaUniqueViolation(error)) {
        throw new BadRequestException("Resource category name/slug must be unique");
      }
      throw error;
    }
  }

  async updateAdminResourceCategory(
    id: string,
    input: AdminUpdateResourceCategoryInput
  ): Promise<AdminResourceCategoryResponse> {
    try {
      const updated = await this.prisma.resourceCategory.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.slug !== undefined ? { slug: this.normalizeSlug(input.slug) } : {}),
          ...(input.description !== undefined
            ? { description: this.normalizeNullableString(input.description) }
            : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          sortOrder: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              posts: true,
            },
          },
        },
      });

      return this.serializeAdminCategory(updated);
    } catch (error) {
      if (this.isPrismaUniqueViolation(error)) {
        throw new BadRequestException("Resource category name/slug must be unique");
      }
      if (this.isPrismaRecordNotFound(error)) {
        throw new NotFoundException("Resource category not found");
      }
      throw error;
    }
  }

  async deleteAdminResourceCategory(id: string): Promise<AdminDeleteResourceCategoryResponse> {
    const category = await this.prisma.resourceCategory.findUnique({
      where: { id },
      select: {
        id: true,
        _count: {
          select: {
            posts: true,
          },
        },
      },
    });

    if (!category) {
      throw new NotFoundException("Resource category not found");
    }

    if (category._count.posts > 0) {
      throw new BadRequestException("Cannot delete category with assigned articles");
    }

    try {
      await this.prisma.resourceCategory.delete({ where: { id } });
    } catch (error) {
      if (this.isPrismaRecordNotFound(error)) {
        throw new NotFoundException("Resource category not found");
      }
      throw error;
    }

    return { id, deleted: true };
  }

  private serializeAdminResourceListItem(post: AdminResourceListRow) {
    return {
      id: post.id,
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      coverImageUrl: post.coverImage,
      category: post.category,
      isPublished: post.isPublished,
      publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
    };
  }

  private serializeAdminResourceDetail(post: AdminResourceDetailRow): AdminResourceDetail {
    return {
      id: post.id,
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      content: post.content,
      coverImageUrl: post.coverImage,
      categoryId: post.categoryId,
      category: post.category,
      isPublished: post.isPublished,
      publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
    };
  }

  private serializeAdminCategory(category: AdminCategoryRow): AdminResourceCategoryResponse {
    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      sortOrder: category.sortOrder,
      isActive: category.isActive,
      articleCount: category._count.posts,
      createdAt: category.createdAt.toISOString(),
      updatedAt: category.updatedAt.toISOString(),
    };
  }

  private async assertCategoryExists(categoryId: string | null): Promise<void> {
    if (!categoryId) return;

    const category = await this.prisma.resourceCategory.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });

    if (!category) {
      throw new BadRequestException("Invalid categoryId");
    }
  }

  private async assertAdminAuthorExists(adminId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: adminId },
      select: { id: true },
    });

    if (!user) {
      throw new BadRequestException("Invalid admin user");
    }
  }

  private resolveCreatePublicationState(input: AdminCreateResourceInput) {
    const now = new Date();
    const requestedPublishedAt =
      input.publishedAt === undefined || input.publishedAt === null
        ? null
        : new Date(input.publishedAt);
    const isPublished =
      input.isPublished !== undefined ? input.isPublished : requestedPublishedAt !== null;

    if (!isPublished && requestedPublishedAt !== null) {
      throw new BadRequestException("publishedAt cannot be set when isPublished is false");
    }

    return {
      isPublished,
      publishedAt: isPublished ? (requestedPublishedAt ?? now) : null,
    };
  }

  private resolveUpdatePublicationState(params: {
    currentIsPublished: boolean;
    currentPublishedAt: Date | null;
    inputIsPublished: boolean | undefined;
    inputPublishedAt: string | null | undefined;
  }) {
    const now = new Date();

    // Explicit unpublish takes priority and clears publishedAt.
    if (params.inputIsPublished === false) {
      if (params.inputPublishedAt !== undefined && params.inputPublishedAt !== null) {
        throw new BadRequestException("Cannot set publishedAt while unpublishing");
      }

      return {
        isPublished: false,
        publishedAt: null,
      };
    }

    // Explicit publish.
    if (params.inputIsPublished === true) {
      if (params.inputPublishedAt === null) {
        return {
          isPublished: true,
          publishedAt: params.currentPublishedAt ?? now,
        };
      }

      if (params.inputPublishedAt !== undefined) {
        return {
          isPublished: true,
          publishedAt: new Date(params.inputPublishedAt),
        };
      }

      return {
        isPublished: true,
        publishedAt: params.currentPublishedAt ?? now,
      };
    }

    // isPublished not explicitly provided.
    if (params.inputPublishedAt !== undefined) {
      if (params.inputPublishedAt === null) {
        if (params.currentIsPublished) {
          throw new BadRequestException(
            "Cannot clear publishedAt without setting isPublished to false"
          );
        }

        return {
          isPublished: false,
          publishedAt: null,
        };
      }

      return {
        isPublished: true,
        publishedAt: new Date(params.inputPublishedAt),
      };
    }

    // No publication fields changed.
    return {
      isPublished: params.currentIsPublished,
      publishedAt: params.currentIsPublished ? (params.currentPublishedAt ?? now) : null,
    };
  }

  private normalizeSlug(slug: string): string {
    return slug.trim().toLowerCase();
  }

  private normalizeNullableString(value: string | null | undefined): string | null {
    if (value === undefined || value === null) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private isPrismaUniqueViolation(error: unknown): boolean {
    return Boolean(
      error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
    );
  }

  private isPrismaRecordNotFound(error: unknown): boolean {
    return Boolean(
      error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: string }).code === "P2025"
    );
  }

  private isPrismaForeignKeyViolation(error: unknown): boolean {
    return Boolean(
      error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: string }).code === "P2003"
    );
  }
}
