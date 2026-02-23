import { Controller, Get, Param } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import { PackageResponseDto } from "./dto/package-response.dto.js";
import { PackagesService } from "./packages.service.js";

/**
 * Public endpoints for retrieving package/tier information.
 * No authentication required — pricing data is publicly visible.
 * Rate limiting is skipped (read-only reference data).
 */
@ApiTags("Packages")
@Controller("packages")
@SkipThrottle()
export class PackagesController {
  constructor(private readonly packagesService: PackagesService) {}

  /**
   * GET /api/v1/packages
   * List all active packages sorted by display order.
   */
  @Get()
  @ApiOperation({
    summary: "List active packages",
    description:
      "Returns all active publishing packages (First Draft, Glow Up, Legacy) " +
      "sorted by display order. Used on the pricing page. No authentication required.",
  })
  @ApiResponse({
    status: 200,
    description: "List of active packages",
    type: [PackageResponseDto],
  })
  async findAll(): Promise<PackageResponseDto[]> {
    return this.packagesService.findAllActive();
  }

  /**
   * GET /api/v1/packages/:id
   * Get a single package by ID.
   */
  @Get(":id")
  @ApiOperation({
    summary: "Get package by ID",
    description:
      "Returns a single package by its unique identifier. " +
      "Returns 404 if the package does not exist or is inactive.",
  })
  @ApiParam({
    name: "id",
    description: "Package CUID",
    example: "clxyz1234567890abcdef",
  })
  @ApiResponse({
    status: 200,
    description: "Package details",
    type: PackageResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: "Package not found or inactive",
  })
  async findOne(@Param("id") id: string): Promise<PackageResponseDto> {
    return this.packagesService.findOneById(id);
  }
}
