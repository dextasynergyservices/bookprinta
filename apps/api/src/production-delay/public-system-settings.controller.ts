import { Controller, Get, Header } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { AdminSystemSettingsService } from "./admin-system-settings.service.js";
import { AdminPublicMarketingSettingsResponseDto } from "./dto/admin-system.dto.js";

@ApiTags("System Public")
@Controller("system/settings")
export class PublicSystemSettingsController {
  constructor(private readonly adminSystemSettingsService: AdminSystemSettingsService) {}

  @Get("marketing-content")
  @Header("Cache-Control", "public, max-age=60")
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
