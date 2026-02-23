import { Controller, Get, Param } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import { AddonsService } from "./addons.service.js";
import { AddonResponseDto } from "./dto/addon-response.dto.js";

/**
 * Public endpoints for retrieving addon information.
 * No authentication required — addon data is publicly visible for checkout.
 * Rate limiting is skipped (read-only reference data).
 */
@ApiTags("Addons")
@Controller("addons")
@SkipThrottle()
export class AddonsController {
  constructor(private readonly addonsService: AddonsService) {}

  /**
   * GET /api/v1/addons
   * List all active addons sorted by display order.
   */
  @Get()
  @ApiOperation({
    summary: "List active addons",
    description:
      "Returns all active addons (Cover Design, Formatting, ISBN Registration, etc.) " +
      "sorted by display order. Used on the checkout page for addon selection. " +
      "No authentication required.\n\n" +
      "Pricing types:\n" +
      '- `"fixed"` — flat NGN price (use `price` field)\n' +
      '- `"per_word"` — variable pricing (use `pricePerWord` × word count)',
  })
  @ApiResponse({
    status: 200,
    description: "List of active addons",
    type: [AddonResponseDto],
  })
  async findAll(): Promise<AddonResponseDto[]> {
    return this.addonsService.findAllActive();
  }

  /**
   * GET /api/v1/addons/:id
   * Get a single addon by ID.
   */
  @Get(":id")
  @ApiOperation({
    summary: "Get addon by ID",
    description:
      "Returns a single addon by its unique identifier. " +
      "Returns 404 if the addon does not exist or is inactive.",
  })
  @ApiParam({
    name: "id",
    description: "Addon CUID",
    example: "clxyz1234567890abcdef",
  })
  @ApiResponse({
    status: 200,
    description: "Addon details",
    type: AddonResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: "Addon not found or inactive",
  })
  async findOne(@Param("id") id: string): Promise<AddonResponseDto> {
    return this.addonsService.findOneById(id);
  }
}
