import { Controller, Get, Header, Param, Query } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import {
  AuthorProfileResponseDto,
  ShowcaseCategoriesResponseDto,
  ShowcaseListQueryDto,
  ShowcaseListResponseDto,
} from "./dto/index.js";
import { PublicShowcaseService } from "./public-showcase.service.js";

@ApiTags("Showcase")
@Controller("showcase")
@SkipThrottle()
export class ShowcaseController {
  constructor(private readonly publicShowcaseService: PublicShowcaseService) {}

  @Get()
  @Header("Cache-Control", "public, max-age=120, stale-while-revalidate=300")
  @ApiOperation({
    summary: "List public showcase entries",
    description:
      "Returns cursor-paginated public showcase entries, optionally filtered by search term, category, year, or featured-only mode.",
  })
  @ApiQuery({ name: "q", required: false, description: "Search by book title or author name" })
  @ApiQuery({ name: "category", required: false, description: "Category slug to filter by" })
  @ApiQuery({
    name: "sort",
    required: false,
    enum: ["date_desc", "date_asc", "title_asc", "title_desc"],
    description: "Sort order for public showcase listing",
  })
  @ApiQuery({ name: "year", required: false, description: "Published year to filter by" })
  @ApiQuery({ name: "cursor", required: false, description: "Cursor for pagination" })
  @ApiQuery({ name: "limit", required: false, description: "Page size (default 6, max 30)" })
  @ApiQuery({
    name: "isFeatured",
    required: false,
    description:
      "When true, returns featured homepage-ready entries ordered by sortOrder instead of the general sort mode.",
  })
  @ApiResponse({
    status: 200,
    description: "Showcase entries retrieved successfully",
    type: ShowcaseListResponseDto,
  })
  async list(@Query() query: ShowcaseListQueryDto): Promise<ShowcaseListResponseDto> {
    return this.publicShowcaseService.listPublic(query);
  }

  @Get("categories")
  @Header("Cache-Control", "public, max-age=300, stale-while-revalidate=300")
  @ApiOperation({
    summary: "List active showcase categories",
    description: "Returns active showcase categories sorted by display order for filter UIs.",
  })
  @ApiResponse({
    status: 200,
    description: "Active showcase categories retrieved successfully",
    type: ShowcaseCategoriesResponseDto,
  })
  async listCategories(): Promise<ShowcaseCategoriesResponseDto> {
    return this.publicShowcaseService.listCategories();
  }

  @Get(":id/author")
  @Header("Cache-Control", "public, max-age=300, stale-while-revalidate=300")
  @ApiOperation({
    summary: "Get author profile for a showcase entry",
    description:
      "Returns the public author profile tied to a showcase entry when the linked user has completed their profile.",
  })
  @ApiParam({
    name: "id",
    description: "Showcase entry ID",
    example: "cm1234567890abcdef1234567",
  })
  @ApiResponse({
    status: 200,
    description: "Author profile retrieved successfully",
    type: AuthorProfileResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: "Showcase entry or public author profile not found",
  })
  async getAuthorProfile(@Param("id") id: string): Promise<AuthorProfileResponseDto> {
    return this.publicShowcaseService.getAuthorProfile(id);
  }
}
