import { Controller, Get, Header } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { resolveExtraPagePriceNgn } from "../common/extra-page-pricing.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { AdminSystemSettingsService } from "./admin-system-settings.service.js";
import { AdminPublicMarketingSettingsResponseDto } from "./dto/admin-system.dto.js";

@ApiTags("System Public")
@Controller("system/settings")
export class PublicSystemSettingsController {
  constructor(
    private readonly adminSystemSettingsService: AdminSystemSettingsService,
    private readonly prisma: PrismaService
  ) {}

  /**
   * GET /api/v1/system/settings/pricing
   * Public pricing values the dashboard needs to explain the billing gate.
   * The server still computes every charge itself; this is display only.
   */
  @Get("pricing")
  @Header("Cache-Control", "public, max-age=60, s-maxage=60")
  @ApiOperation({ summary: "Get public pricing settings (extra page price)" })
  @ApiResponse({
    status: 200,
    description: "Public pricing settings",
    schema: {
      type: "object",
      properties: { extraPagePriceNgn: { type: "number", example: 10 } },
    },
  })
  async getPublicPricing(): Promise<{ extraPagePriceNgn: number }> {
    return { extraPagePriceNgn: await resolveExtraPagePriceNgn(this.prisma) };
  }

  @Get("marketing-content")
  @Header("Cache-Control", "public, max-age=60, s-maxage=60")
  @ApiOperation({
    summary: "Get public marketing content settings",
    description:
      "Returns admin-managed public content settings used by marketing pages, including hero copy, contact details, and business profile fields.",
  })
  @ApiResponse({
    status: 200,
    description: "Public marketing settings returned successfully",
    type: AdminPublicMarketingSettingsResponseDto,
  })
  async getPublicMarketingSettings(): Promise<AdminPublicMarketingSettingsResponseDto> {
    return this.adminSystemSettingsService.getPublicMarketingSettings();
  }
}
