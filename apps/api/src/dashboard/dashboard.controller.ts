import { Controller, Get, Header, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser, JwtAuthGuard } from "../auth/index.js";
import { DashboardService } from "./dashboard.service.js";
import { DashboardOverviewResponseDto } from "./dto/dashboard.dto.js";

@ApiTags("Dashboard")
@Controller("dashboard")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth("access-token")
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * GET /api/v1/dashboard/overview
   * Authenticated dashboard summary for the main user dashboard route.
   */
  @Get("overview")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Get current user's dashboard overview",
    description:
      "Returns the authenticated user's main dashboard overview payload, including " +
      "the active book, recent orders, unread notification state, profile completeness, and pending actions.",
  })
  @ApiResponse({
    status: 200,
    description: "Dashboard overview retrieved successfully",
    type: DashboardOverviewResponseDto,
  })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  async getOverview(@CurrentUser("sub") userId: string): Promise<DashboardOverviewResponseDto> {
    return this.dashboardService.getUserDashboardOverview(userId);
  }
}
