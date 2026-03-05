import { Controller, Get, Header, Param, Query } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import {
  PublicResourceCategoriesResponseDto,
  PublicResourceDetailResponseDto,
  PublicResourcesListQueryDto,
  PublicResourcesListResponseDto,
} from "./dto/index.js";
import { ResourcesService } from "./resources.service.js";

@ApiTags("Resources")
@Controller("resources")
@SkipThrottle()
export class ResourcesController {
  constructor(private readonly resourcesService: ResourcesService) {}

  /**
   * GET /api/v1/resources/categories
   * List active resource categories and published article counts.
   */
  @Get("categories")
  @Header("Cache-Control", "public, max-age=300, stale-while-revalidate=300")
  @ApiOperation({
    summary: "List active resource categories",
    description:
      "Returns active resource categories sorted by display order, each including " +
      "the count of currently published articles in that category.",
  })
  @ApiResponse({
    status: 200,
    description: "Active categories retrieved successfully",
    type: PublicResourceCategoriesResponseDto,
  })
  async listCategories(): Promise<PublicResourceCategoriesResponseDto> {
    return this.resourcesService.listPublicCategories();
  }

  /**
   * GET /api/v1/resources
   * List published resources with cursor-based pagination.
   */
  @Get()
  @Header("Cache-Control", "public, max-age=120, stale-while-revalidate=300")
  @ApiOperation({
    summary: "List published resources",
    description:
      "Returns published resources sorted by publishedAt (descending), optionally filtered by category slug, " +
      "with cursor-based pagination.",
  })
  @ApiQuery({
    name: "category",
    required: false,
    description: "Category slug to filter by",
    example: "publishing-guides",
  })
  @ApiQuery({
    name: "cursor",
    required: false,
    description: "Pagination cursor (last seen article ID)",
    example: "cm1234567890abcdef1234567",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    description: "Page size (default 9, max 30)",
    example: 9,
  })
  @ApiResponse({
    status: 200,
    description: "Published resources retrieved successfully",
    type: PublicResourcesListResponseDto,
  })
  async listPublished(
    @Query() query: PublicResourcesListQueryDto
  ): Promise<PublicResourcesListResponseDto> {
    return this.resourcesService.listPublishedResources(query);
  }

  /**
   * GET /api/v1/resources/:slug
   * Get single published resource article by slug.
   */
  @Get(":slug")
  @Header("Cache-Control", "public, max-age=120, stale-while-revalidate=300")
  @ApiOperation({
    summary: "Get published resource by slug",
    description:
      "Returns a single published resource article by slug, including full content, category summary, and author.",
  })
  @ApiParam({
    name: "slug",
    description: "Resource slug",
    example: "how-to-format-your-manuscript",
  })
  @ApiResponse({
    status: 200,
    description: "Published resource retrieved successfully",
    type: PublicResourceDetailResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: "Published resource not found",
  })
  async getBySlug(@Param("slug") slug: string): Promise<PublicResourceDetailResponseDto> {
    return this.resourcesService.getPublishedResourceBySlug(slug);
  }
}
