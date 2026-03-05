import { Controller, Get, Header } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import { AboutStatsResponseDto } from "./dto/about-stats-response.dto.js";
import { MarketingService } from "./marketing.service.js";

@ApiTags("Marketing")
@Controller("marketing")
@SkipThrottle()
export class MarketingController {
  constructor(private readonly marketingService: MarketingService) {}

  /**
   * GET /api/v1/marketing/about-stats
   * Public aggregate counters used on the About page.
   */
  @Get("about-stats")
  @Header("Cache-Control", "public, max-age=300, stale-while-revalidate=300")
  @ApiOperation({
    summary: "Get public About page stats",
    description:
      "Returns public aggregate counters for the marketing About page " +
      "(titles published, copies printed, and total orders received).",
  })
  @ApiResponse({
    status: 200,
    description: "Public about stats retrieved successfully",
    type: AboutStatsResponseDto,
  })
  async getAboutStats(): Promise<AboutStatsResponseDto> {
    return this.marketingService.getAboutStats();
  }
}
