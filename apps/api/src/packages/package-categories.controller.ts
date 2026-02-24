import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import { PackageCategoryResponseDto } from "./dto/package-category-response.dto.js";
import { PackagesService } from "./packages.service.js";

/**
 * Public endpoints for retrieving package categories grouped with packages.
 * No authentication required — pricing data is publicly visible.
 */
@ApiTags("Package Categories")
@Controller("package-categories")
@SkipThrottle()
export class PackageCategoriesController {
  constructor(private readonly packagesService: PackagesService) {}

  /**
   * GET /api/v1/package-categories
   * List all active categories with nested active packages for pricing UI.
   */
  @Get()
  @ApiOperation({
    summary: "List active package categories with nested packages",
    description:
      "Returns all active package categories sorted by display order, each with active packages " +
      "sorted by display order. Used on the pricing page. No authentication required.",
  })
  @ApiResponse({
    status: 200,
    description: "List of active package categories with nested active packages",
    type: [PackageCategoryResponseDto],
  })
  async findAll(): Promise<PackageCategoryResponseDto[]> {
    return this.packagesService.findAllActiveByCategory();
  }
}
