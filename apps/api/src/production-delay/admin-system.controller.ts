import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard, UserRole } from "../auth/index.js";
import {
  ProductionDelayStatusResponseDto,
  UpdateProductionDelayBodyDto,
} from "./dto/production-delay.dto.js";
import { ProductionDelayAdminService } from "./production-delay-admin.service.js";

@ApiTags("Admin System")
@Controller("admin/system")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@ApiBearerAuth("access-token")
export class AdminSystemController {
  constructor(private readonly productionDelayAdminService: ProductionDelayAdminService) {}

  @Get("production-status")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Get production delay status",
    description:
      "Returns the resolved production backlog status for admin tooling, including the " +
      "current threshold, backlog count, affected-user count, effective delay state, and active event snapshot.",
  })
  @ApiResponse({
    status: 200,
    description: "Production delay status retrieved successfully",
    type: ProductionDelayStatusResponseDto,
  })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  @ApiResponse({ status: 403, description: "Forbidden — admin role required" })
  async getProductionStatus(): Promise<ProductionDelayStatusResponseDto> {
    return this.productionDelayAdminService.getProductionStatus();
  }

  @Post("production-delay")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Set production delay override state",
    description:
      "Manually forces the production delay active, forces it inactive, or returns control " +
      "to automatic threshold evaluation using the shared production-delay monitor path.",
  })
  @ApiResponse({
    status: 200,
    description: "Production delay override applied successfully",
    type: ProductionDelayStatusResponseDto,
  })
  @ApiResponse({ status: 400, description: "Invalid override state or notes payload" })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  @ApiResponse({ status: 403, description: "Forbidden — admin role required" })
  async updateProductionDelay(
    @CurrentUser("sub") adminId: string,
    @Body() body: UpdateProductionDelayBodyDto
  ): Promise<ProductionDelayStatusResponseDto> {
    return this.productionDelayAdminService.updateProductionDelayOverride(adminId, body);
  }
}
