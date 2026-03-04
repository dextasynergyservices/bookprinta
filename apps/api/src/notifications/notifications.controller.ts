import { Controller, Get, Header, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser, JwtAuthGuard } from "../auth/index.js";
import { UnreadCountResponseDto } from "./dto/unread-count-response.dto.js";
import { NotificationsService } from "./notifications.service.js";

@ApiTags("Notifications")
@Controller("notifications")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth("access-token")
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get("unread-count")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Get unread notification count",
    description:
      "Returns the unread in-app notification count for the currently authenticated user.",
  })
  @ApiResponse({
    status: 200,
    description: "Unread count retrieved successfully",
    type: UnreadCountResponseDto,
  })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  async getUnreadCount(@CurrentUser("sub") userId: string): Promise<UnreadCountResponseDto> {
    return this.notificationsService.getUnreadCount(userId);
  }
}
