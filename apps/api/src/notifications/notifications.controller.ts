import { Controller, Get, Header, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import {
  NotificationIdParamsDto,
  NotificationMarkAllReadResponseDto,
  NotificationMarkReadResponseDto,
  NotificationsListQueryDto,
  NotificationsListResponseDto,
} from "./dto/notification.dto.js";
import { UnreadCountResponseDto } from "./dto/unread-count-response.dto.js";
import { NotificationsService } from "./notifications.service.js";

@ApiTags("Notifications")
@Controller("notifications")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth("access-token")
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @SkipThrottle({ short: true, long: true })
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "List current user's notifications",
    description:
      "Returns the authenticated user's in-app notifications (paginated, newest first). " +
      "Each item is serialized into the stable notification contract with metadata payloads.",
  })
  @ApiResponse({
    status: 200,
    description: "Notifications retrieved successfully",
    type: NotificationsListResponseDto,
  })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  async findMyNotifications(
    @CurrentUser("sub") userId: string,
    @Query() query: NotificationsListQueryDto
  ): Promise<NotificationsListResponseDto> {
    return this.notificationsService.findUserNotifications(userId, query);
  }

  @Get("unread-count")
  @SkipThrottle({ short: true, long: true })
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

  @Patch(":id/read")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Mark a notification as read",
    description:
      "Marks a single in-app notification as read for the authenticated user and returns " +
      "the normalized notification payload.",
  })
  @ApiParam({
    name: "id",
    description: "Notification CUID",
    example: "cm1234567890abcdef1234567",
  })
  @ApiResponse({
    status: 200,
    description: "Notification marked as read",
    type: NotificationMarkReadResponseDto,
  })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  @ApiResponse({ status: 404, description: "Notification not found" })
  async markNotificationRead(
    @CurrentUser("sub") userId: string,
    @Param() params: NotificationIdParamsDto
  ): Promise<NotificationMarkReadResponseDto> {
    return this.notificationsService.markNotificationRead(userId, params.id);
  }

  @Patch("read-all")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  @ApiOperation({
    summary: "Mark all notifications as read",
    description:
      "Marks all unread in-app notifications as read for the authenticated user and returns " +
      "the number of updated rows.",
  })
  @ApiResponse({
    status: 200,
    description: "All unread notifications marked as read",
    type: NotificationMarkAllReadResponseDto,
  })
  @ApiResponse({ status: 401, description: "Unauthorized — missing or invalid JWT" })
  async markAllNotificationsRead(
    @CurrentUser("sub") userId: string
  ): Promise<NotificationMarkAllReadResponseDto> {
    return this.notificationsService.markAllNotificationsRead(userId);
  }
}
